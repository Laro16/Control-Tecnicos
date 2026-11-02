import test from 'node:test'
import assert from 'node:assert/strict'
import { obtenerControlAlertas, obtenerTicketsDuplicados } from '../src/utils/alertas.js'

const catalogo = [{ nombre: 'Cliente de prueba', anios: 2 }]
const anioActual = new Date().getFullYear()
const ticket = (datos = {}) => ({
  CLIENTE: 'Cliente de prueba', TIPO: 'Garantia',
  ESTADO: 'Asignada a Técnico', ESTADO_LIMPIO: 'ASIGNADA A TECNICO',
  'N° REFERENCIA': 'A1', SERIE: '1001011234', 'FECHA INGRESO': `01/01/${anioActual}`, ...datos,
})

test('ignora referencias vacías y agrupa todas las filas, también finalizadas', () => {
  const datos = ['', '   ', null, undefined, '-', ' a1 ', 'A1', 'B2'].map((ref, i) => ticket({
    'N° REFERENCIA': ref,
    ESTADO_LIMPIO: i === 6 ? 'ORDEN FINALIZADA' : 'EN PROCESO',
  }))
  const duplicados = obtenerTicketsDuplicados(datos)
  assert.equal(duplicados.length, 1)
  assert.equal(duplicados[0].cantidad, 2)
  assert.equal(duplicados[0].tickets[1].ESTADO_LIMPIO, 'ORDEN FINALIZADA')
})

test('un grupo triplicado cuenta como una incidencia, no como tres', () => {
  const datos = [1, 2, 3].map(() => ticket({ CLIENTE: 'Fuera del catálogo' }))
  const control = obtenerControlAlertas(datos, catalogo)
  assert.equal(control.total, 1)
  assert.equal(control.duplicados[0].cantidad, 3)
})

test('separa vencida, tipo Normal y serie inválida; no notifica vigentes', () => {
  const anio = String(new Date().getFullYear()).slice(-2)
  const control = obtenerControlAlertas([
    ticket(),
    ticket({ 'N° REFERENCIA': 'A2', TIPO: ' normal ', SERIE: `${anio}01011234` }),
    ticket({ 'N° REFERENCIA': 'A3', SERIE: '-' }),
    ticket({ 'N° REFERENCIA': 'A4', SERIE: `${anio}01011234` }),
    ticket({ 'N° REFERENCIA': 'A5', ESTADO_LIMPIO: 'ORDEN FINALIZADA' }),
    ticket({ 'N° REFERENCIA': 'A6', CLIENTE: 'No cubierto' }),
  ], catalogo)
  assert.equal(control.total, 3)
  assert.equal(control.garantias.length, 4)
  assert.equal(control.vencidas.length, 1)
  assert.equal(control.tipoIncorrecto.length, 1)
  assert.equal(control.sinSerie.length, 1)
  assert.equal(control.vigentes.length, 1)
})

test('una serie recuperada de DESCRIPCIÓN INICIAL también detecta garantía vencida', () => {
  const control = obtenerControlAlertas([ticket({ SERIE: '', 'DESCRIPCIÓN INICIAL': 'Serie: 1001011234. Tel: 48771534.' })], catalogo)
  assert.equal(control.vencidas.length, 1)
  assert.equal(control.sinSerie.length, 0)
})

test('no busca la serie faltante en DESCRIPCIÓN ni en otros campos', () => {
  const control = obtenerControlAlertas([ticket({ SERIE: '', DESCRIPCIÓN: 'Serie: 1001011234', COMENTARIO: '2408104963' })], catalogo)
  assert.equal(control.sinSerie.length, 1)
  assert.equal(control.vencidas.length, 0)
})

test('un TIPO Normal vencido aparece primero como vencido y se cuenta una sola vez', () => {
  const control = obtenerControlAlertas([ticket({ TIPO: 'Normal' })], catalogo)
  assert.equal(control.vencidas.length, 1)
  assert.equal(control.tipoIncorrecto.length, 0)
  assert.equal(control.total, 1)
  assert.equal(control.vencidas[0].garantia.tipoIncorrecto, true)
})

test('se recalcula al corregir la base sin modificar los tickets de entrada', () => {
  const anio = String(new Date().getFullYear()).slice(-2)
  const original = Object.freeze(ticket({ TIPO: 'Normal', SERIE: `${anio}01011234` }))
  assert.equal(obtenerControlAlertas([original], catalogo).tipoIncorrecto.length, 1)
  assert.equal(original.TIPO, 'Normal')
  const corregido = { ...original, TIPO: 'Garantia', SERIE: `${anio}01011234` }
  assert.equal(obtenerControlAlertas([corregido], catalogo).total, 0)
})

