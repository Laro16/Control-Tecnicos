import { useState, useEffect } from 'react'
import JSZip from 'jszip'
import { supabase } from '../supabase.jsx'
import {
  Plus, Pencil, Trash2, CheckCircle, X, ClipboardList, AlertCircle, RotateCcw, 
  Paperclip, DownloadCloud, Eye, Image as ImageIcon, Download, FileText
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

export default function ModuloPendientes() {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(VACIO_TAREA)
  const [editId, setEditId] = useState(null)
  const [filtro, setFiltro] = useState('Todos')
  const [vistaActual, setVistaActual] = useState('Tarea')
  const [error, setError] = useState('')
  
  const [archivosSubir, setArchivosSubir] = useState([])
  const [archivosParticular, setArchivosParticular] = useState({})
  
  const [subiendoFiles, setSubiendoFiles] = useState(false)
  const [imgPreview, setImgPreview] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase.from('pendientes').select('*').order('created_at', { ascending: false })
    if (error) setError('Error en conexión con tabla de Supabase.')
    else setItems(data || [])
    setCargando(false)
  }

  function obtenerFechaHoy() { return new Date().toISOString().split('T')[0] }

  function abrirNuevo() {
    const hoy = obtenerFechaHoy()
    setForm(vistaActual === 'Tarea' ? { ...VACIO_TAREA, fecha: hoy } : { ...VACIO_PARTICULAR, fecha: hoy })
    setEditId(null)
    setArchivosSubir([])
    setArchivosParticular({})
    setError('')
    setModal(true)
  }

  function abrirEditar(item) {
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
      setError(`Error al guardar: ${e.message}`)
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
  const filtrados = filtro === 'Todos' ? itemsFiltrados : itemsFiltrados.filter(i => i.estado === filtro)
  const estadosFiltro = vistaActual === 'Tarea' ? ['Todos', ...ESTADOS_TAREA] : ['Todos', ...ESTADOS_PARTICULAR]

  return (
    <div className="space-y-4 fade-in">
      {/* ── Selector de vista ── */}
      <div className="flex gap-2">
        {['Tarea', 'Particular'].map(v => (
          <button key={v} onClick={() => { setVistaActual(v); setFiltro('Todos') }}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              vistaActual === v 
                ? 'bg-slate-800 text-white shadow-md' 
                : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {v === 'Tarea' ? '📋 Mis Pendientes' : '🔧 Servicios Particulares'}
          </button>
        ))}
      </div>

      {/* ── Filtros + Nuevo ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {estadosFiltro.map(e => (
            <button key={e} onClick={() => setFiltro(e)} className={`pill ${filtro === e ? 'pill-active' : 'pill-inactive'}`}>{e}</button>
          ))}
        </div>
        <button onClick={abrirNuevo} className="btn-primary flex items-center gap-1.5 shrink-0">
          <Plus size={14} /> Nuevo {vistaActual === 'Tarea' ? 'Pendiente' : 'Servicio'}
        </button>
      </div>

      {error && !modal && <div className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5">{error}</div>}

      {/* ── Lista ── */}
      {cargando ? (
        <div className="text-center py-16 text-slate-400"><RotateCcw size={24} className="mx-auto mb-3 animate-spin text-sky-500" /><p className="text-xs font-semibold">Cargando…</p></div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-slate-400 card"><ClipboardList size={40} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-semibold text-slate-500">No hay registros</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtrados.map(item => {
            const isDone = item.estado === 'Realizado' || item.estado === 'Completada' || item.estado === 'Pagado'
            return (
              <div key={item.id} className={`card overflow-hidden transition-all ${isDone ? 'opacity-60' : 'hover:shadow-md hover:border-sky-200'}`}>
                {item.tipo === 'Particular' && <div className="h-1 bg-gradient-to-r from-sky-400 to-blue-600"></div>}

                <div className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <p className={`font-bold text-slate-800 text-sm leading-tight flex-1 ${isDone ? 'line-through text-slate-400' : ''}`}>{item.titulo}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => abrirEditar(item)} className="p-1.5 rounded-md hover:bg-slate-100 text-sky-600 transition"><Pencil size={14} /></button>
                      {item.tipo === 'Tarea' && (
                        <button onClick={() => eliminar(item.id)} className="p-1.5 rounded-md hover:bg-slate-100 text-rose-500 transition"><Trash2 size={14} /></button>
                      )}
                    </div>
                  </div>

                  {/* Datos Particular */}
                  {item.tipo === 'Particular' && (
                    <div className="grid grid-cols-2 gap-2 text-[10px] bg-sky-50 p-3 rounded-lg border border-sky-100">
                      <div><span className="font-bold text-sky-800 block">ORDEN</span><span className="font-mono font-bold text-sky-700">{item.orden || '-'}</span></div>
                      <div><span className="font-bold text-sky-800 block">CORRELATIVO</span><span className="font-mono font-bold text-sky-700">{item.correlativo || '-'}</span></div>
                      <div className="col-span-2"><span className="font-bold text-sky-800">NEGOCIO:</span> <span className="font-semibold text-slate-700">{item.negocio || '-'}</span></div>
                      <div><span className="font-bold text-sky-800">NIT:</span> <span className="font-semibold text-slate-700">{item.nit || '-'}</span></div>
                      <div className="col-span-2"><span className="font-bold text-sky-800">DIR:</span> <span className="font-semibold text-slate-700">{item.direccion || '-'}</span></div>
                    </div>
                  )}
                  
                  {item.descripcion && <p className="text-[11px] text-slate-600 leading-relaxed font-medium">{item.descripcion}</p>}
                  
                  {/* Archivos */}
                  {item.archivos && item.archivos.length > 0 && (
                    <div className="pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Paperclip size={11} /> {item.archivos.length} adjuntos</span>
                        <button onClick={() => descargarZIP(item)} className="text-[10px] font-bold flex items-center gap-1 text-sky-600 bg-sky-50 px-2 py-1 rounded-md hover:bg-sky-100 transition"><DownloadCloud size={11}/> ZIP</button>
                      </div>
                      <div className="space-y-1">
                        {item.archivos.map((arch, idx) => {
                          const archObj = typeof arch === 'string' ? JSON.parse(arch) : arch
                          const url = archObj.url, nombre = archObj.nombre, tipoDoc = archObj.tipoDoc || 'Adjunto'
                          const isImage = url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || nombre.match(/\.(jpeg|jpg|gif|png|webp)$/i)
                          return (
                            <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-md px-2.5 py-1.5 text-[10px] hover:border-sky-200 transition">
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                {item.tipo === 'Particular' && <span className="bg-sky-100 text-sky-700 font-bold px-1.5 py-0.5 rounded text-[9px] shrink-0">{tipoDoc}</span>}
                                {isImage ? (
                                  <button onClick={() => setImgPreview(url)} className="text-sky-600 hover:text-sky-800 flex items-center gap-1 truncate font-semibold"><ImageIcon size={11} className="shrink-0"/><span className="truncate">{nombre}</span></button>
                                ) : (
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-800 flex items-center gap-1 truncate font-semibold"><FileText size={11} className="shrink-0"/><span className="truncate">{nombre}</span></a>
                                )}
                              </div>
                              <a href={url} target="_blank" rel="noopener noreferrer" download={nombre} className="text-sky-600 hover:text-sky-800 p-1 rounded shrink-0"><Download size={12} /></a>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Footer: badges */}
                  <div className="flex items-center justify-between flex-wrap pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${prioBadge(item.prioridad)}`}>{item.prioridad}</span>
                      <button onClick={() => cambiarEstado(item.id, item.estado, item.tipo)} className={`text-[10px] font-bold px-2 py-0.5 rounded-md border cursor-pointer hover:opacity-80 transition ${estBadge(item.estado)}`}>{item.estado}</button>
                    </div>
                    {item.fecha && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${new Date(item.fecha) < new Date() && !isDone ? 'text-rose-600 bg-rose-50 border border-rose-200' : 'text-slate-500 bg-slate-50 border border-slate-200'}`}>📅 {item.fecha}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="font-bold text-slate-800 text-sm">{editId ? 'Editar' : 'Nuevo'} {form.tipo === 'Particular' ? 'Servicio' : 'Pendiente'}</h3>
              <button onClick={() => setModal(false)} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 transition"><X size={16} /></button>
            </div>
            
            <div className="px-5 py-4 space-y-4">
              {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{error}</p>}

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Título *</label>
                <input type="text" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-sky-400 focus:ring-1 focus:ring-sky-100 outline-none font-semibold text-slate-800 bg-slate-50 focus:bg-white transition" placeholder="Ej: Mantenimiento Preventivo" />
              </div>

              {form.tipo === 'Particular' && (
                <div className="grid grid-cols-2 gap-3 bg-sky-50 p-4 rounded-lg border border-sky-100">
                  <div><label className="block text-[10px] font-semibold text-sky-800 mb-0.5">Orden N°</label><input type="text" value={form.orden || ''} onChange={e => setForm(p => ({ ...p, orden: e.target.value }))} className="w-full border border-sky-200 rounded-md px-2.5 py-1.5 text-xs outline-none font-semibold bg-white" /></div>
                  <div><label className="block text-[10px] font-semibold text-sky-800 mb-0.5">Correlativo</label><input type="text" value={form.correlativo || ''} onChange={e => setForm(p => ({ ...p, correlativo: e.target.value }))} className="w-full border border-sky-200 rounded-md px-2.5 py-1.5 text-xs outline-none font-semibold bg-white" /></div>
                  <div className="col-span-2"><label className="block text-[10px] font-semibold text-sky-800 mb-0.5">Negocio / Empresa</label><input type="text" value={form.negocio || ''} onChange={e => setForm(p => ({ ...p, negocio: e.target.value }))} className="w-full border border-sky-200 rounded-md px-2.5 py-1.5 text-xs outline-none font-semibold bg-white" /></div>
                  <div><label className="block text-[10px] font-semibold text-sky-800 mb-0.5">NIT</label><input type="text" value={form.nit || ''} onChange={e => setForm(p => ({ ...p, nit: e.target.value }))} className="w-full border border-sky-200 rounded-md px-2.5 py-1.5 text-xs outline-none font-semibold bg-white" /></div>
                  <div className="col-span-2"><label className="block text-[10px] font-semibold text-sky-800 mb-0.5">Dirección</label><input type="text" value={form.direccion || ''} onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))} className="w-full border border-sky-200 rounded-md px-2.5 py-1.5 text-xs outline-none font-semibold bg-white" /></div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Descripción / Notas</label>
                <textarea value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-sky-400 focus:ring-1 focus:ring-sky-100 outline-none resize-none font-medium text-slate-700 bg-slate-50 focus:bg-white transition" placeholder="Detalles adicionales..." />
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
                          <div key={doc} className="space-y-1">
                            <span className="text-[10px] font-bold text-sky-800">{doc}</span>
                            {existente !== undefined && existente !== -1 ? (
                              <div className="flex items-center justify-between bg-white border border-emerald-200 rounded-md px-2.5 py-1.5">
                                <span className="text-[10px] text-emerald-600 font-semibold">✅ Guardado</span>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:border-sky-400 transition" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:border-sky-400 transition">
                    {(form.tipo === 'Particular' ? ESTADOS_PARTICULAR : ESTADOS_TAREA).map(e => <option key={e}>{e}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50 rounded-b-xl">
              <button onClick={() => setModal(false)} disabled={subiendoFiles} className="btn-ghost">Cancelar</button>
              <button onClick={guardar} disabled={subiendoFiles} className="btn-primary flex items-center gap-1.5">
                {subiendoFiles ? <RotateCcw size={13} className="animate-spin" /> : <CheckCircle size={13} />} 
                {subiendoFiles ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview imagen */}
      {imgPreview && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md" onClick={() => setImgPreview(null)}>
          <button onClick={() => setImgPreview(null)} className="absolute top-4 right-4 text-white bg-white/10 p-2 rounded-lg hover:bg-white/20 transition"><X size={20} /></button>
          <img src={imgPreview} alt="Vista previa" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
