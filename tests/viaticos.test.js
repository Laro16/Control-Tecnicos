import test from 'node:test'
import assert from 'node:assert/strict'
import { resumenViaticos, CONCEPTOS_VIATICOS, comprimirFactura } from '../src/utils/viaticos.js'

test('cuadra entregas y gastos por persona sin mezclar técnicos y redondea centavos', () => {
  const empleados = [{ id: 'a', nombre: 'Ana' }, { id: 'b', nombre: 'Luis' }]
  const entregas = [{ empleado_id: 'a', monto: '100.10' }, { empleado_id: 'a', monto: '50.20' }, { empleado_id: 'b', monto: '20.00' }]
  const gastos = [{ empleado_id: 'a', monto: '40.05' }, { empleado_id: 'a', monto: '10.10' }, { empleado_id: 'b', monto: '25.00' }]
  const [ana, luis] = resumenViaticos(empleados, entregas, gastos)
  assert.deepEqual([ana.totalEntregado, ana.totalGastado, ana.saldo], [150.3, 50.15, 100.15])
  assert.deepEqual([luis.totalEntregado, luis.totalGastado, luis.saldo], [20, 25, -5])
  assert.deepEqual([ana.saldoDisponible, ana.saldoAFavorTecnico, ana.estadoCuadre], [100.15, 0, 'Pendiente por comprobar'])
  assert.deepEqual([luis.saldoDisponible, luis.saldoAFavorTecnico, luis.estadoCuadre], [0, 5, 'A favor del técnico'])
  assert.equal(ana.sinRespaldo, 50.15)
  assert.ok(CONCEPTOS_VIATICOS.includes('Hospedaje'))
  assert.ok(CONCEPTOS_VIATICOS.includes('Transporte'))
})

test('las entregas posteriores reducen el saldo a favor del técnico hasta cuadrarlo', () => {
  const empleados = [{ id: 'a', nombre: 'Ana' }]
  const gastos = [{ empleado_id: 'a', monto: '125.00', foto_ruta: 'factura.jpg' }]
  const entregas = [{ empleado_id: 'a', monto: '100.00' }]
  const saldo = () => resumenViaticos(empleados, entregas, gastos)[0]
  assert.deepEqual([saldo().saldoAFavorTecnico, saldo().saldoDisponible], [25, 0])
  entregas.push({ empleado_id: 'a', monto: '10.00' })
  assert.deepEqual([saldo().saldoAFavorTecnico, saldo().saldoDisponible], [15, 0])
  entregas.push({ empleado_id: 'a', monto: '15.00' })
  assert.deepEqual([saldo().saldoAFavorTecnico, saldo().saldoDisponible, saldo().estadoCuadre], [0, 0, 'Cuadrado'])
  entregas.push({ empleado_id: 'a', monto: '10.00' })
  assert.deepEqual([saldo().saldoAFavorTecnico, saldo().saldoDisponible], [0, 10])
})

test('reduce una factura grande a 2000 px y entrega JPEG legible', async t => {
  const anteriores = ['document', 'createImageBitmap', 'File'].map(nombre => [nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)])
  t.after(() => anteriores.forEach(([nombre, descriptor]) => descriptor
    ? Object.defineProperty(globalThis, nombre, descriptor)
    : delete globalThis[nombre]))
  let cerrado = false
  let calidadUsada = 0
  let dimensionesDibujadas
  let canvas
  globalThis.createImageBitmap = async () => ({ width: 4000, height: 3000, close() { cerrado = true } })
  globalThis.document = { createElement: () => (canvas = {
    width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage() { dimensionesDibujadas = [canvas.width, canvas.height] } }),
    toBlob(callback, tipo, calidad) { calidadUsada = calidad; assert.equal(tipo, 'image/jpeg'); callback(new Blob(['factura legible'], { type: tipo })) },
  }) }
  globalThis.File = class extends Blob { constructor(partes, nombre, opciones) { super(partes, opciones); this.name = nombre } }
  const resultado = await comprimirFactura(new File(['imagen'], 'prueba.png', { type: 'image/png' }))
  assert.equal(resultado.type, 'image/jpeg')
  assert.equal(calidadUsada, 0.88)
  assert.equal(resultado.name, 'prueba.jpg')
  assert.deepEqual(dimensionesDibujadas, [2000, 1500])
  assert.equal(canvas.width, 0)
  assert.equal(canvas.height, 0)
  assert.equal(cerrado, true)
})
