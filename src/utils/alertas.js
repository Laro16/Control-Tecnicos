import { normalizarTextoGarantia, verificarGarantiaTicket } from './garantias.js'
import { detectarReincidencias } from './historialSeries.js'

export function obtenerTicketsDuplicados(tickets = []) {
  const referencias = new Map()
  tickets.forEach(ticket => {
    const ref = String(ticket['N° REFERENCIA'] ?? '').trim()
    if (!ref || ref === '-') return
    const clave = normalizarTextoGarantia(ref)
    if (!referencias.has(clave)) referencias.set(clave, { ref, tickets: [] })
    referencias.get(clave).tickets.push(ticket)
  })
  return Array.from(referencias.values())
    .filter(grupo => grupo.tickets.length > 1)
    .map(grupo => ({ ...grupo, cantidad: grupo.tickets.length }))
    .sort((a, b) => b.cantidad - a.cantidad)
}

// Una sola fuente para la campana y el panel de Técnicos: los contadores
// mantienen los mismos estados, clientes y reglas de duplicados.
export function obtenerControlAlertas(tickets = [], clientesGarantia = [], historialSeries = [], vencimientos = {}) {
  const garantias = tickets
    .filter(ticket => !normalizarTextoGarantia(ticket.ESTADO_LIMPIO || ticket.ESTADO).includes('FINALIZADA'))
    .map(ticket => ({ ticket, garantia: verificarGarantiaTicket(ticket, clientesGarantia, vencimientos) }))
    .filter(alerta => alerta.garantia)

  // Una alerta por ticket: Normal con plazo vencido aparece primero entre
  // vencidas; los demás Normal siguen alertando, nunca pasan a vigentes.
  const tipoIncorrecto = garantias.filter(a => a.garantia.tipoIncorrecto === true && !a.garantia.vencida)
  const vencidas = garantias.filter(a => a.garantia.vencida === true)
  const sinSerie = garantias.filter(a => !a.garantia.tipoIncorrecto && a.garantia.sinDatosSerie === true)
  const vigentes = garantias.filter(a => !a.garantia.tipoIncorrecto && a.garantia.vencida === false && !a.garantia.sinDatosSerie)
  const duplicados = obtenerTicketsDuplicados(tickets)
  const reincidencias = detectarReincidencias(tickets, historialSeries)

  return {
    garantias, tipoIncorrecto, vencidas, sinSerie, vigentes, duplicados, reincidencias,
    // Se cuentan incidencias: un ticket a revisar o un grupo de referencias
    // duplicadas. Las garantías vigentes no requieren una notificación.
    total: tipoIncorrecto.length + vencidas.length + sinSerie.length + duplicados.length + reincidencias.length,
  }
}
