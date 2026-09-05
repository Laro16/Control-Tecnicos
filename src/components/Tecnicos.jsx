import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { 
  Upload, Clipboard, FileText, FileSpreadsheet, ChevronDown, Wrench, Filter, 
  DownloadCloud, MapPin, ShieldAlert, ShieldCheck, Copy, ChevronRight, Users, Activity,
  Phone, Navigation, MessageCircle, Check
} from 'lucide-react'
import { obtenerSerieTicket, resolverSerie, verificarGarantiaTicket } from '../utils/garantias'
import { claveAtencion, normalizarSerieHistorial } from '../utils/historialSeries'
import HistorialSeries from './HistorialSeries'
import { crearLibroTecnicos, descargarArchivo, fechaArchivo, prepararInformeTecnicos } from '../utils/exportacionesTecnicos'
import { crearPDFGarantias } from '../utils/pdfGarantias'
import EstadoParticulares from './EstadoParticulares'

const TODAY = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

function normalizarTexto(texto) {
  if (!texto) return ''
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
}

const ESTADOS_ACTIVOS_RUTA = new Set(['EN PROCESO', 'ASIGNADA A TECNICO', 'ASIGNADA A AGENCIA'])

function esEstadoActivoRuta(ticket) {
  return ESTADOS_ACTIVOS_RUTA.has(normalizarTexto(ticket?.ESTADO || ticket?.ESTADO_LIMPIO))
}

function limpiarReferencia(valor) {
  if (valor === null || valor === undefined) return ''
  const referencia = String(valor).trim()
  return referencia === '-' ? '' : referencia
}

