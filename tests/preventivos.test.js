import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import { catalogoDesdeMatriz, extraerOrdenesPreventivas, atribuirOrden, prepararAvance, codigoDesdeNegocio, rangoSemana, fechaPreventivo } from '../src/utils/preventivos.js'

const libro = XLSX.readFile('src/Mantenimientos.xlsx')
const catalogo = catalogoDesdeMatriz(XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, defval: '' }))
test('Calendario real: excluye cerrados y conserva meses y códigos por marca', () => {
  assert.equal(catalogo.length, 173)
  assert.equal(catalogo.filter(l => l.activo && l.marca === 'GRANJERO').length, 114)
  assert.equal(catalogo.filter(l => l.activo && l.marca === 'CAMPERO').length, 39)
  assert.equal(catalogo.find(l => l.codigo === '745' && l.marca === 'GRANJERO').activo, false)
})
test('Órdenes únicas, todos los estados y nunca fecha de ingreso', () => {
  const fila = { CLIENTE: 'CAMPERO PREVENTIVO', 'N° ORDEN': '10', 'ESTADO': 'Cancelada', NEGOCIO: 'CAMPERO PREVENTIVO 654', 'FECHA INGRESO': '01/09/2026' }
  const { ordenes, sinOrden } = extraerOrdenesPreventivas([fila, fila, {...fila, 'N° ORDEN': ''}])
  assert.equal(ordenes.length, 1)
  assert.equal(sinOrden, 1)
  assert.equal(ordenes[0].fecha_realizada, null)
  assert.equal(atribuirOrden(ordenes[0], catalogo).programado, null)
})
test('Atención de septiembre se acredita al agosto programado', () => {
  const orden = {numero_orden: '11', marca: 'CAMPERO', negocio: 'CAMPERO PREVENTIVO 654', fecha_realizada: '2026-09-01'}
  const atribuida = atribuirOrden(orden, catalogo)
  assert.equal(atribuida.codigo, '654')
  assert.deepEqual(atribuida.programado, { anio: 2026, mes: 8, vuelta: 2 })
  assert.equal(atribuida.tarde, true)
  assert.equal(atribuida.adelantado, false)
  assert.equal(prepararAvance(catalogo, [orden], 2026, 2, '2026-08-31').resumen[1].equipos, 0)
  assert.equal(prepararAvance(catalogo, [orden], 2026, 2, '2026-09-06').resumen[1].equipos, 1)
})

test('los cuatro puntos programados en noviembre reconocen sus adelantos de octubre', () => {
  for (const [marca, codigo, fecha] of [['GRANJERO', '413', '2026-10-07'], ['GRANJERO', '752', '2026-10-07'], ['CAMPERO', '644', '2026-10-15'], ['CAMPERO', '703', '2026-10-07']]) {
    const local = catalogo.find(l => l.marca === marca && l.codigo === codigo)
    assert.deepEqual(local.meses, [3, 7, 11])
    const original = Object.freeze({ numero_orden: `${marca}-${codigo}`, marca, codigo, fecha_realizada: fecha, estado: 'Orden Finalizada' })
    const atribuida = atribuirOrden(original, catalogo)
    assert.deepEqual(atribuida.programado, { anio: 2026, mes: 11, vuelta: 3 })
    assert.equal(atribuida.adelantado, true)
    assert.equal(atribuida.tarde, false)
    assert.equal(atribuida.fecha_realizada, fecha)
    assert.equal(original.fecha_realizada, fecha)
    assert.equal(prepararAvance(catalogo, [original, original], 2026, 3, '2026-10-31').incluidas.length, 1)
    assert.equal(prepararAvance(catalogo, [original], 2026, 2, '2026-10-31').incluidas.length, 0)
  }
})

