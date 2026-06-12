import { useState, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { 
  Upload, Clipboard, FileText, FileSpreadsheet, ChevronDown, Wrench, Filter, 
  DownloadCloud, MapPin, ShieldAlert, ShieldCheck, Copy, ChevronRight
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

// ── GARANTÍA ──
const CLIENTES_GARANTIA = [
  { nombre: 'ABCO', anios: 1 },
  { nombre: 'COMERCIALIZADORA  DE ALIMENTOS Y BEBIDAS SAN MIGUEL S.A', anios: 2 },
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
  { nombre: 'ARRENDADORA SARITA, S.A.', anios: 1 },
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
  if (!clienteGarantia) return null
  const fechaFab = parsearFechaSerie(ticket['SERIE'])
  if (!fechaFab) return { esClienteGarantia: true, sinDatosSerie: true, clienteNombre: clienteGarantia.nombre, aniosGarantia: clienteGarantia.anios }
  const fechaVencimiento = new Date(fechaFab)
  fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + clienteGarantia.anios)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const vencida = hoy > fechaVencimiento
  const diasRestantes = Math.ceil((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24))
  return {
    esClienteGarantia: true, sinDatosSerie: false, vencida, diasRestantes,
    fechaFabricacion: fechaFab, fechaVencimiento,
    clienteNombre: clienteGarantia.nombre, aniosGarantia: clienteGarantia.anios,
    fabDisplay: `${String(fechaFab.getDate()).padStart(2,'0')}/${String(fechaFab.getMonth()+1).padStart(2,'0')}/${fechaFab.getFullYear()}`,
    vencDisplay: `${String(fechaVencimiento.getDate()).padStart(2,'0')}/${String(fechaVencimiento.getMonth()+1).padStart(2,'0')}/${fechaVencimiento.getFullYear()}`
  }
}

function obtenerComentarioProceso(ticket) {
  if (ticket['DESCRIPCIÓN'] && ticket['DESCRIPCIÓN'] !== '-') return ticket['DESCRIPCIÓN']
  if (ticket['GEOLOCALIZACIÓN'] && ticket['GEOLOCALIZACIÓN'] !== '-') return 'Técnico únicamente cargó geolocalización'
  return 'Sin datos'
}

function buildMessage(tecnico, tickets, rutaDefinida) {
  const fecha = TODAY()
  let msg = `🔧 *TÉCNICO: ${tecnico}*\n📅 *FECHA:* ${fecha}\n`
  if (rutaDefinida && rutaDefinida.trim() !== '') msg += `🗺️ *RUTA:* ${rutaDefinida.trim()}\n`
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
      const c = obtenerComentarioProceso(t)
      msg += `\n⚠️ *COMENTARIO EN PROCESO:*\n${c}\n`
    }
  })
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━`
  return msg
}

function TicketBadge({ estado }) {
  const n = normalizarTexto(estado)
  let cls = 'badge-asignada'
  if (n.includes('PROCESO')) cls = 'badge-proceso'
  if (n.includes('AGENCIA')) cls = 'badge-agencia'
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${cls}`}>{estado}</span>
}

