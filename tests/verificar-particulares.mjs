// Lectura del reporte de referencia, sin modificarlo ni conectarse a Supabase.
// node tests/verificar-particulares.mjs <reporte.xls>
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx/xlsx.mjs'
import assert from 'node:assert/strict'
import { prepararParticularesExcel } from '../src/utils/particulares.js'
import { normalizarTextoGarantia } from '../src/utils/garantias.js'

const ruta = process.argv[2]
assert.ok(ruta, 'Indica el reporte que quieres comprobar')
const libro = XLSX.read(readFileSync(ruta), { type: 'buffer' })
const nombre = libro.SheetNames.find(n => normalizarTextoGarantia(n) === 'BASE COMPLETA') || libro.SheetNames[0]
const matriz = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, defval: '' })
const encabezado = matriz.findIndex(f => f.map(normalizarTextoGarantia).includes('ESTADO'))
assert.ok(encabezado >= 0, 'No se encontró el encabezado ESTADO')
const columnas = matriz[encabezado].map(normalizarTextoGarantia)
const filas = matriz.slice(encabezado + 1).map(f => Object.fromEntries(columnas.filter(Boolean).map(c => [c, f[columnas.indexOf(c)]])))
const resultado = prepararParticularesExcel(filas, ruta.split(/[\\/]/).pop())
assert.equal(new Set(resultado.fichas.map(f => f.correlativo)).size, resultado.fichas.length)
assert.ok(resultado.fichas.every(f => f.estado === 'Pendiente de pago' && f.fecha === null && f.archivos.length === 0))
console.log(JSON.stringify({ hoja: nombre, detectadas: resultado.detectadas, repetidas: resultado.repetidas, sinReferencia: resultado.sinReferencia, fichas: resultado.fichas.map(f => ({ referencia: f.correlativo, orden: f.orden, negocio: f.negocio, estadoInicial: f.estado, tieneDireccion: Boolean(f.direccion), tieneNit: Boolean(f.nit) })) }, null, 2))
