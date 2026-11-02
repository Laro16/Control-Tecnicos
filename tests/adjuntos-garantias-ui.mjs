// Sólo localhost, respaldos ficticios y Supabase en memoria. No elimina Storage real.
// node tests/adjuntos-garantias-ui.mjs <playwright.mjs> <capturas> <chrome.exe>
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'

const { chromium } = await import(pathToFileURL(process.argv[2]).href)
await mkdir(process.argv[3], { recursive: true })
const pdf = new jsPDF()
pdf.setFontSize(22); pdf.text('Respaldo de garantia - prueba', 20, 30)
pdf.setFontSize(13); pdf.text('Expediente GAR-PRUEBA', 20, 48)
pdf.text('Autorizacion ficticia. Sin documentos de clientes.', 20, 63)
const bytesPdf = Buffer.from(pdf.output('arraybuffer'))
const bytesPng = await readFile('public/icons/ticket-manager-512.png')
const nombrePdf = 'Autorización original.pdf', nombreFoto = 'Fotografía original.png'
const fixture = { id: 1, referencia: 'GAR-PRUEBA', serie: '2505105909', cliente: 'Cliente ficticio', motivo: 'Despacho', estado: 'En revisión', fecha_vencimiento: '2027-09-30', explicacion: 'Respaldo de garantía de prueba.', autorizado_por: 'Administrador ficticio', datos_ticket: { numero_orden: 'ORD-PRUEBA', negocio: 'Negocio ficticio' }, revision: 1, archivos: [{ nombre: nombrePdf, path: 'uuid/autorizacion.pdf' }, { nombre: nombreFoto, path: 'uuid/foto.png' }] }
const backend = `
const copiar = dato => JSON.parse(JSON.stringify(dato));
let registro=${JSON.stringify(fixture)}, revisiones=[{id:1,expediente_id:1,registrado_en:'2026-10-30T14:00:00Z',datos:copiar(${JSON.stringify(fixture)})}], firmas=[],fallarFirma=false,guardados=0,subidas=0,eliminaciones=0;
window.__garantiasPrueba={snapshot:()=>copiar({registro,revisiones,firmas,guardados,subidas,eliminaciones}),fallarFirma:v=>{fallarFirma=v},obsoleta:()=>{registro.revision++;registro.explicacion='Cambio remoto protegido'}};
export const supabase={
from(tabla){let datos;if(tabla==='garantias_expedientes')datos=[registro];else if(tabla==='garantias_expedientes_revisiones')datos=revisiones;else throw new Error('Tabla inesperada '+tabla);return {select(){return this},order(){return this},eq(c,v){datos=datos.filter(d=>d[c]===v);return this},async range(i,f){return {data:copiar(datos.slice(i,f+1)),error:null}}}},
async rpc(nombre,p){if(nombre!=='guardar_expediente_garantia')throw new Error('RPC inesperada '+nombre);if(p.p_revision!==registro.revision)return {data:null,error:{message:'El expediente cambió o ya existe. Recarga antes de guardar.'}};if(p.p_datos.estado==='Autorizado'&&!p.p_datos.archivos.length)return {data:null,error:{message:'Falta respaldo o responsable.'}};registro={...copiar(p.p_datos),id:registro.id,revision:registro.revision+1};guardados++;revisiones.push({id:revisiones.length+1,expediente_id:1,registrado_en:'2026-10-30T15:00:00Z',datos:copiar(registro)});return {data:copiar(registro),error:null}},
storage:{from(bucket){if(bucket!=='respaldos-garantia')throw new Error('Bucket inesperado '+bucket);return {async createSignedUrl(path,ttl){firmas.push({path,ttl});if(fallarFirma)return {data:null,error:{message:'Firma de prueba falló'}};return {data:{signedUrl:location.origin+'/firmados/'+encodeURIComponent(path)+'?firma='+firmas.length},error:null}},async upload(path){subidas++;return {data:{path},error:null}},async remove(){eliminaciones++;throw new Error('No se debe borrar Storage')}}}}
};`
const entrada = `import React from'react';import{createRoot}from'react-dom/client';import Modulo from'./src/components/ExpedientesGarantia.jsx';createRoot(document.getElementById('root')).render(<div className="app-layout" style={{display:'block'}}><main className="app-main mx-auto max-w-6xl p-4"><Modulo datos={{porSerie:{},reintentar(){}}}/></main></div>);`
const compilado = await build({ stdin: { contents: entrada, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, outdir: 'prueba-en-memoria', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'supabase-ficticio', setup(api) { api.onLoad({ filter: /supabase\.jsx$/ }, () => ({ contents: backend, loader: 'js' })) } }] })
const js = compilado.outputFiles.find(f => f.path.endsWith('.js')).text
const cssNombre = (await readFile('dist/index.html', 'utf8')).match(/href="\/assets\/([^" ]+\.css)"/)[1]
const css = `${await readFile(join('dist/assets', cssNombre), 'utf8')}\n${await readFile('src/responsive.css', 'utf8')}`
const server = createServer((req, res) => {
  const ruta = new URL(req.url, 'http://127.0.0.1').pathname
  if (ruta === '/test.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(js); return }
  if (ruta === '/test.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return }
  if (ruta.startsWith('/firmados/')) { const path = decodeURIComponent(ruta.slice('/firmados/'.length)); res.setHeader('Content-Type', path.endsWith('.pdf') ? 'application/octet-stream' : 'image/png'); res.setHeader('Content-Disposition', 'attachment; filename="servidor.pdf"'); res.end(path.endsWith('.pdf') ? bytesPdf : bytesPng); return }
  res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"></head><body><div id="root"></div><script src="/test.js"></script></body></html>')
})
let browser
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  browser = await chromium.launch({ headless: true, executablePath: process.argv[4] })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  const errores = [], descargas = []
  page.on('pageerror', e => errores.push(e.message)); page.on('download', d => descargas.push(d))
  await page.route('**/*', route => { const url = new URL(route.request().url()); const permitido = url.protocol === 'http:' && url.hostname === '127.0.0.1' || url.protocol === 'chrome-extension:' && url.hostname === 'mhjfbmdgcfjbbpaeojofohoefgiehjai' || url.protocol === 'chrome:' && url.hostname === 'resources' || ['blob:', 'data:'].includes(url.protocol); return permitido ? route.continue() : route.abort() })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const ficha = page.locator('article').first(), editor = () => page.getByRole('dialog', { name: 'Expediente de garantía', exact: true }), vista = () => page.getByRole('dialog', { name: /^Vista previa de / })
  const snapshot = () => page.evaluate(() => window.__garantiasPrueba.snapshot())
  const abrirEditor = async () => { await ficha.getByRole('button', { name: 'Abrir / subir respaldo', exact: true }).click(); await editor().waitFor() }
  const cerrarVista = async () => { await vista().getByRole('button', { name: 'Cerrar vista previa', exact: true }).click(); await vista().waitFor({ state: 'detached' }) }
  const confirmarQuitar = async nombre => { page.once('dialog', d => d.accept()); await editor().getByRole('button', { name: `Quitar ${nombre}`, exact: true }).click() }
  const guardar = async () => { await editor().getByRole('button', { name: 'Guardar expediente', exact: true }).click() }
  const ancho = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await ficha.waitFor()
  await ficha.getByRole('button', { name: `Ver ${nombrePdf}`, exact: true }).click()
  await vista().getByTitle(`PDF: ${nombrePdf}`, { exact: true }).waitFor()
  await page.waitForTimeout(2500)
  let plugin
  for (const frame of page.frames()) if (await frame.locator('embed[type="application/x-google-chrome-pdf"]').count()) plugin = frame
  assert.ok(plugin, 'Debe inicializarse el visor PDF, no basta el iframe')
  await plugin.waitForFunction(() => { const p = document.querySelector('#sizer'); return p && p.getBoundingClientRect().width > 0 && p.getBoundingClientRect().height > 0 }, null, { timeout: 15000 })
  await ancho(); await page.screenshot({ path: join(process.argv[3], 'garantias-vista-pdf-movil.png') })
  await page.setViewportSize({ width: 1440, height: 1000 }); await ancho(); await page.screenshot({ path: join(process.argv[3], 'garantias-vista-pdf-pc.png') })
  assert.equal(descargas.length, 0)
  await cerrarVista()
  await page.setViewportSize({ width: 390, height: 844 })
  await ficha.getByRole('button', { name: `Ver ${nombreFoto}`, exact: true }).click()
  await vista().getByRole('img', { name: `Vista previa de ${nombreFoto}`, exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('.attachment-preview-panel img')?.naturalWidth > 0)
  await ancho(); await page.screenshot({ path: join(process.argv[3], 'garantias-vista-foto-movil.png') }); await cerrarVista()

  // Confirmación cancelada y Cancelar editor no alteran la ficha ni Storage.
  await abrirEditor()
  const quitarPdf = editor().getByRole('button', { name: `Quitar ${nombrePdf}`, exact: true })
  await quitarPdf.scrollIntoViewIfNeeded()
  await ancho()
  assert.equal(await quitarPdf.evaluate(boton => { const fila = boton.parentElement; return fila.scrollWidth <= fila.clientWidth }), true, 'La fila Ver/Quitar no debe desbordarse en móvil')
  await page.screenshot({ path: join(process.argv[3], 'garantias-editor-adjuntos-movil.png') })
  page.once('dialog', d => d.dismiss()); await editor().getByRole('button', { name: `Quitar ${nombreFoto}`, exact: true }).click()
  assert.equal(await editor().getByRole('button', { name: `Ver ${nombreFoto}`, exact: true }).count(), 1)
  await confirmarQuitar(nombreFoto)
  assert.equal(await editor().getByRole('button', { name: `Ver ${nombreFoto}`, exact: true }).count(), 0)
  await editor().getByRole('button', { name: 'Cancelar', exact: true }).click()
  assert.equal((await snapshot()).registro.archivos.length, 2)
  assert.equal(await ficha.getByRole('button', { name: `Ver ${nombreFoto}`, exact: true }).count(), 1)

  // Guardar quita sólo la referencia actual; la revisión anterior permanece consultable.
  await abrirEditor(); await confirmarQuitar(nombreFoto); await guardar(); await editor().waitFor({ state: 'detached' })
  await page.waitForFunction(() => window.__garantiasPrueba.snapshot().registro.archivos.length === 1)
  assert.equal((await snapshot()).eliminaciones, 0)
  await abrirEditor(); await editor().getByRole('button', { name: 'Consultar revisiones de esta ficha', exact: true }).click()
  await editor().getByRole('button', { name: `Ver ${nombreFoto}`, exact: true }).waitFor()
  assert.equal(await editor().getByRole('button', { name: `Quitar ${nombreFoto}`, exact: true }).count(), 0)
  await editor().getByRole('button', { name: `Ver ${nombreFoto}`, exact: true }).click(); await vista().getByRole('img', { name: `Vista previa de ${nombreFoto}`, exact: true }).waitFor(); await cerrarVista()
  await editor().getByRole('button', { name: `Ver ${nombrePdf}`, exact: true }).last().click(); await vista().getByTitle(`PDF: ${nombrePdf}`, { exact: true }).waitFor(); await cerrarVista()
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), `Ver ${nombrePdf}`)
  await editor().getByRole('button', { name: 'Cancelar', exact: true }).click()

  // La autorización no pierde su último respaldo: se bloquea hasta subir reemplazo.
  await abrirEditor(); await editor().getByLabel(/^Estado/).selectOption('Autorizado'); await confirmarQuitar(nombrePdf); await guardar()
  await editor().getByRole('alert').filter({ hasText: /adjunta el respaldo|Falta respaldo/ }).waitFor()
  assert.equal((await snapshot()).registro.archivos.length, 1)
  await editor().locator('input[type="file"]').setInputFiles({ name: 'Respaldo corregido.pdf', mimeType: 'application/pdf', buffer: bytesPdf })
  await editor().getByRole('button', { name: 'Ver Respaldo corregido.pdf', exact: true }).waitFor()
  await guardar(); await editor().waitFor({ state: 'detached' })
  assert.equal((await snapshot()).registro.estado, 'Autorizado'); assert.equal((await snapshot()).registro.archivos[0].nombre, 'Respaldo corregido.pdf')

  // Una revisión desactualizada no confirma quitar ni sobrescribe cambios remotos.
  await abrirEditor(); await editor().getByLabel(/^Estado/).selectOption('En revisión'); await confirmarQuitar('Respaldo corregido.pdf')
  await page.evaluate(() => window.__garantiasPrueba.obsoleta()); const antes = await snapshot(); await guardar()
  await editor().getByRole('alert').filter({ hasText: 'Recarga antes de guardar' }).waitFor()
  assert.deepEqual((await snapshot()).registro, antes.registro)
  await editor().getByRole('button', { name: 'Cancelar', exact: true }).click()

  // Reintentar vuelve a firmar; descargar usa el nombre original, sin exponer el bucket.
  await page.evaluate(() => window.__garantiasPrueba.fallarFirma(true))
  await ficha.getByRole('button', { name: 'Ver Respaldo corregido.pdf', exact: true }).click(); await vista().getByRole('alert').filter({ hasText: 'Firma de prueba falló' }).waitFor()
  await page.evaluate(() => window.__garantiasPrueba.fallarFirma(false)); await vista().getByRole('button', { name: 'Reintentar vista previa', exact: true }).click()
  await vista().getByTitle('PDF: Respaldo corregido.pdf', { exact: true }).waitFor()
  const descarga = page.waitForEvent('download'); await vista().getByRole('button', { name: 'Descargar', exact: true }).click(); assert.equal((await descarga).suggestedFilename(), 'Respaldo corregido.pdf'); await cerrarVista()
  const final = await snapshot()
  assert.ok(final.firmas.every(f => f.ttl === 300)); assert.equal(final.eliminaciones, 0); assert.equal(final.subidas, 1); assert.equal(final.guardados, 2)
  assert.equal(final.revisiones[0].datos.archivos.length, 2); assert.deepEqual(errores, [])
  console.log('UI Garantías: PDF/fotos firmados, móvil/PC, quitar+cancelar/guardar, historial, autorización con respaldo, revisión obsoleta, reintento y descarga original verificados.')
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
