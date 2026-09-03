import test from 'node:test'
import assert from 'node:assert/strict'
import { obtenerControlAlertas, obtenerTicketsDuplicados } from '../src/utils/alertas.js'

const catalogo = [{ nombre: 'Cliente de prueba', anios: 2 }]
const ticket = (datos = {}) => ({
  CLIENTE: 'Cliente de prueba', TIPO: 'Garantia',
  ESTADO: 'Asignada a Técnico', ESTADO_LIMPIO: 'ASIGNADA A TECNICO',
  'N° REFERENCIA': 'A1', SERIE: '1001011234', ...datos,
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
    ticket({ 'N° REFERENCIA': 'A2', TIPO: ' normal ' }),
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

test('una serie recuperada de DESCRIPCIÓN también detecta garantía vencida', () => {
  const control = obtenerControlAlertas([ticket({ SERIE: '', DESCRIPCIÓN: 'Serie: 1001011234. Tel: 48771534.' })], catalogo)
  assert.equal(control.vencidas.length, 1)
  assert.equal(control.sinSerie.length, 0)
})

test('se recalcula al corregir la base sin modificar los tickets de entrada', () => {
  const original = Object.freeze(ticket({ TIPO: 'Normal' }))
  assert.equal(obtenerControlAlertas([original], catalogo).tipoIncorrecto.length, 1)
  assert.equal(original.TIPO, 'Normal')
  const anio = String(new Date().getFullYear()).slice(-2)
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
