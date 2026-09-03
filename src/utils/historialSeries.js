import { normalizarTextoGarantia, obtenerSerieTicket } from './garantias.js'

export function normalizarSerieHistorial(valor) {
  const serie = normalizarTextoGarantia(valor).replace(/[\s-]+/g, '')
  // Conserva los ceros iniciales. No usa teléfonos ni otros campos para
  // completar la serie: la recuperación de DESCRIPCIÓN ya tiene sus reglas.
  if (!/^[A-Z0-9]{7,40}$/.test(serie) || !/\d/.test(serie) || /^(\d)\1+$/.test(serie)) return ''
  return serie
}

const referenciaTicket = ticket => normalizarTextoGarantia(ticket['N° REFERENCIA'])
export const claveAtencion = registro => JSON.stringify([registro.serie, registro.referencia])
export const esTicketFinalizado = ticket => normalizarTextoGarantia(ticket.ESTADO_LIMPIO || ticket.ESTADO).includes('FINALIZADA')

function fechaCierreTicket(ticket) {
  const partes = String(ticket.FECHA_TEXTO || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (partes) {
    const [, dia, mes, anio] = partes.map(Number)
    const fecha = new Date(anio, mes - 1, dia)
    if (fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia) {
      return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    }
    return null
  }
  if (!ticket.FECHA_OBJ) return null
  const fecha = new Date(ticket.FECHA_OBJ)
  return Number.isNaN(fecha.getTime()) ? null : `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

export function extraerAtencionesFinalizadas(tickets = []) {
  const registros = new Map()
  for (const ticket of tickets) {
    if (!esTicketFinalizado(ticket)) continue
    const serie = normalizarSerieHistorial(obtenerSerieTicket(ticket))
    const referencia = referenciaTicket(ticket)
    if (!serie || !referencia || referencia === '-') continue
    const registro = {
      serie, referencia,
      cliente: String(ticket.CLIENTE || ''),
      negocio: String(ticket.NEGOCIO || ''),
      tecnico: String(ticket.tecnico || ''),
      fecha_cierre: fechaCierreTicket(ticket),
    }
    const clave = claveAtencion(registro)
    if (!registros.has(clave)) registros.set(clave, registro)
  }
  return [...registros.values()]
}

export function combinarHistorial(guardado = [], observado = []) {
  const registros = new Map()
  // La atención guardada representa la primera constancia del cierre.
  // Volver a importar ese mismo ticket no crea otra reparación.
  for (const registro of [...guardado, ...observado]) {
    const clave = claveAtencion(registro)
    if (!registros.has(clave)) registros.set(clave, registro)
  }
  return [...registros.values()].sort((a, b) => (b.fecha_cierre || '').localeCompare(a.fecha_cierre || '') || a.serie.localeCompare(b.serie) || a.referencia.localeCompare(b.referencia))
}

export function detectarReincidencias(tickets = [], historial = [], hoy = new Date()) {
  const limite = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const porSerie = new Map()
  for (const registro of combinarHistorial(historial)) {
    if (registro.fecha_cierre && registro.fecha_cierre > limite) continue
    if (!porSerie.has(registro.serie)) porSerie.set(registro.serie, [])
    porSerie.get(registro.serie).push(registro)
  }
  const incidencias = new Map()
  for (const ticket of tickets) {
    if (esTicketFinalizado(ticket)) continue
    const serie = normalizarSerieHistorial(obtenerSerieTicket(ticket))
    const referencia = referenciaTicket(ticket)
    if (!serie || !referencia || referencia === '-') continue
    const anteriores = (porSerie.get(serie) || []).filter(registro => registro.referencia !== referencia)
    if (!anteriores.length) continue
    const clave = claveAtencion({ serie, referencia })
    if (!incidencias.has(clave)) incidencias.set(clave, { ticket, serie, anteriores })
  }
  return [...incidencias.values()]
}
