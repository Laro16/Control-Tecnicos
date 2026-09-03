// Comprobación opcional del PNG con una implementación de Canvas para Node.
// Uso: node tests/render-avance.mjs <ruta al módulo canvas> <carpeta temporal>
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { dibujarPaginaAvance, prepararPaginasAvance } from '../src/utils/avanceImagen.js'

const { createCanvas } = await import(pathToFileURL(process.argv[2]).href)
const salida = process.argv[3]
assert.ok(salida, 'Indica una carpeta temporal existente')
const tecnicos = ['ANA MARTÍNEZ', 'LUIS DE LEÓN', 'JORGE ORLANDO GÓMEZ CALITO NOMBRE EXTENSO DE PRUEBA']
const fechas = ['03/09/2026']
const matriz = Object.fromEntries(tecnicos.map((tecnico, i) => [tecnico, { [fechas[0]]: { count: i + 4 } }]))
const [pagina] = prepararPaginasAvance(fechas, tecnicos, matriz)
const canvas = dibujarPaginaAvance(createCanvas(1, 1), pagina, { periodo: 'Cierres del 03/09/2026', generado: '03/09/2026, 08:00' })
assert.equal(canvas.width, 1040)
const png = await canvas.encode('png')
assert.equal(png.subarray(1, 4).toString(), 'PNG')
await writeFile(join(salida, 'avance-prueba.png'), png)
console.log(`PNG verificado: ${canvas.width} × ${canvas.height}; total ${pagina.totalGeneral}`)
