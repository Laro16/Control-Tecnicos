import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { supabase } from './supabase.jsx'
import {
  Upload, Clipboard, MessageCircle, FileText, FileSpreadsheet,
  Plus, Pencil, Trash2, CheckCircle, X, ChevronDown,
  Wrench, ClipboardList, AlertCircle, RotateCcw
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────────────────

const TODAY = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

// Simplificador de nombres de clientes
function simplificarCliente(cliente) {
  if (!cliente) return '-'
  const upper = cliente.toUpperCase()
  if (upper.includes('COMERCIALIZADORA Y PRODUCTORA DE BEBIDAS LOS VOLCANES')) {
    return 'Los Volcanes'
  }
  if (upper.includes('CERVECERIA CENTROAMERICANA')) {
    return 'Cervecería'
  }
  return cliente
}

// Construye el mensaje WhatsApp de un técnico
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
    
    // Agregar comentario si está en proceso
    if (t['ESTADO'].toUpperCase().includes('PROCESO') && t['DESCRIPCIÓN'] !== '-') {
      msg += `\n⚠️ *COMENTARIO EN PROCESO:*\n${t['DESCRIPCIÓN']}\n`
    }
  })
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━`
  return msg
}

// Badge de estado del ticket
function TicketBadge({ estado }) {
  const estNormalizado = (estado || '').toString().toLowerCase();
  let cls = 'badge-asignada'
  if (estNormalizado.includes('proceso')) cls = 'badge-proceso'
  if (estNormalizado.includes('agencia')) cls = 'badge-agencia'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {estado}
    </span>
  )
}

// ─── MÓDULO TÉCNICOS ─────────────────────────────────────────────────────────

function ModuloTecnicos() {
  const [grupos, setGrupos] = useState({})
  const [dragging, setDragging] = useState(false)
  const [expandido, setExpandido] = useState({})
  const [nombreArchivo, setNombreArchivo] = useState('')
  const fileRef = useRef()
  const cardRefs = useRef({})

  // Procesa el archivo Excel
  function procesarExcel(file) {
    if (!file) return;
    setNombreArchivo(file.name);
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rawMatrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      
      let headerRowIndex = -1;
      let headerKeys = [];

      for (let i = 0; i < rawMatrix.length; i++) {
        const row = rawMatrix[i];
        const upperRow = row.map(cell => String(cell).trim().toUpperCase());
        if (upperRow.includes('ESTADO')) {
          headerRowIndex = i;
          headerKeys = upperRow;
          break;
        }
      }

      if (headerRowIndex === -1) {
        alert("⚠️ No encontré ninguna columna llamada 'ESTADO' en el archivo.\nVerifica que el Excel tenga esa columna.");
        return;
      }

      const agrupados = {}
      let ticketsEncontrados = 0

      for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
        const row = rawMatrix[i];
        const fila = {};
        
        headerKeys.forEach((key, index) => {
          if (key) fila[key] = row[index];
        });

        let estadoOriginal = String(fila['ESTADO'] || '').trim();
        let estadoLimpio = estadoOriginal.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const esAsignadoTecnico = estadoLimpio.includes('ASIGNAD') && estadoLimpio.includes('TECNICO');
        const esEnProceso = estadoLimpio.includes('PROCESO');
        const esAsignadoAgencia = estadoLimpio.includes('ASIGNAD') && estadoLimpio.includes('AGENCIA');

        if (esAsignadoTecnico || esEnProceso || esAsignadoAgencia) {
          ticketsEncontrados++;
          
          let tecnico = String(fila['TÉCNICO'] || fila['TECNICO'] || fila['TECNICOS'] || '').trim();
          if (!tecnico || tecnico === '') tecnico = 'SIN TÉCNICO';
          if (esAsignadoAgencia) tecnico = tecnico || 'SIN TÉCNICO';

          if (!agrupados[tecnico]) agrupados[tecnico] = [];
          
          let clienteOriginal = String(fila['CLIENTE'] || fila['NOMBRE CLIENTE'] || '-').trim();
          
          agrupados[tecnico].push({
            'N° REFERENCIA': fila['N° REFERENCIA'] || fila['NO REFERENCIA'] || fila['REFERENCIA'] || fila['TICKET'] || '-',
            'NEGOCIO': fila['NEGOCIO'] || fila['NOMBRE NEGOCIO'] || fila['SUCURSAL'] || '-',
            'DIRECCIÓN': fila['DIRECCIÓN'] || fila['DIRECCION'] || '-',
            'TELÉFONO': fila['TELÉFONO'] || fila['TELEFONO'] || fila['TEL'] || '-',
            'CLIENTE': simplificarCliente(clienteOriginal),
            'SERIE': fila['SERIE'] || fila['NO SERIE'] || '-',
            'MODELO': fila['MODELO'] || '-',
            'ESTADO': estadoOriginal,
            'DESCRIPCIÓN INICIAL': fila['DESCRIPCIÓN INICIAL'] || fila['DESCRIPCION INICIAL'] || '-',
            'DESCRIPCIÓN': fila['DESCRIPCIÓN'] || fila['DESCRIPCION'] || fila['COMENTARIO'] || '-'
          })
        }
      }

      if (ticketsEncontrados === 0) {
        alert("⚠️ Encontré la columna 'ESTADO', pero no detecté ningún ticket asignado o en proceso.");
      } else {
        setGrupos(agrupados)
        const exp = {}
        Object.keys(agrupados).forEach(k => (exp[k] = true))
        setExpandido(exp)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function onFileChange(e) {
    const f = e.target.files[0]
    if (f) procesarExcel(f)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) procesarExcel(f)
  }

  function copiarTexto(tecnico, tickets) {
    navigator.clipboard.writeText(buildMessage(tecnico, tickets))
      .then(() => alert('✅ Texto copiado al portapapeles'))
  }

  function abrirWhatsapp(tecnico, tickets) {
    const num = prompt('Ingresa el número con código de país (Ej: 50230000000):')
    if (!num) return
    const msg = encodeURIComponent(buildMessage(tecnico, tickets))
    window.open(`https://wa.me/${num.replace(/\D/g,'')}?text=${msg}`, '_blank')
  }

  // Generar PDF del técnico
  function generarPDF(tecnico, tickets) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const fecha = TODAY()
    let y = 15

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(`TÉCNICO: ${tecnico}`, 14, y)
    y += 7
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Fecha: ${fecha}  |  Tickets: ${tickets.length}`, 14, y)
    y += 5
    doc.setDrawColor(180)
    doc.line(14, y, 196, y)
    y += 6

    tickets.forEach((t, i) => {
      if (y > 265) { doc.addPage(); y = 15 }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(`#${i+1}  Ref: ${t['N° REFERENCIA'] || '-'}`, 14, y)
      y += 5

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const lines = [
        `Negocio: ${t['NEGOCIO'] || '-'}`,
        `Dirección: ${t['DIRECCIÓN'] || '-'}`,
        `Teléfono: ${t['TELÉFONO'] || '-'}`,
        `Cliente: ${t['CLIENTE'] || '-'}`,
        `Serie: ${t['SERIE'] || '-'}   Modelo: ${t['MODELO'] || '-'}`,
        `Estado: ${t['ESTADO'] || '-'}`,
        `Descripción Inicial: ${t['DESCRIPCIÓN INICIAL'] || '-'}`,
      ]
      
      if (t['ESTADO'].toUpperCase().includes('PROCESO') && t['DESCRIPCIÓN'] !== '-') {
        lines.push(`Comentario (En Proceso): ${t['DESCRIPCIÓN']}`);
      }

      lines.forEach(l => {
        const wrapped = doc.splitTextToSize(l, 180)
        if (y > 270) { doc.addPage(); y = 15 }
        doc.text(wrapped, 14, y)
        y += wrapped.length * 4.5
      })
      y += 2
      doc.setDrawColor(210)
      doc.line(14, y, 196, y)
      y += 4
    })

    doc.save(`Tickets_${tecnico.replace(/\s+/g,'_')}_${fecha.replace('/','')}.pdf`)
  }

  // Generar Excel por Técnico
  function generarExcelTecnico(tecnico, tickets) {
    const data = tickets.map(t => ({
      'N° REFERENCIA': t['N° REFERENCIA'],
      'NEGOCIO': t['NEGOCIO'],
      'DIRECCIÓN': t['DIRECCIÓN'],
      'TELÉFONO': t['TELÉFONO'],
      'CLIENTE': t['CLIENTE'],
      'SERIE': t['SERIE'],
      'MODELO': t['MODELO'],
      'ESTADO': t['ESTADO'],
      'DESCRIPCIÓN INICIAL': t['DESCRIPCIÓN INICIAL'],
      'DESCRIPCIÓN (PROCESO)': t['ESTADO'].toUpperCase().includes('PROCESO') && t['DESCRIPCIÓN'] !== '-' ? t['DESCRIPCIÓN'] : ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tickets Asignados");
    XLSX.writeFile(wb, `Tickets_${tecnico.replace(/\s+/g,'_')}.xlsx`);
  }

  const tieneDatos = Object.keys(grupos).length > 0

  return (
    <div className="space-y-6">
      {/* Zona de carga */}
      <div
        className={`drop-zone p-10 text-center cursor-pointer select-none ${dragging ? 'drag-over' : ''}`}
        onClick={() => fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Upload className="mx-auto mb-3 text-blue-400" size={36} />
        <p className="font-bold text-gray-700">Arrastra o haz clic para subir el Excel</p>
        <p className="text-sm text-gray-400 mt-1">Soporta formatos .xlsx, .xls y .csv</p>
        {nombreArchivo && <p className="text-sm font-bold text-blue-500 mt-3">Archivo: {nombreArchivo}</p>}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
      </div>

      {/* Cards por técnico */}
      {tieneDatos && Object.entries(grupos).map(([tecnico, tickets]) => (
        <div
          key={tecnico}
          ref={el => (cardRefs.current[tecnico] = el)}
          className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden fade-in"
        >
          {/* Header del técnico */}
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

            {/* Botones de acción */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                onClick={() => copiarTexto(tecnico, tickets)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 transition font-bold"
              >
                <Clipboard size={13} /> Copiar
              </button>
              <button
                onClick={() => abrirWhatsapp(tecnico, tickets)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 transition font-bold"
              >
                <MessageCircle size={13} /> WhatsApp
              </button>
              <button
                onClick={() => generarExcelTecnico(tecnico, tickets)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition font-bold"
              >
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button
                onClick={() => generarPDF(tecnico, tickets)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition font-bold"
              >
                <FileText size={13} /> PDF
              </button>
              <button
                onClick={() => setExpandido(p => ({ ...p, [tecnico]: !p[tecnico] }))}
                className="p-1.5 rounded-lg hover:bg-gray-200 transition text-gray-500"
              >
                <ChevronDown size={16} className={`transition-transform ${expandido[tecnico] ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {/* Lista de tickets */}
          {expandido[tecnico] && (
            <div className="divide-y divide-gray-50">
              {tickets.map((t, i) => (
                <div key={i} className="px-5 py-4 hover:bg-gray-50 transition">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          #{t['N° REFERENCIA'] || '-'}
                        </span>
                        <TicketBadge estado={t['ESTADO']} />
                      </div>
                      
                      <p className="text-sm text-gray-800"><span className="font-bold text-gray-900">NEGOCIO:</span> {t['NEGOCIO'] || '-'}</p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                        <p><span className="font-bold text-gray-800">📍 DIR:</span> {t['DIRECCIÓN'] || '-'}</p>
                        <p><span className="font-bold text-gray-800">📞 TEL:</span> {t['TELÉFONO'] || '-'}</p>
                        <p><span className="font-bold text-gray-800">👤 CLIENTE:</span> {t['CLIENTE'] || '-'}</p>
                        <div className="flex gap-3">
                          <p><span className="font-bold text-gray-800">🧊 SERIE:</span> {t['SERIE'] || '-'}</p>
                          <p><span className="font-bold text-gray-800">📦 MOD:</span> {t['MODELO'] || '-'}</p>
                        </div>
                      </div>
                      
                      {t['DESCRIPCIÓN INICIAL'] && t['DESCRIPCIÓN INICIAL'] !== '-' && (
                        <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5 border-l-2 border-blue-200">
                          <span className="font-bold text-gray-800 block mb-0.5">DESCRIPCIÓN INICIAL:</span>
                          {t['DESCRIPCIÓN INICIAL']}
                        </div>
                      )}

                      {t['ESTADO'].toUpperCase().includes('PROCESO') && t['DESCRIPCIÓN'] !== '-' && (
                        <div className="mt-1 text-xs text-yellow-800 bg-yellow-50 rounded px-2 py-1.5 border-l-2 border-yellow-300">
                          <span className="font-bold block mb-0.5">COMENTARIO (En Proceso):</span>
                          {t['DESCRIPCIÓN']}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {!tieneDatos && (
        <div className="text-center py-16 text-gray-300">
          <Wrench size={48} className="mx-auto mb-3" />
          <p className="text-sm font-medium">Sube un archivo Excel o CSV para ver los tickets</p>
        </div>
      )}
    </div>
  )
}

// ─── MÓDULO PENDIENTES ───────────────────────────────────────────────────────

const PRIORIDADES = ['Baja', 'Media', 'Alta']
const ESTADOS_P   = ['Pendiente', 'En proceso', 'Realizado', 'Cancelado']

const VACÍO = { titulo: '', descripcion: '', fecha: '', prioridad: 'Media', estado: 'Pendiente' }

function prioBadge(p) {
  if (p === 'Baja')  return 'prio-baja'
  if (p === 'Alta')  return 'prio-alta'
  return 'prio-media'
}
function estBadge(e) {
  if (e === 'Pendiente')  return 'est-pendiente'
  if (e === 'En proceso') return 'est-proceso'
  if (e === 'Realizado')  return 'est-realizado'
  return 'est-cancelado'
}

function ModuloPendientes() {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(VACÍO)
  const [editId, setEditId] = useState(null)
  const [filtro, setFiltro] = useState('Todos')
  const [error, setError] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase
      .from('pendientes')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError('Error al cargar. Verifica tu Supabase.')
    else setItems(data || [])
    setCargando(false)
  }

  function abrirNuevo() {
    setForm(VACÍO)
    setEditId(null)
    setModal(true)
  }

  function abrirEditar(item) {
    setForm({
      titulo: item.titulo,
      descripcion: item.descripcion || '',
      fecha: item.fecha || '',
      prioridad: item.prioridad,
      estado: item.estado,
    })
    setEditId(item.id)
    setModal(true)
  }

  async function guardar() {
    if (!form.titulo.trim()) { setError('El título es obligatorio.'); return }
    setError('')
    if (editId) {
      const { error } = await supabase.from('pendientes').update(form).eq('id', editId)
      if (error) { setError('Error al actualizar.'); return }
    } else {
      const { error } = await supabase.from('pendientes').insert([form])
      if (error) { setError('Error al guardar. ¿Creaste la tabla?'); return }
    }
    setModal(false)
    cargar()
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este pendiente?')) return
    await supabase.from('pendientes').delete().eq('id', id)
    cargar()
  }

  async function cambiarEstado(id, estadoActual) {
    const idx = ESTADOS_P.indexOf(estadoActual)
    const siguiente = ESTADOS_P[(idx + 1) % ESTADOS_P.length]
    await supabase.from('pendientes').update({ estado: siguiente }).eq('id', id)
    cargar()
  }

  const filtrados = filtro === 'Todos' ? items : items.filter(i => i.estado === filtro)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {['Todos', ...ESTADOS_P].map(e => (
            <button
              key={e}
              onClick={() => setFiltro(e)}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition border ${
                filtro === e
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <button
          onClick={abrirNuevo}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-xl font-bold transition shadow-sm"
        >
          <Plus size={15} /> Nuevo
        </button>
      </div>

      {error && !modal && (
        <div className="flex items-center gap-2 text-sm font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {cargando ? (
        <div className="text-center py-16 text-gray-400 text-sm font-bold">
          <RotateCcw size={30} className="mx-auto mb-2 animate-spin" />
          Cargando pendientes…
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-gray-300">
          <ClipboardList size={48} className="mx-auto mb-3" />
          <p className="text-sm font-bold">No hay pendientes en esta categoría</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(item => (
            <div key={item.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-4 fade-in hover:shadow-md transition">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="font-black text-gray-900 leading-tight">{item.titulo}</p>
                  {item.descripcion && (
                    <p className="text-sm text-gray-600 leading-snug">{item.descripcion}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${prioBadge(item.prioridad)}`}>
                      {item.prioridad}
                    </span>
                    <button
                      onClick={() => cambiarEstado(item.id, item.estado)}
                      className={`text-xs font-bold px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 transition ${estBadge(item.estado)}`}
                    >
                      {item.estado}
                    </button>
                    {item.fecha && (
                      <span className="text-xs font-medium text-gray-400">
                        📅 {item.fecha}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => abrirEditar(item)} className="p-2 rounded-lg hover:bg-blue-50 text-blue-500 transition">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => eliminar(item.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900">{editId ? 'Editar pendiente' : 'Nuevo pendiente'}</h3>
              <button onClick={() => setModal(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {error && <p className="text-sm font-bold text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Título *</label>
                <input type="text" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition font-medium" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Descripción</label>
                <textarea value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} rows={3} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition resize-none font-medium" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Fecha</label>
                <input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition font-medium" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Prioridad</label>
                  <select value={form.prioridad} onChange={e => setForm(p => ({ ...p, prioridad: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition bg-white font-bold">
                    {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 transition bg-white font-bold">
                    {ESTADOS_P.map(e => <option key={e}>{e}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setModal(false); setError('') }} className="px-4 py-2 rounded-xl text-sm text-gray-700 hover:bg-gray-100 transition font-bold">
                Cancelar
              </button>
              <button onClick={guardar} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm">
                <CheckCircle size={15} /> Guardar
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <Wrench size={16} className="text-white" />
            </div>
            <span className="font-black text-gray-900 text-lg tracking-tight">Ticket Manager</span>
          </div>

          <nav className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setTab('tecnicos')}
              className={`flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg font-bold transition ${
                tab === 'tecnicos' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Wrench size={14} /> Técnicos
            </button>
            <button
              onClick={() => setTab('pendientes')}
              className={`flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg font-bold transition ${
                tab === 'pendientes' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <ClipboardList size={14} /> Pendientes
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {tab === 'tecnicos' && <ModuloTecnicos />}
        {tab === 'pendientes' && <ModuloPendientes />}
      </main>

      <footer className="text-center text-xs font-bold text-gray-300 py-6">
        Ticket Manager · {new Date().getFullYear()}
      </footer>
    </div>
  )
}