test('un empate de meses queda Por ubicar sin inventar una asignación', () => {
  const orden = { numero_orden: 'EMPATE', marca: 'GRANJERO', codigo: '413', fecha_realizada: '2026-09-01' }
  for (const fecha_realizada of ['2026-09-01', '2026-09-30']) {
    const atribuida = atribuirOrden({ ...orden, fecha_realizada }, catalogo)
    assert.equal(atribuida.programado, null)
    assert.equal(atribuida.tarde, false)
    assert.equal(atribuida.adelantado, false)
    assert.match(atribuida.motivoUbicacion, /misma distancia/)
  }
  assert.equal(prepararAvance(catalogo, [orden], 2026, 2).incluidas.length, 0)
  assert.equal(prepararAvance(catalogo, [orden], 2026, 3).incluidas.length, 0)
})

test('la cercanía contempla meses programados de los años adyacentes', () => {
  const base = { numero_orden: 'ANIO', marca: 'CAMPERO', codigo: '1' }
  const local = meses => [{ id: 'CAMPERO:1', marca: 'CAMPERO', codigo: '1', meses, activo: true }]
  const diciembre = atribuirOrden({ ...base, fecha_realizada: '2026-12-20' }, local([1, 5, 9]))
  assert.deepEqual(diciembre.programado, { anio: 2027, mes: 1, vuelta: 1 })
  assert.equal(diciembre.adelantado, true)
  const enero = atribuirOrden({ ...base, fecha_realizada: '2027-01-02' }, local([4, 8, 12]))
  assert.deepEqual(enero.programado, { anio: 2026, mes: 12, vuelta: 3 })
  assert.equal(enero.tarde, true)
  const repetidos = atribuirOrden({ ...base, fecha_realizada: '2026-10-07' }, local([3, 7, 11, 11]))
  assert.deepEqual(repetidos.programado, { anio: 2026, mes: 11, vuelta: 3 })
})

test('asignación manual prevalece sobre adelantos, empates y fechas ausentes', () => {
  const base = { numero_orden: 'MANUAL', marca: 'GRANJERO', codigo: '413', anio_programado: 2026, mes_programado: 7 }
  for (const fecha_realizada of ['2026-09-01', '2026-10-07', null]) {
    const atribuida = atribuirOrden({ ...base, fecha_realizada }, catalogo)
    assert.deepEqual(atribuida.programado, { anio: 2026, mes: 7, vuelta: 2 })
    assert.equal(atribuida.tarde, Boolean(fecha_realizada))
    assert.equal(atribuida.adelantado, false)
  }
  const adelantada = atribuirOrden({ ...base, mes_programado: 11, fecha_realizada: '2026-10-07' }, catalogo)
  assert.equal(adelantada.adelantado, true)
})

test('un calendario inválido no genera meses ficticios ni modifica el restaurante', () => {
  const local = Object.freeze({ id: 'GRANJERO:1', marca: 'GRANJERO', codigo: '1', meses: Object.freeze([0, 13, null, '']) })
  const atribuida = atribuirOrden({ numero_orden: 'SIN-PLAN', marca: 'GRANJERO', codigo: '1', fecha_realizada: '2026-10-07' }, [local])
  assert.equal(atribuida.programado, null)
  assert.match(atribuida.motivoUbicacion, /meses programados válidos/)
})
test('Asignación manual conserva mes sin inventar fecha', () => {
  const orden = {numero_orden: '12', marca:'CAMPERO',codigo:'654',anio_programado:2026,mes_programado:8,fecha_realizada:null}
  assert.equal(prepararAvance(catalogo,[orden],2026,2,'2026-09-06').resumen[1].equipos,1)
  assert.equal(atribuirOrden(orden,catalogo).fecha_realizada,null)
})
test('No adivina códigos ambiguos y valida fecha/semana', () => {
  assert.equal(codigoDesdeNegocio('LOCAL 1 2','CAMPERO',[{marca:'CAMPERO',codigo:'1'},{marca:'CAMPERO',codigo:'2'}]),null)
  assert.equal(fechaPreventivo('31/02/2026'),null)
  assert.deepEqual(rangoSemana('2026-09-30'), {inicio:'2026-09-28',fin:'2026-10-04'})
})
