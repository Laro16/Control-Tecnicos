import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import JSZip from 'jszip'
import { supabase } from './supabase.jsx'
import {
  Upload, Clipboard, MessageCircle, FileText, FileSpreadsheet,
  Plus, Pencil, Trash2, CheckCircle, X, ChevronDown,
  Wrench, ClipboardList, AlertCircle, RotateCcw, Filter, Paperclip, DownloadCloud
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────────────────

const TODAY = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

function simplificarCliente(cliente) {
  if (!cliente) return '-'
  const upper = cliente.toUpperCase()
  if (upper.includes('COMERCIALIZADORA Y PRODUCTORA DE BEBIDAS LOS VOLCANES')) return 'Los Volcanes'
  if (upper.includes('CERVECERIA CENTROAMERICANA')) return 'Cervecería'
  return cliente
}

function buildMessage(tecnico, tickets) {
  const fecha = TODAY()
  let msg = `🔧 *TÉCNICO: ${tecnico}*\n📅 *FECHA:* ${fecha}\n`
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`
  tickets.forEach((t, i) => {
    if (i > 0) msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`
    msg += `\n📌 *REFERENCIA:* ${t['N° REFERENCIA'] || '-'}\n`
    msg += `🏪 *NEGOCIO:* ${t['NEGOCIO'] || '-'}\n`
    msg += `📍 *DIRECCIÓN:* ${t['DIRECCIÓN'] || '-'}\n`
    msg += `📞 *TELÉFONO:* ${t['TELÉFONO'] || '-'}\n`
    msg += `👤 *CLIENTE:* ${t['CLIENTE'] || '-'}\n`
    msg += `🧊 *SERIE:* ${t['SERIE'] || '-'}  📦 *MODELO:* ${t['MODELO'] || '-'}\n`
    msg += `📝 *DESCRIPCIÓN INICIAL:*\n${t['DESCRIPCIÓN INICIAL'] || '-'}\n`
    
    if (t['ESTADO'].toUpperCase().includes('PROCESO') && t['DESCRIPCIÓN'] !== '-') {
      msg += `\n⚠️ *COMENTARIO EN PROCESO:*\n${t['DESCRIPCIÓN']}\n`
    }
  })
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━`
  return msg
}

function TicketBadge({ estado }) {
  const estNormalizado = (estado || '').toString().toLowerCase()
  let cls = 'badge-asignada'
  if (estNormalizado.includes('proceso')) cls = 'badge-proceso'
  if (estNormalizado.includes('agencia')) cls = 'badge-agencia'
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{estado}</span>
}

// ─── MÓDULO TÉCNICOS ─────────────────────────────────────────────────────────

function ModuloTecnicos() {
  const [grupos, setGrupos] = useState({})
  const [dragging, setDragging] = useState(false)
  const [expandido, setExpandido] = useState({})
  const [nombreArchivo, setNombreArchivo] = useState('')
  
  // Filtros
  const [filtroTecnico, setFiltroTecnico] = useState('Todos')
  const [filtroEstadoGlobal, setFiltroEstadoGlobal] = useState('Todos')

  const fileRef = useRef()

  function procesarExcel(file) {
    if (!file) return
    setNombreArchivo(file.name)
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rawMatrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      
      let headerRowIndex = -1
      let headerKeys = []

      for (let i = 0; i < rawMatrix.length; i++) {
        const row = rawMatrix[i]
        const upperRow = row.map(cell => String(cell).trim().toUpperCase())
        if (upperRow.includes('ESTADO')) {
          headerRowIndex = i
          headerKeys = upperRow
          break
        }
      }

      if (headerRowIndex === -1) {
        alert("⚠️ No encontré ninguna columna llamada 'ESTADO'.")
        return
      }

      const agrupados = {}
      let ticketsEncontrados = 0

      for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
        const row = rawMatrix[i]
        const fila = {}
        headerKeys.forEach((key, index) => { if (key) fila[key] = row[index] })

        let estadoOriginal = String(fila['ESTADO'] || '').trim()
        let estadoLimpio = estadoOriginal.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

        const esAsignadoTecnico = estadoLimpio.includes('ASIGNAD') && estadoLimpio.includes('TECNICO')
        const esEnProceso = estadoLimpio.includes('PROCESO')
        const esAsignadoAgencia = estadoLimpio.includes('ASIGNAD') && estadoLimpio.includes('AGENCIA')

        if (esAsignadoTecnico || esEnProceso || esAsignadoAgencia) {
          ticketsEncontrados++
          let tecnico = String(fila['TÉCNICO'] || fila['TECNICO'] || fila['TECNICOS'] || '').trim()
          if (!tecnico || tecnico === '') tecnico = 'SIN TÉCNICO'
          if (esAsignadoAgencia) tecnico = tecnico || 'SIN TÉCNICO'

          if (!agrupados[tecnico]) agrupados[tecnico] = []
          
          let clienteOriginal = String(fila['CLIENTE'] || fila['NOMBRE CLIENTE'] || '-').trim()
          agrupados[tecnico].push({
            'N° REFERENCIA': fila['N° REFERENCIA'] || fila['NO REFERENCIA'] || fila['REFERENCIA'] || fila['TICKET'] || '-',
            'NEGOCIO': fila['NEGOCIO'] || fila['NOMBRE NEGOCIO'] || fila['SUCURSAL'] || '-',
            'DIRECCIÓN': fila['DIRECCIÓN'] || fila['DIRECCION'] || '-',
            'TELÉFONO': fila['TELÉFONO'] || fila['TELEFONO'] || fila['TEL'] || '-',
            'CLIENTE': simplificarCliente(clienteOriginal),
            'SERIE': fila['SERIE'] || fila['NO SERIE'] || '-',
            'MODELO': fila['MODELO'] || '-',
            'ESTADO': estadoOriginal,
            'ESTADO_LIMPIO': estadoLimpio, // Helper para filtros
            'DESCRIPCIÓN INICIAL': fila['DESCRIPCIÓN INICIAL'] || fila['DESCRIPCION INICIAL'] || '-',
            'DESCRIPCIÓN': fila['DESCRIPCIÓN'] || fila['DESCRIPCION'] || fila['COMENTARIO'] || '-'
          })
        }
      }

      if (ticketsEncontrados === 0) {
        alert("⚠️ No detecté ningún ticket asignado o en proceso.")
      } else {
        setGrupos(agrupados)
        const exp = {}
        Object.keys(agrupados).forEach(k => (exp[k] = true))
        setExpandido(exp)
        setFiltroTecnico('Todos')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function onFileChange(e) { if (e.target.files[0]) procesarExcel(e.target.files[0]) }
  function onDrop(e) { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) procesarExcel(e.dataTransfer.files[0]) }

  function generarExcelTecnico(tecnico, tickets) {
    const data = tickets.map(t => ({
      'N° REFERENCIA': t['N° REFERENCIA'], 'NEGOCIO': t['NEGOCIO'], 'DIRECCIÓN': t['DIRECCIÓN'],
      'TELÉFONO': t['TELÉFONO'], 'CLIENTE': t['CLIENTE'], 'SERIE': t['SERIE'], 'MODELO': t['MODELO'],
      'ESTADO': t['ESTADO'], 'DESCRIPCIÓN INICIAL': t['DESCRIPCIÓN INICIAL'],
      'DESCRIPCIÓN (PROCESO)': t['ESTADO'].toUpperCase().includes('PROCESO') && t['DESCRIPCIÓN'] !== '-' ? t['DESCRIPCIÓN'] : ''
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Tickets")
    XLSX.writeFile(wb, `Tickets_${tecnico.replace(/\s+/g,'_')}.xlsx`)
  }

  function generarPDFGlobalEnProceso() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const fecha = TODAY()
    let y = 15

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(`REPORTE GLOBAL: TICKETS EN PROCESO`, 14, y)
    y += 7
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Fecha: ${fecha}`, 14, y)
    y += 5
    doc.setDrawColor(180)
    doc.line(14, y, 196, y)
    y += 6

    let count = 1
    Object.entries(grupos).forEach(([tecnico, tickets]) => {
      const ticketsEnProceso = tickets.filter(t => t['ESTADO_LIMPIO'].includes('PROCESO'))
      
      ticketsEnProceso.forEach(t => {
        if (y > 265) { doc.addPage(); y = 15 }
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text(`#${count} - TÉCNICO: ${tecnico} | Ref: ${t['N° REFERENCIA'] || '-'}`, 14, y)
        y += 5

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        const lines = [
          `Negocio: ${t['NEGOCIO'] || '-'}`,
          `Motivo / Comentario: ${t['DESCRIPCIÓN'] !== '-' ? t['DESCRIPCIÓN'] : t['DESCRIPCIÓN INICIAL']}`
        ]
        lines.forEach(l => {
          const wrapped = doc.splitTextToSize(l, 180)
          if (y > 270) { doc.addPage(); y = 15 }
          doc.text(wrapped, 14, y)
          y += wrapped.length * 4.5
        })
        y += 2
        doc.setDrawColor(230)
        doc.line(14, y, 196, y)
        y += 4
        count++
      })
    })

    if(count === 1) return alert("No hay tickets 'En Proceso' en este reporte.")
    doc.save(`Tickets_En_Proceso_${fecha.replace('/','')}.pdf`)
  }

  const tecnicosDetectados = Object.keys(grupos).sort()
  const tieneDatos = tecnicosDetectados.length > 0

  return (
    <div className="space-y-6">
      {/* Dropzone Compacto */}
      <div
        className={`border-2 border-dashed rounded-xl transition-all duration-200 p-4 flex flex-col sm:flex-row items-center justify-center gap-4 cursor-pointer bg-white ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
        onClick={() => fileRef.current.click()} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
      >
        <div className="bg-blue-50 p-3 rounded-full text-blue-500"><Upload size={24} /></div>
        <div className="text-center sm:text-left">
          <p className="font-bold text-gray-700">Arrastra o haz clic para subir Excel (.xlsx, .csv)</p>
          {nombreArchivo ? <p className="text-sm font-bold text-blue-500">{nombreArchivo}</p> : <p className="text-xs text-gray-400">Actualiza tus tickets al instante</p>}
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
      </div>

      {tieneDatos && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2 flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Filter size={12}/> Filtrar por Técnico</label>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setFiltroTecnico('Todos')} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition border ${filtroTecnico === 'Todos' ? 'bg-gray-800 text-white border-gray-800' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>Todos</button>
                {tecnicosDetectados.map(t => (
                  <button key={t} onClick={() => setFiltroTecnico(t)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition border ${filtroTecnico === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>{t}</button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-gray-100 pt-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Filtrar Estado (Global)</label>
              <div className="flex flex-wrap gap-2">
                {['Todos', 'Asignada a Técnico', 'En Proceso', 'Asignada a Agencia'].map(est => (
                  <button key={est} onClick={() => setFiltroEstadoGlobal(est)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition border ${filtroEstadoGlobal === est ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{est}</button>
                ))}
              </div>
            </div>
            
            <button onClick={generarPDFGlobalEnProceso} className="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 font-bold rounded-lg transition border border-red-200 text-sm">
              <FileText size={16} /> Generar PDF "En Proceso"
            </button>
          </div>
        </div>
      )}

      {/* Cards por técnico */}
      {tieneDatos && Object.entries(grupos)
        .filter(([tecnico]) => filtroTecnico === 'Todos' || filtroTecnico === tecnico)
        .map(([tecnico, ticketsRaw]) => {
          
          // Aplicar filtro de estado global
          const tickets = ticketsRaw.filter(t => filtroEstadoGlobal === 'Todos' || t['ESTADO_LIMPIO'].includes(filtroEstadoGlobal.replace('é','e').toUpperCase().split(' ')[0]))
          
          if (tickets.length === 0) return null; // Ocultar técnico si no tiene tickets con ese filtro

          return (
            <div key={tecnico} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden fade-in">
              <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                    <Wrench size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-black text-gray-900 text-lg leading-tight uppercase">{tecnico}</p>
                    <p className="text-xs font-bold text-gray-400">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button onClick={() => {navigator.clipboard.writeText(buildMessage(tecnico, tickets)); alert('Copiado')}} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold"><Clipboard size={13} /> Copiar</button>
                  <button onClick={() => {
                    const num = prompt('Número WhatsApp (Ej: 502...):')
                    if(num) window.open(`https://wa.me/${num.replace(/\D/g,'')}?text=${encodeURIComponent(buildMessage(tecnico, tickets))}`, '_blank')
                  }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 font-bold"><MessageCircle size={13} /> WhatsApp</button>
                  <button onClick={() => generarExcelTecnico(tecnico, tickets)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold"><FileSpreadsheet size={13} /> Excel</button>
                  <button onClick={() => setExpandido(p => ({ ...p, [tecnico]: !p[tecnico] }))} className="p-1.5 rounded-lg hover:bg-gray-200 transition text-gray-500"><ChevronDown size={16} className={`transition-transform ${expandido[tecnico] ? 'rotate-180' : ''}`} /></button>
                </div>
              </div>

              {expandido[tecnico] && (
                <div className="p-5">
                  {tickets.map((t, i) => (
                    <div key={i}>
                      <div className="hover:bg-gray-50 transition p-2 -mx-2 rounded-lg">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">#{t['N° REFERENCIA']}</span>
                          <TicketBadge estado={t['ESTADO']} />
                        </div>
                        
                        <p className="text-sm text-gray-800"><span className="font-bold text-gray-900">NEGOCIO:</span> {t['NEGOCIO']}</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 mt-1">
                          <p><span className="font-bold text-gray-800">📍 DIR:</span> <a href={`https://maps.google.com/?q=${encodeURIComponent(t['DIRECCIÓN'])}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{t['DIRECCIÓN']}</a></p>
                          <p><span className="font-bold text-gray-800">📞 TEL:</span> {t['TELÉFONO']}</p>
                          <p><span className="font-bold text-gray-800">👤 CLIENTE:</span> {t['CLIENTE']}</p>
                          <div className="flex gap-3">
                            <p><span className="font-bold text-gray-800">🧊 SERIE:</span> {t['SERIE']}</p>
                            <p><span className="font-bold text-gray-800">📦 MOD:</span> {t['MODELO']}</p>
                          </div>
                        </div>
                        
                        {t['DESCRIPCIÓN INICIAL'] && t['DESCRIPCIÓN INICIAL'] !== '-' && (
                          <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-3 py-2 border-l-2 border-blue-200">
                            <span className="font-bold text-gray-800 block mb-0.5">DESCRIPCIÓN INICIAL:</span>
                            {t['DESCRIPCIÓN INICIAL']}
                          </div>
                        )}

                        {t['ESTADO_LIMPIO'].includes('PROCESO') && t['DESCRIPCIÓN'] !== '-' && (
                          <div className="mt-2 text-xs text-yellow-800 bg-yellow-50 rounded px-3 py-2 border-l-2 border-yellow-300 shadow-sm">
                            <span className="font-bold block mb-0.5">COMENTARIO (En Proceso):</span>
                            {t['DESCRIPCIÓN']}
                          </div>
                        )}
                      </div>
                      
                      {/* Línea divisoria elegante excepto en el último */}
                      {i !== tickets.length - 1 && <hr className="my-4 border-gray-200 border-dashed" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}

// ─── MÓDULO PENDIENTES Y SERVICIOS ───────────────────────────────────────────

const PRIORIDADES = ['Baja', 'Media', 'Alta']
const ESTADOS_P   = ['Pendiente', 'En proceso', 'Realizado', 'Cancelado']

const VACIO_TAREA = { tipo: 'Tarea', titulo: '', descripcion: '', fecha: '', prioridad: 'Media', estado: 'Pendiente' }
const VACIO_PARTICULAR = { tipo: 'Particular', titulo: '', descripcion: '', fecha: '', prioridad: 'Media', estado: 'Pendiente', orden: '', correlativo: '', negocio: '', nit: '', direccion: '' }

function prioBadge(p) { return p === 'Baja' ? 'bg-gray-100 text-gray-700' : p === 'Alta' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800' }
function estBadge(e) { return e === 'Pendiente' ? 'bg-yellow-100 text-yellow-800' : e === 'En proceso' ? 'bg-blue-100 text-blue-800' : e === 'Realizado' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500' }

function ModuloPendientes() {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(VACIO_TAREA)
  const [editId, setEditId] = useState(null)
  const [filtro, setFiltro] = useState('Todos')
  const [vistaActual, setVistaActual] = useState('Tarea') // 'Tarea' | 'Particular'
  const [error, setError] = useState('')
  const [archivosSubir, setArchivosSubir] = useState([])
  const [subiendoFiles, setSubiendoFiles] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase.from('pendientes').select('*').order('created_at', { ascending: false })
    if (error) setError('Error DB: ¿Agregaste las nuevas columnas SQL?')
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

  // Compresor simple de imágenes
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
          const max_width = 1200; // Resolución tope
          const scaleSize = max_width / img.width;
          canvas.width = max_width;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          }, 'image/jpeg', 0.8);
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
      // 1. Subir archivos a Supabase Storage
      for (const fileRaw of archivosSubir) {
        const file = await comprimirImagen(fileRaw) // Comprime si es imagen, deja igual si es PDF/Excel
        const fileExt = file.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `${form.tipo}/${fileName}`

        const { error: uploadError } = await supabase.storage.from('adjuntos').upload(filePath, file)
        if (uploadError) throw new Error('Error al subir archivo: ' + uploadError.message)
        
        const { data: { publicUrl } } = supabase.storage.from('adjuntos').getPublicUrl(filePath)
        urlsNuevas.push({ nombre: fileRaw.name, url: publicUrl })
      }

      // Unir URLs nuevas con las que ya tenía si estamos editando
      const archivosFinales = editId ? [...(form.archivos || []), ...urlsNuevas] : urlsNuevas

      const datosGuardar = { ...form, archivos: archivosFinales }

      if (editId) {
        await supabase.from('pendientes').update(datosGuardar).eq('id', editId)
      } else {
        await supabase.from('pendientes').insert([datosGuardar])
      }
      
      setModal(false)
      cargar()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubiendoFiles(false)
    }
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar registro?')) return
    await supabase.from('pendientes').delete().eq('id', id)
    cargar()
  }

  async function cambiarEstado(id, estadoActual) {
    const idx = ESTADOS_P.indexOf(estadoActual)
    const siguiente = ESTADOS_P[(idx + 1) % ESTADOS_P.length]
    await supabase.from('pendientes').update({ estado: siguiente }).eq('id', id)
    cargar()
  }

  async function descargarZIP(item) {
    if(!item.archivos || item.archivos.length === 0) return alert("No hay archivos adjuntos.")
    const zip = new JSZip()
    const folder = zip.folder(`Adjuntos_${item.titulo.replace(/\s+/g, '_')}`)
    
    // Descargar cada archivo desde la URL y meterlo al ZIP
    for (let i = 0; i < item.archivos.length; i++) {
      const arch = item.archivos[i];
      // Si el formato de BD es un string crudo o JSON parseado
      let urlStr = typeof arch === 'string' ? JSON.parse(arch).url : arch.url;
      let nomStr = typeof arch === 'string' ? JSON.parse(arch).nombre : arch.nombre;
      
      try {
        const response = await fetch(urlStr)
        const blob = await response.blob()
        folder.file(nomStr || `archivo_${i}`, blob)
      } catch (e) {
        console.error("Error bajando archivo para zip", e)
      }
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

  return (
    <div className="space-y-5">
      {/* Selector Tareas vs Servicios Particulares */}
      <div className="flex p-1 bg-white border border-gray-200 rounded-xl max-w-sm mx-auto mb-6 shadow-sm">
        <button onClick={() => {setVistaActual('Tarea'); setFiltro('Todos')}} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${vistaActual === 'Tarea' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>Mis Pendientes</button>
        <button onClick={() => {setVistaActual('Particular'); setFiltro('Todos')}} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${vistaActual === 'Particular' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>Servicios Particulares</button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {['Todos', ...ESTADOS_P].map(e => (
            <button key={e} onClick={() => setFiltro(e)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition border ${filtro === e ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>{e}</button>
          ))}
        </div>
        <button onClick={abrirNuevo} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-xl font-bold transition shadow-sm">
          <Plus size={15} /> Nuevo {vistaActual === 'Tarea' ? 'Pendiente' : 'Servicio'}
        </button>
      </div>

      {error && !modal && <div className="text-sm font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>}

      {cargando ? (
        <div className="text-center py-16 text-gray-400 font-bold"><RotateCcw size={30} className="mx-auto mb-2 animate-spin" /> Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-gray-300"><ClipboardList size={48} className="mx-auto mb-3" /> <p className="font-bold">No hay registros</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtrados.map(item => (
            <div key={item.id} className={`bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-5 transition relative overflow-hidden ${item.estado === 'Realizado' ? 'opacity-70' : ''}`}>
              {/* Franja de color superior si es particular */}
              {item.tipo === 'Particular' && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>}

              <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div className="flex-1 min-w-0">
                  <p className={`font-black text-lg text-gray-900 leading-tight ${item.estado === 'Realizado' ? 'line-through text-gray-400' : ''}`}>{item.titulo}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => abrirEditar(item)} className="p-1.5 rounded-md hover:bg-blue-50 text-blue-500 transition"><Pencil size={15} /></button>
                  <button onClick={() => eliminar(item.id)} className="p-1.5 rounded-md hover:bg-red-50 text-red-400 transition"><Trash2 size={15} /></button>
                </div>
              </div>

              {/* Contenido Dinámico Tarea vs Particular */}
              <div className="space-y-3 text-sm">
                {item.tipo === 'Particular' && (
                  <div className="grid grid-cols-2 gap-2 text-xs bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                    <p><span className="font-bold text-blue-900">ORDEN:</span> <span className="font-mono text-blue-700 bg-white px-1 rounded">{item.orden || '-'}</span></p>
                    <p><span className="font-bold text-blue-900">CORR:</span> <span className="font-mono text-blue-700 bg-white px-1 rounded">{item.correlativo || '-'}</span></p>
                    <p className="col-span-2"><span className="font-bold text-blue-900">NEGOCIO:</span> {item.negocio || '-'}</p>
                    <p className="col-span-2"><span className="font-bold text-blue-900">NIT:</span> {item.nit || '-'}</p>
                    <p className="col-span-2"><span className="font-bold text-blue-900">DIR:</span> {item.direccion || '-'}</p>
                  </div>
                )}
                
                {item.descripcion && <p className="text-gray-600 leading-snug">{item.descripcion}</p>}
                
                {item.archivos && item.archivos.length > 0 && (
                  <div className="pt-2 border-t border-gray-50 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 flex items-center gap-1"><Paperclip size={12} /> {item.archivos.length} adjuntos</span>
                    <button onClick={() => descargarZIP(item)} className="text-xs font-bold flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition"><DownloadCloud size={14}/> Bajar ZIP</button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between flex-wrap mt-4 pt-3 border-t border-gray-100">
                 <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${prioBadge(item.prioridad)}`}>{item.prioridad}</span>
                    <button onClick={() => cambiarEstado(item.id, item.estado)} className={`text-xs font-bold px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition ${estBadge(item.estado)}`}>{item.estado}</button>
                  </div>
                  {item.fecha && <span className={`text-xs font-bold ${new Date(item.fecha) < new Date() && item.estado !== 'Realizado' ? 'text-red-500' : 'text-gray-400'}`}>📅 {item.fecha}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Formulario Unificado */}
      {modal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h3 className="font-black text-gray-900 text-lg">{editId ? 'Editar' : 'Nuevo'} {form.tipo === 'Particular' ? 'Servicio Particular' : 'Pendiente'}</h3>
              <button onClick={() => setModal(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"><X size={20} /></button>
            </div>
            
            <div className="px-6 py-5 space-y-4">
              {error && <p className="text-sm font-bold text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

              {/* Campos comunes */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Título / Nombre *</label>
                <input type="text" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-medium" />
              </div>

              {/* Campos Específicos Servicios Particulares */}
              {form.tipo === 'Particular' && (
                <div className="grid grid-cols-2 gap-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                  <div>
                    <label className="block text-xs font-bold text-blue-800 mb-1">Orden N°</label>
                    <input type="text" value={form.orden || ''} onChange={e => setForm(p => ({ ...p, orden: e.target.value }))} className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-blue-800 mb-1">Correlativo</label>
                    <input type="text" value={form.correlativo || ''} onChange={e => setForm(p => ({ ...p, correlativo: e.target.value }))} className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-blue-800 mb-1">Negocio / Empresa</label>
                    <input type="text" value={form.negocio || ''} onChange={e => setForm(p => ({ ...p, negocio: e.target.value }))} className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-blue-800 mb-1">NIT</label>
                    <input type="text" value={form.nit || ''} onChange={e => setForm(p => ({ ...p, nit: e.target.value }))} className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-blue-800 mb-1">Dirección Exacta</label>
                    <input type="text" value={form.direccion || ''} onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))} className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm outline-none" />
                  </div>
                </div>
              )}

              {/* Descripción */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Descripción / Notas</label>
                <textarea value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none font-medium" />
              </div>

              {/* Selector Archivos */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Subir Archivos (Imágenes, PDF, Excel)</label>
                <input type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.csv" onChange={(e) => setArchivosSubir(Array.from(e.target.files))} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
                {archivosSubir.length > 0 && <p className="text-xs text-blue-600 mt-2 font-bold">{archivosSubir.length} archivos seleccionados listos para subir.</p>}
                {editId && form.archivos?.length > 0 && <p className="text-xs text-gray-500 mt-1">Este registro ya tiene {form.archivos.length} archivos guardados. Los nuevos se agregarán.</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Prioridad</label>
                  <select value={form.prioridad} onChange={e => setForm(p => ({ ...p, prioridad: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none font-bold">
                    {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setModal(false)} disabled={subiendoFiles} className="px-4 py-2 rounded-xl text-sm text-gray-700 hover:bg-gray-200 font-bold transition">Cancelar</button>
              <button onClick={guardar} disabled={subiendoFiles} className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                {subiendoFiles ? <RotateCcw size={16} className="animate-spin" /> : <CheckCircle size={16} />} 
                {subiendoFiles ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState('tecnicos')

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white"><Wrench size={16} /></div>
            <span className="font-black text-gray-900 text-xl tracking-tight">TicketManager Pro</span>
          </div>

          <nav className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto">
            <button onClick={() => setTab('tecnicos')} className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 text-sm px-5 py-2 rounded-lg font-bold transition ${tab === 'tecnicos' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}>
               Técnicos
            </button>
            <button onClick={() => setTab('pendientes')} className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 text-sm px-5 py-2 rounded-lg font-bold transition ${tab === 'pendientes' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}>
               Gestión Personal
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'tecnicos' && <ModuloTecnicos />}
        {tab === 'pendientes' && <ModuloPendientes />}
      </main>
    </div>
  )
}
