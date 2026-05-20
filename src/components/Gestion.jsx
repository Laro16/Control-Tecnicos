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

const VACIO_TAREA = { tipo: 'Tarea', titulo: '', descripcion: '', fecha: '', prioridad: 'Media', estado: 'Pendiente' }
const VACIO_PARTICULAR = { tipo: 'Particular', titulo: '', descripcion: '', fecha: '', prioridad: 'Media', estado: 'Pendiente de pago', orden: '', correlativo: '', negocio: '', nit: '', direccion: '' }

function prioBadge(p) { return p === 'Baja' ? 'bg-gray-100 text-gray-700 border-gray-200' : p === 'Alta' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-orange-100 text-orange-800 border-orange-200' }
function estBadge(e) { 
  if (e === 'Pendiente' || e === 'Pendiente de pago') return 'bg-yellow-100 text-yellow-800 border-yellow-200'
  if (e === 'En proceso' || e === 'En Proceso') return 'bg-blue-100 text-blue-800 border-blue-200'
  if (e === 'Realizado' || e === 'Pagado' || e === 'Completada') return 'bg-green-100 text-green-800 border-green-200'
  return 'bg-gray-100 text-gray-500 border-gray-200'
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

  function abrirNuevo() {
    setForm(vistaActual === 'Tarea' ? VACIO_TAREA : VACIO_PARTICULAR)
    setEditId(null)
    setArchivosSubir([])
    setModal(true)
  }

  function abrirEditar(item) {
    setForm(item)
    setEditId(item.id)
    setArchivosSubir([])
    setModal(true)
  }

  function eliminarArchivoExistente(index) {
    if(!confirm('¿Quitar este archivo del registro?')) return;
    const nuevosArchivos = [...form.archivos];
    nuevosArchivos.splice(index, 1);
    setForm({ ...form, archivos: nuevosArchivos });
  }

  function quitarArchivoParaSubir(index) {
    const nuevos = [...archivosSubir];
    nuevos.splice(index, 1);
    setArchivosSubir(nuevos);
  }

  function comprimirImagen(file) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) return resolve(file);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const max_width = 1200;
          const scaleSize = max_width / img.width;
          canvas.width = max_width;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => resolve(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', 0.8);
        };
      };
    });
  }

  async function guardar() {
    if (!form.titulo.trim()) return setError('El título es obligatorio.')
    setError('')
    setSubiendoFiles(true)

    try {
      let urlsNuevas = []
      for (const fileRaw of archivosSubir) {
        const file = await comprimirImagen(fileRaw)
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `${form.tipo}/${fileName}`

        const { error: uploadError } = await supabase.storage.from('adjuntos').upload(filePath, file)
        if (uploadError) throw new Error('Error subiendo archivo: ' + uploadError.message)
        
        const { data: { publicUrl } } = supabase.storage.from('adjuntos').getPublicUrl(filePath)
        urlsNuevas.push({ nombre: fileRaw.name, url: publicUrl })
      }

      const archivosFinales = editId ? [...(form.archivos || []), ...urlsNuevas] : urlsNuevas
      const datosGuardar = { ...form, archivos: archivosFinales }

      if (editId) await supabase.from('pendientes').update(datosGuardar).eq('id', editId)
      else await supabase.from('pendientes').insert([datosGuardar])
      
      setModal(false)
      cargar()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubiendoFiles(false)
    }
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar registro de la base de datos?')) return
    await supabase.from('pendientes').delete().eq('id', id)
    cargar()
  }

  async function cambiarEstado(id, estadoActual, tipo) {
    const listaEstados = tipo === 'Particular' ? ESTADOS_PARTICULAR : ESTADOS_TAREA
    const idx = listaEstados.indexOf(estadoActual)
    const siguiente = listaEstados[(idx + 1) % listaEstados.length]
    await supabase.from('pendientes').update({ estado: siguiente }).eq('id', id)
    cargar()
  }

  async function descargarZIP(item) {
    if(!item.archivos || item.archivos.length === 0) return alert("No hay archivos adjuntos.")
    const zip = new JSZip()
    const folder = zip.folder(`Archivos_${item.titulo.replace(/\s+/g, '_')}`)
    
    for (let i = 0; i < item.archivos.length; i++) {
      const arch = item.archivos[i];
      let urlStr = typeof arch === 'string' ? JSON.parse(arch).url : arch.url;
      let nomStr = typeof arch === 'string' ? JSON.parse(arch).nombre : arch.nombre;
      try {
        const response = await fetch(urlStr)
        const blob = await response.blob()
        folder.file(nomStr || `archivo_${i}`, blob)
      } catch (e) { console.error(e) }
    }
    zip.generateAsync({ type: 'blob' }).then(content => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = `Adjuntos_${item.titulo}.zip`;
      a.click();
    })
  }

  const itemsVista = items.filter(i => i.tipo === vistaActual || (!i.tipo && vistaActual === 'Tarea'))
  const filtrados = filtro === 'Todos' ? itemsVista : itemsVista.filter(i => i.estado === filtro)
  const tabsActuales = vistaActual === 'Tarea' ? ESTADOS_TAREA : ESTADOS_PARTICULAR

  return (
    <div className="space-y-6">
      <div className="flex p-1 bg-white border border-gray-200 rounded-xl max-w-sm mx-auto shadow-sm">
        <button onClick={() => {setVistaActual('Tarea'); setFiltro('Todos')}} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${vistaActual === 'Tarea' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>Mis Pendientes</button>
        <button onClick={() => {setVistaActual('Particular'); setFiltro('Todos')}} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${vistaActual === 'Particular' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>Servicios Particulares</button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {['Todos', ...tabsActuales].map(e => (
            <button key={e} onClick={() => setFiltro(e)} className={`text-xs px-4 py-2 rounded-xl font-bold transition border ${filtro === e ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>{e}</button>
          ))}
        </div>
        <button onClick={abrirNuevo} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2.5 rounded-xl font-bold transition shadow-md">
          <Plus size={16} /> Nuevo {vistaActual === 'Tarea' ? 'Pendiente' : 'Servicio'}
        </button>
      </div>

      {error && !modal && <div className="text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 shadow-sm">{error}</div>}

      {cargando ? (
        <div className="text-center py-20 text-gray-400 font-bold"><RotateCcw size={32} className="mx-auto mb-3 animate-spin text-blue-500" /> Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-20 text-gray-400"><ClipboardList size={54} className="mx-auto mb-4 text-gray-300" /> <p className="font-bold text-lg">No hay registros aquí</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtrados.map(item => (
            <div key={item.id} className={`bg-white border border-gray-200 rounded-2xl shadow-md px-6 py-6 transition-all relative overflow-hidden ${(item.estado === 'Realizado' || item.estado === 'Completada' || item.estado === 'Pagado') ? 'opacity-75 bg-gray-50' : 'hover:shadow-lg hover:border-blue-200'}`}>
              {item.tipo === 'Particular' && <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-blue-700"></div>}

              <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                <div className="flex-1 min-w-0">
                  <p className={`font-black text-xl text-gray-900 leading-tight ${(item.estado === 'Realizado' || item.estado === 'Completada') ? 'line-through text-gray-500' : ''}`}>{item.titulo}</p>
                </div>
                <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg">
                  <button onClick={() => abrirEditar(item)} className="p-1.5 rounded-md hover:bg-white hover:shadow-sm text-blue-600 transition"><Pencil size={16} /></button>
                  {item.tipo === 'Tarea' && (
                    <button onClick={() => eliminar(item.id)} className="p-1.5 rounded-md hover:bg-white hover:shadow-sm text-red-500 transition"><Trash2 size={16} /></button>
                  )}
                </div>
              </div>

              <div className="space-y-4 text-sm">
                {item.tipo === 'Particular' && (
                  <div className="grid grid-cols-2 gap-3 text-xs bg-blue-50 p-4 rounded-xl border border-blue-100 shadow-inner">
                    <p><span className="font-bold text-blue-900 block mb-0.5">ORDEN:</span> <span className="font-mono font-bold text-blue-800 bg-white px-2 py-0.5 rounded border border-blue-200">{item.orden || '-'}</span></p>
                    <p><span className="font-bold text-blue-900 block mb-0.5">CORR:</span> <span className="font-mono font-bold text-blue-800 bg-white px-2 py-0.5 rounded border border-blue-200">{item.correlativo || '-'}</span></p>
                    <p className="col-span-2"><span className="font-bold text-blue-900">NEGOCIO:</span> {item.negocio || '-'}</p>
                    <p className="col-span-2"><span className="font-bold text-blue-900">NIT:</span> {item.nit || '-'}</p>
                    <p className="col-span-2"><span className="font-bold text-blue-900">DIR:</span> {item.direccion || '-'}</p>
                  </div>
                )}
                
                {item.descripcion && <p className="text-gray-700 leading-relaxed font-medium">{item.descripcion}</p>}
                
                {item.archivos && item.archivos.length > 0 && (
                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-gray-500 flex items-center gap-1.5"><Paperclip size={14} /> {item.archivos.length} archivos adjuntos</span>
                      <button onClick={() => descargarZIP(item)} className="text-xs font-bold flex items-center gap-1.5 text-blue-700 bg-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition shadow-sm"><DownloadCloud size={14}/> Descargar ZIP</button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {item.archivos.map((arch, idx) => {
                        const url = typeof arch === 'string' ? JSON.parse(arch).url : arch.url;
                        const nombre = typeof arch === 'string' ? JSON.parse(arch).nombre : arch.nombre;
                        const isImage = url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || nombre.match(/\.(jpeg|jpg|gif|png|webp)$/i);
                        
                        return (
                          <div key={idx} className="flex items-center gap-2 bg-white border border-gray-300 shadow-sm rounded-lg px-2.5 py-1.5 text-xs max-w-full hover:border-blue-300 transition">
                            {isImage ? (
                              <button onClick={() => setImgPreview(url)} className="text-blue-600 hover:text-blue-800 flex items-center gap-1.5 truncate max-w-[130px] font-bold"><ImageIcon size={14} className="shrink-0"/> <span className="truncate">{nombre}</span></button>
                            ) : (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="text-gray-700 hover:text-gray-900 flex items-center gap-1.5 truncate max-w-[130px] font-bold"><FileText size={14} className="shrink-0"/> <span className="truncate">{nombre}</span></a>
                            )}
                            <a href={url} target="_blank" rel="noopener noreferrer" download className="text-gray-400 hover:text-gray-700 border-l border-gray-200 pl-2 ml-1"><Download size={14} /></a>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between flex-wrap mt-6 pt-4 border-t border-gray-100">
                 <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${prioBadge(item.prioridad)}`}>{item.prioridad}</span>
                    <button onClick={() => cambiarEstado(item.id, item.estado, item.tipo)} className={`text-xs font-bold px-3 py-1 rounded-full border cursor-pointer hover:opacity-80 hover:shadow-sm transition ${estBadge(item.estado)}`}>{item.estado}</button>
                  </div>
                  {item.fecha && <span className={`text-xs font-bold bg-gray-100 px-3 py-1 rounded-full ${new Date(item.fecha) < new Date() && item.estado !== 'Realizado' ? 'text-red-600' : 'text-gray-500'}`}>📅 {item.fecha}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10 shadow-sm">
              <h3 className="font-black text-gray-900 text-xl">{editId ? 'Editar' : 'Nuevo'} {form.tipo === 'Particular' ? 'Servicio' : 'Pendiente'}</h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition"><X size={20} /></button>
            </div>
            
            <div className="px-6 py-6 space-y-5">
              {error && <p className="text-sm font-bold text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{error}</p>}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Título / Nombre *</label>
                <input type="text" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-bold text-gray-800 bg-gray-50 focus:bg-white transition" placeholder="Ej: Mantenimiento Preventivo" />
              </div>

              {form.tipo === 'Particular' && (
                <div className="grid grid-cols-2 gap-4 bg-blue-50 p-5 rounded-xl border border-blue-100 shadow-inner">
                  <div><label className="block text-xs font-bold text-blue-900 mb-1">Orden N°</label><input type="text" value={form.orden || ''} onChange={e => setForm(p => ({ ...p, orden: e.target.value }))} className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none font-medium bg-white" /></div>
                  <div><label className="block text-xs font-bold text-blue-900 mb-1">Correlativo</label><input type="text" value={form.correlativo || ''} onChange={e => setForm(p => ({ ...p, correlativo: e.target.value }))} className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none font-medium bg-white" /></div>
                  <div className="col-span-2"><label className="block text-xs font-bold text-blue-900 mb-1">Negocio / Empresa</label><input type="text" value={form.negocio || ''} onChange={e => setForm(p => ({ ...p, negocio: e.target.value }))} className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none font-medium bg-white" /></div>
                  <div><label className="block text-xs font-bold text-blue-900 mb-1">NIT</label><input type="text" value={form.nit || ''} onChange={e => setForm(p => ({ ...p, nit: e.target.value }))} className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none font-medium bg-white" /></div>
                  <div className="col-span-2"><label className="block text-xs font-bold text-blue-900 mb-1">Dirección Exacta</label><input type="text" value={form.direccion || ''} onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))} className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none font-medium bg-white" /></div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Descripción / Notas</label>
                <textarea value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} rows={4} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none font-medium text-gray-800 bg-gray-50 focus:bg-white transition" placeholder="Detalles adicionales..." />
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label className="block text-xs font-bold text-gray-700 mb-2">Adjuntar Nuevos Archivos</label>
                <input type="file" multiple onChange={(e) => setArchivosSubir(Array.from(e.target.files))} className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer transition" />
                
                {/* Visualizar archivos seleccionados para subir con opción a quitar */}
                {archivosSubir.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-bold text-blue-600">Listos para subir:</p>
                    {archivosSubir.map((arch, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg p-2">
                        <span className="text-xs text-blue-800 font-bold truncate max-w-[85%]">{arch.name}</span>
                        <button type="button" onClick={() => quitarArchivoParaSubir(idx)} className="text-blue-500 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Mostrar y gestionar archivos que ya están en la base de datos */}
                {editId && form.archivos?.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-200 space-y-2">
                    <p className="text-xs font-bold text-gray-500">Archivos ya guardados en este registro:</p>
                    {form.archivos.map((arch, idx) => {
                      const nombre = typeof arch === 'string' ? JSON.parse(arch).nombre : arch.nombre;
                      return (
                        <div key={idx} className="flex items-center justify-between bg-white border border-gray-300 rounded-lg p-2 shadow-sm">
                          <span className="text-xs text-gray-700 font-bold truncate max-w-[85%]">{nombre}</span>
                          <button type="button" onClick={() => eliminarArchivoExistente(idx)} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded transition" title="Quitar archivo">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-gray-700 mb-1.5">Fecha</label><input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none font-bold text-gray-800 bg-gray-50 focus:bg-white transition focus:border-blue-500" /></div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Estado Inicial</label>
                  <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none font-bold text-gray-800 bg-gray-50 focus:bg-white transition focus:border-blue-500">
                    {(form.tipo === 'Particular' ? ESTADOS_PARTICULAR : ESTADOS_TAREA).map(e => <option key={e}>{e}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-5 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setModal(false)} disabled={subiendoFiles} className="px-5 py-2.5 rounded-xl text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 font-bold transition shadow-sm">Cancelar</button>
              <button onClick={guardar} disabled={subiendoFiles} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-md disabled:opacity-60">
                {subiendoFiles ? <RotateCcw size={18} className="animate-spin" /> : <CheckCircle size={18} />} 
                {subiendoFiles ? 'Guardando...' : 'Guardar Registro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {imgPreview && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-md" onClick={() => setImgPreview(null)}>
          <button onClick={() => setImgPreview(null)} className="absolute top-6 right-6 text-white bg-white/10 p-3 rounded-full hover:bg-white/30 hover:scale-110 transition"><X size={24} /></button>
          <img src={imgPreview} alt="Vista previa" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl ring-1 ring-white/20" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
