// Prueba aislada: sólo localhost, archivos ficticios y Supabase en memoria.
// node tests/adjuntos-particulares-ui.mjs <playwright.mjs> <capturas> <chrome.exe>
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'

const { chromium } = await import(pathToFileURL(process.argv[2]).href)
const capturas = process.argv[3]
await mkdir(capturas, { recursive: true })
const pdf = new jsPDF()
pdf.setFontSize(22)
pdf.text('Recibo de caja - prueba', 20, 30)
pdf.setFontSize(13)
pdf.text('Servicio particular P1-PRUEBA', 20, 48)
pdf.text('Documento ficticio para verificar la vista previa.', 20, 63)
const bytesPdf = Buffer.from(pdf.output('arraybuffer'))
const bytesPng = await readFile('public/icons/ticket-manager-512.png')
const nombreFoto = 'Fotografía del servicio particular - evidencia del equipo.png'
const fixture = {
  id: 'particular-prueba', tipo: 'Particular', titulo: 'Servicio particular P1-PRUEBA',
  correlativo: 'P1-PRUEBA', orden: 'ORD-PRUEBA', negocio: 'Negocio ficticio', nit: '',
  direccion: 'Dirección ficticia de la evidencia', descripcion: 'Documentos de prueba sin datos reales.',
  estado: 'Pendiente de pago', prioridad: 'Media', fecha: null, created_at: '2026-10-30T14:00:00Z',
  archivos: [
    JSON.stringify({ tipoDoc: 'Recibo de caja', nombre: 'Recibo original.pdf', url: '/evidencias/recibo.pdf?token=ficticio' }),
    JSON.stringify({ tipoDoc: 'Orden de servicio fisica', nombre: nombreFoto, url: '/evidencias/foto.png' }),
    JSON.stringify({ tipoDoc: 'Cotizacion', nombre: 'Cotización original.docx', url: '/evidencias/cotizacion.docx' }),
  ],
}
const backend = `
const fixture = ${JSON.stringify(fixture)};
export const supabase = {
  from(tabla) {
    if (tabla !== 'pendientes') throw new Error('Tabla inesperada: ' + tabla);
    return { select(){ return this }, order(){ return this }, async range(){ return {data:[fixture],error:null} } };
  },
  storage:{from(){throw new Error('No deben realizarse escrituras en Storage durante esta prueba')}},
};
`
const entrada = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import Gestion from './src/components/Gestion.jsx';
createRoot(document.getElementById('root')).render(
  <div className="app-layout" style={{display:'block'}}><main className="app-main mx-auto max-w-6xl p-4"><Gestion vista="Particular"/></main></div>
);
`
const compilado = await build({
  stdin: { contents: entrada, resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, write: false, outdir: 'prueba-en-memoria', jsx: 'automatic', format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'supabase-ficticio', setup(api) {
    api.onLoad({ filter: /supabase\.jsx$/ }, () => ({ contents: backend, loader: 'js' }))
  } }],
})
const js = compilado.outputFiles.find(f => f.path.endsWith('.js')).text
const cssNombre = (await readFile('dist/index.html', 'utf8')).match(/href="\/assets\/([^" ]+\.css)"/)[1]
const css = `${await readFile(join('dist/assets', cssNombre), 'utf8')}\n${await readFile('src/responsive.css', 'utf8')}`
let fallarPdf = false, retenerPdf = false
const respuestasLentas = []
const server = createServer((req, res) => {
  const ruta = new URL(req.url, 'http://127.0.0.1').pathname
  if (ruta === '/test.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(js); return }
  if (ruta === '/test.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return }
  if (ruta === '/evidencias/recibo.pdf') {
    if (fallarPdf) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Fallo de prueba'); return }
    const responder = () => {
      if (res.destroyed || res.writableEnded) return
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Disposition', 'attachment; filename="nombre-del-servidor.pdf"')
      res.end(bytesPdf)
    }
    if (retenerPdf) respuestasLentas.push(responder)
    else responder()
    return
  }
  if (ruta === '/evidencias/foto.png') { res.setHeader('Content-Type', 'image/png'); res.end(bytesPng); return }
  if (ruta === '/evidencias/cotizacion.docx') { res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); res.end('Documento de prueba'); return }
  res.setHeader('Content-Type', 'text/html')
  res.end('<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"></head><body><div id="root"></div><script src="/test.js"></script></body></html>')
})

let browser
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  browser = await chromium.launch({ headless: true, executablePath: process.argv[4] })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  const errores = [], descargas = [], fallosRed = []
  page.on('pageerror', error => errores.push(error.message))
  page.on('download', archivo => descargas.push(archivo))
  page.on('requestfailed', solicitud => fallosRed.push({ url: solicitud.url(), fallo: solicitud.failure()?.errorText }))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    const local = url.protocol === 'http:' && url.hostname === '127.0.0.1'
    const visorNativo = url.protocol === 'chrome-extension:' && url.hostname === 'mhjfbmdgcfjbbpaeojofohoefgiehjai'
    const recursoChrome = url.protocol === 'chrome:' && url.hostname === 'resources'
    return local || visorNativo || recursoChrome || ['blob:', 'data:'].includes(url.protocol) ? route.continue() : route.abort()
  })
  await page.addInitScript(() => {
    const crear = URL.createObjectURL.bind(URL), revocar = URL.revokeObjectURL.bind(URL), obtener = window.fetch.bind(window)
    window.__adjuntosPrueba = { creadas: [], revocadas: [], solicitudesActivas: 0 }
    URL.createObjectURL = blob => {
      const url = crear(blob)
      window.__adjuntosPrueba.creadas.push({ url, type: blob.type })
      return url
    }
    URL.revokeObjectURL = url => { window.__adjuntosPrueba.revocadas.push(url); return revocar(url) }
    window.fetch = async (...args) => {
      window.__adjuntosPrueba.solicitudesActivas++
      try { return await obtener(...args) }
      finally { window.__adjuntosPrueba.solicitudesActivas-- }
    }
  })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.getByRole('heading', { name: fixture.titulo, exact: true }).waitFor()
  const ficha = page.locator('article').first()
  const vista = () => page.getByRole('dialog', { name: /^Vista previa de / })
  const verificarAncho = async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No debe existir desbordamiento horizontal')
    if (await vista().count()) assert.equal(await vista().evaluate(el => el.scrollWidth <= el.clientWidth), true, 'El visor no debe desbordarse horizontalmente')
  }
  const cerrarVista = async () => {
    await vista().getByRole('button', { name: 'Cerrar vista previa', exact: true }).click()
    await vista().waitFor({ state: 'detached' })
  }
  const verificarSinBlobs = async () => {
    await page.waitForFunction(() => window.__adjuntosPrueba.creadas.every(c => window.__adjuntosPrueba.revocadas.includes(c.url)))
  }

  // El enlace original exige descarga, pero el visor usa un PDF Blob inline.
  await ficha.getByRole('button', { name: 'Ver Recibo original.pdf', exact: true }).click()
  const marco = vista().getByTitle('PDF: Recibo original.pdf', { exact: true })
  await marco.waitFor()
  const urlPdf = await marco.getAttribute('src')
  assert.match(urlPdf, /^blob:/)
  assert.equal(await page.evaluate(async url => (await (await fetch(url.split('#')[0])).blob()).type, urlPdf), 'application/pdf')
  assert.equal(descargas.length, 0)
  await page.waitForTimeout(2500)
  let pluginPdf
  for (const cuadro of page.frames()) {
    if (await cuadro.locator('embed[type="application/x-google-chrome-pdf"]').count()) pluginPdf = cuadro
  }
  assert.ok(pluginPdf, 'El visor PDF nativo debe inicializarse, no basta con crear un iframe')
  await pluginPdf.waitForFunction(() => {
    const pagina = document.querySelector('#sizer')
    return pagina && pagina.getBoundingClientRect().width > 0 && pagina.getBoundingClientRect().height > 0
  }, null, { timeout: 15000 })
  assert.deepEqual(fallosRed, [], 'No deben bloquearse recursos internos del visor PDF')
  await verificarAncho()
  await page.screenshot({ path: join(capturas, 'particulares-vista-pdf-movil.png') })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await verificarAncho()
  await page.screenshot({ path: join(capturas, 'particulares-vista-pdf-pc.png') })
  await cerrarVista()
  await verificarSinBlobs()

  // La foto se muestra dentro de la app, sin descargarla ni perder su nombre.
  await page.setViewportSize({ width: 390, height: 844 })
  await ficha.getByRole('button', { name: `Ver ${nombreFoto}`, exact: true }).click()
  const imagen = vista().getByRole('img', { name: `Vista previa de ${nombreFoto}`, exact: true })
  await imagen.waitFor()
  await page.waitForFunction(() => document.querySelector('.attachment-preview-panel img')?.naturalWidth > 0)
  assert.match(await imagen.getAttribute('src'), /^blob:/)
  await verificarAncho()
  await page.screenshot({ path: join(capturas, 'particulares-vista-foto-movil.png') })
  await cerrarVista()
  await verificarSinBlobs()

  // El formulario mantiene sus datos y foco al cerrar una vista previa anidada.
  await ficha.getByRole('button', { name: 'Editar', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Editar servicio particular', exact: true })
  await editor.waitFor()
  await editor.getByRole('button', { name: 'Ver Recibo de caja', exact: true }).click()
  await vista().getByTitle('PDF: Recibo original.pdf', { exact: true }).waitFor()
  assert.equal(await page.getByRole('dialog').count(), 2)
  await vista().getByRole('button', { name: 'Cerrar vista previa', exact: true }).focus()
  await page.keyboard.press('Escape')
  await vista().waitFor({ state: 'detached' })
  assert.equal(await editor.count(), 1)
  assert.equal(await editor.locator('input').first().inputValue(), fixture.titulo)
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Ver Recibo de caja')
  await editor.getByRole('button', { name: 'Ver Orden de servicio fisica', exact: true }).click()
  await vista().getByRole('img', { name: `Vista previa de ${nombreFoto}`, exact: true }).waitFor()
  await cerrarVista()
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await verificarSinBlobs()

  // Un fallo de lectura se explica y se puede reintentar sin cerrar el visor.
  fallarPdf = true
  await ficha.getByRole('button', { name: 'Ver Recibo original.pdf', exact: true }).click()
  await vista().getByRole('alert').filter({ hasText: 'HTTP 403' }).waitFor()
  assert.equal(await vista().locator('iframe').count(), 0)
  fallarPdf = false
  await vista().getByRole('button', { name: 'Reintentar vista previa', exact: true }).click()
  await vista().getByTitle('PDF: Recibo original.pdf', { exact: true }).waitFor()
  await cerrarVista()
  await verificarSinBlobs()

  // Cerrar mientras llega la respuesta no crea URLs huérfanas ni reabre el visor.
  retenerPdf = true
  const cantidadAntes = await page.evaluate(() => window.__adjuntosPrueba.creadas.length)
  const solicitud = page.waitForRequest(req => req.url().includes('/evidencias/recibo.pdf'))
  await ficha.getByRole('button', { name: 'Ver Recibo original.pdf', exact: true }).click()
  await solicitud
  await vista().getByRole('status').filter({ hasText: 'Cargando vista previa' }).waitFor()
  await cerrarVista()
  retenerPdf = false
  for (const responder of respuestasLentas.splice(0)) responder()
  await page.waitForFunction(() => window.__adjuntosPrueba.solicitudesActivas === 0)
  assert.equal(await page.evaluate(() => window.__adjuntosPrueba.creadas.length), cantidadAntes)
  await verificarSinBlobs()

  // Office no se incrusta y no genera un Blob para el iframe.
  await ficha.getByRole('button', { name: 'Ver Cotización original.docx', exact: true }).click()
  await vista().getByText(/Este formato no tiene vista previa/).waitFor()
  assert.equal(await vista().locator('iframe,img').count(), 0)
  await vista().getByRole('button', { name: 'Descargar', exact: true }).waitFor()
  await cerrarVista()
  await verificarSinBlobs()

  // La descarga opcional sigue respetando el nombre original y sólo ocurre al pedirla.
  assert.equal(descargas.length, 0)
  await ficha.getByRole('button', { name: 'Ver Recibo original.pdf', exact: true }).click()
  await vista().getByTitle('PDF: Recibo original.pdf', { exact: true }).waitFor()
  const descarga = page.waitForEvent('download')
  await vista().getByRole('button', { name: 'Descargar', exact: true }).click()
  assert.equal((await descarga).suggestedFilename(), 'Recibo original.pdf')
  assert.equal(descargas.length, 1)
  await cerrarVista()
  assert.deepEqual(errores, [])
  console.log('UI Particulares: PDF/fotos inline, ficha/editor, móvil/PC, foco, errores/reintento, abortos, limpieza Blob y descarga opcional verificados sin Supabase real.')
} finally {
  for (const responder of respuestasLentas.splice(0)) responder()
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
