import test from 'node:test'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import { construirReciboEfectivo, estadoRecepcion } from '../src/utils/reciboViaticos.js'

const entrega = {
  id: 'ace4f8e3-7643-496c-9479-11ed5c777777',
  fecha: '2026-09-28', monto: '250.50', medio: 'Efectivo',
  observaciones: 'Viáticos para visita de servicio en Quetzaltenango',
}

test('recibo de efectivo distingue pendiente y confirmado', async () => {
  assert.equal(estadoRecepcion(entrega), 'Pendiente de confirmación')
  const pendiente = construirReciboEfectivo(new jsPDF({ unit: 'mm', format: 'a4' }), entrega, 'José Francisco Antonio Martínez Rodríguez de la Cruz')
  assert.ok(pendiente.output('arraybuffer').byteLength > 1000)
  const confirmado = { ...entrega, recibido_en: '2026-09-28T16:30:00Z', recibido_nombre: 'Técnico de prueba', recibido_por: '9be16270-d4a3-4dfb-a6e3-198e21a8c000' }
  assert.equal(estadoRecepcion(confirmado), 'Recibido')
  const recibido = construirReciboEfectivo(new jsPDF({ unit: 'mm', format: 'a4' }), confirmado, 'Técnico de prueba')
  assert.ok(recibido.output('arraybuffer').byteLength > 1000)
  if (process.env.RENDER_SAMPLE_RECEIPT) {
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir('tmp/pdfs', { recursive: true })
    await writeFile('tmp/pdfs/recibo-pendiente.pdf', Buffer.from(pendiente.output('arraybuffer')))
    await writeFile('tmp/pdfs/recibo-confirmado.pdf', Buffer.from(recibido.output('arraybuffer')))
  }
})

test('recibo de efectivo no se genera para una transferencia', () => {
  assert.throws(() => construirReciboEfectivo(new jsPDF(), { ...entrega, medio: 'Transferencia' }, 'Técnico'), /solo corresponde/)
})