export default function ModuloTecnicos({ 
  allTickets, setAllTickets, nombreArchivo, setNombreArchivo, 
  fechaSubidaExcel, setFechaSubidaExcel,
  rutasTecnicos, setRutasTecnicos, rutasAutomaticas, valorRutaTecnico, baseMunicipios 
}) {
  const [dragging, setDragging] = useState(false)
  const [expandido, setExpandido] = useState({})
  const [filtroTecnico, setFiltroTecnico] = useState('Todos')
  const [filtroEstadoGlobal, setFiltroEstadoGlobal] = useState('Todos')
  const [garantiaAbierta, setGarantiaAbierta] = useState(false)
  const [duplicadosAbierta, setDuplicadosAbierta] = useState(false)
  const fileRef = useRef()

  function procesarExcel(file) {
    if (!file) return
    setNombreArchivo(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rawMatrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      
      let headerRowIndex = -1, headerKeys = []
      for (let i = 0; i < rawMatrix.length; i++) {
        const upperRow = rawMatrix[i].map(cell => normalizarTexto(cell))
        if (upperRow.includes('ESTADO')) { headerRowIndex = i; headerKeys = upperRow; break }
      }
      if (headerRowIndex === -1) { alert("⚠️ No encontré columna 'ESTADO'."); return }

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
          let clienteOriginal = String(fila['CLIENTE'] || fila['NOMBRE CLIENTE'] || '-').trim()
          let fechaRaw = fila['FECHA REALIZADA'] || fila['FECHA REALIZACION'] || fila['FECHA'] || ''
          const fechaEstructura = normalizarFechaExcel(fechaRaw)
          
          listaTemporal.push({
            tecnico,
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
            'DESCRIPCIÓN': fila['DESCRIPCIÓN'] || fila['DESCRIPCION'] || fila['COMENTARIO'] || '-',
            'GEOLOCALIZACIÓN': fila['GEOLOCALIZACION'] || fila['GEOLOCALIZACIÓN'] || fila['GEOLOCALIZACIÓ'] || fila['GEO'] || '-'
          })
        }
      }

      if (listaTemporal.length === 0) {
        alert("⚠️ No detecté tickets con estados válidos.")
      } else {
        setAllTickets(listaTemporal)
        setFiltroTecnico('Todos')
        // Recalcular rutas al subir Excel nuevo
        const ticketsActivosParaRuta = listaTemporal.filter(t => 
          t.ESTADO_LIMPIO.includes('TECNICO') || t.ESTADO_LIMPIO.includes('PROCESO') || t.ESTADO_LIMPIO.includes('AGENCIA')
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
              if (regex.test(textoBuscar)) encontrados.add(muniOriginal.toUpperCase())
            })
          })
          nuevasRutas[tec] = Array.from(encontrados).slice(0, 10).join(' - ')
        })
        setRutasTecnicos(nuevasRutas)
        const ahora = new Date()
        setFechaSubidaExcel(`${ahora.toLocaleDateString()} a las ${ahora.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const extensionesValidas = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.csv', '.tsv', '.ods']
  function onFileChange(e) {
    const archivo = e.target.files[0]
    if (!archivo) return
    const ext = archivo.name.slice(archivo.name.lastIndexOf('.')).toLowerCase()
    if (!extensionesValidas.includes(ext)) {
      alert('Archivo no soportado. Usa: ' + extensionesValidas.join(', '))
      e.target.value = ''
      return
    }
    procesarExcel(archivo)
  }
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
    XLSX.utils.book_append_sheet(wb, ws, "Base Completa")
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
    XLSX.writeFile(wb, `Tickets_${tecnico.replace(/\s+/g,'_')}.xlsx`)
  }

  // ── PDF con autoTable (ya no se monta texto sobre texto) ──
  function generarPDFIndividual(tecnico, tickets, rutaDefinida) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const fecha = TODAY()

    // Encabezado
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(15, 23, 42)
    doc.text(`TÉCNICO: ${tecnico}`, 14, 16)
    doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(100, 116, 139)
    doc.text(`Fecha: ${fecha}  |  Órdenes: ${tickets.length}`, 14, 22)
    if (rutaDefinida && rutaDefinida.trim()) {
      doc.setFont('helvetica', 'bold').setTextColor(14, 116, 144)
      const lr = doc.splitTextToSize(`Ruta: ${rutaDefinida.trim()}`, 180)
      doc.text(lr, 14, 27)
    }

    // Tabla principal con autoTable
    const body = []
    tickets.forEach((t, i) => {
      const esProceso = t['ESTADO_LIMPIO'].includes('PROCESO')
      
      // Separador entre tickets (excepto antes del primero)
      if (i > 0) {
        body.push([{
          content: '',
          colSpan: 4,
          styles: { 
            fillColor: [30, 41, 59], 
            cellPadding: 0.5,
            minCellHeight: 1
          }
        }])
      }

      let info = `Negocio: ${t['NEGOCIO'] || '-'}\nDirección: ${t['DIRECCIÓN'] || '-'}\nTeléfono: ${t['TELÉFONO'] || '-'}\nCliente: ${t['CLIENTE'] || '-'}\nSerie: ${t['SERIE'] || '-'} | Modelo: ${t['MODELO'] || '-'}`
      
      // Fila principal del ticket
      body.push([
        { content: `#${i+1}`, styles: { fontStyle: 'bold', halign: 'center' } },
        { content: t['N° REFERENCIA'] || '-', styles: { fontStyle: 'bold' } },
        { content: t['ESTADO'] || '-', styles: esProceso ? { textColor: [190, 18, 60], fontStyle: 'bold' } : {} },
        { content: info }
      ])

      // Fila DESCRIPCIÓN INICIAL
      const descInicial = (t['DESCRIPCIÓN INICIAL'] && t['DESCRIPCIÓN INICIAL'] !== '-') ? t['DESCRIPCIÓN INICIAL'] : 'Sin descripción inicial'
      body.push([{
        content: `DESCRIPCIÓN INICIAL:  ${descInicial}`, 
        colSpan: 4, 
        styles: { 
          fontStyle: 'bold', fontSize: 8, 
          fillColor: [241, 245, 249], textColor: [15, 23, 42],
          cellPadding: { top: 2, bottom: 2, left: 12, right: 5 },
          overflow: 'linebreak'
        } 
      }])

      // Fila COMENTARIO EN PROCESO (solo si aplica, en rojo)
      if (esProceso) {
        const com = obtenerComentarioProceso(t)
        body.push([{
          content: `COMENTARIO EN PROCESO:  ${com}`,
          colSpan: 4,
          styles: {
            fontStyle: 'bold', fontSize: 7.5,
            fillColor: [255, 241, 242], textColor: [190, 18, 60],
            cellPadding: { top: 2, bottom: 2, left: 12, right: 5 },
            overflow: 'linebreak'
          }
        }])
      }
    })

    autoTable(doc, {
      startY: rutaDefinida?.trim() ? 33 : 28,
      head: [['#', 'Ref', 'Estado', 'Información del Ticket']],
      body,
      theme: 'grid',
      tableWidth: 'auto',
      styles: { 
        fontSize: 7.5, 
        cellPadding: 2.5, 
        lineColor: [203, 213, 225], 
        lineWidth: 0.2, 
        textColor: [30, 41, 59],
        overflow: 'linebreak'
      },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 
        0: { halign: 'center', cellWidth: 9 },
        1: { cellWidth: 21 },
        2: { cellWidth: 26 },
        3: { cellWidth: 'auto' }
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
        doc.setFontSize(7).setTextColor(150)
        doc.text(`TicketManager Pro — ${tecnico}`, 14, doc.internal.pageSize.height - 8)
        doc.text(`Pág. ${doc.internal.getCurrentPageInfo().pageNumber}`, doc.internal.pageSize.width - 25, doc.internal.pageSize.height - 8)
      }
    })
    doc.save(`Tickets_${tecnico.replace(/\s+/g,'_')}.pdf`)
  }

  function generarPDFGlobalEnProceso() {
    const enProceso = allTickets.filter(t => t.ESTADO_LIMPIO.includes('PROCESO'))
    if (enProceso.length === 0) return alert("No hay tickets en proceso.")
    
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(15, 23, 42)
    doc.text('REPORTE GLOBAL: TICKETS EN PROCESO', 14, 16)
    doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(100, 116, 139)
    doc.text(`${enProceso.length} tickets — ${TODAY()}`, 14, 22)

    const body = enProceso.map((t, i) => {
      const com = obtenerComentarioProceso(t)
      return [
        `${i+1}`,
        t.tecnico,
        t['N° REFERENCIA'] || '-',
        t['NEGOCIO'] || '-',
        { content: com, styles: { textColor: [190, 18, 60], fontStyle: 'bold' } }
      ]
    })

    autoTable(doc, {
      startY: 27,
      head: [['#', 'Técnico', 'Ref', 'Negocio', 'Comentario']],
      body,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2, lineColor: [203, 213, 225], lineWidth: 0.2, textColor: [30, 41, 59], overflow: 'linebreak' },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 28 }, 2: { cellWidth: 18 }, 3: { cellWidth: 32 }, 4: { cellWidth: 'auto' } },
      margin: { left: 14, right: 14 },
    })
    doc.save(`Global_En_Proceso_${TODAY().replace('/','')}.pdf`)
  }

  // ── Datos computados ──
  const ticketsPendientesTotales = allTickets.filter(t => !t.ESTADO_LIMPIO.includes('FINALIZADA'))
  const gruposPendientesAgrupados = {}
  ticketsPendientesTotales.forEach(t => {
    if (!gruposPendientesAgrupados[t.tecnico]) gruposPendientesAgrupados[t.tecnico] = []
    gruposPendientesAgrupados[t.tecnico].push(t)
  })
  const tecnicosConPendientes = Object.keys(gruposPendientesAgrupados).sort()

  const alertasGarantia = useMemo(() => {
    return ticketsPendientesTotales.map(t => {
      const garantia = verificarGarantia(t)
      if (!garantia) return null
      return { ticket: t, garantia }
    }).filter(Boolean)
  }, [ticketsPendientesTotales])

  const alertasVencidas = alertasGarantia.filter(a => a.garantia.vencida === true)
  const alertasVigentes = alertasGarantia.filter(a => a.garantia.vencida === false && !a.garantia.sinDatosSerie)
  const alertasSinSerie = alertasGarantia.filter(a => a.garantia.sinDatosSerie === true)

  const ticketsDuplicados = useMemo(() => {
    const conteo = {}
    ticketsPendientesTotales.forEach(t => {
      const ref = String(t['N° REFERENCIA'] || '').trim()
      if (!ref) return
      if (!conteo[ref]) conteo[ref] = []
      conteo[ref].push(t)
    })
    return Object.entries(conteo)
      .filter(([, arr]) => arr.length > 1)
      .map(([ref, arr]) => ({ ref, tickets: arr, cantidad: arr.length }))
      .sort((a, b) => b.cantidad - a.cantidad)
  }, [ticketsPendientesTotales])

  return (
    <div className="space-y-4">
      {/* ── Upload zone ── */}
      <div
        className={`card flex items-center gap-3 px-4 py-3 cursor-pointer transition-all border-2 border-dashed ${dragging ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}
        onClick={() => fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <Upload size={15} className="text-slate-400" />
        </div>
        <div className="flex-1 min-w-0 text-xs">
          {nombreArchivo ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sky-600 truncate max-w-[250px]">{nombreArchivo}</span>
              {fechaSubidaExcel && <span className="text-slate-400 font-medium text-[10px]">· {fechaSubidaExcel}</span>}
            </div>
          ) : (
            <p className="font-semibold text-slate-500">Arrastra o selecciona el archivo de tickets</p>
          )}
        </div>
        {allTickets.length > 0 && (
          <button onClick={(e) => { e.stopPropagation(); descargarExcelCompleto() }} className="btn-success flex items-center gap-1.5 shrink-0 text-[10px]">
            <DownloadCloud size={12} /> Excel
          </button>
        )}
        <input ref={fileRef} type="file" className="hidden" onChange={onFileChange} />
      </div>

      {allTickets.length > 0 && (
        <>
          {/* ── Stats strip + Filtros ── */}
          <div className="card overflow-hidden">
            {/* Stats strip */}
            <div className="flex border-b border-slate-100">
              <div className="flex-1 px-3 py-2 text-center border-r border-slate-100">
                <p className="text-lg font-black text-slate-800 leading-none">{ticketsPendientesTotales.length}</p>
                <p className="text-[9px] font-semibold text-slate-400 uppercase mt-0.5">Pendientes</p>
              </div>
              <div className="flex-1 px-3 py-2 text-center border-r border-slate-100 cursor-pointer hover:bg-amber-50 transition-colors" onClick={() => setFiltroEstadoGlobal('En Proceso')}>
                <p className="text-lg font-black text-amber-600 leading-none">{ticketsPendientesTotales.filter(t => t.ESTADO_LIMPIO.includes('PROCESO')).length}</p>
                <p className="text-[9px] font-semibold text-slate-400 uppercase mt-0.5">En Proceso</p>
              </div>
              <div className="flex-1 px-3 py-2 text-center border-r border-slate-100">
                <p className="text-lg font-black text-sky-600 leading-none">{tecnicosConPendientes.length}</p>
                <p className="text-[9px] font-semibold text-slate-400 uppercase mt-0.5">Técnicos</p>
              </div>
              <div className="flex-1 px-3 py-2 text-center">
                <p className="text-lg font-black text-emerald-600 leading-none">{allTickets.filter(t => t.ESTADO_LIMPIO.includes('FINALIZADA')).length}</p>
                <p className="text-[9px] font-semibold text-slate-400 uppercase mt-0.5">Finalizados</p>
              </div>
            </div>

            {/* Filtros */}
            <div className="p-3 space-y-2.5">
              <div>
                <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Técnico</label>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setFiltroTecnico('Todos')} className={`pill ${filtroTecnico === 'Todos' ? 'pill-active' : 'pill-inactive'}`}>Todos</button>
                  {tecnicosConPendientes.map(t => (
                    <button key={t} onClick={() => setFiltroTecnico(t)} className={`pill ${filtroTecnico === t ? 'pill-active' : 'pill-inactive'}`}>{t}</button>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Estado:</span>
                  {['Todos', 'Asignada a Técnico', 'En Proceso', 'Asignada a Agencia'].map(est => (
                    <button key={est} onClick={() => setFiltroEstadoGlobal(est)} className={`pill ${filtroEstadoGlobal === est ? 'pill-active' : 'pill-inactive'}`}>{est}</button>
                  ))}
                </div>
                <button onClick={generarPDFGlobalEnProceso} className="btn-danger flex items-center gap-1 text-[10px] shrink-0">
                  <FileText size={11} /> PDF En Proceso
                </button>
              </div>
            </div>
          </div>

          {/* ── Alertas Garantía (colapsable) ── */}
          {alertasGarantia.length > 0 && (
            <div className="card-section">
              <button
                onClick={() => setGarantiaAbierta(!garantiaAbierta)}
                className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert size={13} className="text-rose-500" />
                  <span className="font-bold text-slate-600 text-[10px] uppercase tracking-wider">Alertas de Garantía</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {alertasVencidas.length > 0 && <span className="text-[9px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">{alertasVencidas.length} vencida{alertasVencidas.length !== 1 ? 's' : ''}</span>}
                  {alertasVigentes.length > 0 && <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{alertasVigentes.length} vigente{alertasVigentes.length !== 1 ? 's' : ''}</span>}
                  {alertasSinSerie.length > 0 && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{alertasSinSerie.length} sin serie</span>}
                  <ChevronDown size={13} className={`text-slate-400 transition-transform ${garantiaAbierta ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {garantiaAbierta && (
                <div className="slide-up">
                  {alertasVencidas.length > 0 && (
                    <div className="p-3 space-y-2.5 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-rose-600 uppercase flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                        Garantía vencida — No atender bajo garantía
                      </p>
                      {alertasVencidas.map((a, i) => (
                        <div key={i} className="bg-rose-50 border border-rose-200 border-l-[4px] border-l-rose-500 rounded-lg px-3 py-2.5 space-y-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">#{a.ticket['N° REFERENCIA']}</span>
                            <span className="text-[10px] font-semibold text-slate-500">{a.ticket.tecnico}</span>
                            <span className="text-[9px] font-semibold text-rose-600 ml-auto shrink-0">Fab: {a.garantia.fabDisplay} · Venció: {a.garantia.vencDisplay} · {a.garantia.aniosGarantia}a</span>
                          </div>
                          <p className="text-[10px] font-semibold text-slate-700">{a.ticket['NEGOCIO']}</p>
                          <div className="flex flex-col sm:flex-row sm:gap-4 text-[9px] font-medium text-slate-500">
                            <p>📍 {a.ticket['DIRECCIÓN'] || '-'}</p>
                            <p className="shrink-0">🧊 Serie: <span className="font-bold text-slate-700">{a.ticket['SERIE'] || '-'}</span></p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {alertasVigentes.length > 0 && (
                    <div className={`p-3 space-y-2.5 ${alertasVencidas.length ? 'border-t border-slate-100' : ''}`}>
                      <p className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Garantía vigente
                      </p>
                      {alertasVigentes.map((a, i) => (
                        <div key={i} className="bg-emerald-50 border border-emerald-200 border-l-[4px] border-l-emerald-500 rounded-lg px-3 py-2.5 space-y-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">#{a.ticket['N° REFERENCIA']}</span>
                            <span className="text-[10px] font-semibold text-slate-500">{a.ticket.tecnico}</span>
                            <span className="text-[9px] font-semibold text-emerald-600 ml-auto shrink-0">{a.garantia.diasRestantes}d restantes · {a.garantia.aniosGarantia}a</span>
                          </div>
                          <p className="text-[10px] font-semibold text-slate-700">{a.ticket['NEGOCIO']}</p>
                          <div className="flex flex-col sm:flex-row sm:gap-4 text-[9px] font-medium text-slate-500">
                            <p>📍 {a.ticket['DIRECCIÓN'] || '-'}</p>
                            <p className="shrink-0">🧊 Serie: <span className="font-bold text-slate-700">{a.ticket['SERIE'] || '-'}</span></p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {alertasSinSerie.length > 0 && (
                    <div className={`p-3 space-y-2.5 ${(alertasVencidas.length || alertasVigentes.length) ? 'border-t border-slate-100' : ''}`}>
                      <p className="text-[10px] font-bold text-amber-600 uppercase flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        Verificar serie manualmente
                      </p>
                      {alertasSinSerie.map((a, i) => (
                        <div key={i} className="bg-amber-50 border border-amber-200 border-l-[4px] border-l-amber-500 rounded-lg px-3 py-2.5 space-y-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">#{a.ticket['N° REFERENCIA']}</span>
                            <span className="text-[10px] font-semibold text-slate-500">{a.ticket.tecnico}</span>
                            <span className="text-[9px] font-semibold text-amber-600 ml-auto shrink-0">Serie: "{a.ticket['SERIE']}" · {a.garantia.aniosGarantia}a</span>
                          </div>
                          <p className="text-[10px] font-semibold text-slate-700">{a.ticket['NEGOCIO']} — {a.ticket['CLIENTE']}</p>
                          <p className="text-[9px] font-medium text-slate-500">📍 {a.ticket['DIRECCIÓN'] || '-'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Tickets Duplicados (colapsable) ── */}
          {ticketsDuplicados.length > 0 && (
            <div className="card-section">
              <button
                onClick={() => setDuplicadosAbierta(!duplicadosAbierta)}
                className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Copy size={13} className="text-orange-500" />
                  <span className="font-bold text-slate-600 text-[10px] uppercase tracking-wider">Tickets Duplicados</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                    {ticketsDuplicados.length} referencia{ticketsDuplicados.length !== 1 ? 's' : ''} · {ticketsDuplicados.reduce((s, d) => s + d.cantidad, 0)} tickets
                  </span>
                  <ChevronDown size={13} className={`text-slate-400 transition-transform ${duplicadosAbierta ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {duplicadosAbierta && (
                <div className="slide-up p-3 space-y-2.5 border-t border-slate-100">
                  {ticketsDuplicados.map((dup, i) => (
                    <div key={i} className="bg-orange-50 border border-orange-200 border-l-[4px] border-l-orange-500 rounded-lg overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-orange-100/50 border-b border-orange-200">
                        <span className="font-mono text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded border border-orange-200">#{dup.ref}</span>
                        <span className="text-[9px] font-bold text-orange-600">{dup.cantidad}x duplicado</span>
                      </div>
                      <div className="px-3 py-2 space-y-1.5">
                        {dup.tickets.map((t, j) => (
                          <div key={j} className="flex items-center gap-2 flex-wrap text-[10px]">
                            <span className="font-semibold text-slate-700">{t['NEGOCIO'] || '-'}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500">{t.tecnico || '-'}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500">{t['ESTADO'] || '-'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tarjetas de técnicos ── */}
          {tecnicosConPendientes
            .filter(tecnico => filtroTecnico === 'Todos' || filtroTecnico === tecnico)
            .map(tecnico => {
              const tickets = gruposPendientesAgrupados[tecnico].filter(t => {
                if (filtroEstadoGlobal === 'Todos') return true
                if (filtroEstadoGlobal === 'Asignada a Técnico') {
                  return t.ESTADO_LIMPIO.includes('TECNICO') && !t.ESTADO_LIMPIO.includes('PROCESO')
                }
                if (filtroEstadoGlobal === 'En Proceso') {
                  return t.ESTADO_LIMPIO.includes('PROCESO')
                }
                if (filtroEstadoGlobal === 'Asignada a Agencia') {
                  return t.ESTADO_LIMPIO.includes('AGENCIA')
                }
                return true
              })
              if (tickets.length === 0) return null
              const rutaActual = valorRutaTecnico(tecnico)

              return (
                <div key={tecnico} className="card-section fade-in">
                  {/* Header del técnico */}
                  <div className="bg-slate-800 px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <p className="font-bold text-white text-xs uppercase tracking-wider">{tecnico}</p>
                        <span className="text-[10px] font-semibold text-slate-400">{tickets.length} orden{tickets.length !== 1 ? 'es' : ''}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => {navigator.clipboard.writeText(buildMessage(tecnico, tickets, rutaActual)); alert('Copiado')}} className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition" title="Copiar WhatsApp"><Copy size={12} /></button>
                        <button onClick={() => generarPDFIndividual(tecnico, tickets, rutaActual)} className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition" title="Descargar PDF"><FileText size={12} /></button>
                        <button onClick={() => generarExcelTecnico(tecnico, tickets)} className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition" title="Descargar Excel"><FileSpreadsheet size={12} /></button>
                        <button onClick={() => setExpandido(p => ({ ...p, [tecnico]: !p[tecnico] }))} className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition ml-1">
                          <ChevronDown size={14} className={`transition-transform ${expandido[tecnico] ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>
                    {rutaActual && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <MapPin size={10} className="text-sky-400 shrink-0" />
                        <span className="text-[10px] font-medium text-sky-300 uppercase">{rutaActual}</span>
                      </div>
                    )}
                  </div>

                  {/* Tickets expandidos */}
                  {expandido[tecnico] && (
                    <div className="p-3 sm:p-4 space-y-4 slide-up bg-slate-50/60">
                      {tickets.map((t, i) => {
                        const g = verificarGarantia(t)
                        const esProceso = t['ESTADO_LIMPIO'].includes('PROCESO')
                        const esAgencia = t['ESTADO_LIMPIO'].includes('AGENCIA')
                        const borderColor = g?.vencida ? 'border-l-rose-500' 
                          : esProceso ? 'border-l-amber-400' 
                          : esAgencia ? 'border-l-violet-400' 
                          : 'border-l-sky-400'
                        const headerBg = g?.vencida ? 'bg-rose-50' 
                          : esProceso ? 'bg-amber-50/60' 
                          : esAgencia ? 'bg-violet-50/60' 
                          : 'bg-slate-50'
                        return (
                          <div key={i} className={`rounded-lg border border-slate-200 border-l-[4px] ${borderColor} overflow-hidden bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]`}>
                            {/* Badge row */}
                            <div className={`flex items-center gap-1.5 flex-wrap px-3 py-2.5 ${headerBg} border-b border-slate-100`}>
                              <span className="font-mono text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100">#{t['N° REFERENCIA']}</span>
                              <TicketBadge estado={t['ESTADO']} />
                              {g?.vencida && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-rose-600 text-white flex items-center gap-0.5"><ShieldAlert size={9} /> VENCIDA</span>}
                              {g && !g.vencida && !g.sinDatosSerie && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-600 text-white flex items-center gap-0.5"><ShieldCheck size={9} /> VIGENTE</span>}
                              {g?.sinDatosSerie && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500 text-white flex items-center gap-0.5"><ShieldAlert size={9} /> VERIFICAR</span>}
                            </div>
                            
                            {/* Negocio */}
                            <div className="px-3 pt-2.5 pb-2">
                              <p className="text-[13px] font-bold text-slate-800 leading-tight">{t['NEGOCIO']}</p>
                            </div>
                            
                            {/* Descripción Inicial */}
                            {t['DESCRIPCIÓN INICIAL'] && t['DESCRIPCIÓN INICIAL'] !== '-' && (
                              <div className="mx-3 mb-2 text-[11px] text-slate-600 bg-sky-50 rounded-md px-3 py-2 border-l-[3px] border-sky-400">
                                <span className="font-bold text-sky-700 block mb-0.5 text-[10px] uppercase">Descripción Inicial</span>
                                <span className="font-medium leading-relaxed">{t['DESCRIPCIÓN INICIAL']}</span>
                              </div>
                            )}

                            {/* Datos del ticket - grid estructurado */}
                            <div className="mx-3 mb-3 bg-slate-50 rounded-md p-2.5 space-y-1">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                                <div className="flex gap-1.5">
                                  <span className="text-slate-400 shrink-0 w-12 font-semibold">DIR</span>
                                  <span className="text-slate-700 font-medium">{t['DIRECCIÓN'] || '-'}</span>
                                </div>
                                <div className="flex gap-1.5">
                                  <span className="text-slate-400 shrink-0 w-12 font-semibold">TEL</span>
                                  <span className="text-slate-700 font-medium">{t['TELÉFONO']}</span>
                                </div>
                                <div className="flex gap-1.5">
                                  <span className="text-slate-400 shrink-0 w-12 font-semibold">CLIENTE</span>
                                  <span className="text-slate-700 font-medium">{t['CLIENTE']}</span>
                                </div>
                                <div className="flex gap-1.5">
                                  <span className="text-slate-400 shrink-0 w-12 font-semibold">SERIE</span>
                                  <span className="text-slate-700 font-mono font-semibold text-[10px]">{t['SERIE'] || '-'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Garantía inline */}
                            {g?.vencida && (
                              <div className="mx-3 mb-2 text-[10px] text-rose-700 bg-rose-100 rounded-md px-3 py-1.5 border-l-[3px] border-rose-500">
                                <span className="font-bold">⚠️ NO ATENDER — </span>
                                Fab: {g.fabDisplay} · Venció: {g.vencDisplay} · {g.aniosGarantia}a ({g.clienteNombre})
                              </div>
                            )}
                            {g && !g.vencida && !g.sinDatosSerie && (
                              <div className="mx-3 mb-2 text-[10px] text-emerald-700 bg-emerald-50 rounded-md px-3 py-1.5 border-l-[3px] border-emerald-400">
                                <span className="font-bold">✅ VIGENTE — </span>
                                Fab: {g.fabDisplay} · Vence: {g.vencDisplay} · {g.diasRestantes}d ({g.clienteNombre})
                              </div>
                            )}
                            {g?.sinDatosSerie && (
                              <div className="mx-3 mb-2 text-[10px] text-amber-700 bg-amber-50 rounded-md px-3 py-1.5 border-l-[3px] border-amber-400">
                                <span className="font-bold">⚠️ VERIFICAR — </span>
                                {g.clienteNombre} ({g.aniosGarantia}a) — Serie: "{t['SERIE']}"
                              </div>
                            )}
                            
                            {t['ESTADO_LIMPIO'].includes('PROCESO') && (
                              <div className="mx-3 mb-3 text-[10px] text-rose-700 bg-rose-50 rounded-md px-3 py-1.5 border-l-[3px] border-rose-400">
                                <span className="font-bold block mb-0.5 uppercase text-[9px]">Comentario en Proceso</span>
                                <span className="font-semibold">{obtenerComentarioProceso(t)}</span>
                              </div>
                            )}
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
