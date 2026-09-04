// Verificación de los archivos reales producidos por los exportadores de la app.
// node tests/verificar-exportaciones.mjs <directorio-temporal>
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { ejemploExportacion } from './fixtures/exportacionesTecnicos.js'
import { prepararInformeTecnicos, crearLibroTecnicos } from '../src/utils/exportacionesTecnicos.js'
import { crearPDFGarantias } from '../src/utils/pdfGarantias.js'

const salida = process.argv[2]
assert.ok(salida, 'Indica un directorio temporal existente')
const datos = ejemploExportacion()
const libro = await crearLibroTecnicos(prepararInformeTecnicos(datos))
await writeFile(join(salida, 'excel-prueba.xlsx'), await libro.xlsx.writeBuffer())
const pdf = crearPDFGarantias(datos.control.garantias, datos)
await writeFile(join(salida, 'garantias-prueba.pdf'), new Uint8Array(pdf.output('arraybuffer')))
const muchas = Array.from({ length: 48 }, (_, i) => ({
  ...datos.control.garantias[i % 4],
  ticket: { ...datos.control.garantias[i % 4].ticket, 'N° REFERENCIA': `PRUEBA-${String(i + 1).padStart(3, '0')}`, CLIENTE: 'CLIENTE DE PRUEBA CON NOMBRE LARGO PARA VERIFICAR LA DISTRIBUCIÓN', 'DESCRIPCIÓN INICIAL': `${datos.control.garantias[i % 4].ticket['DESCRIPCIÓN INICIAL']} ${'Equipo no enfría correctamente. Revisar compresor y termostato. '.repeat(5)}` },
}))
const extenso = crearPDFGarantias(muchas, datos)
await writeFile(join(salida, 'garantias-extenso.pdf'), new Uint8Array(extenso.output('arraybuffer')))
console.log(JSON.stringify({ hojas: libro.worksheets.length, paginas: pdf.getNumberOfPages(), paginasExtenso: extenso.getNumberOfPages() }))
