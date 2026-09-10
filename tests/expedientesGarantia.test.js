import test from 'node:test'
import assert from 'node:assert/strict'
import { nuevoExpediente, validarExpediente, leerExpedientes, expedienteDeTicket, referenciaTicketGarantia, candidatosExpedienteGarantia, combinarDatosTicket, datosTicketExpediente, expedientesAnterioresTicket, numeroOrdenDesdeFila } from '../src/utils/expedientesGarantia.js'

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
  assert.equal(referenciaTicketGarantia({ 'N° REFERENCIA': '-', 'N° ORDEN': 'ORD-99' }), 'ORD-99')
})

test('lee variantes seguras del encabezado N° ORDEN', () => {
  assert.equal(numeroOrdenDesdeFila({ 'N° ORDEN': 402700 }), '402700')
  assert.equal(numeroOrdenDesdeFila({ 'Nº Orden': ' 00012 ' }), '00012')
  assert.equal(numeroOrdenDesdeFila({ 'Número de orden': 'ABC-9' }), 'ABC-9')
  assert.equal(numeroOrdenDesdeFila({ 'ORDEN FINALIZADA': 'NO USAR' }), '')
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
  assert.deepEqual(candidatos.map(c => c.diagnostico), ['Ingresó fuera de cobertura', 'TIPO Normal · revisar'])
})

test('nueva atención conserva serie y referencia, nunca hereda autorización', () => {
  const form = nuevoExpediente({ 'N° REFERENCIA': ' ab123 ', 'N° ORDEN': '402443', CLIENTE: 'Cliente', NEGOCIO: 'SHELL', MODELO: 'CR-23', TÉCNICO: 'Henry', 'DESCRIPCIÓN INICIAL': 'Equipo 2401011234 no enfría' })
  assert.equal(form.referencia, 'AB123')
  assert.equal(form.serie, '2401011234')
  assert.equal(form.estado, 'Pendiente de respaldo')
  assert.equal(form.fecha_vencimiento, '')
  assert.deepEqual(form.archivos, [])
  assert.deepEqual(form.datos_ticket, {
    numero_referencia: 'AB123',
    numero_orden: '402443',
    negocio: 'SHELL',
    modelo: 'CR-23',
    tecnico: 'Henry',
    descripcion_inicial: 'Equipo 2401011234 no enfría',
  })
})

test('conserva datos útiles del reporte y completa únicamente campos vacíos', () => {
  const datos = datosTicketExpediente({
    'Nº Referencia': 'ref-9',
    'Número de orden': '0009',
    NEGOCIO: 'Tienda central',
    DIRECCION: 'Zona 1',
    TELEFONO: '5555 5555',
    ESTADO: 'En Proceso',
    TIPO: 'Normal',
    'FECHA DE INGRESO': '10/09/2026',
  })
  assert.equal(datos.numero_referencia, 'REF-9')
  assert.equal(datos.numero_orden, '0009')
  assert.equal(datos.direccion, 'Zona 1')
  assert.equal(datos.telefono, '5555 5555')
  assert.deepEqual(combinarDatosTicket(datos, { negocio: 'Nombre guardado', modelo: '-' }), {
    numero_referencia: 'REF-9', numero_orden: '0009', negocio: 'Nombre guardado', estado_ticket: 'En Proceso', tipo_original: 'Normal', direccion: 'Zona 1', telefono: '5555 5555', fecha_ingreso: '10/09/2026',
  })
})

test('solo propone otra ficha cuando la serie reaparece después, no para reportes anteriores', () => {
  const existente = {
    referencia: 'TECNOCHEF-1934', serie: '2508105893',
    datos_ticket: { fecha_ingreso: '08/09/2026' },
  }
  const anterior = { 'N° REFERENCIA': 'TECNOCHEF-1927', SERIE: '2508105893', 'FECHA INGRESO': '03/09/2026' }
  const posterior = { 'N° REFERENCIA': 'TECNOCHEF-1940', SERIE: '2508105893', 'FECHA INGRESO': '10/09/2026' }
  assert.deepEqual(expedientesAnterioresTicket(anterior, [existente]), [])
  assert.deepEqual(expedientesAnterioresTicket(posterior, [existente]), [existente])
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
