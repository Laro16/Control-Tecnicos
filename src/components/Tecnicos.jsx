import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { 
  Upload, Clipboard, MessageCircle, FileText, FileSpreadsheet, 
  ChevronDown, Wrench, Filter, Calendar, Image
} from 'lucide-react'

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

function normalizarFechaExcel(fechaTexto) {
  if (!fechaTexto) return null
  const partes = String(fechaTexto).trim().split('/')
  if (partes.length === 3) {
    const dia = parseInt(partes[0], 10)
    const mes = parseInt(partes[1], 10) - 1
    const anio = parseInt(partes[2], 10)
    return new Date(anio, mes, dia)
  }
  return null
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
  if (estNormalizado.includes('finalizada')) cls = 'bg-emerald-100 text-emerald-800 border border-emerald-200'
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{estado}</span>
}

export default function ModuloTecnicos() {
  const [allTickets, setAllTickets] = useState([]) 
  const [dragging, setDragging] = useState(false)
  const [expandido, setExpandido] = useState({})
  const [nombreArchivo, setNombreArchivo] = useState('')
  
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  
  const [filtroTecnico, setFiltroTecnico] = useState('Todos')
  const [filtroEstadoGlobal, setFiltroEstadoGlobal] = useState('Todos')

  const fileRef = useRef()
  const tablaDinamicaRef = useRef()

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

      const listaTemporal = []

      for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
        const row = rawMatrix[i]
        const fila = {}
        headerKeys.forEach((key, index) => { if (key) fila[key] = row[index] })

        let estadoOriginal = String(fila['ESTADO'] || '').trim()
        let estadoLimpio = estadoOriginal.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

        const esAsignadoTecnico = estadoLimpio.includes('ASIGNAD') && estadoLimpio.includes('TECNICO')
        const esEnProceso = estadoLimpio.includes('PROCESO')
        const esAsignadoAgencia = estadoLimpio.includes('ASIGNAD') && estadoLimpio.includes('AGENCIA')
        const esFinalizada = estadoLimpio.includes('FINALIZADA')

        if (esAsignadoTecnico || esEnProceso || esAsignadoAgencia || esFinalizada) {
          let tecnico = String(fila['TÉCNICO'] || fila['TECNICO'] || fila['TÉCNICOS'] || fila['TECNICOS'] || '').trim()
          if (!tecnico || tecnico === '') tecnico = 'SIN TÉCNICO'
          if (esAsignadoAgencia) tecnico = tecnico || 'SIN TÉCNICO'

          let clienteOriginal = String(fila['CLIENTE'] || fila['NOMBRE CLIENTE'] || '-').trim()
          let fechaRaw = fila['FECHA'] || fila['FECHA ORDEN'] || fila['FECHA REVISION'] || fila['FECHA REVISIÓN'] || ''
          
          listaTemporal.push({
            tecnico: tecnico,
            'N° REFERENCIA': fila['N° REFERENCIA'] || fila['NO REFERENCIA'] || fila['REFERENCIA'] || fila['TICKET'] || '-',
            'NEGOCIO': fila['NEGOCIO'] || fila['NOMBRE NEGOCIO'] || fila['SUCURSAL'] || '-',
            'DIRECCIÓN': fila['DIRECCIÓN'] || fila['DIRECCION'] || '-',
            'TELÉFONO': fila['TELÉFONO'] || fila['TELEFONO'] || fila['TEL'] || '-',
            'CLIENTE': simplificarCliente(clienteOriginal),
            'SERIE': fila['SERIE'] || fila['NO SERIE'] || '-',
            'MODELO': fila['MODELO'] || '-',
            'ESTADO': estadoOriginal,
            'ESTADO_LIMPIO': estadoLimpio,
            'FECHA_TEXTO': fechaRaw,
            'FECHA_OBJ': normalizarFechaExcel(fechaRaw),
            'DESCRIPCIÓN INICIAL': fila['DESCRIPCIÓN INICIAL'] || fila['DESCRIPCION INICIAL'] || '-',
            'DESCRIPCIÓN': fila['DESCRIPCIÓN'] || fila['DESCRIPCION'] || fila['COMENTARIO'] || '-'
          })
        }
      }

      if (listaTemporal.length === 0) {
        alert("⚠️ No detecté ningún ticket con estados válidos.")
      } else {
        setAllTickets(listaTemporal)
        setFiltroTecnico('Todos')
        
        const fechasValidas = listaTemporal.map(t => t.FECHA_OBJ).filter(d => d !== null)
        if (fechasValidas.length > 0) {
          const minDate = new Date(Math.min(...fechasValidas))
          const maxDate = new Date(Math.max(...fechasValidas))
          setFechaInicio(minDate.toISOString().split('T')[0])
          setFechaFin(maxDate.toISOString().split('T')[0])
        }
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function onFileChange(e) { if (e.target.files[0]) procesarExcel(e.target.files[0]) }
  function onDrop(e) { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) procesarExcel(e.dataTransfer.files[0]) }

  const ticketsFiltradosPorFecha = allTickets.filter(t => {
    if (!t.FECHA_OBJ) return true 
    if (!fechaInicio || !fechaFin) return true
    const start = new Date(fechaInicio + 'T00:00:00')
    const end = new Date(fechaFin + 'T23:59:59')
    return t.FECHA_OBJ >= start && t.FECHA_OBJ <= end
  })

  const gruposAgrupados = {}
  ticketsFiltradosPorFecha.forEach(t => {
    if (!gruposAgrupados[t.tecnico]) gruposAgrupados[t.tecnico] = []
    gruposAgrupados[t.tecnico].push(t)
  })

  const tecnicosDetectados = Object.keys(gruposAgrupados).sort()

  const matrizDinamica = {}
  ticketsFiltradosPorFecha.forEach(t => {
    if (!matrizDinamica[t.tecnico]) {
      matrizDinamica[t.tecnico] = { total: 0, finalizadas: 0, proceso: 0, asignadas: 0, agencia: 0 }
    }
    matrizDinamica[t.tecnico].total++
    if (t.ESTADO_LIMPIO.includes('FINALIZADA')) matrizDinamica[t.tecnico].finalizadas++
    else if (t.ESTADO_LIMPIO.includes('PROCESO')) matrizDinamica[t.tecnico].proceso++
    else if (t.ESTADO_LIMPIO.includes('AGENCIA')) matrizDinamica[t.tecnico].agencia++
    else if (t.ESTADO_LIMPIO.includes('TECNICO')) matrizDinamica[t.tecnico].asignadas++
  })

  async function capturarTablaDinamica() {
    const el = tablaDinamicaRef.current
    if (!el) return
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2 })
    const link = document.createElement('a')
    link.download = `Resumen_Tabla_Dinamica_${TODAY().replace('/','_')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  function generarExcelTecnico(tecnico, tickets) {
    const data = tickets.map(t => ({
      'N° REFERENCIA': t['N° REFERENCIA'], 'NEGOCIO': t['NEGOCIO'], 'DIRECCIÓN': t['DIRECCIÓN'],
      'TELÉFONO': t['TELÉFONO'], 'CLIENTE': t['CLIENTE'], 'SERIE': t['SERIE'], 'MODELO': t['MODELO'],
      'ESTADO': t['ESTADO'], 'FECHA': t['FECHA_TEXTO'], 'DESCRIPCIÓN INICIAL': t['DESCRIPCIÓN INICIAL'],
      'DESCRIPCIÓN (PROCESO)': t['ESTADO_LIMPIO'].includes('PROCESO') && t['DESCRIPCIÓN'] !== '-' ? t['DESCRIPCIÓN'] : ''
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Tickets")
    XLSX.writeFile(wb, `Tickets_${tecnico.replace(/\s+/g,'_')}.xlsx`)
  }

  // NUEVO: Generador de PDF individual por técnico (Excluye finalizados)
  function generarPDFIndividual(tecnico, tickets) {
    const ticketsActivos = tickets.filter(t => !t['ESTADO_LIMPIO'].includes('FINALIZADA'))

    if(ticketsActivos.length === 0) {
      alert('No hay tickets activos (pendientes/en proceso) para este técnico.')
      return
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const fecha = TODAY()
    let y = 15

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(`TÉCNICO: ${tecnico}`, 14, y)
    y += 7
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Fecha: ${fecha}  |  Tickets a revisar: ${ticketsActivos.length}`, 14, y)
    y += 5
    doc.setDrawColor(180)
    doc.line(14, y, 196, y)
    y += 6

    ticketsActivos.forEach((t, i) => {
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
      
      if (t['ESTADO_LIMPIO'].includes('PROCESO') && t['DESCRIPCIÓN'] !== '-') {
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

    doc.save(`Tickets_Activos_${tecnico.replace(/\s+/g,'_')}_${fecha.replace('/','')}.pdf`)
  }

  function generarPDFGlobalEnProceso() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    let y = 15
    doc.setFont('helvetica', 'bold').setFontSize(14)
    doc.text(`REPORTE GLOBAL: TICKETS EN PROCESO`, 14, y)
    y += 12
    doc.setDrawColor(180).line(14, y-5, 196, y-5)

    let count = 1
    ticketsFiltradosPorFecha.filter(t => t.ESTADO_LIMPIO.includes('PROCESO')).forEach(t => {
      if (y > 265) { doc.addPage(); y = 15 }
      doc.setFont('helvetica', 'bold').setFontSize(10)
      doc.text(`#${count} - TÉCNICO: ${t.tecnico} | Ref: ${t['N° REFERENCIA'] || '-'}`, 14, y)
      y += 5
      doc.setFont('helvetica', 'normal').setFontSize(9)
      const wrapped = doc.splitTextToSize(`Negocio: ${t['NEGOCIO']} | Comentario: ${t['DESCRIPCIÓN'] !== '-' ? t['DESCRIPCIÓN'] : t['DESCRIPCIÓN INICIAL']}`, 180)
      doc.text(wrapped, 14, y)
      y += wrapped.length * 5 + 4
      count++
    })
    if(count === 1) return alert("No hay tickets en proceso en el rango de fechas seleccionado.")
    doc.save(`Tickets_En_Proceso_${TODAY().replace('/','')}.pdf`)
  }

  return (
    <div className="space-y-6">
      <div
        className={`border-2 border-dashed rounded-xl transition-all duration-200 p-4 flex flex-col sm:flex-row items-center justify-center gap-4 cursor-pointer bg-white ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
        onClick={() => fileRef.current.click()} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
      >
        <div className="bg-blue-50 p-3 rounded-full text-blue-500"><Upload size={24} /></div>
        <div className="text-center sm:text-left">
          <p className="font-bold text-gray-700">Arrastra o haz clic para cargar tu archivo general de órdenes</p>
          {nombreArchivo ? <p className="text-sm font-bold text-blue-500">{nombreArchivo}</p> : <p className="text-xs text-gray-400">Soporta cualquier formato de hoja de cálculo</p>}
        </div>
        <input ref={fileRef} type="file" className="hidden" onChange={onFileChange} />
      </div>

      {allTickets.length > 0 && (
        <>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 space-y-4 fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-gray-800 font-black text-sm uppercase">
                <Calendar size={18} className="text-blue-600" />
                Rango de Control de Fechas (Excel)
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border border-gray-300 rounded-lg p-1.5 text-xs font-bold outline-none focus:border-blue-500 bg-gray-50" />
                <span className="text-gray-400 font-bold text-xs">hasta</span>
                <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border border-gray-300 rounded-lg p-1.5 text-xs font-bold outline-none focus:border-blue-500 bg-gray-50" />
              </div>
            </div>

            <div ref={tablaDinamicaRef} className="p-2 bg-white rounded-xl">
              <div className="mb-2 text-xs font-bold text-gray-400 tracking-wider uppercase">Tabla Dinámica de Rendimiento Diario</div>
              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-900 text-white font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3">Técnico Responsable</th>
                      <th className="p-3 text-center bg-emerald-700">Orden Finalizada</th>
                      <th className="p-3 text-center bg-blue-700">En Proceso</th>
                      <th className="p-3 text-center bg-amber-600">Asignada Técnico</th>
                      <th className="p-3 text-center bg-purple-700">Asignada Agencia</th>
                      <th className="p-3 text-center bg-gray-800">Total Revisados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-bold text-gray-700">
                    {Object.entries(matrizDinamica).map(([tec, info]) => (
                      <tr key={tec} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3 uppercase text-gray-900">{tec}</td>
                        <td className="p-3 text-center text-emerald-600 bg-emerald-50/30">{info.finalizadas}</td>
                        <td className="p-3 text-center text-blue-600 bg-blue-50/30">{info.proceso}</td>
                        <td className="p-3 text-center text-amber-600 bg-amber-50/30">{info.asignadas}</td>
                        <td className="p-3 text-center text-purple-600 bg-purple-50/30">{info.agencia}</td>
                        <td className="p-3 text-center bg-gray-50 font-black text-gray-900">{info.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={capturarTablaDinamica} className="flex items-center gap-1.5 text-xs bg-gray-900 hover:bg-black text-white font-bold px-4 py-2 rounded-xl transition shadow-sm">
                <Image size={14} /> Capturar Tabla para WhatsApp Group
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Filter size={12}/> Tarjeta de Técnico Específico</label>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setFiltroTecnico('Todos')} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition border ${filtroTecnico === 'Todos' ? 'bg-gray-800 text-white border-gray-800' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>Todos</button>
                {tecnicosDetectados.map(t => (
                  <button key={t} onClick={() => setFiltroTecnico(t)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition border ${filtroTecnico === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>{t}</button>
                ))}
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-gray-100 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Filtrar por Estado en Vista Detalle</label>
                <div className="flex flex-wrap gap-2">
                  {['Todos', 'Asignada a Técnico', 'En Proceso', 'Asignada a Agencia', 'Orden Finalizada'].map(est => (
                    <button key={est} onClick={() => setFiltroEstadoGlobal(est)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition border ${filtroEstadoGlobal === est ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{est}</button>
                  ))}
                </div>
              </div>
              <button onClick={generarPDFGlobalEnProceso} className="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 font-bold rounded-lg transition border border-red-200 text-xs">
                <FileText size={14} /> Descargar PDF "En Proceso"
              </button>
            </div>
          </div>

          {tecnicosDetectados
            .filter(tecnico => filtroTecnico === 'Todos' || filtroTecnico === tecnico)
            .map(tecnico => {
              const tickets = gruposAgrupados[tecnico].filter(t => {
                if (filtroEstadoGlobal === 'Todos') return true
                const terminoFiltro = filtroEstadoGlobal.toUpperCase().split(' ')[0]
                return t.ESTADO_LIMPIO.includes(terminoFiltro)
              })
              
              if (tickets.length === 0) return null

              return (
                <div key={tecnico} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden fade-in">
                  <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><Wrench size={16} /></div>
                      <div>
                        <p className="font-black text-gray-900 text-base uppercase leading-tight">{tecnico}</p>
                        <p className="text-xs font-bold text-gray-400">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''} en rango</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => {
                        const ticketsActivos = tickets.filter(t => !t['ESTADO_LIMPIO'].includes('FINALIZADA'))
                        if(ticketsActivos.length === 0) return alert('No hay tickets activos.')
                        navigator.clipboard.writeText(buildMessage(tecnico, ticketsActivos))
                        alert('Copiado al portapapeles (Excluyendo Finalizados)')
                      }} className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold">Copiar</button>
                      
                      <button onClick={() => {
                        const ticketsActivos = tickets.filter(t => !t['ESTADO_LIMPIO'].includes('FINALIZADA'))
                        if(ticketsActivos.length === 0) return alert('No hay tickets activos.')
                        const num = prompt('Número WhatsApp (Ej: 502...):')
                        if(num) window.open(`https://wa.me/${num.replace(/\D/g,'')}?text=${encodeURIComponent(buildMessage(tecnico, ticketsActivos))}`, '_blank')
                      }} className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-bold">WhatsApp</button>
                      
                      <button onClick={() => generarPDFIndividual(tecnico, tickets)} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 font-bold">PDF</button>
                      
                      <button onClick={() => generarExcelTecnico(tecnico, tickets)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold">Excel</button>
                      
                      <button onClick={() => setExpandido(p => ({ ...p, [tecnico]: !p[tecnico] }))} className="p-1.5 hover:bg-gray-200 rounded-lg"><ChevronDown size={16} className={`transition-transform ${expandido[tecnico] ? 'rotate-180' : ''}`} /></button>
                    </div>
                  </div>

                  {expandido[tecnico] && (
                    <div className="p-5">
                      {tickets.map((t, i) => (
                        <div key={i}>
                          <div className="p-2 -mx-2 rounded-lg">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">#{t['N° REFERENCIA']}</span>
                              <TicketBadge estado={t['ESTADO']} />
                              {t['FECHA_TEXTO'] && <span className="text-[11px] font-bold text-gray-400 ml-auto">📅 {t['FECHA_TEXTO']}</span>}
                            </div>
                            <p className="text-sm text-gray-800"><span className="font-bold text-gray-900">NEGOCIO:</span> {t['NEGOCIO']}</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 mt-1">
                              <p><span className="font-bold text-gray-800">📍 DIR:</span> {t['DIRECCIÓN'] || '-'}</p>
                              <p><span className="font-bold text-gray-800">📞 TEL:</span> {t['TELÉFONO']}</p>
                              <p><span className="font-bold text-gray-800">👤 CLIENTE:</span> {t['CLIENTE']}</p>
                              <div className="flex gap-3">
                                <p><span className="font-bold text-gray-800">🧊 SERIE:</span> {t['SERIE']}</p>
                                <p><span className="font-bold text-gray-800">📦 MOD:</span> {t['MODELO']}</p>
                              </div>
                            </div>
                            {t['DESCRIPCIÓN INICIAL'] && t['DESCRIPCIÓN INICIAL'] !== '-' && (
                              <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-3 py-2 border-l-2 border-blue-200">
                                <span className="font-bold text-gray-800 block mb-0.5">DESCRIPCIÓN INICIAL:</span>{t['DESCRIPCIÓN INICIAL']}
                              </div>
                            )}
                            {t['ESTADO_LIMPIO'].includes('PROCESO') && t['DESCRIPCIÓN'] !== '-' && (
                              <div className="mt-2 text-xs text-yellow-800 bg-yellow-50 rounded px-3 py-2 border-l-2 border-yellow-300">
                                <span className="font-bold block mb-0.5">COMENTARIO (En Proceso):</span>{t['DESCRIPCIÓN']}
                              </div>
                            )}
                          </div>
                          {i !== tickets.length - 1 && <div className="my-5 border-b-2 border-gray-200 border-dashed w-full"></div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </>
      )}

      {allTickets.length === 0 && (
        <div className="text-center py-20 text-gray-300">
          <Wrench size={54} className="mx-auto mb-3" />
          <p className="text-sm font-bold">Carga un archivo para desplegar la matriz de control diario</p>
        </div>
      )}
    </div>
  )
}