import test from 'node:test'
import assert from 'node:assert/strict'
import { DOCS_PARTICULAR, buscarDocumento, descargarAdjunto } from '../src/utils/adjuntosParticulares.js'

test('particulares: factura del servicio tiene un espacio propio y los documentos cargados se reconocen', () => {
  assert.ok(DOCS_PARTICULAR.includes('Factura del servicio'))
  const archivos = [JSON.stringify({ tipoDoc: 'Recibo de caja', nombre: 'recibo original.pdf', url: 'https://ejemplo.test/123_recibo.pdf' })]
  assert.equal(buscarDocumento(archivos, 'Recibo de caja')?.nombre, 'recibo original.pdf')
  assert.equal(buscarDocumento(archivos, 'Factura del servicio'), null)
})

test('particulares: descarga el PDF con el nombre original, no con el nombre de Storage', async () => {
  let enlaceCreado
  let descargado = false
  const documento = {
    createElement: () => (enlaceCreado = { click() { descargado = true }, remove() {} }),
    body: { appendChild() {} },
  }
  const urls = { createObjectURL: () => 'blob:temporal', revokeObjectURL() {} }
  await descargarAdjunto(
    { url: 'https://ejemplo.test/123_recibo_original.pdf', nombre: 'recibo original.pdf' },
    { obtener: async () => ({ ok: true, blob: async () => new Blob(['pdf']) }), documento, urls, programar() {} },
  )
  assert.equal(enlaceCreado.download, 'recibo original.pdf')
  assert.equal(enlaceCreado.href, 'blob:temporal')
  assert.ok(descargado)
})
