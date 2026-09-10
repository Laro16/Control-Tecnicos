import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx/xlsx.mjs'
import { ejemploExportacion } from './fixtures/exportacionesTecnicos.js'
import { crearLibroTecnicos, prepararInformeTecnicos, prepararGarantiasExportacion } from '../src/utils/exportacionesTecnicos.js'
import { crearPDFGarantias } from '../src/utils/pdfGarantias.js'

test('clasifica garantías como el panel y pone vencidas primero sin duplicarlas', () => {
  const { control } = ejemploExportacion()
  const filas = prepararGarantiasExportacion(control.garantias)
  assert.deepEqual(filas.map(f => f.estado), ['VENCIDA', 'NORMAL - REVISAR', 'VERIFICAR DATOS', 'VIGENTE'])
  assert.equal(filas.length, control.garantias.length)
  assert.equal(filas[0].ticket.TIPO, 'Normal')
  assert.equal(filas[1].origen, 'DESCRIPCIÓN INICIAL')
  assert.match(filas[1].accion, /No atender sin garantía/)
})

test('garantías usan N° ORDEN cuando N° REFERENCIA está vacío', () => {
  const datos = ejemploExportacion()
  datos.control.garantias[0].ticket['N° REFERENCIA'] = ''
  datos.control.garantias[0].ticket['N° ORDEN'] = 'ORD-009'
  const informe = prepararInformeTecnicos(datos)
  const fila = informe.hojas.find(hoja => hoja.nombre === 'Garantías').filas.find(actual => actual[1] === 'ORD-009')
  assert.ok(fila)
})

test('organiza toda la base sin perder filas, y distingue vistas de subconjuntos', () => {
  const datos = ejemploExportacion()
  const informe = prepararInformeTecnicos(datos)
  const hoja = nombre => informe.hojas.find(h => h.nombre === nombre)
  assert.equal(informe.hojas.length, 7)
  assert.equal(hoja('Base completa').filas.length, 8)
  assert.equal(hoja('Pendientes sin proceso').filas.length + hoja('En proceso').filas.length + hoja('Finalizados').filas.length, 8)
  assert.equal(hoja('Duplicados').filas.length, 2)
  assert.equal(hoja('Reincidencias').filas.length, 1)
  assert.equal(hoja('Garantías').filas.length, 4)
  assert.equal(hoja('Base completa').filas[7][1], '')
  assert.match(prepararInformeTecnicos({ ...datos, estadoHistorial: 'sin-configurar' }).notaHistorial, /incompleta/)
})

test('genera ocho pestañas con filtros, fórmulas, identificadores textuales y fechas', async () => {
  const informe = prepararInformeTecnicos(ejemploExportacion())
  const libro = await crearLibroTecnicos(informe)
  const bytes = await libro.xlsx.writeBuffer()
  const leido = new ExcelJS.Workbook()
  await leido.xlsx.load(bytes)
  assert.deepEqual(leido.worksheets.map(h => h.name), ['Resumen', 'Garantías', 'Pendientes sin proceso', 'En proceso', 'Finalizados', 'Duplicados', 'Reincidencias', 'Base completa'])
  const resumen = leido.getWorksheet('Resumen')
  assert.equal(resumen.getCell('B7').value.result, 8)
  assert.match(resumen.getCell('B7').value.formula, /COUNTA/)
  const garantias = leido.getWorksheet('Garantías')
  assert.equal(garantias.getCell('B6').value, '001234')
  assert.equal(garantias.getCell('F6').value, 'VENCIDA')
  assert.ok(garantias.getCell('J6').value instanceof Date)
  assert.ok(garantias.getCell('K6').value instanceof Date)
  assert.ok(garantias.getCell('L6').value instanceof Date)
  assert.ok(garantias.getCell('M6').value instanceof Date)
  assert.ok(garantias.getCell('O6').value.result < 0)
  assert.match(garantias.getCell('O6').value.formula, /M6-J6/)
  assert.ok(garantias.autoFilter)
  assert.equal(garantias.views[0].ySplit, 5)
  assert.equal(leido.getWorksheet('Base completa').getCell('E9').value, '=1+1')
  assert.equal(leido.getWorksheet('Base completa').getCell('L6').value, '0012345678')
  assert.equal(garantias.conditionalFormattings.length, 1)
})

test('las pestañas vacías no contienen filas falsas y los totales quedan en cero', async () => {
  const datos = ejemploExportacion()
  const informe = prepararInformeTecnicos({ ...datos, tickets: [], control: { garantias: [], duplicados: [], reincidencias: [] } })
  const libro = await crearLibroTecnicos(informe)
  assert.equal(libro.getWorksheet('Resumen').getCell('B7').result, 0)
  assert.equal(libro.getWorksheet('Garantías').getCell('A6').value, null)
  assert.throws(() => crearPDFGarantias([]), /No hay garantías/)
})

test('la base exportada conserva encabezados, fechas y origen de serie para volver a cargarla', async () => {
  const datos = ejemploExportacion()
  datos.tickets[0].TIEMPO_TRANSCURRIDO = null
  const informe = prepararInformeTecnicos(datos)
  assert.ok(informe.hojas.find(h => h.nombre === 'Base completa').filas[0][12] instanceof Date)
  assert.equal(informe.hojas.find(h => h.nombre === 'Base completa').filas[0][13], null)
  const libro = await crearLibroTecnicos(informe)
  const leido = XLSX.read(await libro.xlsx.writeBuffer(), { type: 'array' })
  const matriz = XLSX.utils.sheet_to_json(leido.Sheets['Base completa'], { header: 1, defval: '' })
  assert.equal(matriz[4][5], 'ESTADO')
  assert.equal(matriz[4][12], 'FECHA INGRESO')
  assert.equal(matriz[4][13], 'TIEMPO TRANSCURRIDO')
  assert.equal(matriz[4][14], 'FECHA REALIZADA')
  assert.equal(matriz[5][1], '001234')
  assert.equal(matriz[6][8], 'DESCRIPCIÓN INICIAL')
  const fecha = XLSX.SSF.parse_date_code(matriz[9][14])
  assert.deepEqual([fecha.y, fecha.m, fecha.d], [2026, 8, 1])
})

test('el PDF incluye los cuatro diagnósticos, fechas, series y el aviso Normal', () => {
  const datos = ejemploExportacion()
  const doc = crearPDFGarantias(datos.control.garantias, datos)
  const contenido = doc.output()
  assert.ok(doc.getNumberOfPages() >= 1)
  for (const palabra of ['001234', '002234', '003234', '004234', '1001011234', 'TIPO Normal', '01/01/2010']) {
    assert.ok(contenido.includes(palabra), `Falta ${palabra}`)
  }
  assert.ok(contenido.startsWith('%PDF-'))
})
