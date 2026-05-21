import { useState, useRef, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { 
  Upload, Clipboard, FileText, FileSpreadsheet, ChevronDown, Wrench, Filter, DownloadCloud, MapPin
} from 'lucide-react'

const TODAY = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

function normalizarTexto(texto) {
  if (!texto) return ''
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
}

function simplificarCliente(cliente) {
  if (!cliente) return '-'
  const upper = normalizarTexto(cliente)
  if (upper.includes('COMERCIALIZADORA Y PRODUCTORA DE BEBIDAS LOS VOLCANES')) return 'Los Volcanes'
  if (upper.includes('CERVECERIA CENTROAMERICANA')) return 'Cervecería'
  return cliente
}

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

function buildMessage(tecnico, tickets, rutaDefinida) {
  const fecha = TODAY()
  let msg = `🔧 *TÉCNICO: ${tecnico}*\n📅 *FECHA:* ${fecha}\n`
  if (rutaDefinida && rutaDefinida.trim() !== '') {
    msg += `🗺️ *RUTA:* ${rutaDefinida.trim()}\n`
  }
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
    
    if (t['ESTADO_LIMPIO'].includes('PROCESO')) {
      const comentarioProceso = (t['DESCRIPCIÓN'] && t['DESCRIPCIÓN'] !== '-') ? t['DESCRIPCIÓN'] : 'Sin datos';
      msg += `\n⚠️ *COMENTARIO EN PROCESO:*\n${comentarioProceso}\n`
    }
  })
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━`
  return msg
}

function TicketBadge({ estado }) {
  const estNormalizado = normalizarTexto(estado)
  let cls = 'badge-asignada'
  if (estNormalizado.includes('PROCESO')) cls = 'badge-proceso'
  if (estNormalizado.includes('AGENCIA')) cls = 'badge-agencia'
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{estado}</span>
}

export default function ModuloTecnicos({ allTickets, setAllTickets, nombreArchivo, setNombreArchivo, fechaSubidaExcel, setFechaSubidaExcel }) {
  const [dragging, setDragging] = useState(false)
  const [expandido, setExpandido] = useState({})
  const [filtroTecnico, setFiltroTecnico] = useState('Todos')
  const [filtroEstadoGlobal, setFiltroEstadoGlobal] = useState('Todos')
  
  const [baseMunicipios, setBaseMunicipios] = useState([])
  const [rutasTecnicos, setRutasTecnicos] = useState({})

  const fileRef = useRef()

  useEffect(() => {
    async function cargarRutasDelRepo() {
      try {
        const response = await fetch('/Rutas.xlsx')
        if (!response.ok) {
          console.warn('No se encontró el archivo Rutas.xlsx en la carpeta public.')
          return
        }
        const arrayBuffer = await response.arrayBuffer()
        const wb = XLSX.read(arrayBuffer, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rawMatrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        
        let munis = new Set()
        for (let row of rawMatrix) {
          for (let cell of row) {
            if (typeof cell === 'string' && cell.trim().length > 2) {
              munis.add(cell.trim())
            }
          }
        }
        setBaseMunicipios(Array.from(munis))
      } catch (error) {
        console.error('Error al cargar Rutas.xlsx:', error)
      }
    }
    cargarRutasDelRepo()
  }, [])

  const rutasAutomaticas = useMemo(() => {
    const autoRutas = {}
    if (baseMunicipios.length === 0 || allTickets.length === 0) return autoRutas

    const ticketsActivos = allTickets.filter(t => 
      t.ESTADO_LIMPIO.includes('TECNICO') || t.ESTADO_LIMPIO.includes('PROCESO') || t.ESTADO_LIMPIO.includes('AGENCIA')
    )

    const ticketsPorTecnico = {}
    ticketsActivos.forEach(t => {
      let tec = t.tecnico === 'SIN TÉCNICO' || !t.tecnico || t.tecnico === '-' ? 'SIN ASIGNAR' : t.tecnico
      if(!ticketsPorTecnico[tec]) ticketsPorTecnico[tec] = []
      ticketsPorTecnico[tec].push(t)
    })

    Object.keys(ticketsPorTecnico).forEach(tec => {
      let encontrados = new Set()
      ticketsPorTecnico[tec].forEach(t => {
        const textoBuscar = normalizarTexto(`${t['DIRECCIÓN']} ${t['NEGOCIO']}`)
        baseMunicipios.forEach(muniOriginal => {
          const muniLimpio = normalizarTexto(muniOriginal)
          const escaped = muniLimpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const regex = new RegExp(`\\b${escaped}\\b`, 'i')
          if (regex.test(textoBuscar)) encontrados.add(muniOriginal.toUpperCase())
        })
      })
      autoRutas[tec] = Array.from(encontrados).slice(0, 10).join(' - ')
    })
    return autoRutas
  }, [baseMunicipios, allTickets])

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
        const upperRow = row.map(cell => normalizarTexto(cell))
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
        let estadoLimpio = normalizarTexto(estadoOriginal)

        const esAsignadoTecnico = estadoLimpio.includes('ASIGNAD') && estadoLimpio.includes('TECNICO')
        const esEnProceso = estadoLimpio.includes('PROCESO')
        const esAsignadoAgencia = estadoLimpio.includes('ASIGNAD') && estadoLimpio.includes('AGENCIA')
        const esFinalizada = estadoLimpio.includes('FINALIZADA')

        if (esAsignadoTecnico || esEnProceso || esAsignadoAgencia || esFinalizada) {
          let tecnico = String(fila['TÉCNICO'] || fila['TECNICO'] || fila['TÉCNICOS'] || fila['TECNICOS'] || '').trim()
          if (!tecnico || tecnico === '') tecnico = 'SIN TÉCNICO'
          if (esAsignadoAgencia) tecnico = tecnico || 'SIN TÉCNICO'

          let clienteOriginal = String(fila['CLIENTE'] || fila['NOMBRE CLIENTE'] || '-').trim()
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
            'TIEMPO_TRANSCURRIDO': fila['TIEMPO TRANSCURRIDO'] || fila['TIEMPO'] || '0',
            'FECHA_TEXTO': fechaEstructura ? fechaEstructura.display : (fechaRaw || '-'),
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
        
        const ticketsActivosParaRuta = listaTemporal.filter(t => 
          t.ESTADO_LIMPIO.includes('TECNICO') || 
          t.ESTADO_LIMPIO.includes('PROCESO') || 
          t.ESTADO_LIMPIO.includes('AGENCIA')
        )

        const nuevasRutas = {}
        const ticketsPorTecnico = {}
        
        ticketsActivosParaRuta.forEach(t => {
          if(!ticketsPorTecnico[t.tecnico]) ticketsPorTecnico[t.tecnico] = []
          ticketsPorTecnico[t.tecnico].push(t)
        })

        Object.keys(ticketsPorTecnico).forEach(tec => {
          let encontrados = new Set()
          ticketsPorTecnico[tec].forEach(t => {
            const textoBuscar = normalizarTexto(`${t['DIRECCIÓN']} ${t['NEGOCIO']}`)
            
            baseMunicipios.forEach(muniOriginal => {
              const muniLimpio = normalizarTexto(muniOriginal) 
              const escaped = muniLimpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const regex = new RegExp(`\\b${escaped}\\b`, 'i')
              
              if (regex.test(textoBuscar)) {
                encontrados.add(muniOriginal.toUpperCase())
              }
            })
          })
          nuevasRutas[tec] = Array.from(encontrados).slice(0, 10).join(' - ')
        })
        setRutasTecnicos(nuevasRutas)

        const ahora = new Date()
        const fechaFormateada = `${ahora.toLocaleDateString()} a las ${ahora.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
        if (setFechaSubidaExcel) {
          setFechaSubidaExcel(fechaFormateada)
        }
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function onFileChange(e) { if (e.target.files[0]) procesarExcel(e.target.files[0]) }
  function onDrop(e) { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) procesarExcel(e.dataTransfer.files[0]) }

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

  // ==========================================
  // GENERADOR PDF ACTUALIZADO CON NUEVA ESTRUCTURA
  // ==========================================
  function generarPDFIndividual(tecnico, tickets, rutaDefinida) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const fecha = TODAY()
    let y = 15

    const printLine = (label, value, xOffset, colorRGB) => {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...colorRGB) 
      doc.text(label, xOffset, y)
      const labelWidth = doc.getTextWidth(label)
      
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60) 
      const textoReal = String(value)
      
      const maxAncho = 196 - (xOffset + labelWidth) - 5
      const lineas = doc.splitTextToSize(textoReal, maxAncho)
      doc.text(lineas, xOffset + labelWidth + 1, y)
      
      y += lineas.length * 4.5
    }

    doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(0, 0, 0)
    doc.text(`TÉCNICO: ${tecnico}`, 14, y)
    y += 7
    doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(100, 100, 100)
    doc.text(`Fecha Envío: ${fecha}  |  Órdenes Pendientes: ${tickets.length}`, 14, y)
    y += 5

    if (rutaDefinida && rutaDefinida.trim() !== '') {
      doc.setFont('helvetica', 'bold').setTextColor(0, 100, 200)
      const lineasRuta = doc.splitTextToSize(`Ruta Asignada: ${rutaDefinida.trim()}`, 180)
      doc.text(lineasRuta, 14, y)
      y += lineasRuta.length * 5
    }

    doc.setDrawColor(200).line(14, y, 196, y)
    y += 6

    tickets.forEach((t, i) => {
      if (y > 255) { doc.addPage(); y = 15 }
      
      // Encabezado: Ticket + Referencia e inmediatamente el Cliente al lado derecho
      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0, 80, 180) 
      const headerText = `#${i+1}  Ref: ${t['N° REFERENCIA'] || '-'}`
      doc.text(headerText, 14, y)
      const headerWidth = doc.getTextWidth(headerText)
      doc.text(`   Cliente: ${t['CLIENTE'] || '-'}`, 14 + headerWidth, y)
      y += 5

      doc.setFontSize(9)
      
      // Impresión en el orden estricto solicitado
      printLine('Negocio: ', t['NEGOCIO'] || '-', 14, [0, 0, 0])
      printLine('Dirección: ', t['DIRECCIÓN'] || '-', 14, [180, 50, 50]) 
      printLine('Teléfono: ', t['TELÉFONO'] || '-', 14, [30, 120, 30]) 
      printLine('Descripción Inicial: ', t['DESCRIPCIÓN INICIAL'] || '-', 14, [80, 80, 80]) 
      printLine('Estado actual: ', t['ESTADO'] || '-', 14, [200, 100, 0]) 
      
      if (t['ESTADO_LIMPIO'].includes('PROCESO')) {
        const comentarioProceso = (t['DESCRIPCIÓN'] && t['DESCRIPCIÓN'] !== '-') ? t['DESCRIPCIÓN'] : 'Sin datos'
        printLine('Comentario (En Proceso): ', comentarioProceso, 14, [180, 140, 0]) 
      }

      y += 2
      doc.setDrawColor(220).line(14, y, 196, y)
      y += 5
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
      
      const descr = (t['DESCRIPCIÓN'] && t['DESCRIPCIÓN'] !== '-') ? t['DESCRIPCIÓN'] : 'Sin datos'
      const wrapped = doc.splitTextToSize(`Negocio: ${t['NEGOCIO']} | Comentario: ${descr}`, 180)
      
      doc.text(wrapped, 14, y)
      y += wrapped.length * 5 + 4
      count++
    })
    if(count === 1) return alert("No hay tickets en proceso.")
    doc.save(`Global_En_Proceso_${TODAY().replace('/','')}.pdf`)
  }

  const ticketsPendientesTotales = allTickets.filter(t => !t.ESTADO_LIMPIO.includes('FINALIZADA'))

  const gruposPendientesAgrupados = {}
  ticketsPendientesTotales.forEach(t => {
    if (!gruposPendientesAgrupados[t.tecnico]) gruposPendientesAgrupados[t.tecnico] = []
    gruposPendientesAgrupados[t.tecnico].push(t)
  })

  const tecnicosConPendientes = Object.keys(gruposPendientesAgrupados).sort()

  const valorRutaTecnico = (tecnico) => {
    return rutasTecnicos[tecnico] !== undefined ? rutasTecnicos[tecnico] : (rutasAutomaticas[tecnico] || '')
  }

  return (
    <div className="space-y-6">
      
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        <div
          className={`border-2 border-dashed rounded-xl transition-all duration-200 p-4 flex-1 flex items-center justify-center gap-4 cursor-pointer bg-white ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
          onClick={() => fileRef.current.click()} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
        >
          <Upload size={24} className="text-blue-500 shrink-0" />
          <div className="text-left text-xs">
            <p className="font-bold text-gray-700">Arrastra o selecciona el archivo del sistema (Tickets)</p>
            {nombreArchivo && (
              <div className="mt-1">
                <p className="font-black text-blue-600 truncate max-w-[200px] sm:max-w-xs">{nombreArchivo}</p>
                {fechaSubidaExcel && (
                  <p className="text-green-600 font-bold text-[10px] mt-0.5">
                    Última carga: {fechaSubidaExcel}
                  </p>
                )}
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={onFileChange} />
        </div>
        
        {allTickets.length > 0 && (
          <div className="flex items-center shrink-0">
            <button onClick={descargarExcelCompleto} className="h-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition">
              <DownloadCloud size={16} /> Excel Completo
            </button>
          </div>
        )}
      </div>

      {allTickets.length > 0 && (
        <>
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

          {tecnicosConPendientes
            .filter(tecnico => filtroTecnico === 'Todos' || filtroTecnico === tecnico)
            .map(tecnico => {
              const tickets = gruposPendientesAgrupados[tecnico].filter(t => {
                if (filtroEstadoGlobal === 'Todos') return true
                if (filtroEstadoGlobal === 'Asignada a Técnico') {
                  return t.ESTADO_LIMPIO.includes('TECNICO') || t.ESTADO_LIMPIO.includes('PROCESO')
                }
                const termino = normalizarTexto(filtroEstadoGlobal).split(' ')[0]
                return t.ESTADO_LIMPIO.includes(termino)
              })
              
              if (tickets.length === 0) return null

              const rutaActual = valorRutaTecnico(tecnico)

              return (
                <div key={tecnico} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden fade-in">
                  <div className="flex flex-col md:flex-row md:items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-200 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0"><Wrench size={16} /></div>
                      <div>
                        <p className="font-black text-gray-900 text-base uppercase leading-tight">{tecnico}</p>
                        <p className="text-xs font-bold text-gray-400">{tickets.length} orden{tickets.length !== 1 ? 'es' : ''} pendiente{tickets.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 w-full md:w-auto">
                      <div className="w-full sm:w-auto relative bg-white border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-sm min-h-[34px]">
                        <MapPin size={14} className="text-blue-500 shrink-0" />
                        <span className="text-xs font-bold text-gray-700 uppercase">
                          {rutaActual || 'SIN RUTA DETECTADA'}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => {navigator.clipboard.writeText(buildMessage(tecnico, tickets, rutaActual)); alert('Copiado')}} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 font-bold shadow-sm">Copiar</button>
                        <button onClick={() => generarPDFIndividual(tecnico, tickets, rutaActual)} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 font-bold border border-red-100">PDF</button>
                        <button onClick={() => generarExcelTecnico(tecnico, tickets)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">Excel</button>
                        <button onClick={() => setExpandido(p => ({ ...p, [tecnico]: !p[tecnico] }))} className="p-1.5 hover:bg-gray-200 rounded-lg transition"><ChevronDown size={16} className={`transition-transform ${expandido[tecnico] ? 'rotate-180' : ''}`} /></button>
                      </div>
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
                            {t['ESTADO_LIMPIO'].includes('PROCESO') && (
                              <div className="mt-2 text-xs text-yellow-800 bg-yellow-50 rounded px-3 py-2 border-l-2 border-yellow-300">
                                <span className="font-bold block mb-0.5">COMENTARIO DE AVANCE (En Proceso):</span>
                                {t['DESCRIPCIÓN'] && t['DESCRIPCIÓN'] !== '-' ? t['DESCRIPCIÓN'] : 'Sin datos'}
                              </div>
                            )}
                          </div>
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
    </div>
  )
}
