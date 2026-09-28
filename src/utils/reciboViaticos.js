import { quetzales } from './viaticos.js'

export function estadoRecepcion(entrega) {
  return entrega.recibido_en ? 'Recibido' : 'Pendiente de confirmación'
}

const fechaLocal = valor => valor
  ? new Date(valor).toLocaleString('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'medium', timeStyle: 'short' })
  : ''

export function construirReciboEfectivo(pdf, entrega, nombreTecnico) {
  if (entrega.medio !== 'Efectivo') throw new Error('El recibo de efectivo solo corresponde a entregas en efectivo.')
  const margen = 18
  pdf.setFillColor(15, 23, 42)
  pdf.rect(0, 0, 210, 39, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.text('RECIBO DE VIÁTICOS', margen, 20)
  pdf.setFontSize(10)
  pdf.text('Entrega en efectivo', margen, 29)
  pdf.setTextColor(15, 23, 42)

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Folio: ${entrega.id}`, margen, 51)
  pdf.text(`Fecha de entrega: ${String(entrega.fecha || '').split('-').reverse().join('/')}`, margen, 58)
  pdf.setDrawColor(148, 163, 184)
  pdf.line(margen, 65, 192, 65)
  pdf.setFontSize(10)
  pdf.text('TÉCNICO', margen, 76)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text(pdf.splitTextToSize(String(nombreTecnico || 'Sin nombre'), 174).slice(0, 2), margen, 84)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.text('Monto entregado', margen, 99)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(22)
  pdf.text(quetzales(entrega.monto), margen, 111)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  const observaciones = pdf.splitTextToSize(`Observaciones: ${entrega.observaciones || 'Sin observaciones'}`, 174).slice(0, 5)
  pdf.text(observaciones, margen, 126)

  const confirmado = Boolean(entrega.recibido_en)
  pdf.setFillColor(...(confirmado ? [236, 253, 245] : [255, 251, 235]))
  pdf.setDrawColor(...(confirmado ? [5, 150, 105] : [217, 119, 6]))
  pdf.roundedRect(margen, 156, 174, 53, 3, 3, 'FD')
  pdf.setTextColor(...(confirmado ? [6, 95, 70] : [146, 64, 14]))
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.text(confirmado ? 'RECIBIDO POR EL TÉCNICO' : 'PENDIENTE DE CONFIRMACIÓN', margen + 6, 169)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  const detalle = confirmado
    ? [`Confirmado por: ${entrega.recibido_nombre || nombreTecnico}`, `Fecha y hora: ${fechaLocal(entrega.recibido_en)} (Guatemala)`, `Usuario de confirmación: ${entrega.recibido_por || 'No disponible'}`]
    : ['El técnico aún no ha confirmado que recibió el dinero.', 'Este documento no acredita la recepción hasta que quede confirmado.']
  detalle.forEach((linea, indice) => pdf.text(pdf.splitTextToSize(linea, 160)[0], margen + 6, 180 + indice * 7))
  pdf.setTextColor(71, 85, 105)
  pdf.setFontSize(9)
  pdf.text('Constancia digital de Ticket Manager. La confirmación se registra en Supabase.', margen, 227)
  pdf.text('No sustituye una firma manuscrita cuando esta sea requerida por la empresa.', margen, 234)
  return pdf
}

export async function descargarReciboEfectivo(entrega, nombreTecnico) {
  const { jsPDF } = await import('jspdf')
  const pdf = construirReciboEfectivo(new jsPDF({ unit: 'mm', format: 'a4' }), entrega, nombreTecnico)
  pdf.save(`Recibo_viaticos_${entrega.fecha}_${entrega.id.slice(0, 8)}.pdf`)
}
