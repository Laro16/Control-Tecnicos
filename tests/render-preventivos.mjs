// Uso: node tests/render-preventivos.mjs <módulo canvas> <directorio existente> [Excel diario]
import XLSX from 'xlsx'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { catalogoDesdeMatriz, extraerOrdenesPreventivas, prepararAvance } from '../src/utils/preventivos.js'
import { datosImagenAvance, dibujarImagenPreventivos } from '../src/utils/preventivosImagen.js'
const { createCanvas } = await import(pathToFileURL(process.argv[2]).href)
const libro=XLSX.readFile('src/Mantenimientos.xlsx')
const catalogo=catalogoDesdeMatriz(XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]],{header:1,defval:''}))
let ordenes=[]
if(process.argv[4]) {
  const diario=XLSX.readFile(process.argv[4])
  const filas=XLSX.utils.sheet_to_json(diario.Sheets.GENERAL,{defval:''})
  ordenes=extraerOrdenesPreventivas(filas).ordenes
  assert.equal(ordenes.length,314)
  assert.equal(extraerOrdenesPreventivas([...filas,...filas]).ordenes.length,314)
  console.log('Excel real: 314 órdenes, repetirlo conserva 314.')
}
const avance=prepararAvance(catalogo,ordenes,2026,3,'2026-09-06')
const canvas=dibujarImagenPreventivos(createCanvas(1,1),datosImagenAvance(avance.resumen,{anio:2026,vuelta:3,semana:{inicio:'2026-08-31',fin:'2026-09-06'}}))
await writeFile(join(process.argv[3],'preventivos-avance.png'),await canvas.encode('png'))
console.log(`PNG: ${canvas.width} × ${canvas.height}`)
