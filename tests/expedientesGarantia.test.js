import test from 'node:test'
import assert from 'node:assert/strict'
import { nuevoExpediente, validarExpediente, leerExpedientes } from '../src/utils/expedientesGarantia.js'

test('nueva atención conserva serie y referencia, nunca hereda autorización', () => {
  const form = nuevoExpediente({ 'N° REFERENCIA': ' ab123 ', CLIENTE: 'Cliente', 'DESCRIPCIÓN INICIAL': 'Equipo 2401011234 no enfría' })
  assert.equal(form.referencia, 'AB123')
  assert.equal(form.serie, '2401011234')
  assert.equal(form.estado, 'Pendiente de respaldo')
  assert.equal(form.fecha_vencimiento, '')
  assert.deepEqual(form.archivos, [])
})
const base = () => ({ ...nuevoExpediente({ 'N° REFERENCIA': '123', SERIE: '2401011234' }), explicacion: 'Verificado en sistema' })
test('se puede guardar pendiente sin documento pero no autorizar', () => {
  assert.equal(validarExpediente(base()), true)
  assert.throws(() => validarExpediente({ ...base(), estado: 'Autorizado' }), /respaldo/)
})
test('despacho o factura exigen vencimiento y responsable al autorizar', () => {
  const f = { ...base(), estado: 'Autorizado', archivos: [{ path: 'a' }], autorizado_por: 'Supervisor' }
  assert.throws(() => validarExpediente(f), /vencimiento/)
  assert.equal(validarExpediente({ ...f, fecha_vencimiento: '2028-02-29' }), true)
  assert.throws(() => validarExpediente({ ...f, fecha_vencimiento: '2027-02-29' }), /inválido/)
})
test('excepción y reparación no requieren ampliar cobertura por serie', () => {
  for (const motivo of ['Excepción', 'Reparación']) assert.equal(validarExpediente({ ...base(), motivo, estado: 'Autorizado', autorizado_por: 'Jefe', archivos: [{ path: 'a' }] }), true)
})
test('rechaza referencias vacías, series inválidas y falta de explicación', () => {
  assert.throws(() => validarExpediente({ ...base(), referencia: ' ' }))
  assert.throws(() => validarExpediente({ ...base(), serie: '-' }))
  assert.throws(() => validarExpediente({ ...base(), explicacion: ' ' }))
})
test('consulta todas las páginas y propaga fallos de conexión', async () => {
  const query = { select() { return this }, order() { return this }, async range(from) { return { data: from === 0 ? Array.from({ length: 500 }, (_, id) => ({ id })) : [{ id: 501 }] } } }
  assert.equal((await leerExpedientes({ from: () => query })).length, 501)
  query.range = async () => ({ error: new Error('sin conexión') })
  await assert.rejects(leerExpedientes({ from: () => query }), /sin conexión/)
})
