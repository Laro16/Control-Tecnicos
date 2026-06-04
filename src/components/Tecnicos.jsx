import { useState, useRef, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { 
  Upload, Clipboard, FileText, FileSpreadsheet, ChevronDown, Wrench, Filter, DownloadCloud, MapPin, ShieldAlert, ShieldCheck
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

// ============================================================================
// GARANTÍA: Clientes especiales y verificación por serie
// ============================================================================
const CLIENTES_GARANTIA = [
  { nombre: 'ABCO', anios: 1 },
  { nombre: 'COMERCIALIZADORA DE ALIMENTOS Y BEBIDAS SAN MIGUEL', anios: 2 },
  { nombre: 'DISTRIBUIDORA DE LICORES', anios: 1 },
  { nombre: 'EMBOTELLADORA CENTRAL', anios: 2 },
  { nombre: 'EMBOTELLADORA LA MARIPOSA', anios: 2 },
  { nombre: 'GARANTIA IMPORTADORA Y DISTRIBUIDORA DE APARATOS ELECTRICOS', anios: 1 },
  { nombre: 'M.D.T. INTERNACIONAL', anios: 1 },
  { nombre: 'PRODUCTOS LACTEOS DE CENTROAMERICA', anios: 1 },
  { nombre: 'RICZA', anios: 1 },
  { nombre: 'SAVONA DE GUATEMALA', anios: 1 },
  { nombre: 'SERVICOCINAS', anios: 1 },
  { nombre: 'SUPER VITAMINAS', anios: 1 },
  { nombre: 'UNISUPER', anios: 1 },
  { nombre: 'VIVENDO', anios: 1 },
]

function buscarClienteGarantia(clienteTexto) {
  if (!clienteTexto || clienteTexto === '-') return null
  const clienteNorm = normalizarTexto(clienteTexto)
  return CLIENTES_GARANTIA.find(c => clienteNorm.includes(normalizarTexto(c.nombre))) || null
}

function parsearFechaSerie(serie) {
  if (!serie || serie === '-') return null
  const limpio = String(serie).replace(/\D/g, '')
  if (limpio.length < 6) return null
  const anio = parseInt(limpio.substring(0, 2), 10)
  const mes = parseInt(limpio.substring(2, 4), 10)
  const dia = parseInt(limpio.substring(4, 6), 10)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const anioCompleto = anio >= 0 && anio <= 50 ? 2000 + anio : 1900 + anio
  const fecha = new Date(anioCompleto, mes - 1, dia)
  if (isNaN(fecha.getTime())) return null
  return fecha
}

function verificarGarantia(ticket) {
  const clienteGarantia = buscarClienteGarantia(ticket['CLIENTE'])
  if (!clienteGarantia) return null // No es cliente con garantía especial

  const fechaFab = parsearFechaSerie(ticket['SERIE'])
  if (!fechaFab) return { esClienteGarantia: true, sinDatosSerie: true, clienteNombre: clienteGarantia.nombre, aniosGarantia: clienteGarantia.anios }

  const fechaVencimiento = new Date(fechaFab)
  fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + clienteGarantia.anios)

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const vencida = hoy > fechaVencimiento
  const diasRestantes = Math.ceil((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24))

  return {
    esClienteGarantia: true,
    sinDatosSerie: false,
    vencida,
    diasRestantes,
    fechaFabricacion: fechaFab,
    fechaVencimiento,
    clienteNombre: clienteGarantia.nombre,
    aniosGarantia: clienteGarantia.anios,
    fabDisplay: `${String(fechaFab.getDate()).padStart(2,'0')}/${String(fechaFab.getMonth()+1).padStart(2,'0')}/${fechaFab.getFullYear()}`,
    vencDisplay: `${String(fechaVencimiento.getDate()).padStart(2,'0')}/${String(fechaVencimiento.getMonth()+1).padStart(2,'0')}/${fechaVencimiento.getFullYear()}`
  }
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
    msg += `📝 *DESCRIPCIÓN INICIAL:*\n${t['DESCRIPCIÓN INICIAL'] || '-'}\n`
    msg += `📍 *DIRECCIÓN:* ${t['DIRECCIÓN'] || '-'}\n`
    msg += `📞 *TELÉFONO:* ${t['TELÉFONO'] || '-'}\n`
    msg += `👤 *CLIENTE:* ${t['CLIENTE'] || '-'}\n`
    msg += `🧊 *SERIE:* ${t['SERIE'] || '-'}  📦 *MODELO:* ${t['MODELO'] || '-'}\n`
    
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
      
      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0, 80, 180) 
      const headerText = `#${i+1}  Ref: ${t['N° REFERENCIA'] || '-'}`
      doc.text(headerText, 14, y)
      const headerWidth = doc.getTextWidth(headerText)
      doc.text(`   Cliente: ${t['CLIENTE'] || '-'}`, 14 + headerWidth, y)
      y += 5

      doc.setFontSize(9)
      
      printLine('Negocio: ', t['NEGOCIO'] || '-', 14, [0, 0, 0])
      printLine('Descripción Inicial: ', t['DESCRIPCIÓN INICIAL'] || '-', 14, [80, 80, 80]) 
      printLine('Dirección: ', t['DIRECCIÓN'] || '-', 14, [180, 50, 50]) 
      printLine('Teléfono: ', t['TELÉFONO'] || '-', 14, [30, 120, 30]) 
      
      doc.setFont('helvetica', 'bold').setTextColor(0, 130, 150)
      doc.text('Serie: ', 14, y)
      let w1 = doc.getTextWidth('Serie: ')
      doc.setFont('helvetica', 'normal').setTextColor(60, 60, 60)
      doc.text(String(t['SERIE'] || '-'), 14 + w1, y)
      
      let w2 = doc.getTextWidth(String(t['SERIE'] || '-')) + 10
      doc.setFont('helvetica', 'bold').setTextColor(0, 130, 150)
      doc.text('Modelo: ', 14 + w1 + w2, y)
      let w3 = doc.getTextWidth('Modelo: ')
      doc.setFont('helvetica', 'normal').setTextColor(60, 60, 60)
      doc.text(String(t['MODELO'] || '-'), 14 + w1 + w2 + w3, y)
      y += 4.5

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

  // Alertas de garantía vencida en tickets pendientes
  const alertasGarantia = useMemo(() => {
    return ticketsPendientesTotales
      .map(t => {
        const garantia = verificarGarantia(t)
        if (!garantia) return null
        return { ticket: t, garantia }
      })
      .filter(Boolean)
  }, [ticketsPendientesTotales])

  const alertasVencidas = alertasGarantia.filter(a => a.garantia.vencida === true)
  const alertasVigentes = alertasGarantia.filter(a => a.garantia.vencida === false && !a.garantia.sinDatosSerie)
  const alertasSinSerie = alertasGarantia.filter(a => a.garantia.sinDatosSerie === true)

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

          {/* PANEL DE ALERTAS DE GARANTÍA */}
          {alertasGarantia.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden fade-in">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={16} className="text-red-600" />
                  <span className="font-black text-gray-800 text-sm uppercase tracking-wide">Alertas de Garantía</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold">
                  {alertasVencidas.length > 0 && (
                    <span className="bg-red-100 text-red-800 px-2.5 py-1 rounded-full border border-red-200">
                      {alertasVencidas.length} vencida{alertasVencidas.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {alertasVigentes.length > 0 && (
                    <span className="bg-green-100 text-green-800 px-2.5 py-1 rounded-full border border-green-200">
                      {alertasVigentes.length} vigente{alertasVigentes.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {alertasSinSerie.length > 0 && (
                    <span className="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full border border-yellow-200">
                      {alertasSinSerie.length} sin serie
                    </span>
                  )}
                </div>
              </div>

              {alertasVencidas.length > 0 && (
                <div className="p-4 space-y-2">
                  <p className="text-xs font-bold text-red-700 uppercase mb-3 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    No se pueden atender bajo garantía — Garantía vencida
                  </p>
                  {alertasVencidas.map((a, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs font-bold text-red-800 bg-red-100 px-2 py-0.5 rounded border border-red-200">#{a.ticket['N° REFERENCIA']}</span>
                        <span className="text-xs font-bold text-gray-500">{a.ticket.tecnico}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{a.ticket['NEGOCIO']}</p>
                        <p className="text-[10px] text-gray-500 font-bold truncate">Cliente: {a.ticket['CLIENTE']} — Serie: {a.ticket['SERIE']}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold text-red-700">Fab: {a.garantia.fabDisplay}</p>
                        <p className="text-[10px] font-bold text-red-600">Venció: {a.garantia.vencDisplay}</p>
                        <p className="text-[10px] font-black text-red-800">Garantía: {a.garantia.aniosGarantia} año{a.garantia.aniosGarantia > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {alertasVigentes.length > 0 && (
                <div className={`p-4 space-y-2 ${alertasVencidas.length > 0 ? 'border-t border-gray-200' : ''}`}>
                  <p className="text-xs font-bold text-green-700 uppercase mb-3 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    Garantía vigente — Se atienden sin costo
                  </p>
                  {alertasVigentes.map((a, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs font-bold text-green-800 bg-green-100 px-2 py-0.5 rounded border border-green-200">#{a.ticket['N° REFERENCIA']}</span>
                        <span className="text-xs font-bold text-gray-500">{a.ticket.tecnico}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{a.ticket['NEGOCIO']}</p>
                        <p className="text-[10px] text-gray-500 font-bold truncate">Cliente: {a.ticket['CLIENTE']} — Serie: {a.ticket['SERIE']}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold text-green-700">Fab: {a.garantia.fabDisplay}</p>
                        <p className="text-[10px] font-bold text-green-600">Vence: {a.garantia.vencDisplay}</p>
                        <p className="text-[10px] font-black text-green-800">{a.garantia.diasRestantes} días restantes</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {alertasSinSerie.length > 0 && (
                <div className={`p-4 space-y-2 ${(alertasVencidas.length > 0 || alertasVigentes.length > 0) ? 'border-t border-gray-200' : ''}`}>
                  <p className="text-xs font-bold text-yellow-700 uppercase mb-3 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                    Serie inválida o vacía — Verificar manualmente
                  </p>
                  {alertasSinSerie.map((a, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2.5">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs font-bold text-yellow-800 bg-yellow-100 px-2 py-0.5 rounded border border-yellow-200">#{a.ticket['N° REFERENCIA']}</span>
                        <span className="text-xs font-bold text-gray-500">{a.ticket.tecnico}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{a.ticket['NEGOCIO']}</p>
                        <p className="text-[10px] text-gray-500 font-bold truncate">Cliente: {a.ticket['CLIENTE']} — Serie: {a.ticket['SERIE'] || 'VACÍA'}</p>
                      </div>
                      <span className="text-[10px] font-black text-yellow-800">Garantía: {a.garantia.aniosGarantia} año{a.garantia.aniosGarantia > 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
                      {tickets.map((t, i) => {
                        const garantiaInfo = verificarGarantia(t)
                        return (
                        <div key={i}>
                          <div className={`p-1 rounded-lg ${garantiaInfo?.vencida ? 'ring-2 ring-red-400 bg-red-50/40 p-3' : garantiaInfo?.sinDatosSerie ? 'ring-2 ring-yellow-300 bg-yellow-50/40 p-3' : (garantiaInfo && !garantiaInfo.vencida && !garantiaInfo.sinDatosSerie) ? 'ring-2 ring-green-300 bg-green-50/30 p-3' : ''}`}>
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">#{t['N° REFERENCIA']}</span>
                              <TicketBadge estado={t['ESTADO']} />
                              {garantiaInfo?.vencida && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white flex items-center gap-1">
                                  <ShieldAlert size={10} /> GARANTÍA VENCIDA
                                </span>
                              )}
                              {garantiaInfo && !garantiaInfo.vencida && !garantiaInfo.sinDatosSerie && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-green-600 text-white flex items-center gap-1">
                                  <ShieldCheck size={10} /> GARANTÍA VIGENTE
                                </span>
                              )}
                              {garantiaInfo?.sinDatosSerie && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-500 text-white flex items-center gap-1">
                                  <ShieldAlert size={10} /> VERIFICAR SERIE
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-800"><span className="font-bold text-gray-900">NEGOCIO:</span> {t['NEGOCIO']}</p>
                            
                            {t['DESCRIPCIÓN INICIAL'] && t['DESCRIPCIÓN INICIAL'] !== '-' && (
                              <div className="mt-1 mb-2 text-xs text-gray-600 bg-gray-50 rounded px-3 py-2 border-l-2 border-blue-200">
                                <span className="font-bold text-gray-800 block mb-0.5">DESCRIPCIÓN INICIAL:</span>{t['DESCRIPCIÓN INICIAL']}
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 mt-1">
                              <p><span className="font-bold text-gray-800">📍 DIR:</span> {t['DIRECCIÓN'] || '-'}</p>
                              <p><span className="font-bold text-gray-800">📞 TEL:</span> {t['TELÉFONO']}</p>
                              <p><span className="font-bold text-gray-800">👤 CLIENTE:</span> {t['CLIENTE']}</p>
                              <div className="flex gap-3">
                                <p><span className="font-bold text-gray-800">🧊 SERIE:</span> {t['SERIE'] || '-'}</p>
                                <p><span className="font-bold text-gray-800">📦 MOD:</span> {t['MODELO'] || '-'}</p>
                              </div>
                            </div>

                            {/* Detalle de garantía inline */}
                            {garantiaInfo?.vencida && (
                              <div className="mt-2 text-xs text-red-800 bg-red-100 rounded px-3 py-2 border-l-2 border-red-500">
                                <span className="font-black block mb-0.5">⚠️ GARANTÍA VENCIDA — NO ATENDER BAJO GARANTÍA</span>
                                <span className="font-bold text-red-700">Fabricado: {garantiaInfo.fabDisplay} | Venció: {garantiaInfo.vencDisplay} | Garantía: {garantiaInfo.aniosGarantia} año{garantiaInfo.aniosGarantia > 1 ? 's' : ''} ({garantiaInfo.clienteNombre})</span>
                              </div>
                            )}
                            {garantiaInfo && !garantiaInfo.vencida && !garantiaInfo.sinDatosSerie && (
                              <div className="mt-2 text-xs text-green-800 bg-green-100 rounded px-3 py-2 border-l-2 border-green-500">
                                <span className="font-black block mb-0.5">✅ GARANTÍA VIGENTE</span>
                                <span className="font-bold text-green-700">Fabricado: {garantiaInfo.fabDisplay} | Vence: {garantiaInfo.vencDisplay} | Restan: {garantiaInfo.diasRestantes} días ({garantiaInfo.clienteNombre})</span>
                              </div>
                            )}
                            {garantiaInfo?.sinDatosSerie && (
                              <div className="mt-2 text-xs text-yellow-800 bg-yellow-100 rounded px-3 py-2 border-l-2 border-yellow-500">
                                <span className="font-black block mb-0.5">⚠️ SERIE INVÁLIDA — VERIFICAR MANUALMENTE</span>
                                <span className="font-bold text-yellow-700">Cliente con garantía: {garantiaInfo.clienteNombre} ({garantiaInfo.aniosGarantia} año{garantiaInfo.aniosGarantia > 1 ? 's' : ''}) — Serie no se pudo leer: "{t['SERIE']}"</span>
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
                        )
                      })}
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