test('maneja una base vacía y un catálogo todavía no cargado', () => {
  assert.equal(obtenerControlAlertas().total, 0)
  assert.equal(obtenerControlAlertas([ticket()]).total, 0)
})

test('la campana incluye reincidencias aunque el cliente no tenga garantía', () => {
  const datos = [ticket({ CLIENTE: 'Cliente sin garantía', 'N° REFERENCIA': 'NUEVA' })]
  const historial = [{ serie: '1001011234', referencia: 'ANTERIOR', fecha_cierre: '2020-01-01' }]
  const control = obtenerControlAlertas(datos, catalogo, historial)
  assert.equal(control.reincidencias.length, 1)
  assert.equal(control.total, 1)
  assert.equal(obtenerControlAlertas([{ ...datos[0], ESTADO_LIMPIO: 'ORDEN FINALIZADA' }], catalogo, historial).total, 0)
})

test('Avícola Villalobos no genera alertas de garantía aunque siga en el catálogo', () => {
  const clientes = [...catalogo, { nombre: 'AVICOLA VILLALOBOS S.A.', anios: 2 }]
  const variantes = ['AVICOLA VILLALOBOS S.A.', '  avícola   villalobos s. a.  ', 'AVICOLA VILLALOBOS, SOCIEDAD ANONIMA', 'GARANTIA AVICOLA VILLALOBOS S.A.']
  const casos = [
    { SERIE: '1001011234' },
    { SERIE: `${String(anioActual).slice(-2)}01011234`, TIPO: 'Normal' },
    { SERIE: '-' },
    { SERIE: `${String(anioActual).slice(-2)}01011234` },
    { SERIE: '1001011234', 'FECHA INGRESO': '' },
  ]
  const datos = Object.freeze(variantes.flatMap((CLIENTE, i) => casos.map((caso, j) => Object.freeze(ticket({ CLIENTE, 'N° REFERENCIA': `AV-${i}-${j}`, ...caso })))))
  const antes = JSON.stringify(datos)
  for (const vencimientos of [{}, { '1001011234': { fecha_vencimiento: '2099-01-01' } }]) {
    const control = obtenerControlAlertas(datos, clientes, [], vencimientos)
    for (const grupo of ['garantias', 'tipoIncorrecto', 'vencidas', 'sinSerie', 'vigentes']) assert.equal(control[grupo].length, 0, grupo)
    assert.equal(control.total, 0)
  }
  assert.equal(JSON.stringify(datos), antes)
})

test('la exclusión es por cliente, no por serie ni por coincidencias parciales del nombre', () => {
  const clientes = [...catalogo, { nombre: 'AVICOLA VILLALOBOS S.A.', anios: 2 }, { nombre: 'AVICOLA VILLALOBOS SERVICIOS S.A.', anios: 2 }]
  const control = obtenerControlAlertas([
    ticket({ CLIENTE: 'AVICOLA VILLALOBOS S.A.', 'N° REFERENCIA': 'AV-1' }),
    ticket({ 'N° REFERENCIA': 'OTRO-1' }),
    ticket({ CLIENTE: 'AVICOLA VILLALOBOS SERVICIOS S.A.', 'N° REFERENCIA': 'OTRO-2' }),
  ], clientes)
  assert.deepEqual(control.vencidas.map(a => a.ticket['N° REFERENCIA']), ['OTRO-1', 'OTRO-2'])
  assert.equal(control.total, 2)
})

test('excluir garantías de Avícola no elimina tickets ni sus duplicados o antecedentes', () => {
  const datos = [ticket({ CLIENTE: 'AVICOLA VILLALOBOS S.A.', 'N° REFERENCIA': 'AV-NUEVA' }), ticket({ CLIENTE: 'AVICOLA VILLALOBOS S.A.', 'N° REFERENCIA': 'AV-NUEVA' })]
  const historial = [{ serie: '1001011234', referencia: 'AV-ANTERIOR', fecha_cierre: '2020-01-01' }]
  const sinCatalogo = obtenerControlAlertas(datos, [], historial)
  const control = obtenerControlAlertas(datos, [{ nombre: 'AVICOLA VILLALOBOS S.A.', anios: 2 }], historial)
  assert.equal(control.garantias.length, 0)
  assert.equal(control.duplicados.length, 1)
  assert.ok(control.reincidencias.length > 0)
  assert.deepEqual(control.duplicados, sinCatalogo.duplicados)
  assert.deepEqual(control.reincidencias, sinCatalogo.reincidencias)
  assert.equal(datos.length, 2)
})