function normalizarFechaExcel(fechaTexto) {
  if (!fechaTexto) return null
  if (typeof fechaTexto === 'number') {
    const fecha = XLSX.SSF.parse_date_code(fechaTexto)
    if (!fecha) return null
    fechaTexto = `${fecha.d}/${fecha.m}/${fecha.y}`
  }
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
    msg += `🧊 *SERIE:* ${obtenerSerieTicket(t)}  📦 *MODELO:* ${t['MODELO'] || '-'}\n`
    if (t['ESTADO_LIMPIO'].includes('PROCESO')) {
      const c = obtenerComentarioProceso(t)
      msg += `\n⚠️ *COMENTARIO EN PROCESO:*\n${c}\n`
    }
  })
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━`
  return msg
}

function buildTicketMessage(ticket) {
  return [
    `🔧 *TICKET ${ticket['N° REFERENCIA'] || '-'}*`,
    `🏪 *NEGOCIO:* ${ticket['NEGOCIO'] || '-'}`,
    `👤 *CLIENTE:* ${ticket['CLIENTE'] || '-'}`,
    `📍 *DIRECCIÓN:* ${ticket['DIRECCIÓN'] || '-'}`,
    `📞 *TELÉFONO:* ${ticket['TELÉFONO'] || '-'}`,
    `🧊 *SERIE:* ${obtenerSerieTicket(ticket)}`,
    `📦 *MODELO:* ${ticket['MODELO'] || '-'}`,
    `📝 *DESCRIPCIÓN INICIAL:* ${ticket['DESCRIPCIÓN INICIAL'] || '-'}`,
    `📌 *ESTADO:* ${ticket['ESTADO'] || '-'}`,
  ].join('\n')
}

function obtenerTelefonoAccion(telefono) {
  if (!telefono || telefono === '-') return ''
  const coincidencia = String(telefono).match(/\+?\d[\d\s().-]{6,}/)
  if (!coincidencia) return ''
  const limpio = coincidencia[0].replace(/[^\d+]/g, '')
  return /^\+?\d{7,15}$/.test(limpio) ? limpio : ''
}

function TicketActions({ ticket, onCopy, compact = false }) {
  const telefono = obtenerTelefonoAccion(ticket['TELÉFONO'])
  const direccion = ticket['DIRECCIÓN'] && ticket['DIRECCIÓN'] !== '-' ? ticket['DIRECCIÓN'] : ''
  const mapsUrl = direccion
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${direccion} ${ticket['NEGOCIO'] || ''}`.trim())}`
    : ''
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(buildTicketMessage(ticket))}`
  const base = `flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-extrabold transition active:scale-[0.98] ${compact ? 'sm:min-h-8' : 'sm:min-h-9'}`

  return (
    <div className={`grid grid-cols-2 gap-2 ${compact ? 'pt-1 sm:flex sm:flex-wrap' : 'border-t border-slate-100 px-3 py-3 sm:grid-cols-4'}`}>
      {telefono ? (
        <a href={`tel:${telefono}`} className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`} title={`Llamar a ${telefono}`}>
          <Phone size={12} /> Llamar
        </a>
      ) : (
        <span className={`${base} cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300`} title="Sin teléfono válido">
          <Phone size={12} /> Sin teléfono
        </span>
      )}
      {mapsUrl ? (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={`${base} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100`} title="Abrir dirección en Google Maps">
          <Navigation size={12} /> Maps
        </a>
      ) : (
        <span className={`${base} cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300`} title="Sin dirección">
          <Navigation size={12} /> Sin dirección
        </span>
      )}
      <button type="button" onClick={() => onCopy(ticket)} className={`${base} border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50`} title="Copiar todos los datos del ticket">
        <Copy size={12} /> Copiar
      </button>
      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={`${base} border-green-200 bg-green-50 text-green-700 hover:bg-green-100`} title="Compartir ticket por WhatsApp">
        <MessageCircle size={12} /> WhatsApp
      </a>
    </div>
  )
}

function WarrantyClient({ ticket, tone = 'rose' }) {
  const tones = {
    rose: 'border-rose-300 bg-white text-rose-800',
    amber: 'border-amber-300 bg-white text-amber-800',
    emerald: 'border-emerald-300 bg-white text-emerald-800',
    violet: 'border-violet-300 bg-white text-violet-800',
  }
  return (
    <div className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:gap-2 ${tones[tone]}`} title="Dato tomado del encabezado CLIENTE del Excel diario">
      <span className="text-[9px] font-black uppercase tracking-[0.14em] opacity-70">Cliente</span>
      <span className="text-[11px] font-black leading-tight">{ticket['CLIENTE'] || 'SIN DATO EN CLIENTE'}</span>
    </div>
  )
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
  rutasTecnicos, setRutasTecnicos, rutasAutomaticas, valorRutaTecnico, baseMunicipios,
  clientesGarantia = [], estadoCatalogoGarantias, controlAlertas, solicitudAlerta, historialSeries, importacionParticulares
}) {
  const [dragging, setDragging] = useState(false)
  const [expandido, setExpandido] = useState({})
  const [filtroTecnico, setFiltroTecnico] = useState('Todos')
  const [filtroEstadoGlobal, setFiltroEstadoGlobal] = useState('Todos')
  const [garantiaAbierta, setGarantiaAbierta] = useState(false)
  const [duplicadosAbierta, setDuplicadosAbierta] = useState(false)
  const [toast, setToast] = useState('')
  const [exportando, setExportando] = useState('')
  const fileRef = useRef()
  const leyendoExcel = useRef(false)
  const [procesandoExcel, setProcesandoExcel] = useState(false)
  const ultimaAlertaEnfocada = useRef(null)

  useEffect(() => {
    if (!solicitudAlerta || solicitudAlerta.tipo === 'reincidencias') return
    if (solicitudAlerta.tipo === 'duplicados') setDuplicadosAbierta(true)
    else setGarantiaAbierta(true)
  }, [solicitudAlerta])

  useEffect(() => {
    if (!solicitudAlerta || solicitudAlerta.tipo === 'reincidencias' || ultimaAlertaEnfocada.current === solicitudAlerta.secuencia) return
    const abierta = solicitudAlerta.tipo === 'duplicados' ? duplicadosAbierta : garantiaAbierta
    if (!abierta) return
    const frame = requestAnimationFrame(() => {
      const destino = document.getElementById(`alertas-${solicitudAlerta.tipo}`)
      if (!destino) return
      destino.focus({ preventScroll: true })
      destino.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      ultimaAlertaEnfocada.current = solicitudAlerta.secuencia
    })
    return () => cancelAnimationFrame(frame)
  }, [solicitudAlerta, garantiaAbierta, duplicadosAbierta])

  async function copiarTicket(ticket) {
    try {
      await navigator.clipboard.writeText(buildTicketMessage(ticket))
      setToast('Datos del ticket copiados')
      setTimeout(() => setToast(''), 2200)
    } catch {
      setToast('No se pudo copiar el ticket')
      setTimeout(() => setToast(''), 2200)
    }
  }

  function procesarExcel(file) {
    if (!file) return
    if (leyendoExcel.current || importacionParticulares?.estado === 'importando') {
      alert('Espera a que termine la carga actual antes de subir otro Excel.')
      return
    }
    leyendoExcel.current = true
    setProcesandoExcel(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        // Nuestro informe abre en Resumen, pero al volver a cargarlo la fuente
        // es Base completa, nunca las vistas de garantías o duplicados.
        const hojaBase = wb.SheetNames.find(nombre => normalizarTexto(nombre) === 'BASE COMPLETA') || wb.SheetNames[0]
        const ws = wb.Sheets[hojaBase]
        const rawMatrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        
        let headerRowIndex = -1, headerKeys = []
        for (let i = 0; i < rawMatrix.length; i++) {
          const upperRow = rawMatrix[i].map(cell => normalizarTexto(cell))
          if (upperRow.includes('ESTADO')) { headerRowIndex = i; headerKeys = upperRow; break }
        }
        if (headerRowIndex === -1) { alert("⚠️ No encontré columna 'ESTADO'."); return }

        const listaTemporal = []
        const filasParticulares = []
        for (let i = headerRowIndex + 1; i < rawMatrix.length; i++) {
          const row = rawMatrix[i]
          const fila = {}
          headerKeys.forEach((key, index) => { if (key) fila[key] = row[index] })
          // Particulares se revisa antes de filtrar estados. También se crean
          // fichas de órdenes finalizadas: su pago y documentos son manuales.
          if (normalizarTexto(fila.CLIENTE) === 'PARTICULAR') filasParticulares.push(fila)
          let estadoOriginal = String(fila['ESTADO'] || '').trim()
          let estadoLimpio = normalizarTexto(estadoOriginal)
          const esAsignadoTecnico = estadoLimpio.includes('ASIGNAD') && estadoLimpio.includes('TECNICO')
          const esEnProceso = estadoLimpio.includes('PROCESO')
          const esAsignadoAgencia = estadoLimpio.includes('ASIGNAD') && estadoLimpio.includes('AGENCIA')
          const esFinalizada = estadoLimpio.includes('FINALIZADA')

          if (esAsignadoTecnico || esEnProceso || esAsignadoAgencia || esFinalizada) {
            let tecnico = String(fila['TÉCNICO'] || fila['TECNICO'] || fila['TÉCNICOS'] || fila['TECNICOS'] || '').trim()
            if (!tecnico || tecnico === '') tecnico = 'SIN TÉCNICO'
            let clienteOriginal = String(fila['CLIENTE'] || '-').trim()
            let fechaRaw = fila['FECHA REALIZADA'] || fila['FECHA REALIZACION'] || fila['FECHA'] || ''
            const fechaEstructura = normalizarFechaExcel(fechaRaw)
            const descripcion = fila['DESCRIPCIÓN'] || fila['DESCRIPCION'] || fila['COMENTARIO'] || '-'
            const descripcionInicial = fila['DESCRIPCIÓN INICIAL'] || fila['DESCRIPCION INICIAL'] || '-'
            const serieEnDescripcion = ['DESCRIPCION', 'DESCRIPCION INICIAL'].includes(normalizarTexto(fila['ORIGEN DE SERIE']))
            const serie = resolverSerie(serieEnDescripcion ? '' : fila['SERIE'] || fila['NO SERIE'], descripcionInicial)
            
            listaTemporal.push({
              tecnico,
              // La referencia vacía se conserva vacía. Usar "-" aquí hacía que
              // todas las celdas sin dato aparecieran como un falso duplicado.
              'N° REFERENCIA': limpiarReferencia(fila['N° REFERENCIA'] ?? fila['NO REFERENCIA'] ?? fila['REFERENCIA'] ?? fila['TICKET']),
              'NEGOCIO': fila['NEGOCIO'] || fila['NOMBRE NEGOCIO'] || fila['SUCURSAL'] || '-',
              'DIRECCIÓN': fila['DIRECCIÓN'] || fila['DIRECCION'] || '-',
              'TELÉFONO': fila['TELÉFONO'] || fila['TELEFONO'] || fila['TEL'] || '-',
              // Se conserva exactamente el dato del encabezado CLIENTE para que
              // la alerta identifique al cliente real sin abreviarlo ni inferirlo.
              'CLIENTE': clienteOriginal || '-',
              'TIPO': fila['TIPO'] || '-',
              'SERIE': serie.valor,
              'SERIE_ORIGEN': serie.origen,
              'MODELO': fila['MODELO'] || '-',
              'ESTADO': estadoOriginal,
              'ESTADO_LIMPIO': estadoLimpio,
              'TIEMPO_TRANSCURRIDO': fila['TIEMPO TRANSCURRIDO'] || fila['TIEMPO'] || '0',
              'FECHA_TEXTO': fechaEstructura ? fechaEstructura.display : (fechaRaw || '-'),
              'FECHA_OBJ': fechaEstructura ? fechaEstructura.dateObj : null,
              'DESCRIPCIÓN INICIAL': descripcionInicial,
              'DESCRIPCIÓN': descripcion,
              'GEOLOCALIZACIÓN': fila['GEOLOCALIZACION'] || fila['GEOLOCALIZACIÓN'] || fila['GEOLOCALIZACIÓ'] || fila['GEO'] || '-'
            })
          }
        }

        if (listaTemporal.length === 0) {
          if (!filasParticulares.length) alert("⚠️ No detecté tickets con estados válidos.")
        } else {
          setNombreArchivo(file.name)
          setAllTickets(listaTemporal)
          setFiltroTecnico('Todos')
          // Recalcular rutas al subir Excel nuevo
          const ticketsActivosParaRuta = listaTemporal.filter(esEstadoActivoRuta)
          const nuevasRutas = {}
          const ticketsPorTecnico = {}
          ticketsActivosParaRuta.forEach(t => {
            if(!ticketsPorTecnico[t.tecnico]) ticketsPorTecnico[t.tecnico] = []
            ticketsPorTecnico[t.tecnico].push(t)
          })
          Object.keys(ticketsPorTecnico).forEach(tec => {
            let encontrados = new Set()
            ticketsPorTecnico[tec].forEach(t => {
              const textoBuscar = normalizarTexto(t['DIRECCIÓN'])
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
        await importacionParticulares?.importar(filasParticulares, file.name)
      } catch {
        alert('No se pudo leer el Excel. Comprueba el archivo y vuelve a intentar.')
      } finally {
        leyendoExcel.current = false
        setProcesandoExcel(false)
      }
    }
    reader.onerror = () => {
      leyendoExcel.current = false
      setProcesandoExcel(false)
      alert('No se pudo abrir el archivo. Vuelve a seleccionarlo.')
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
    e.target.value = ''
  }
  function onDrop(e) { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) procesarExcel(e.dataTransfer.files[0]) }

  function comprobarCatalogoExportacion() {
    if (estadoCatalogoGarantias !== 'listo' || !clientesGarantia.length) {
      alert('El catálogo de garantías no está disponible o está vacío. Recarga la página y comprueba Garantias.xlsx antes de exportar el informe.')
      return false
    }
    return true
  }

  async function descargarExcelCompleto() {
    if (!allTickets.length || exportando || !comprobarCatalogoExportacion()) return
    setExportando('excel')
    try {
      const informe = prepararInformeTecnicos({ tickets: allTickets, control: controlAlertas, nombreArchivo, fechaSubidaExcel, estadoHistorial: historialSeries.estado })
      const libro = await crearLibroTecnicos(informe)
      const buffer = await libro.xlsx.writeBuffer()
      descargarArchivo(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Control_Tecnicos_${fechaArchivo(informe.generado)}.xlsx`)
      setToast('Excel organizado descargado: 8 pestañas')
      setTimeout(() => setToast(''), 4500)
    } catch (error) {
      console.error('Error al exportar el informe:', error)
      alert('No se pudo generar el Excel organizado. Intenta nuevamente.')
    } finally { setExportando('') }
  }

  function descargarPDFGarantias() {
    if (exportando || !comprobarCatalogoExportacion()) return
    try {
      const generado = new Date()
      crearPDFGarantias(controlAlertas.garantias, { nombreArchivo, generado }).save(`Garantias_${fechaArchivo(generado)}.pdf`)
    } catch (error) { alert(error.message || 'No se pudo generar el PDF de garantías.') }
  }

  function generarExcelTecnico(tecnico, tickets) {
    const data = tickets.map(t => ({
      'N° REFERENCIA': t['N° REFERENCIA'], 'NEGOCIO': t['NEGOCIO'], 'DIRECCIÓN': t['DIRECCIÓN'],
      'TELÉFONO': t['TELÉFONO'], 'CLIENTE': t['CLIENTE'], 'TIPO': t['TIPO'], 'SERIE': obtenerSerieTicket(t), 'MODELO': t['MODELO'],
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

      let info = `Negocio: ${t['NEGOCIO'] || '-'}\nDirección: ${t['DIRECCIÓN'] || '-'}\nTeléfono: ${t['TELÉFONO'] || '-'}\nCliente: ${t['CLIENTE'] || '-'}\nSerie: ${obtenerSerieTicket(t)} | Modelo: ${t['MODELO'] || '-'}`
      
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
        doc.text(`TicketManager — ${tecnico}`, 14, doc.internal.pageSize.height - 8)
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

  const {
    garantias: alertasGarantia, tipoIncorrecto: alertasTipoIncorrecto,
    vencidas: alertasVencidas, vigentes: alertasVigentes,
    sinSerie: alertasSinSerie, duplicados: ticketsDuplicados,
  } = controlAlertas
  const reincidenciasPorTicket = new Map(controlAlertas.reincidencias.map(alerta => [
    claveAtencion({ serie: alerta.serie, referencia: normalizarTexto(alerta.ticket['N° REFERENCIA']) }), alerta,
  ]))

  return (
    <div className="space-y-5 fade-in">
      {toast && (
        <div className="fixed left-1/2 top-16 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-[11px] font-bold text-white shadow-2xl toast-enter">
          <Check size={13} className="text-emerald-400" /> {toast}
        </div>
      )}
      <section className="workspace-hero">
        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky-300">
              <Activity size={13} /> Operación en campo
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Control por técnico</h1>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-300 sm:text-sm">Carga la base, distribuye las órdenes y revisa rutas, garantías y posibles duplicados desde un único tablero.</p>
          </div>
          {allTickets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={generarPDFGlobalEnProceso} className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-[10px] font-extrabold text-white transition hover:bg-white/15">
                <FileText size={13} /> En proceso
              </button>
              <button type="button" onClick={descargarPDFGarantias} disabled={Boolean(exportando) || estadoCatalogoGarantias === 'cargando'} title="Descargar garantías pendientes con diagnóstico de series y TIPO Normal" className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-[10px] font-extrabold text-white transition hover:bg-white/15 disabled:opacity-50">
                <ShieldAlert size={13} /> PDF Garantías
              </button>
              <button onClick={descargarExcelCompleto} disabled={Boolean(exportando) || estadoCatalogoGarantias === 'cargando'} title="Resumen, garantías, pendientes, en proceso, finalizados, duplicados, reincidencias y base completa" className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-[10px] font-extrabold text-slate-900 shadow-lg transition hover:bg-sky-50 disabled:opacity-50">
                <DownloadCloud size={13} /> {exportando === 'excel' ? 'Generando Excel…' : 'Excel organizado'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Upload zone ── */}
      <div
        className={`upload-zone card group flex cursor-pointer items-center gap-4 border-2 border-dashed px-4 py-4 transition-all ${dragging ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-sky-300 hover:bg-sky-50/40'}`}
        onClick={() => fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100 transition group-hover:bg-sky-100">
          <Upload size={18} />
        </div>
        <div className="flex-1 min-w-0 text-xs">
          {nombreArchivo ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-slate-800 truncate max-w-[300px]">{nombreArchivo}</span>
              {fechaSubidaExcel && <span className="text-slate-400 font-medium text-[10px]">· {fechaSubidaExcel}</span>}
            </div>
          ) : (
            <div>
              <p className="font-extrabold text-slate-700">Cargar base de tickets</p>
              <p className="mt-0.5 text-[10px] font-medium text-slate-400">Arrastra el archivo aquí o haz clic para seleccionarlo</p>
            </div>
          )}
        </div>
        {allTickets.length > 0 && (
          <button disabled={Boolean(exportando) || estadoCatalogoGarantias === 'cargando'} onClick={(e) => { e.stopPropagation(); descargarExcelCompleto() }} className="btn-success hidden items-center gap-1.5 shrink-0 text-[10px] sm:flex disabled:opacity-50">
            <DownloadCloud size={12} /> {exportando === 'excel' ? 'Generando…' : 'Excel organizado'}
          </button>
        )}
        <input ref={fileRef} type="file" className="hidden" onChange={onFileChange} disabled={procesandoExcel || importacionParticulares?.estado === 'importando'} />
      </div>

      {procesandoExcel && importacionParticulares?.estado !== 'importando' && <p className="text-sm text-slate-600" role="status">Leyendo el archivo…</p>}
      <EstadoParticulares importacion={importacionParticulares} />

      {allTickets.length === 0 && <HistorialSeries datos={historialSeries} reincidencias={controlAlertas.reincidencias} solicitudAlerta={solicitudAlerta} />}
      {allTickets.length > 0 && (
        <>
          {/* ── Stats strip + Filtros ── */}
          <div className="card overflow-hidden">
            {/* Stats strip */}
            <div className="grid grid-cols-2 border-b border-slate-100 sm:grid-cols-4">
              <div className="px-4 py-3.5 border-r border-b sm:border-b-0 border-slate-100">
                <p className="text-2xl font-black text-slate-900 leading-none">{ticketsPendientesTotales.length}</p>
                <p className="text-[9px] font-extrabold text-slate-400 uppercase mt-1 tracking-wider">Pendientes</p>
              </div>
              <button className="px-4 py-3.5 text-left border-b sm:border-b-0 border-r border-slate-100 cursor-pointer hover:bg-amber-50 transition-colors" onClick={() => setFiltroEstadoGlobal('En Proceso')}>
                <p className="text-2xl font-black text-amber-600 leading-none">{ticketsPendientesTotales.filter(t => t.ESTADO_LIMPIO.includes('PROCESO')).length}</p>
                <p className="text-[9px] font-extrabold text-slate-400 uppercase mt-1 tracking-wider">En proceso</p>
              </button>
              <div className="px-4 py-3.5 border-r border-slate-100">
                <p className="text-2xl font-black text-sky-600 leading-none">{tecnicosConPendientes.length}</p>
                <p className="text-[9px] font-extrabold text-slate-400 uppercase mt-1 tracking-wider">Técnicos</p>
              </div>
              <div className="px-4 py-3.5">
                <p className="text-2xl font-black text-emerald-600 leading-none">{allTickets.filter(t => t.ESTADO_LIMPIO.includes('FINALIZADA')).length}</p>
                <p className="text-[9px] font-extrabold text-slate-400 uppercase mt-1 tracking-wider">Finalizados</p>
              </div>
            </div>

            {/* Filtros */}
            <div className="p-4 space-y-3.5">
              <div>
                <label className="section-title mb-2 block">Técnico</label>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setFiltroTecnico('Todos')} className={`pill ${filtroTecnico === 'Todos' ? 'pill-active' : 'pill-inactive'}`}>Todos</button>
                  {tecnicosConPendientes.map(t => (
                    <button key={t} onClick={() => setFiltroTecnico(t)} className={`pill ${filtroTecnico === t ? 'pill-active' : 'pill-inactive'}`}>{t}</button>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="section-title mr-1">Estado</span>
                  {['Todos', 'Asignada a Técnico', 'En Proceso', 'Asignada a Agencia'].map(est => (
                    <button key={est} onClick={() => setFiltroEstadoGlobal(est)} className={`pill ${filtroEstadoGlobal === est ? 'pill-active' : 'pill-inactive'}`}>{est}</button>
                  ))}
                </div>
                <button onClick={generarPDFGlobalEnProceso} className="btn-danger flex items-center gap-1 text-[10px] shrink-0 sm:hidden">
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
                aria-expanded={garantiaAbierta}
                className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert size={13} className="text-rose-500" />
                  <span className="font-bold text-slate-600 text-[10px] uppercase tracking-wider">Alertas de Garantía</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {alertasVencidas.length > 0 && <span className="text-[9px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">{alertasVencidas.length} vencida{alertasVencidas.length !== 1 ? 's' : ''}</span>}
                  {alertasTipoIncorrecto.length > 0 && <span className="text-[9px] font-bold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">{alertasTipoIncorrecto.length} Normal por revisar</span>}
                  {alertasSinSerie.length > 0 && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{alertasSinSerie.length} sin serie</span>}
                  {alertasVigentes.length > 0 && <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{alertasVigentes.length} vigente{alertasVigentes.length !== 1 ? 's' : ''}</span>}
                  <ChevronDown size={13} className={`text-slate-400 transition-transform ${garantiaAbierta ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {garantiaAbierta && (
                <div className="slide-up">
                  {alertasVencidas.length > 0 && (
                    <div id="alertas-vencidas" tabIndex={-1} className="alert-anchor p-3 space-y-2.5 border-t border-slate-200">
                      <p className="text-[10px] font-bold text-rose-600 uppercase flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                        Garantía vencida — No atender bajo garantía
                      </p>
                      {alertasVencidas.map((a, i) => (
                        <div key={i} className="alert-card bg-rose-50 border border-rose-200 border-l-[4px] border-l-rose-500 rounded-lg px-3 py-2.5 space-y-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">#{a.ticket['N° REFERENCIA']}</span>
                            {a.garantia.tipoIncorrecto && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-800">TIPO NORMAL · NO ATENDER SIN GARANTÍA</span>}
                            <span className="text-[10px] font-semibold text-slate-500">{a.ticket.tecnico}</span>
                            <span className="text-[9px] font-semibold text-rose-600 ml-auto shrink-0">Fab: {a.garantia.fabDisplay} · Venció: {a.garantia.vencDisplay} · {a.garantia.aniosGarantia}a</span>
                          </div>
                          <p className="text-[11px] font-bold text-slate-800">{a.ticket['NEGOCIO'] || '-'}</p>
                          <WarrantyClient ticket={a.ticket} tone="rose" />
                          {a.ticket['DESCRIPCIÓN INICIAL'] && <p className="text-[9px] text-slate-500 italic leading-snug">📋 {a.ticket['DESCRIPCIÓN INICIAL']}</p>}
                          <div className="flex flex-col sm:flex-row sm:gap-4 text-[9px] font-medium text-slate-500">
                            <p>📍 {a.ticket['DIRECCIÓN'] || '-'}</p>
                            <p className="shrink-0">🧊 Serie: <span className="font-bold text-slate-700">{obtenerSerieTicket(a.ticket)}</span></p>
                          </div>
                          <TicketActions ticket={a.ticket} onCopy={copiarTicket} compact />
                        </div>
                      ))}
                    </div>
                  )}
                  {alertasTipoIncorrecto.length > 0 && (
                    <div id="alertas-tipo-incorrecto" tabIndex={-1} className="alert-anchor space-y-2.5 border-t border-slate-200 p-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-violet-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-500"></span>
                        TIPO Normal — Revisar cobertura antes de atender
                      </p>
                      {alertasTipoIncorrecto.map((a, i) => (
                        <div key={i} className="alert-card space-y-2 rounded-lg border border-violet-300 border-l-[4px] border-l-violet-600 bg-violet-50 px-3 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-violet-800">#{a.ticket['N° REFERENCIA'] || '-'}</span>
                            <span className="text-[10px] font-semibold text-slate-500">{a.ticket.tecnico}</span>
                            <span className="ml-auto rounded-md border border-violet-300 bg-white px-2 py-1 text-[9px] font-black text-violet-800">
                              TIPO: {a.garantia.tipoActual} · REVISAR
                            </span>
                          </div>
                          <p className="text-[11px] font-bold text-slate-800">{a.ticket['NEGOCIO'] || '-'}</p>
                          <WarrantyClient ticket={a.ticket} tone="violet" />
                          <p className="text-[10px] font-semibold leading-relaxed text-violet-800">
                            Este cliente sólo puede atenderse con garantía. El sistema de origen generó TIPO "Normal": revisar el motivo antes de atender; no basta con cambiar el tipo.
                          </p>
                          <p className="text-[10px] font-semibold text-violet-800">
                            {a.garantia.sinDatosSerie
                              ? 'No se pudo verificar el plazo con SERIE ni con DESCRIPCIÓN INICIAL.'
                              : `La serie está dentro del plazo calculado (hasta ${a.garantia.vencDisplay}), pero esto no elimina la alerta Normal ni confirma la cobertura.`}
                          </p>
                          <p className="text-[9px] font-medium text-slate-500">Serie: {obtenerSerieTicket(a.ticket)}</p>
                          <p className="text-[9px] font-medium text-slate-500">📍 {a.ticket['DIRECCIÓN'] || '-'}</p>
                          <TicketActions ticket={a.ticket} onCopy={copiarTicket} compact />
                        </div>
                      ))}
                    </div>
                  )}
                  {alertasSinSerie.length > 0 && (
                    <div id="alertas-sin-serie" tabIndex={-1} className={`alert-anchor p-3 space-y-2.5 ${(alertasTipoIncorrecto.length || alertasVencidas.length) ? 'border-t border-slate-300' : ''}`}>
                      <p className="text-[10px] font-bold text-amber-600 uppercase flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        Verificar serie manualmente
                      </p>
                      {alertasSinSerie.map((a, i) => (
                        <div key={i} className="alert-card bg-amber-50 border border-amber-200 border-l-[4px] border-l-amber-500 rounded-lg px-3 py-2.5 space-y-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">#{a.ticket['N° REFERENCIA']}</span>
                            <span className="text-[10px] font-semibold text-slate-500">{a.ticket.tecnico}</span>
                            <span className="text-[9px] font-semibold text-amber-600 ml-auto shrink-0">Serie: "{obtenerSerieTicket(a.ticket)}" · {a.garantia.aniosGarantia}a</span>
                          </div>
                          <p className="text-[11px] font-bold text-slate-800">{a.ticket['NEGOCIO'] || '-'}</p>
                          <WarrantyClient ticket={a.ticket} tone="amber" />
                          {a.ticket['DESCRIPCIÓN INICIAL'] && <p className="text-[9px] text-slate-500 italic leading-snug">📋 {a.ticket['DESCRIPCIÓN INICIAL']}</p>}
                          <p className="text-[9px] font-medium text-slate-500">📍 {a.ticket['DIRECCIÓN'] || '-'}</p>
                          <TicketActions ticket={a.ticket} onCopy={copiarTicket} compact />
                        </div>
                      ))}
                    </div>
                  )}
                  {alertasVigentes.length > 0 && (
                    <div className={`p-3 space-y-2.5 ${(alertasTipoIncorrecto.length || alertasVencidas.length || alertasSinSerie.length) ? 'border-t border-slate-300' : ''}`}>
                      <p className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Garantía vigente
                      </p>
                      {alertasVigentes.map((a, i) => (
                        <div key={i} className="alert-card bg-emerald-50 border border-emerald-200 border-l-[4px] border-l-emerald-500 rounded-lg px-3 py-2.5 space-y-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">#{a.ticket['N° REFERENCIA']}</span>
                            <span className="text-[10px] font-semibold text-slate-500">{a.ticket.tecnico}</span>
                            <span className="text-[9px] font-semibold text-emerald-600 ml-auto shrink-0">{a.garantia.diasRestantes}d restantes · {a.garantia.aniosGarantia}a</span>
                          </div>
                          <p className="text-[11px] font-bold text-slate-800">{a.ticket['NEGOCIO'] || '-'}</p>
                          <WarrantyClient ticket={a.ticket} tone="emerald" />
                          {a.ticket['DESCRIPCIÓN INICIAL'] && <p className="text-[9px] text-slate-500 italic leading-snug">📋 {a.ticket['DESCRIPCIÓN INICIAL']}</p>}
                          <div className="flex flex-col sm:flex-row sm:gap-4 text-[9px] font-medium text-slate-500">
                            <p>📍 {a.ticket['DIRECCIÓN'] || '-'}</p>
                            <p className="shrink-0">🧊 Serie: <span className="font-bold text-slate-700">{obtenerSerieTicket(a.ticket)}</span></p>
                          </div>
                          <TicketActions ticket={a.ticket} onCopy={copiarTicket} compact />
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
            <div id="alertas-duplicados" tabIndex={-1} className="alert-anchor card-section">
              <button
                onClick={() => setDuplicadosAbierta(!duplicadosAbierta)}
                aria-expanded={duplicadosAbierta}
                className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
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
                    <div key={i} className="alert-card bg-orange-50 border border-orange-200 border-l-[4px] border-l-orange-500 rounded-lg overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-orange-100/50 border-b border-orange-200">
                        <span className="font-mono text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded border border-orange-200">#{dup.ref}</span>
                        <span className="text-[9px] font-bold text-orange-600">{dup.cantidad}x duplicado</span>
                      </div>
                      <div className="px-3 py-2 space-y-1.5">
                        {dup.tickets.map((t, j) => (
                          <div key={j} className="flex items-center gap-2 flex-wrap text-[10px]">
                            <span className="font-semibold text-slate-700">{t['NEGOCIO'] || '-'}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500">{t['CLIENTE'] || '-'}</span>
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

          <HistorialSeries datos={historialSeries} reincidencias={controlAlertas.reincidencias} solicitudAlerta={solicitudAlerta} />
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
                <div key={tecnico} className="card-section fade-in transition hover:border-sky-200">
                  {/* Header del técnico */}
                  <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-sky-50/40 px-4 py-3.5">
                    <div className="technician-heading flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm"><Users size={15} /></span>
                        <div>
                          <p className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">{tecnico}</p>
                          <span className="text-[10px] font-semibold text-slate-400">{tickets.length} orden{tickets.length !== 1 ? 'es' : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => {navigator.clipboard.writeText(buildMessage(tecnico, tickets, rutaActual)); alert('Copiado')}} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-sky-200 hover:text-sky-600 transition" title="Copiar WhatsApp"><Copy size={12} /></button>
                        <button onClick={() => generarPDFIndividual(tecnico, tickets, rutaActual)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-sky-200 hover:text-sky-600 transition" title="Descargar PDF"><FileText size={12} /></button>
                        <button onClick={() => generarExcelTecnico(tecnico, tickets)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-emerald-200 hover:text-emerald-600 transition" title="Descargar Excel"><FileSpreadsheet size={12} /></button>
                        <button onClick={() => setExpandido(p => ({ ...p, [tecnico]: !p[tecnico] }))} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition ml-1" title={expandido[tecnico] ? 'Contraer' : 'Ver tickets'}>
                          <ChevronDown size={14} className={`transition-transform ${expandido[tecnico] ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>
                    {rutaActual && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <MapPin size={10} className="text-sky-500 shrink-0" />
                        <span className="text-[10px] font-bold text-sky-700 uppercase">{rutaActual}</span>
                      </div>
                    )}
                  </div>

                  {/* Tickets expandidos */}
                  {expandido[tecnico] && (
                    <div className="p-3 sm:p-4 space-y-4 slide-up bg-slate-50/60">
                      {tickets.map((t, i) => {
                        const g = verificarGarantiaTicket(t, clientesGarantia)
                        const reincidencia = reincidenciasPorTicket.get(claveAtencion({ serie: normalizarSerieHistorial(obtenerSerieTicket(t)), referencia: normalizarTexto(t['N° REFERENCIA']) }))
                        const esProceso = t['ESTADO_LIMPIO'].includes('PROCESO')
                        const esAgencia = t['ESTADO_LIMPIO'].includes('AGENCIA')
                        const borderColor = g?.vencida ? 'border-l-rose-500'
                          : g?.tipoIncorrecto ? 'border-l-violet-500'
                          : esProceso ? 'border-l-amber-400' 
                          : esAgencia ? 'border-l-violet-400' 
                          : 'border-l-sky-400'
                        const headerBg = g?.vencida ? 'bg-rose-50'
                          : g?.tipoIncorrecto ? 'bg-violet-50'
                          : esProceso ? 'bg-amber-50/60' 
                          : esAgencia ? 'bg-violet-50/60' 
                          : 'bg-slate-50'
                        return (
                          <div key={i} className={`alert-card rounded-lg border-[1.5px] border-slate-300 border-l-[4px] ${borderColor} overflow-hidden bg-white shadow-[0_1px_4px_rgba(0,0,0,0.07)]`}>
                            {/* Badge row */}
                            <div className={`flex items-center gap-1.5 flex-wrap px-3 py-2.5 ${headerBg} border-b border-slate-100`}>
                              <span className="font-mono text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100">#{t['N° REFERENCIA']}</span>
                              <TicketBadge estado={t['ESTADO']} />
                              {reincidencia && <span className="rounded-md bg-sky-700 px-2 py-0.5 text-[9px] font-bold text-white">POSIBLE REINCIDENCIA · {reincidencia.anteriores.length} antecedente{reincidencia.anteriores.length > 1 ? 's' : ''}</span>}
                              {g?.tipoIncorrecto && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-violet-600 text-white flex items-center gap-0.5"><ShieldAlert size={9} /> TIPO NORMAL</span>}
                              {g?.vencida && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-rose-600 text-white flex items-center gap-0.5"><ShieldAlert size={9} /> VENCIDA</span>}
                              {g && !g.tipoIncorrecto && !g.vencida && !g.sinDatosSerie && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-600 text-white flex items-center gap-0.5"><ShieldCheck size={9} /> VIGENTE</span>}
                              {g?.sinDatosSerie && !g.tipoIncorrecto && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500 text-white flex items-center gap-0.5"><ShieldAlert size={9} /> VERIFICAR</span>}
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
                              <div className="record-fields text-[11px]">
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
                                  <span className="text-slate-700 font-mono font-semibold text-[10px]">{obtenerSerieTicket(t)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Garantía inline */}
                            {g?.tipoIncorrecto && (
                              <div className="mx-3 mb-2 rounded-md border-l-[3px] border-violet-500 bg-violet-100 px-3 py-1.5 text-[10px] text-violet-800">
                                <span className="font-bold">⚠️ TIPO INCORRECTO — </span>
                                El sistema de origen marcó TIPO "{g.tipoActual}". Este cliente no puede atenderse sin garantía: revisar el motivo, aunque la serie esté dentro del plazo.
                              </div>
                            )}
                            {g?.vencida && (
                              <div className="mx-3 mb-2 text-[10px] text-rose-700 bg-rose-100 rounded-md px-3 py-1.5 border-l-[3px] border-rose-500">
                                <span className="font-bold">⚠️ NO ATENDER — </span>
                                Fab: {g.fabDisplay} · Venció: {g.vencDisplay} · {g.aniosGarantia}a ({g.clienteNombre})
                              </div>
                            )}
                            {g && !g.tipoIncorrecto && !g.vencida && !g.sinDatosSerie && (
                              <div className="mx-3 mb-2 text-[10px] text-emerald-700 bg-emerald-50 rounded-md px-3 py-1.5 border-l-[3px] border-emerald-400">
                                <span className="font-bold">✅ VIGENTE — </span>
                                Fab: {g.fabDisplay} · Vence: {g.vencDisplay} · {g.diasRestantes}d ({g.clienteNombre})
                              </div>
                            )}
                            {g?.sinDatosSerie && !g.tipoIncorrecto && (
                              <div className="mx-3 mb-2 text-[10px] text-amber-700 bg-amber-50 rounded-md px-3 py-1.5 border-l-[3px] border-amber-400">
                                <span className="font-bold">⚠️ VERIFICAR — </span>
                                {g.clienteNombre} ({g.aniosGarantia}a) — Serie: "{obtenerSerieTicket(t)}"
                              </div>
                            )}
                            
                            {t['ESTADO_LIMPIO'].includes('PROCESO') && (
                              <div className="mx-3 mb-3 text-[10px] text-rose-700 bg-rose-50 rounded-md px-3 py-1.5 border-l-[3px] border-rose-400">
                                <span className="font-bold block mb-0.5 uppercase text-[9px]">Comentario en Proceso</span>
                                <span className="font-semibold">{obtenerComentarioProceso(t)}</span>
                              </div>
                            )}
                            <TicketActions ticket={t} onCopy={copiarTicket} />
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
