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
  assert.equal(prepararAvance(catalogo, [orden], 2026, 2, '2026-08-31').resumen[1].equipos, 0)
  assert.equal(prepararAvance(catalogo, [orden], 2026, 2, '2026-09-06').resumen[1].equipos, 1)
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
