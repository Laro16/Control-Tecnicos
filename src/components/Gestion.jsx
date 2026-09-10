import { useState, useEffect, useRef, useCallback } from 'react'
import JSZip from 'jszip'
import { supabase } from '../supabase.jsx'
import { claveReferenciaParticular, idParticularReferencia, leerParticularesExistentes } from '../utils/particulares.js'
import EstadoParticulares from './EstadoParticulares'
import Dialogo from './Dialogo'
import ExpedientesGarantia from './ExpedientesGarantia'
import {
  Plus, Pencil, Trash2, CheckCircle, X, ClipboardList, RotateCcw, 
  Paperclip, DownloadCloud, Download, CalendarClock, Briefcase,
  ListTodo, ArrowUpRight
} from 'lucide-react'

const PRIORIDADES = ['Baja', 'Media', 'Alta']
const ESTADOS_TAREA = ['Pendiente', 'En proceso', 'Realizado', 'Cancelado']
const ESTADOS_PARTICULAR = ['Pendiente de pago', 'Pagado', 'En Proceso', 'Completada', 'Cancelado']

const DOCS_PARTICULAR = ['Cotizacion', 'Voucher de Pago', 'Recibo de caja', 'Orden de servicio fisica', 'Orden de servicio SRS']

const VACIO_TAREA = { tipo: 'Tarea', titulo: '', descripcion: '', fecha: '', prioridad: 'Media', estado: 'Pendiente' }
const VACIO_PARTICULAR = { tipo: 'Particular', titulo: '', descripcion: '', fecha: '', prioridad: 'Media', estado: 'Pendiente de pago', orden: '', correlativo: '', negocio: '', nit: '', direccion: '' }

function prioBadge(p) {
  if (p === 'Alta') return 'bg-rose-50 text-rose-700 border-rose-200'
  if (p === 'Media') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-50 text-slate-500 border-slate-200'
}
function estBadge(e) { 
  if (e === 'Pendiente' || e === 'Pendiente de pago') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (e === 'En proceso' || e === 'En Proceso') return 'bg-sky-50 text-sky-700 border-sky-200'
  if (e === 'Realizado' || e === 'Pagado' || e === 'Completada') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return 'bg-slate-50 text-slate-400 border-slate-200'
}

