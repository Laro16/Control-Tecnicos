import test from 'node:test'
import assert from 'node:assert/strict'
import { DOCS_PARTICULAR, buscarDocumento, descargarAdjunto, tipoVistaPreviaAdjunto, cargarVistaPreviaAdjunto } from '../src/utils/adjuntosParticulares.js'

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

test('particulares: vista previa reconoce PDF y fotos antiguos sin cambiar los adjuntos guardados', () => {
  for (const extension of ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico']) {
    const archivo = { nombre: `Factura original.${extension.toUpperCase()}`, url: 'https://ejemplo.test/descarga' }
    assert.equal(tipoVistaPreviaAdjunto(archivo), 'imagen', extension)
  }
  const original = { tipoDoc: 'Recibo de caja', nombre: 'Recibo original.PDF', url: 'https://ejemplo.test/123_recibo.pdf' }
  const serializado = JSON.stringify(original)
  assert.equal(tipoVistaPreviaAdjunto(original), 'pdf')
  assert.equal(tipoVistaPreviaAdjunto(serializado), 'pdf')
  assert.equal(JSON.stringify(original), serializado)
})

test('particulares: una URL firmada permite vista previa aunque no exista nombre o extensión del nombre', () => {
  assert.equal(tipoVistaPreviaAdjunto({ url: 'https://ejemplo.test/carpeta/RECIBO.PDF?token=123&download=recibo.docx#pagina' }), 'pdf')
  assert.equal(tipoVistaPreviaAdjunto({ nombre: 'Recibo de caja', url: 'https://ejemplo.test/carpeta/foto.png?token=123#vista' }), 'imagen')
  assert.equal(tipoVistaPreviaAdjunto({ nombre: '', url: 'https://ejemplo.test/foto.JPEG?x=.docx' }), 'imagen')
  assert.equal(tipoVistaPreviaAdjunto({ nombre: 'documento.docx', url: 'https://ejemplo.test/foto.png' }), null)
  assert.equal(tipoVistaPreviaAdjunto({ url: 'https://ejemplo.test/documento?nombre=foto.png' }), null)
  for (const archivo of [null, undefined, '', 'JSON inválido', {}, { nombre: 'Sin extensión', url: 'URL inválida' }]) {
    assert.equal(tipoVistaPreviaAdjunto(archivo), null)
  }
})

test('particulares: MIME conocido prevalece y no se incrustan HTML, SVG ni documentos Office', () => {
  const pdf = { nombre: 'archivo.pdf', url: 'https://ejemplo.test/archivo.pdf' }
  assert.equal(tipoVistaPreviaAdjunto(pdf, 'application/pdf'), 'pdf')
  assert.equal(tipoVistaPreviaAdjunto(pdf, 'image/png'), 'imagen')
  assert.equal(tipoVistaPreviaAdjunto(pdf, 'application/octet-stream'), 'pdf')
  for (const mime of ['text/html', 'image/svg+xml', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip']) {
    assert.equal(tipoVistaPreviaAdjunto(pdf, mime), null, mime)
  }
  for (const extension of ['html', 'htm', 'svg', 'doc', 'docx', 'xls', 'xlsx', 'zip']) {
    assert.equal(tipoVistaPreviaAdjunto({ nombre: `evidencia.${extension}`, url: `https://ejemplo.test/evidencia.${extension}` }), null, extension)
  }
})

test('particulares: carga PDF con el MIME inline correcto, pasa la señal y conserva los bytes', async () => {
  const archivo = JSON.stringify({ nombre: 'Recibo original.pdf', url: 'https://ejemplo.test/123_recibo.pdf' })
  const controlador = new AbortController()
  let consulta
  const contenido = '%PDF-1.4\nDocumento de prueba'
  const resultado = await cargarVistaPreviaAdjunto(archivo, {
    signal: controlador.signal,
    obtener: async (...argumentos) => {
      consulta = argumentos
      return { ok: true, blob: async () => new Blob([contenido], { type: 'application/octet-stream' }) }
    },
  })
  assert.equal(consulta[0], 'https://ejemplo.test/123_recibo.pdf')
  assert.equal(consulta[1].signal, controlador.signal)
  assert.equal(resultado.tipo, 'pdf')
  assert.equal(resultado.blob.type, 'application/pdf')
  assert.equal(await resultado.blob.text(), contenido)
})

test('particulares: carga fotos binarias sin MIME usando la extensión o respeta un MIME permitido', async () => {
  const jpg = await cargarVistaPreviaAdjunto({ nombre: 'foto.JPG', url: 'https://ejemplo.test/foto' }, {
    obtener: async () => ({ ok: true, blob: async () => new Blob(['imagen'], { type: 'application/octet-stream' }) }),
  })
  assert.equal(jpg.tipo, 'imagen')
  assert.equal(jpg.blob.type, 'image/jpeg')
  assert.equal(await jpg.blob.text(), 'imagen')
  const contenido = new Blob(['imagen'], { type: 'image/webp' })
  const webp = await cargarVistaPreviaAdjunto({ url: 'https://ejemplo.test/foto' }, {
    obtener: async () => ({ ok: true, blob: async () => contenido }),
  })
  assert.equal(webp.tipo, 'imagen')
  assert.equal(webp.blob.type, 'image/webp')
  assert.equal(await webp.blob.text(), 'imagen')
})

test('particulares: formatos no compatibles no generan un Blob para incrustar', async () => {
  for (const [nombre, mime] of [['archivo.pdf', 'text/html'], ['archivo.svg', 'image/svg+xml'], ['archivo.docx', 'application/octet-stream']]) {
    const resultado = await cargarVistaPreviaAdjunto({ nombre, url: `https://ejemplo.test/${nombre}` }, {
      obtener: async () => ({ ok: true, blob: async () => new Blob(['contenido'], { type: mime }) }),
    })
    assert.deepEqual(resultado, { tipo: null, blob: null })
  }
})

test('particulares: una descarga fallida o cancelada no se presenta como vista previa lista', async () => {
  const archivo = { nombre: 'archivo.pdf', url: 'https://ejemplo.test/archivo.pdf' }
  let leyoBlob = false
  await assert.rejects(cargarVistaPreviaAdjunto(archivo, {
    obtener: async () => ({ ok: false, status: 403, blob: async () => { leyoBlob = true } }),
  }))
  assert.equal(leyoBlob, false)
  const errorRed = new TypeError('Conexión no disponible')
  await assert.rejects(cargarVistaPreviaAdjunto(archivo, { obtener: async () => { throw errorRed } }), errorRed)
  const controlador = new AbortController()
  controlador.abort()
  await assert.rejects(cargarVistaPreviaAdjunto(archivo, {
    signal: controlador.signal,
    obtener: async (_url, { signal }) => { signal.throwIfAborted() },
  }), { name: 'AbortError' })
})
