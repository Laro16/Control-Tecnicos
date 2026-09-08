import test from 'node:test'
import assert from 'node:assert/strict'
import { nuevoExpediente, validarExpediente, leerExpedientes, expedienteDeTicket, referenciaTicketGarantia, candidatosExpedienteGarantia } from '../src/utils/expedientesGarantia.js'

test('ficha creada coincide solo por referencia, nunca por serie ni referencia vacía', () => {
  const ficha = { referencia: '00123', serie: '2401011234' }
  const mapa = { '00123': ficha }
  assert.equal(expedienteDeTicket({ 'N° REFERENCIA': ' 00123 ' }, mapa), ficha)
  assert.equal(expedienteDeTicket({ 'N° REFERENCIA': '00124', SERIE: ficha.serie }, mapa), null)
  assert.equal(expedienteDeTicket({ 'N° REFERENCIA': '123' }, mapa), null)
  assert.equal(expedienteDeTicket({ 'N° REFERENCIA': '' }, { '': ficha }), null)
})

test('usa N° ORDEN únicamente cuando N° REFERENCIA está vacío', () => {
  assert.equal(referenciaTicketGarantia({ 'N° REFERENCIA': ' REF-01 ', 'N° ORDEN': 'ORD-99' }), 'REF-01')
  assert.equal(referenciaTicketGarantia({ 'N° REFERENCIA': '  ', 'N° ORDEN': ' ord-99 ' }), 'ORD-99')
  assert.equal(nuevoExpediente({ 'N° ORDEN': '00045', SERIE: '2401011234' }).referencia, '00045')
  const ficha = { referencia: 'ORD-99' }
  assert.equal(expedienteDeTicket({ 'N° REFERENCIA': '', 'N° ORDEN': 'ord-99' }, { 'ORD-99': ficha }), ficha)
  assert.equal(expedienteDeTicket({ 'N° REFERENCIA': 'REF-01', 'N° ORDEN': 'ORD-99' }, { 'ORD-99': ficha }), null)
})

test('selector ofrece alertas sin ficha y permite la misma serie con otra referencia', () => {
  const alerta = (referencia, serie = '2401011234', extra = {}) => ({ ticket: { 'N° REFERENCIA': referencia, SERIE: serie, CLIENTE: 'Cliente', ...extra } })
  const control = {
    vencidas: [alerta('YA-CREADA'), alerta('NUEVA-1')],
    tipoIncorrecto: [alerta('', '2401011234', { 'N° ORDEN': 'ORD-2' }), alerta('NUEVA-1')],
    sinSerie: [alerta('SIN-SERIE', '-')],
  }
  const candidatos = candidatosExpedienteGarantia(control, [{ referencia: 'YA-CREADA', serie: '2401011234' }])
  assert.deepEqual(candidatos.map(c => c.ficha.referencia), ['NUEVA-1', 'ORD-2'])
  assert.deepEqual(candidatos.map(c => c.diagnostico), ['Garantía vencida', 'TIPO Normal · revisar'])
})

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
test('sin garantía confirmada se guarda rechazada pero nunca autorizada', () => {
  const sinGarantia = { ...base(), motivo: 'Sin garantía confirmada', estado: 'Rechazado', fecha_vencimiento: '' }
  assert.equal(validarExpediente(sinGarantia), true)
  assert.throws(() => validarExpediente({ ...sinGarantia, estado: 'Autorizado', archivos: [{ path: 'a' }], autorizado_por: 'Jefe' }), /no puede quedar Autorizado/)
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