export default function ModuloPendientes({ vista = 'Tarea', importacionParticulares, vencimientosGarantia, allTickets, controlAlertas }) {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(VACIO_TAREA)
  const [editId, setEditId] = useState(null)
  const [filtro, setFiltro] = useState('Todos')
  const vistaActual = vista
  const [error, setError] = useState('')
  
  const [archivosSubir, setArchivosSubir] = useState([])
  const [archivosParticular, setArchivosParticular] = useState({})
  
  const [subiendoFiles, setSubiendoFiles] = useState(false)
  const [imgPreview, setImgPreview] = useState(null)
  const [documentoEnfocado, setDocumentoEnfocado] = useState(null)
  useEffect(() => { setFiltro('Todos') }, [vistaActual])
  useEffect(() => {
    if (!modal || documentoEnfocado === null) return
    const seccion = document.getElementById(`documento-particular-${documentoEnfocado}`)
    seccion?.scrollIntoView({ block: 'center' })
    seccion?.focus({ preventScroll: true })
  }, [modal, documentoEnfocado])

  const cargaActual = useRef(0)

  const cargar = useCallback(async () => {
    const solicitud = ++cargaActual.current
    setCargando(true)
    try {
      const registros = []
      for (let desde = 0; ; desde += 500) {
        const { data, error } = await supabase.from('pendientes').select('*').order('created_at', { ascending: false }).order('id').range(desde, desde + 499)
        if (error || !Array.isArray(data)) throw new Error('No se pudieron cargar los registros.')
        registros.push(...data)
        if (data.length < 500) break
      }
      if (solicitud === cargaActual.current) setItems(registros)
    } catch {
      if (solicitud === cargaActual.current) setError('Error en conexión con tabla de Supabase.')
    } finally {
      if (solicitud === cargaActual.current) setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar, importacionParticulares?.revision])

  function obtenerFechaHoy() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function abrirNuevo() {
    setDocumentoEnfocado(null)
    const hoy = obtenerFechaHoy()
    setForm(vistaActual === 'Tarea' ? { ...VACIO_TAREA, fecha: hoy } : { ...VACIO_PARTICULAR, fecha: hoy })
    setEditId(null)
    setArchivosSubir([])
    setArchivosParticular({})
    setError('')
    setModal(true)
  }

  function abrirEditar(item, documento = null) {
    setDocumentoEnfocado(documento)
    setForm({ ...item })
    setEditId(item.id)
    setArchivosSubir([])
    setArchivosParticular({})
    setError('')
    setModal(true)
  }

  async function comprimirImagen(file, maxW = 1200, quality = 0.7) {
    return new Promise(resolve => {
      if (!file.type.startsWith('image/')) { resolve(file); return }
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new window.Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let w = img.width, h = img.height
          if (w > maxW) { h = h * maxW / w; w = maxW }
          canvas.width = w; canvas.height = h
          canvas.getContext('2d').drawImage(img, 0, 0, w, h)
          canvas.toBlob(blob => resolve(new File([blob], file.name, { type: file.type })), file.type, quality)
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })
  }

  async function subirArchivo(file, tipoDoc = null) {
    const comprimido = await comprimirImagen(file)
    const nombreArchivo = `${Date.now()}_${comprimido.name.replace(/\s+/g, '_')}`
    const { error } = await supabase.storage.from('adjuntos').upload(nombreArchivo, comprimido)
    if (error) throw error
    const { data: urlData } = supabase.storage.from('adjuntos').getPublicUrl(nombreArchivo)
    return { url: urlData.publicUrl, nombre: comprimido.name, tipoDoc }
  }

  async function guardar() {
    if (!form.titulo.trim()) { setError('El título es obligatorio.'); return }
    setError('')
    setSubiendoFiles(true)
    try {
      let idNuevaParticular = null
      const referencia = claveReferenciaParticular(form.correlativo)
      if (form.tipo === 'Particular' && referencia) {
        const particulares = await leerParticularesExistentes(supabase)
        const idReferencia = await idParticularReferencia(referencia)
        if (particulares.some(p => p.id !== editId && (claveReferenciaParticular(p.correlativo) === referencia || p.id === idReferencia))) {
          throw new Error('Ya existe una particular con ese N° REFERENCIA / correlativo. Edita la ficha existente.')
        }
        if (!editId) idNuevaParticular = idReferencia
      }
      let archivosFinales = form.archivos ? [...form.archivos] : []
      
      if (form.tipo === 'Tarea' && archivosSubir.length > 0) {
        for (const file of archivosSubir) {
          const uploaded = await subirArchivo(file)
          archivosFinales.push(JSON.stringify(uploaded))
        }
      }
      
      if (form.tipo === 'Particular' && Object.keys(archivosParticular).length > 0) {
        for (const [tipoDoc, file] of Object.entries(archivosParticular)) {
          const uploaded = await subirArchivo(file, tipoDoc)
          archivosFinales.push(JSON.stringify(uploaded))
        }
      }

      const payload = { ...form, archivos: archivosFinales }
      delete payload.id; delete payload.created_at
      if (idNuevaParticular) payload.id = idNuevaParticular

      if (editId) {
        const { error } = await supabase.from('pendientes').update(payload).eq('id', editId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('pendientes').insert([payload])
        if (error) throw error
      }
      setModal(false)
      cargar()
    } catch (e) {
      setError(e.code === '23505' && form.tipo === 'Particular' ? 'Esta particular ya fue creada desde otra carga. Recarga la lista y edita la ficha existente.' : `Error al guardar: ${e.message}`)
    }
    setSubiendoFiles(false)
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este registro?')) return
    await supabase.from('pendientes').delete().eq('id', id)
    cargar()
  }

  async function cambiarEstado(id, estadoActual, tipo) {
    const listaEstados = tipo === 'Particular' ? ESTADOS_PARTICULAR : ESTADOS_TAREA
    const idx = listaEstados.indexOf(estadoActual)
    const nuevo = listaEstados[(idx + 1) % listaEstados.length]
    await supabase.from('pendientes').update({ estado: nuevo }).eq('id', id)
    cargar()
  }

  function eliminarArchivoExistente(idx) {
    if (!confirm('¿Quitar este archivo?')) return
    const nuevos = [...form.archivos]
    nuevos.splice(idx, 1)
    setForm(p => ({ ...p, archivos: nuevos }))
  }

  function quitarArchivoParaSubir(idx) {
    setArchivosSubir(prev => prev.filter((_, i) => i !== idx))
  }

  async function descargarZIP(item) {
    const zip = new JSZip()
    for (const arch of item.archivos) {
      const obj = typeof arch === 'string' ? JSON.parse(arch) : arch
      try {
        const resp = await fetch(obj.url)
        const blob = await resp.blob()
        zip.file(obj.nombre, blob)
      } catch (e) { console.warn('Error descargando', obj.nombre) }
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(zipBlob)
    link.download = `${item.titulo.replace(/\s+/g, '_')}_archivos.zip`
    link.click()
  }

  const itemsFiltrados = vistaActual === 'Tarea' ? items.filter(i => i.tipo === 'Tarea') : items.filter(i => i.tipo === 'Particular')
  const baseFiltrada = filtro === 'Todos' ? itemsFiltrados : itemsFiltrados.filter(i => i.estado === filtro)
  const prioridadEstado = estado => {
    if (estado === 'Pendiente' || estado === 'Pendiente de pago') return 0
    if (estado === 'En proceso' || estado === 'En Proceso') return 1
    if (estado === 'Realizado' || estado === 'Completada' || estado === 'Pagado') return 2
    return 3
  }
  const prioridadNivel = { Alta: 0, Media: 1, Baja: 2 }
  // Los pendientes siempre encabezan la lista. Dentro del mismo estado se
  // ordenan por prioridad, fecha y creación para que lo urgente quede visible.
  const filtrados = [...baseFiltrada].sort((a, b) => {
    const porEstado = prioridadEstado(a.estado) - prioridadEstado(b.estado)
    if (porEstado !== 0) return porEstado
    const porPrioridad = (prioridadNivel[a.prioridad] ?? 3) - (prioridadNivel[b.prioridad] ?? 3)
    if (porPrioridad !== 0) return porPrioridad
    const porFecha = String(a.fecha || '9999-12-31').localeCompare(String(b.fecha || '9999-12-31'))
    if (porFecha !== 0) return porFecha
    return String(b.created_at || '').localeCompare(String(a.created_at || ''))
  })
  const estadosFiltro = vistaActual === 'Tarea' ? ['Todos', ...ESTADOS_TAREA] : ['Todos', ...ESTADOS_PARTICULAR]

  const pendientesCount = itemsFiltrados.filter(i => i.estado === 'Pendiente' || i.estado === 'Pendiente de pago').length
  const procesoCount = itemsFiltrados.filter(i => i.estado === 'En proceso' || i.estado === 'En Proceso').length
  const completadosCount = itemsFiltrados.filter(i => ['Realizado', 'Completada', 'Pagado'].includes(i.estado)).length

  if (vistaActual === 'Garantia') return <div className="fade-in"><ExpedientesGarantia datos={vencimientosGarantia} tickets={allTickets} controlAlertas={controlAlertas}/></div>

  return (
    <div className="space-y-5 fade-in">
      <section className="workspace-hero">
        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky-300">
              {vistaActual === 'Tarea' ? <ListTodo size={13} /> : <Briefcase size={13} />}
              Espacio de gestión
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              {vistaActual === 'Tarea' ? 'Pendientes y seguimiento' : 'Servicios particulares'}
            </h1>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-300 sm:text-sm">
              {vistaActual === 'Tarea'
                ? 'Lo pendiente aparece primero, ordenado por prioridad y fecha para empezar por lo más importante.'
                : 'Controla el avance, los pagos y los documentos de cada servicio particular.'}
            </p>
          </div>
          <button onClick={abrirNuevo} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-slate-900 shadow-lg transition hover:bg-sky-50 active:scale-[0.98]">
            <Plus size={15} /> Nuevo {vistaActual === 'Tarea' ? 'pendiente' : 'servicio'}
          </button>
        </div>
      </section>

      {vistaActual === 'Particular' && <>
        <div className="card p-4 text-sm text-slate-600">Al cargar la base en Técnicos, los tickets con CLIENTE «PARTICULAR» crean su ficha una sola vez por N° REFERENCIA. Las nuevas quedan en Pendiente de pago; completa sus documentos desde Editar.</div>
        <EstadoParticulares importacion={importacionParticulares} />
      </>}

      <section className="summary-grid">
        <SummaryCard label="Pendientes" value={pendientesCount} tone="amber" />
        <SummaryCard label="En proceso" value={procesoCount} tone="sky" />
        <SummaryCard label="Completados" value={completadosCount} tone="emerald" />
        <SummaryCard label="Total" value={itemsFiltrados.length} tone="slate" />
      </section>

      <section className="card flex flex-col items-start justify-between gap-3 p-3 sm:flex-row sm:items-center">
        <div>
          <p className="section-title mb-2">Filtrar por estado</p>
          <div className="flex flex-wrap gap-1.5">
            {estadosFiltro.map(e => (
              <button key={e} onClick={() => setFiltro(e)} className={`pill ${filtro === e ? 'pill-active' : 'pill-inactive'}`}>{e}</button>
            ))}
          </div>
        </div>
        <p className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-500">
          {filtrados.length} {filtrados.length === 1 ? 'resultado' : 'resultados'}
        </p>
      </section>

      {error && !modal && <div className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5">{error}</div>}

      {/* ── Lista ── */}
      {cargando ? (
        <div className="card text-center py-16 text-slate-400"><RotateCcw size={24} className="mx-auto mb-3 animate-spin text-sky-500" /><p className="text-xs font-semibold">Cargando…</p></div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-slate-400 card"><ClipboardList size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-semibold text-slate-500">No hay registros</p></div>
      ) : (
        <div className="operation-grid">
          {filtrados.map(item => {
            const isDone = item.estado === 'Realizado' || item.estado === 'Completada' || item.estado === 'Pagado'
            const isCancelled = item.estado === 'Cancelado'
            const isPending = item.estado === 'Pendiente' || item.estado === 'Pendiente de pago'
            const isOverdue = item.fecha && item.fecha < obtenerFechaHoy() && !isDone && !isCancelled
            const accent = isOverdue ? 'border-t-rose-500' : isPending ? 'border-t-amber-400' : item.estado.toLowerCase().includes('proceso') ? 'border-t-sky-500' : 'border-t-emerald-500'
            return (
              <article key={item.id} className={`operation-record card-section border-t-4 ${accent} transition-all ${item.tipo === 'Tarea' && (isDone || isCancelled) ? 'opacity-60' : ''}`}>
                <div className="record-heading flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{item.tipo === 'Particular' ? 'Servicio particular' : 'Pendiente'}</span>
                      {isOverdue && <span className="rounded-md bg-rose-500 px-1.5 py-0.5 text-[8px] font-black text-white">VENCIDO</span>}
                    </div>
                    <h2 className={`${item.tipo === 'Particular' ? 'break-words' : 'truncate'} text-sm font-extrabold text-slate-900 ${item.tipo === 'Tarea' && isDone ? 'line-through text-slate-400' : ''}`}>{item.titulo}</h2>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => abrirEditar(item)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600" title="Editar"><Pencil size={13} /></button>
                    {item.tipo === 'Tarea' && (
                      <button onClick={() => eliminar(item.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600" title="Eliminar"><Trash2 size={13} /></button>
                    )}
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div className="record-status flex items-center justify-between flex-wrap gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => cambiarEstado(item.id, item.estado, item.tipo)} title="Cambiar al siguiente estado" className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-extrabold transition hover:shadow-sm ${estBadge(item.estado)}`}>{item.estado}<ArrowUpRight size={10} /></button>
                      <span className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-extrabold ${prioBadge(item.prioridad)}`}>{item.prioridad}</span>
                    </div>
                    {item.fecha && (
                      <span className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${isOverdue ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
                        <CalendarClock size={11} /> {item.fecha}
                      </span>
                    )}
                  </div>

                  {/* Datos Particular */}
                  {item.tipo === 'Particular' && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-1">
                      <div className="record-fields text-[11px]">
                        <div className="flex gap-1.5">
                          <span className="text-slate-400 shrink-0 w-16 font-semibold">ORDEN</span>
                          <span className="font-mono font-bold text-slate-700">{item.orden || '-'}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-slate-400 shrink-0 w-16 font-semibold">REF.</span>
                          <span className="font-mono font-bold text-slate-700">{item.correlativo || '-'}</span>
                        </div>
                        <div className="flex gap-1.5 col-span-2">
                          <span className="text-slate-400 shrink-0 w-16 font-semibold">NEGOCIO</span>
                          <span className="font-semibold text-slate-700">{item.negocio || '-'}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-slate-400 shrink-0 w-16 font-semibold">NIT</span>
                          <span className="font-semibold text-slate-700">{item.nit || '-'}</span>
                        </div>
                        <div className="flex gap-1.5 col-span-2">
                          <span className="text-slate-400 shrink-0 w-16 font-semibold">DIR</span>
                          <span className="font-medium text-slate-600">{item.direccion || '-'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {item.descripcion && (
                    <div className="rounded-xl bg-sky-50 px-3 py-2.5 text-[11px] text-slate-600 ring-1 ring-inset ring-sky-100">
                      <span className={`font-medium leading-relaxed ${item.tipo === 'Particular' ? 'whitespace-pre-line break-words' : ''}`}>{item.descripcion}</span>
                    </div>
                  )}
                  
                  {/* Archivos */}
                  {item.tipo === 'Particular' && (
                    <div className="space-y-2 border-t border-slate-200 pt-3">
                      <p className="text-sm font-bold text-slate-700">Documentos del servicio</p>
                      <div className="record-fields">
                        {DOCS_PARTICULAR.map((doc, indice) => (
                          <button key={doc} type="button" onClick={() => abrirEditar(item, indice)} className="btn-ghost flex items-center justify-start gap-2 text-left" aria-label={`Subir o revisar ${doc} de ${item.correlativo || item.titulo}`}>
                            <Paperclip size={15} className="shrink-0" /><span>Subir / revisar · {doc}</span>
                          </button>
                        ))}
                      </div>
                      {!item.archivos?.length && <p className="text-sm text-slate-500">Sin archivos cargados. Selecciona un documento para subirlo.</p>}
                    </div>
                  )}
                  {item.archivos && item.archivos.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-semibold text-slate-400 flex items-center gap-1 uppercase"><Paperclip size={10} /> {item.archivos.length} adjuntos</span>
                        <button onClick={() => descargarZIP(item)} className="text-[9px] font-bold flex items-center gap-1 text-sky-600 hover:text-sky-800 transition"><DownloadCloud size={10}/> ZIP</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.archivos.map((arch, idx) => {
                          const archObj = typeof arch === 'string' ? JSON.parse(arch) : arch
                          const url = archObj.url, nombre = archObj.nombre, tipoDoc = archObj.tipoDoc || 'Adjunto'
                          const isImage = url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || nombre.match(/\.(jpeg|jpg|gif|png|webp)$/i)
                          return (
                            <div key={idx} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[9px] hover:border-sky-200 transition">
                              {item.tipo === 'Particular' && <span className="bg-sky-100 text-sky-700 font-bold px-1 py-0.5 rounded text-[8px]">{tipoDoc}</span>}
                              {isImage ? (
                                <button onClick={() => setImgPreview(url)} className={`text-sky-600 hover:text-sky-800 font-semibold ${item.tipo === 'Particular' ? 'break-all text-left' : 'truncate max-w-[120px]'}`}>{nombre}</button>
                              ) : (
                                <a href={url} target="_blank" rel="noopener noreferrer" className={`text-slate-600 hover:text-slate-800 font-semibold ${item.tipo === 'Particular' ? 'break-all' : 'truncate max-w-[120px]'}`}>{nombre}</a>
                              )}
                              <a href={url} target="_blank" rel="noopener noreferrer" download={nombre} className="text-sky-500 hover:text-sky-700"><Download size={10} /></a>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* ── Modal ── */}
      {modal && (
        <Dialogo titulo={`${editId ? 'Editar' : 'Nuevo'} ${form.tipo === 'Particular' ? 'servicio particular' : 'pendiente'}`} onCerrar={() => { if (!subiendoFiles) setModal(false) }}>
          <div className="app-dialog-panel">
            <div className="app-dialog-header">
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-sky-400">Gestión</p>
                <h3 className="mt-1 font-extrabold text-white text-sm">{editId ? 'Editar' : 'Nuevo'} {form.tipo === 'Particular' ? 'servicio particular' : 'pendiente'}</h3>
              </div>
              <button aria-label="Cerrar formulario" onClick={() => setModal(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition"><X size={20} /></button>
            </div>
            
            <div className="app-dialog-body space-y-4">
              {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{error}</p>}

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Título *</label>
                <input type="text" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} className="control-field text-sm" placeholder="Ej: Mantenimiento Preventivo" />
              </div>

              {form.tipo === 'Particular' && (
                <div className="form-fields gap-3 bg-sky-50 p-4 rounded-lg border border-sky-100">
                  <div><label className="block text-[10px] font-semibold text-sky-800 mb-0.5">Orden N°</label><input type="text" value={form.orden || ''} onChange={e => setForm(p => ({ ...p, orden: e.target.value }))} className="w-full border border-sky-200 rounded-md px-2.5 py-1.5 text-xs outline-none font-semibold bg-white" /></div>
                  <div><label className="block text-[10px] font-semibold text-sky-800 mb-0.5">N° Referencia / Correlativo</label><input type="text" value={form.correlativo || ''} onChange={e => setForm(p => ({ ...p, correlativo: e.target.value }))} placeholder="Ej.: P1-7682" className="w-full border border-sky-200 rounded-md px-2.5 py-1.5 text-xs outline-none font-semibold bg-white" /></div>
                  <div className="col-span-2"><label className="block text-[10px] font-semibold text-sky-800 mb-0.5">Negocio / Empresa</label><input type="text" value={form.negocio || ''} onChange={e => setForm(p => ({ ...p, negocio: e.target.value }))} className="w-full border border-sky-200 rounded-md px-2.5 py-1.5 text-xs outline-none font-semibold bg-white" /></div>
                  <div><label className="block text-[10px] font-semibold text-sky-800 mb-0.5">NIT</label><input type="text" value={form.nit || ''} onChange={e => setForm(p => ({ ...p, nit: e.target.value }))} className="w-full border border-sky-200 rounded-md px-2.5 py-1.5 text-xs outline-none font-semibold bg-white" /></div>
                  <div className="col-span-2"><label className="block text-[10px] font-semibold text-sky-800 mb-0.5">Dirección</label><input type="text" value={form.direccion || ''} onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))} className="w-full border border-sky-200 rounded-md px-2.5 py-1.5 text-xs outline-none font-semibold bg-white" /></div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Descripción / Notas</label>
                <textarea value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} rows={3} className="control-field resize-none" placeholder="Detalles adicionales..." />
              </div>

              {/* Archivos */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                {form.tipo === 'Tarea' ? (
                  <>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Adjuntar Archivos</label>
                    <input type="file" multiple onChange={(e) => setArchivosSubir(Array.from(e.target.files))} className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-sky-100 file:text-sky-700 hover:file:bg-sky-200 cursor-pointer transition" />
                    {archivosSubir.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {archivosSubir.map((arch, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-sky-50 border border-sky-100 rounded-md px-2.5 py-1.5">
                            <span className="text-[10px] text-sky-700 font-semibold truncate">{arch.name}</span>
                            <button type="button" onClick={() => quitarArchivoParaSubir(idx)} className="text-sky-500 hover:text-rose-500 p-0.5"><Trash2 size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Documentos del Servicio</label>
                    <div className="space-y-2">
                      {DOCS_PARTICULAR.map(doc => {
                        const existente = form.archivos?.findIndex(a => {
                          const obj = typeof a === 'string' ? JSON.parse(a) : a
                          return obj.tipoDoc === doc || obj.nombre.includes(doc)
                        })
                        return (
                          <div key={doc} id={`documento-particular-${DOCS_PARTICULAR.indexOf(doc)}`} tabIndex={-1} className="space-y-1 scroll-mt-4">
                            <span className="text-[10px] font-bold text-sky-800">{doc}</span>
                            {existente !== undefined && existente !== -1 ? (
                              <div className="flex items-center justify-between bg-white border border-emerald-200 rounded-md px-2.5 py-1.5">
                                <span className="text-sm text-emerald-600 font-semibold break-all">✓ {typeof form.archivos[existente] === 'string' ? JSON.parse(form.archivos[existente]).nombre : form.archivos[existente].nombre}</span>
                                <button type="button" onClick={() => eliminarArchivoExistente(existente)} className="text-rose-500 hover:text-rose-700 p-0.5"><Trash2 size={12}/></button>
                              </div>
                            ) : archivosParticular[doc] ? (
                              <div className="flex items-center justify-between bg-sky-50 border border-sky-200 rounded-md px-2.5 py-1.5">
                                <span className="text-[10px] text-sky-700 font-semibold truncate">{archivosParticular[doc].name}</span>
                                <button type="button" onClick={() => setArchivosParticular(p => { const n = {...p}; delete n[doc]; return n })} className="text-rose-500 p-0.5"><Trash2 size={12}/></button>
                              </div>
                            ) : (
                              <input type="file" onChange={e => setArchivosParticular(p => ({...p, [doc]: e.target.files[0]}))} className="text-[10px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-white file:text-slate-600 hover:file:bg-slate-100 cursor-pointer border border-slate-200 rounded-md w-full" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {editId && form.tipo === 'Tarea' && form.archivos?.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-200 space-y-1">
                    <p className="text-[10px] font-semibold text-slate-400">Archivos guardados:</p>
                    {form.archivos.map((arch, idx) => {
                      const nombre = typeof arch === 'string' ? JSON.parse(arch).nombre : arch.nombre
                      return (
                        <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
                          <span className="text-[10px] text-slate-600 font-semibold truncate">{nombre}</span>
                          <button type="button" onClick={() => eliminarArchivoExistente(idx)} className="text-rose-500 hover:text-rose-700 p-0.5"><Trash2 size={12} /></button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="form-fields gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{form.tipo === 'Particular' ? 'Fecha de seguimiento (opcional)' : 'Fecha'}</label>
                  <input type="date" value={form.fecha || ''} onChange={e => setForm(p => ({ ...p, fecha: form.tipo === 'Particular' ? e.target.value || null : e.target.value }))} className="control-field" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))} className="control-field">
                    {(form.tipo === 'Particular' ? ESTADOS_PARTICULAR : ESTADOS_TAREA).map(e => <option key={e}>{e}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="app-dialog-footer">
              <button onClick={() => setModal(false)} disabled={subiendoFiles} className="btn-ghost">Cancelar</button>
              <button onClick={guardar} disabled={subiendoFiles} className="btn-primary flex items-center gap-1.5">
                {subiendoFiles ? <RotateCcw size={13} className="animate-spin" /> : <CheckCircle size={13} />} 
                {subiendoFiles ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </Dialogo>
      )}

      {/* Preview imagen */}
      {imgPreview && (
        <Dialogo titulo="Vista previa del archivo" onCerrar={() => setImgPreview(null)} cerrarFuera>
          <button aria-label="Cerrar vista previa" onClick={() => setImgPreview(null)} className="absolute top-4 right-4 text-white bg-white/10 p-2 rounded-lg hover:bg-white/20 transition"><X size={20} /></button>
          <img src={imgPreview} alt="Vista previa" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
        </Dialogo>
      )}
    </div>
  )
}

function SummaryCard({ label, value, tone }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    sky: 'bg-sky-50 text-sky-700 ring-sky-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    slate: 'bg-white text-slate-700 ring-slate-200',
  }
  return (
    <div className={`rounded-2xl p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] ring-1 ring-inset ${tones[tone]}`}>
      <p className="text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.12em] opacity-70">{label}</p>
    </div>
  )
}
