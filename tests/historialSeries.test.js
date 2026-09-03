import test from 'node:test'
import assert from 'node:assert/strict'
import { combinarHistorial, detectarReincidencias, extraerAtencionesFinalizadas, normalizarSerieHistorial } from '../src/utils/historialSeries.js'

const hoy = new Date(2026, 8, 3)
const ticket = (datos = {}) => ({
  'N° REFERENCIA': 'A1', SERIE: '2408104963',
  ESTADO: 'Orden Finalizada', ESTADO_LIMPIO: 'ORDEN FINALIZADA',
  CLIENTE: 'Cliente de prueba', NEGOCIO: 'Sucursal de prueba', tecnico: 'Técnico de prueba',
  FECHA_TEXTO: '01/09/2026', ...datos,
})
const activo = (datos = {}) => ticket({ 'N° REFERENCIA': 'A2', ESTADO: 'En Proceso', ESTADO_LIMPIO: 'EN PROCESO', FECHA_TEXTO: '-', ...datos })

test('conserva una atención finalizada por serie y referencia, con sus datos', () => {
  const registros = extraerAtencionesFinalizadas([ticket(), ticket(), activo()])
  assert.equal(registros.length, 1)
  assert.deepEqual(registros[0], {
    serie: '2408104963', referencia: 'A1', cliente: 'Cliente de prueba',
    negocio: 'Sucursal de prueba', tecnico: 'Técnico de prueba', fecha_cierre: '2026-09-01',
  })
})

test('otra referencia abierta de una serie trabajada es una posible reincidencia', () => {
  const historial = extraerAtencionesFinalizadas([ticket()])
  const resultado = detectarReincidencias([activo(), activo()], historial, hoy)
  assert.equal(resultado.length, 1)
  assert.equal(resultado[0].ticket['N° REFERENCIA'], 'A2')
  assert.equal(resultado[0].anteriores[0].referencia, 'A1')
})

test('la misma referencia, incluso reabierta o reimportada, no crea otra atención', () => {
  const historial = extraerAtencionesFinalizadas([ticket()])
  assert.equal(combinarHistorial(historial, extraerAtencionesFinalizadas([ticket()])).length, 1)
  assert.equal(detectarReincidencias([activo({ 'N° REFERENCIA': ' a1 ' })], historial, hoy).length, 0)
})

test('dos reportes abiertos no demuestran una reparación anterior', () => {
  const datos = [activo(), activo({ 'N° REFERENCIA': 'A3' })]
  assert.equal(extraerAtencionesFinalizadas(datos).length, 0)
  assert.equal(detectarReincidencias(datos, [], hoy).length, 0)
})

test('los tickets finalizados no mantienen una alerta activa', () => {
  assert.equal(detectarReincidencias([ticket({ 'N° REFERENCIA': 'A2' })], extraerAtencionesFinalizadas([ticket()]), hoy).length, 0)
})

test('combina cargas sin perder atenciones de Excel anteriores', () => {
  const primeraCarga = extraerAtencionesFinalizadas([ticket()])
  const segundaCarga = extraerAtencionesFinalizadas([ticket({ 'N° REFERENCIA': 'B1', SERIE: '2301019876' })])
  const historial = combinarHistorial(primeraCarga, segundaCarga)
  assert.equal(historial.length, 2)
  assert.equal(detectarReincidencias([activo()], historial, hoy).length, 1)
})

test('ignora referencias y series vacías o marcadores inválidos', () => {
  for (const valor of ['', '-', null, undefined, 'SIN SERIE', '00000000', '11111111', '123456']) {
    assert.equal(extraerAtencionesFinalizadas([ticket({ SERIE: valor })]).length, 0)
  }
  for (const valor of ['', '-', null, '  ']) {
    assert.equal(extraerAtencionesFinalizadas([ticket({ 'N° REFERENCIA': valor })]).length, 0)
  }
})

test('usa SERIE primero y recupera DESCRIPCIÓN INICIAL con las reglas existentes', () => {
  assert.equal(extraerAtencionesFinalizadas([ticket({ 'DESCRIPCIÓN INICIAL': 'Otra serie 2301019876' })])[0].serie, '2408104963')
  assert.equal(extraerAtencionesFinalizadas([ticket({ SERIE: '', 'DESCRIPCIÓN INICIAL': 'Teléfono 48771534; equipo 2408104963.' })])[0].serie, '2408104963')
  assert.equal(extraerAtencionesFinalizadas([ticket({ SERIE: '', 'DESCRIPCIÓN INICIAL': 'Teléfono 48771534' })]).length, 0)
})

test('recalcula cargas antiguas cuyo origen decía DESCRIPCIÓN usando DESCRIPCIÓN INICIAL', () => {
  const antiguo = ticket({ SERIE: '1001011234', SERIE_ORIGEN: 'DESCRIPCIÓN', DESCRIPCIÓN: '1001011234', 'DESCRIPCIÓN INICIAL': '2408104963' })
  assert.equal(extraerAtencionesFinalizadas([antiguo])[0].serie, '2408104963')
})

test('conserva ceros iniciales y normaliza formato sin convertir a número', () => {
  assert.equal(normalizarSerieHistorial(' 0012-3456 '), '00123456')
  assert.equal(normalizarSerieHistorial(' ab123456 '), 'AB123456')
  assert.notEqual(normalizarSerieHistorial('00123456'), normalizarSerieHistorial('0123456'))
})

test('no atribuye cierres futuros como antecedentes y ordena los anteriores', () => {
  const historial = extraerAtencionesFinalizadas([
    ticket({ 'N° REFERENCIA': 'FUTURO', FECHA_TEXTO: '04/09/2026' }),
    ticket({ 'N° REFERENCIA': 'ANTIGUO', FECHA_TEXTO: '01/08/2026' }),
    ticket({ 'N° REFERENCIA': 'RECIENTE', FECHA_TEXTO: '02/09/2026' }),
  ])
  assert.deepEqual(detectarReincidencias([activo()], historial, hoy)[0].anteriores.map(r => r.referencia), ['RECIENTE', 'ANTIGUO'])
})

test('una fecha inválida no se inventa al guardar la atención', () => {
  assert.equal(extraerAtencionesFinalizadas([ticket({ FECHA_TEXTO: '31/02/2026' })])[0].fecha_cierre, null)
  assert.equal(extraerAtencionesFinalizadas([ticket({ FECHA_TEXTO: '-', FECHA_OBJ: null })])[0].fecha_cierre, null)
})
