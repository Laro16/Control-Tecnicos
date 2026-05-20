import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { 
  Upload, Clipboard, FileText, FileSpreadsheet, 
  ChevronDown, Wrench, Filter, Calendar, Image, DownloadCloud
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

// Procesa formatos de texto "DD/MM/YYYY" o "DD-MM-YYYY" a un objeto de control de fechas real
function normalizarFechaExcel(fechaTexto) {
  if (!fechaTexto) return null
  let limpio = String(fechaTexto).trim().replace(/-/g, '/')
  const partes = limpio.split('/')
  if (partes.length === 3) {
    let dia = partes[0].padStart(2, '0')
    let mes = partes[1].padStart(2, '0')
    let anio = partes[2]
    if (anio.length === 2) anio = '20' + anio
    return {
      display: `${dia}/${mes}/${anio}`,
      iso: `${anio}-${mes}-${dia}`,
      dateObj: new Date(`${anio}-${mes}-${dia}T00:00:00`)
    }
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
    
    if (t['ESTADO_LIMPIO'].includes('PROCESO') && t['DESCRIPCIÓN'] !== '-') {
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
          
          // Mapear fecha de cierre o realización para las finalizadas
          let fechaRaw = fila['FECHA REALIZADA'] || fila['FECHA REALIZACION'] || fila['FECHA'] || ''
          const fechaEstructura = normalizarFechaExcel(fechaRaw)
          
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
            'FECHA_TEXTO': fechaEstructura ? fechaEstructura.display : (fechaRaw || '-'),
            'FECHA_ISO': fechaEstructura ? fechaEstructura.iso : null,
            'FECHA_OBJ': fechaEstructura ? fechaEstructura.dateObj : null,
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
        
        // Configurar los selectores de fecha con el rango detectado en el archivo
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

  // 1. LÓGICA DE LA TABLA DINÁMICA (Solo "Orden Finalizada" por Fechas en Columnas)
  const ticketsFinalizadosFiltrados = allTickets.filter(t => {
    if (!t.ESTADO_LIMPIO.includes('FINALIZADA')) return false
    if (!t.FECHA_OBJ || !fechaInicio || !fechaFin) return true
    const start = new Date(fechaInicio + 'T00:00:00')
    const end = new Date(fechaFin + 'T23:59:59')
    return t.FECHA_OBJ >= start && t.FECHA_OBJ <= end
  })

  // Obtener fechas únicas de órdenes finalizadas ordenadas cronológicamente
  const columnasFechas = Array.from(new Set(ticketsFinalizadosFiltrados.map(t => t.FECHA_TEXTO)))
    .sort((a, b) => {
      const fA = normalizarFechaExcel(a)
      const fB = normalizarFechaExcel(b)
      if (fA && fB) return fA.dateObj - fB.dateObj
      return 0
    })

  const listaTecnicosFinalizados = Array.from(new Set(ticketsFinalizadosFiltrados.map(t => t.tecnico))).sort()

  // Construir matriz dinámica cruzada: [tecnico][fecha] = cantidad
  const matrizDinamica = {}
  listaTecnicosFinalizados.forEach(tec => {
    matrizDinamica[tec] = { totales: 0 }
    columnasFechas.forEach(f => { matrizDinamica[tec][f] = 0 })
  })

  ticketsFinalizadosFiltrados.forEach(t => {
    if (matrizDinamica[t.tecnico] && matrizDinamica[t.tecnico][t.FECHA_TEXTO] !== undefined) {
      matrizDinamica[t.tecnico][t.FECHA_TEXTO]++
      matrizDinamica[t.tecnico].totales++
    }
  })

  // 2. LÓGICA DE TARJETAS DE TRABAJO PENDIENTE (Excluye "Orden Finalizada")
  const ticketsPendientesTotales = allTickets.filter(t => !t.ESTADO_LIMPIO.includes('FINALIZADA'))

  const gruposPendientesAgrupados = {}
  ticketsPendientesTotales.forEach(t => {
    if (!gruposPendientesAgrupados[t.tecnico]) gruposPendientesAgrupados[t.tecnico] = []
    gruposPendientesAgrupados[t.tecnico].push(t)
  })

  const tecnicosConPendientes = Object.keys(gruposPendientesAgrupados).sort()

  async function capturarTablaDinamica() {
    const el = tablaDinamicaRef.current
    if (!el) return
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2 })
    const link = document.createElement('a')
    link.download = `Reporte_Finalizadas_${TODAY().replace('/','_')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  function descargarExcelCompleto() {
    if (allTickets.length === 0) return
    const data = allTickets.map(t => ({
      'TÉCNICO': t.tecnico, 'N° REFERENCIA': t['N° REFERENCIA'], 'NEGOCIO': t['NEGOCIO'], 
      'DIRECCIÓN': t['DIRECCIÓN'], 'TELÉFONO': t['TELÉFONO'], 'CLIENTE': t['CLIENTE'], 
      'SERIE': t['SERIE'], 'MODELO': t['MODELO'], 'ESTADO': t['ESTADO'], 'FECHA': t['FECHA_TEXTO'], 
      'DESCRIPCIÓN INICIAL': t['DESCRIPCIÓN INICIAL'], 'DESCRIPCIÓN': t['DESCRIPCIÓN']
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Base de Datos Completa")
    XLSX.writeFile(wb, `Reporte_General_Tickets.xlsx`)
  }

  function generarExcelTecnico(tecnico, tickets) {
    const data = tickets.map(t => ({
      'N° REFERENCIA': t['N° REFERENCIA'], 'NEGOCIO': t['NEGOCIO'], 'DIRECCIÓN': t['DIRECCIÓN'],
      'TELÉFONO': t['TELÉFONO'], 'CLIENTE': t['CLIENTE'], 'SERIE': t['SERIE'], 'MODELO': t['MODELO'],
      'ESTADO': t['ESTADO'], 'DESCRIPCIÓN INICIAL': t['DESCRIPCIÓN INICIAL'], 'COMENTARIO': t['DESCRIPCIÓN']
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Pendientes")
    XLSX.writeFile(wb, `Tickets_Pendientes_${tecnico.replace(/\s+/g,'_')}.xlsx`)
  }

  function generarPDFIndividual(tecnico, tickets) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const fecha = TODAY()
    let y = 15

    doc.setFont('helvetica', 'bold').setFontSize(14)
    doc.text(`TÉCNICO: ${tecnico}`, 14, y)
    y += 7
    doc.setFontSize(10).setFont('helvetica', 'normal')
    doc.text(`Fecha Envío: ${fecha}  |  Órdenes Pendientes: ${tickets.length}`, 14, y)
    y += 5
    doc.setDrawColor(180).line(14, y, 196, y)
    y += 6

    tickets.forEach((t, i) => {
      if (y > 265) { doc.addPage(); y = 15 }
      doc.setFont('helvetica', 'bold').setFontSize(10)
      doc.text(`#${i+1}  Ref: ${t['N° REFERENCIA'] || '-'}`, 14, y)
      y += 5

      doc.setFont('helvetica', 'normal').setFontSize(9)
      const lines = [
        `Negocio: ${t['NEGOCIO'] || '-'}`,
        `Dirección: ${t['DIRECCIÓN'] || '-'}`,
        `Teléfono: ${t['TELÉFONO'] || '-'}`,
        `Cliente: ${t['CLIENTE'] || '-'}`,
        `Serie: ${t['SERIE'] || '-'}   Modelo: ${t['MODELO'] || '-'}`,
        `Estado actual: ${t['ESTADO'] || '-'}`,
        `Descripción Inicial: ${t['DESCRIPCIÓN INICIAL'] || '-'}`,
      ]
      
      if (t['ESTADO_LIMPIO'].includes('PROCESO') && t['DESCRIPCIÓN'] !== '-') {
        lines.push(`Comentario en Proceso: ${t['DESCRIPCIÓN']}`)
      }

      lines.forEach(l => {
        const wrapped = doc.splitTextToSize(l, 180)
        if (y > 270) { doc.addPage(); y = 15 }
        doc.text(wrapped, 14, y)
        y += wrapped.length * 4.5
      })
      y += 2
      doc.setDrawColor(210).line(14, y, 196, y)
      y += 4
    })
    doc.save(`Tickets_Pendientes_${tecnico.replace(/\s+/g,'_')}.pdf`)
  }

  function generarPDFGlobalEnProceso() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    let y = 15
    doc.setFont('helvetica', 'bold').setFontSize(14)
    doc.text(`REPORTE GLOBAL: TICKETS EN PROCESO`, 14, y)
    y += 12
    doc.setDrawColor(180).line(14, y-5, 196, y-5)

    let count = 1
    allTickets.filter(t => t.ESTADO_LIMPIO.includes('PROCESO')).forEach(t => {
      if (y > 265) { doc.addPage(); y = 15 }
      doc.setFont('helvetica', 'bold').setFontSize(10)
      doc.text(`#${count} - TÉCNICO: ${t.tecnico} | Ref: ${t['N° REFERENCIA'] || '-'}`, 14, y)
      y += 5
      doc.setFont('helvetica', 'normal').setFontSize(9)
      const wrapped = doc.splitTextToSize(`Negocio: ${t['NEGOCIO']} | Comentario de Proceso: ${t['DESCRIPCIÓN'] !== '-' ? t['DESCRIPCIÓN'] : t['DESCRIPCIÓN INICIAL']}`, 180)
      doc.text(wrapped, 14, y)
      y += wrapped.length * 5 + 4
      count++
    })
    if(count === 1) return alert("No se detectaron tickets con estado 'En Proceso'.")
    doc.save(`Global_En_Proceso_${TODAY().replace('/','')}.pdf`)
  }

  return (
    <div className="space-y-6">
      {/* Barra superior de carga */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        <div
          className={`border-2 border-dashed rounded-xl transition-all duration-200 p-4 flex-1 flex items-center justify-center gap-4 cursor-pointer bg-white ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
          onClick={() => fileRef.current.click()} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
        >
          <Upload size={20} className="text-blue-500" />
          <div className="text-left text-xs">
            <p className="font-bold text-gray-700">Arrastra o selecciona el archivo del sistema</p>
            {nombreArchivo && <p className="font-black text-blue-600 mt-0.5">{nombreArchivo}</p>}
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={onFileChange} />
        </div>
        {allTickets.length > 0 && (
          <button onClick={descargarExcelCompleto} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
            <DownloadCloud size={16} /> Descargar Excel Completo
          </button>
        )}
      </div>

      {allTickets.length > 0 && (
        <>
          {/* CONTROL DE TABLA DINÁMICA: SÓLO FINALIZADAS */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 space-y-4 fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-gray-800 font-black text-xs uppercase">
                <Calendar size={16} className="text-blue-600" />
                Filtro Cronológico de Órdenes Finalizadas
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border border-gray-300 rounded-lg p-1.5 text-xs font-bold outline-none bg-gray-50" />
                <span className="text-gray-400 font-bold text-xs">a</span>
                <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border border-gray-300 rounded-lg p-1.5 text-xs font-bold outline-none bg-gray-50" />
              </div>
            </div>

            <div ref={tablaDinamicaRef} className="p-2 bg-white rounded-xl">
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead className="bg-gray-900 text-white font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3 border-r border-gray-800">Técnicos</th>
                      {columnasFechas.map(f => (
                        <th key={f} className="p-3 text-center border-r border-gray-800 bg-gray-800">{f}</th>
                      ))}
                      <th className="p-3 text-center bg-emerald-700">Total Liquidado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-bold text-gray-700">
                    {listaTecnicosFinalizados.map(tec => (
                      <tr key={tec} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3 uppercase text-gray-900 border-r font-black">{tec}</td>
                        {columnasFechas.map(f => (
                          <td key={f} className="p-3 text-center border-r border-gray-100 font-black text-gray-800">{matrizDinamica[tec][f] || 0}</td>
                        ))}
                        <td className="p-3 text-center bg-emerald-50/60 font-black text-emerald-700 text-sm">{matrizDinamica[tec].totales}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button onClick={capturarTablaDinamica} className="flex items-center gap-1.5 text-xs bg-gray-900 hover:bg-black text-white font-bold px-4 py-2 rounded-xl transition shadow-sm">
                <Image size={14} /> Capturar Tabla de Cierre diario
              </button>
            </div>
          </div>

          {/* CONTROL DE FILTROS SECCIÓN TARJETAS PENDIENTES */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Filter size={12}/> Desplegar Técnico en Detalle</label>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setFiltroTecnico('Todos')} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition border ${filtroTecnico === 'Todos' ? 'bg-gray-800 text-white border-gray-800' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>Todos</button>
                {tecnicosConPendientes.map(t => (
                  <button key={t} onClick={() => setFiltroTecnico(t)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition border ${filtroTecnico === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>{t}</button>
                ))}
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-gray-100 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Filtro de Estado de Trabajo Pendiente</label>
                <div className="flex flex-wrap gap-2">
                  {/* REQUISITO 3: Eliminado "En Proceso" de los botones de filtro */}
                  {['Todos', 'Asignada a Técnico', 'Asignada a Agencia'].map(est => (
                    <button key={est} onClick={() => setFiltroEstadoGlobal(est)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition border ${filtroEstadoGlobal === est ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{est}</button>
                  ))}
                </div>
              </div>
              <button onClick={generarPDFGlobalEnProceso} className="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 font-bold rounded-lg transition border border-red-200 text-xs">
                <FileText size={14} /> Descargar PDF Global "En Proceso"
              </button>
            </div>
          </div>

          {/* BLOQUE DE TARJETAS ACCORDION */}
          {tecnicosConPendientes
            .filter(tecnico => filtroTecnico === 'Todos' || filtroTecnico === tecnico)
            .map(tecnico => {
              // Filtrado inteligente: Si el filtro es "Asignada a Técnico", incluye "TECNICO" y "PROCESO"
              const tickets = gruposPendientesAgrupados[tecnico].filter(t => {
                if (filtroEstadoGlobal === 'Todos') return true
                if (filtroEstadoGlobal === 'Asignada a Técnico') {
                  return t.ESTADO_LIMPIO.includes('TECNICO') || t.ESTADO_LIMPIO.includes('PROCESO')
                }
                const termino = filtroEstadoGlobal.toUpperCase().split(' ')[0]
                return t.ESTADO_LIMPIO.includes(termino)
              })
              
              if (tickets.length === 0) return null

              return (
                <div key={tecnico} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden fade-in">
                  <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><Wrench size={16} /></div>
                      <div>
                        <p className="font-black text-gray-900 text-base uppercase leading-tight">{tecnico}</p>
                        <p className="text-xs font-bold text-gray-400">{tickets.length} órden{tickets.length !== 1 ? 'es' : ''} pendiente{tickets.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => {navigator.clipboard.writeText(buildMessage(tecnico, tickets)); alert('Copiado al portapapeles')}} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 font-bold shadow-sm">Copiar Lista</button>
                      <button onClick={() => generarPDFIndividual(tecnico, tickets)} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 font-bold border border-red-100">PDF</button>
                      <button onClick={() => generarExcelTecnico(tecnico, tickets)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">Excel</button>
                      <button onClick={() => setExpandido(p => ({ ...p, [tecnico]: !p[tecnico] }))} className="p-1.5 hover:bg-gray-200 rounded-lg transition"><ChevronDown size={16} className={`transition-transform ${expandido[tecnico] ? 'rotate-180' : ''}`} /></button>
                    </div>
                  </div>

                  {expandido[tecnico] && (
                    <div className="p-5">
                      {tickets.map((t, i) => (
                        <div key={i}>
                          <div className="p-1 rounded-lg">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">#{t['N° REFERENCIA']}</span>
                              <TicketBadge estado={t['ESTADO']} />
                            </div>
                            <p className="text-sm text-gray-800"><span className="font-bold text-gray-900">NEGOCIO:</span> {t['NEGOCIO']}</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 mt-1">
                              {/* REQUISITO 5: Dirección limpia como texto plano */}
                              <p><span className="font-bold text-gray-800">📍 DIR:</span> {t['DIRECCIÓN'] || '-'}</p>
                              <p><span className="font-bold text-gray-800">📞 TEL:</span> {t['TELÉFONO']}</p>
                              <p><span className="font-bold text-gray-800">👤 CLIENTE:</span> {t['CLIENTE']}</p>
                              <div className="flex gap-3">
                                <p><span className="font-bold text-gray-800">🧊 SERIE:</span> {t['SERIE'] || '-'}</p>
                                <p><span className="font-bold text-gray-800">📦 MOD:</span> {t['MODELO'] || '-'}</p>
                              </div>
                            </div>
                            {t['DESCRIPCIÓN INICIAL'] && t['DESCRIPCIÓN INICIAL'] !== '-' && (
                              <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-3 py-2 border-l-2 border-blue-200">
                                <span className="font-bold text-gray-800 block mb-0.5">DESCRIPCIÓN INICIAL:</span>{t['DESCRIPCIÓN INICIAL']}
                              </div>
                            )}
                            {t['ESTADO_LIMPIO'].includes('PROCESO') && t['DESCRIPCIÓN'] !== '-' && (
                              <div className="mt-2 text-xs text-yellow-800 bg-yellow-50 rounded px-3 py-2 border-l-2 border-yellow-300">
                                <span className="font-bold block mb-0.5">COMENTARIO DE AVANCE (En Proceso):</span>{t['DESCRIPCIÓN']}
                              </div>
                            )}
                          </div>
                          {/* REQUISITO 4: Línea divisoria robusta */}
                          {i !== tickets.length - 1 && <div className="my-5 border-b border-gray-200 border-dashed w-full"></div>}
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
          <p className="text-sm font-bold">Carga un archivo de órdenes para inicializar las matrices operativas</p>
        </div>
      )}
    </div>
  )
}
