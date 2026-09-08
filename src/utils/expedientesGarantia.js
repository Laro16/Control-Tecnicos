import { claveSerieGarantia, fechaGarantiaManual } from './vencimientosGarantia.js'
import { obtenerSerieTicket } from './garantias.js'

export const MOTIVOS = ['Despacho', 'Factura de venta', 'Reparación', 'Excepción']
export const ESTADOS = ['Pendiente de respaldo', 'En revisión', 'Autorizado', 'Rechazado', 'Cerrado']
export const referenciaExpediente = valor => String(valor ?? '').trim().toUpperCase()
export function referenciaTicketGarantia(ticket = {}) {
  return referenciaExpediente(ticket['N° REFERENCIA']) || referenciaExpediente(ticket['N° ORDEN'])
}
export function expedienteDeTicket(ticket, porReferencia = {}) {
  const referencia = referenciaTicketGarantia(ticket)
  return referencia ? porReferencia[referencia] || null : null
}
export function nuevoExpediente(ticket = {}) {
  return { referencia: referenciaTicketGarantia(ticket), serie: claveSerieGarantia(obtenerSerieTicket(ticket)), cliente: ticket.CLIENTE || '', motivo: 'Despacho', estado: 'Pendiente de respaldo', fecha_vencimiento: '', explicacion: '', autorizado_por: '', archivos: [] }
}

export function candidatosExpedienteGarantia(control = {}, registros = []) {
  const existentes = new Set(registros.map(registro => referenciaExpediente(registro.referencia)).filter(Boolean))
  const vistos = new Set()
  const grupos = [
    ['vencidas', 'Garantía vencida'],
    ['tipoIncorrecto', 'TIPO Normal · revisar'],
    ['sinSerie', 'Serie por verificar'],
  ]
  const resultado = []
  grupos.forEach(([grupo, diagnostico]) => {
    ;(control?.[grupo] || []).forEach(alerta => {
      const ficha = nuevoExpediente(alerta.ticket)
      if (!ficha.referencia || !ficha.serie || existentes.has(ficha.referencia) || vistos.has(ficha.referencia)) return
      vistos.add(ficha.referencia)
      resultado.push({ ticket: alerta.ticket, ficha, diagnostico })
    })
  })
  return resultado
}
export function validarExpediente(form) {
  if (!referenciaExpediente(form.referencia) || !claveSerieGarantia(form.serie)) throw new Error('Se necesitan la referencia y una serie válida.')
  if (!MOTIVOS.includes(form.motivo) || !ESTADOS.includes(form.estado)) throw new Error('Motivo o estado inválido.')
  if (!form.explicacion.trim()) throw new Error('Escribe la explicación de esta atención.')
  if (form.fecha_vencimiento && !fechaGarantiaManual(form.fecha_vencimiento)) throw new Error('Vencimiento inválido.')
  if (form.estado === 'Autorizado') {
    if (!form.archivos.length || !form.autorizado_por.trim()) throw new Error('Para autorizar, adjunta el respaldo e indica quién confirmó o autorizó.')
    if (['Despacho', 'Factura de venta'].includes(form.motivo) && !form.fecha_vencimiento) throw new Error('Indica el vencimiento confirmado.')
  }
  return true
}
export async function leerExpedientes(db) {
  const registros = []
  for (let desde = 0; ; desde += 500) {
    const { data, error } = await db.from('garantias_expedientes').select('*').order('id', { ascending: false }).range(desde, desde + 499)
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('No se pudieron consultar los expedientes.')
    registros.push(...data)
    if (data.length < 500) return registros
  }
}
