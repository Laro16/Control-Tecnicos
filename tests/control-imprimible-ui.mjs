// Integración local: datos ficticios y Supabase simulado; no modifica servicios reales.
// Uso: node tests/control-imprimible-ui.mjs <playwright/index.mjs> <capturas> [chrome.exe]
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import { catalogoDesdeMatriz } from '../src/utils/preventivos.js'

const { chromium } = await import(pathToFileURL(process.argv[2]).href)
const capturas = process.argv[3]
await mkdir(capturas, { recursive: true })
const libro = XLSX.readFile('src/Mantenimientos.xlsx')
const catalogo = catalogoDesdeMatriz(XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames.find(n => n !== 'Mexico')], { header: 1, defval: '' }))
const local413 = catalogo.find(l => l.marca === 'GRANJERO' && l.codigo === '413')
const local393 = catalogo.find(l => l.marca === 'GRANJERO' && l.codigo === '393')
assert.ok(local413?.activo && local393?.activo, 'Los puntos usados por la prueba existen en el calendario')
const locales = catalogo.map(l => ({ ...l, activo_calendario: l.activo, activo_manual: null, revision_estado: 0, revision_catalogo: 0, origen_manual: false }))
const ordenes = [
  { numero_orden: 'PRUEBA-413-A', marca: 'GRANJERO', codigo: '413', fecha_realizada: '2026-10-07', tecnico: 'Técnico de prueba', negocio: local413.nombre, estado: 'Asignada a Técnico' },
  { numero_orden: 'PRUEBA-413-B', marca: 'GRANJERO', codigo: '413', fecha_realizada: '2026-10-08', tecnico: 'Técnico de prueba', negocio: local413.nombre, estado: 'En Proceso' },
  { numero_orden: 'PRUEBA-644', marca: 'CAMPERO', codigo: '644', fecha_realizada: '2026-10-16', tecnico: 'Otro técnico', negocio: 'CAMPERO 644', estado: 'Orden Finalizada' },
]
const backend = `
const usuario='00000000-0000-0000-0000-000000000002';
const copiar=d=>JSON.parse(JSON.stringify(d));
const leer=(clave,inicial)=>JSON.parse(sessionStorage.getItem(clave)||JSON.stringify(inicial));
let ordenes=leer('control:ordenes',${JSON.stringify(ordenes)}),declaraciones=leer('control:declaraciones',[]),resaltados=leer('control:resaltados',[]);
const locales=${JSON.stringify(locales)};
const guardar=()=>{for(const[k,v]of Object.entries({ordenes,declaraciones,resaltados}))sessionStorage.setItem('control:'+k,JSON.stringify(v))};
export function snapshot(){return copiar({ordenes,declaraciones,resaltados})}
function query(datos){return{select(){return this},order(){return this},eq(){return this},ilike(){return this},limit(){return this},async maybeSingle(){return{data:copiar(datos[0]||null),error:null}},async range(i,f){return{data:copiar(datos.slice(i,f+1)),error:null}},then(resolve,reject){return Promise.resolve({data:copiar(datos),error:null}).then(resolve,reject)}}}
export const supabase={auth:{async getSession(){return{data:{session:{user:{id:usuario,email:'tecnico@example.test'}}}}}},from(tabla){
if(tabla==='preventivos_ordenes')return query(ordenes);
if(tabla==='preventivos_realizados')return query(declaraciones);
if(tabla==='preventivos_resaltados')return query(resaltados);
if(tabla==='preventivos_locales')return query(locales);
if(['preventivos_cierres_historial','preventivos_ordenes_exclusiones','preventivos_exclusiones_historial'].includes(tabla))return query([]);
throw Error('Tabla inesperada: '+tabla)},rpc(nombre,p){
if(nombre==='consultar_ordenes_preventivos')return query(ordenes);
if(nombre==='sincronizar_catalogo_preventivos')return Promise.resolve({data:null,error:null});
if(nombre==='guardar_resaltado_preventivo'){
const anterior=resaltados.find(r=>r.marca===p.p_marca&&r.codigo===p.p_codigo&&r.anio===p.p_anio&&r.mes===p.p_mes);
if((anterior?.revision||0)!==p.p_revision)return Promise.resolve({data:null,error:{message:'Revisión de color desactualizada'}});
const data={marca:p.p_marca,codigo:p.p_codigo,anio:p.p_anio,mes:p.p_mes,modo:p.p_modo,revision:p.p_revision+1};
resaltados=resaltados.filter(r=>r!==anterior);resaltados.push(data);guardar();return Promise.resolve({data:copiar(data),error:null})}
if(nombre==='marcar_realizado_preventivo'){
const anterior=declaraciones.find(r=>r.marca===p.p_marca&&r.codigo===p.p_codigo&&r.anio===p.p_anio&&r.mes===p.p_mes);
if((anterior?.revision||0)!==p.p_revision)return Promise.resolve({data:null,error:{message:'Revisión de realizado desactualizada'}});
const data={marca:p.p_marca,codigo:p.p_codigo,anio:p.p_anio,mes:p.p_mes,realizado:p.p_realizado,fecha_realizado:p.p_fecha,equipos_declarados:p.p_equipos,observaciones:p.p_observaciones,realizado_nombre:'Técnico de prueba',realizado_por:usuario,revision:p.p_revision+1,actualizado_en:'2026-11-10T14:00:00Z'};
declaraciones=declaraciones.filter(r=>r!==anterior);declaraciones.push(data);guardar();return Promise.resolve({data:copiar(data),error:null})}
throw Error('RPC inesperada: '+nombre)}};
`
const compilado = await build({
  stdin: { contents: 'import React from "react";import{createRoot}from"react-dom/client";import Preventivos from"./src/components/Preventivos.jsx";import*as backend from"./src/supabase.jsx";window.__controlBackend=backend;createRoot(document.getElementById("root")).render(React.createElement("main",{className:"mx-auto max-w-7xl p-4"},React.createElement(Preventivos,{tecnico:location.search.includes("tecnico"),soloControl:!location.search.includes("tecnico")})));', resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true, write: false, outdir: 'prueba-en-memoria', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'backend-local', setup(api) {
    api.onLoad({ filter: /supabase\.jsx$/ }, () => ({ contents: backend, loader: 'js' }))
    api.onResolve({ filter: /\.xlsx\?url$/ }, args => ({ path: join(args.resolveDir, args.path.replace('?url', '')), namespace: 'excel-local' }))
    api.onLoad({ filter: /.*/, namespace: 'excel-local' }, async args => ({ contents: `export default ${JSON.stringify('data:application/octet-stream;base64,' + (await readFile(args.path)).toString('base64'))}`, loader: 'js' }))
  } }],
})
const js = compilado.outputFiles.find(f => f.path.endsWith('.js')).text
const cssNombre = (await readFile('dist/index.html', 'utf8')).match(/href="\/assets\/([^" ]+\.css)"/)[1]
const css = (await readFile(join('dist/assets', cssNombre), 'utf8')) + '\n' + (await readFile('src/responsive.css', 'utf8'))
const server = createServer((req, res) => {
  if (req.url === '/prueba.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(js) }
  else if (req.url === '/prueba.css') { res.setHeader('Content-Type', 'text/css'); res.end(css) }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/prueba.css"></head><body><div id="root"></div><script src="/prueba.js"></script></body></html>') }
})
let browser, page
const errores = []
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  browser = await chromium.launch({ headless: true, ...(process.argv[4] ? { executablePath: process.argv[4] } : {}) })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true })
  const base = `http://127.0.0.1:${server.address().port}`
  await context.route('**/*', route => {
    const url = route.request().url()
    return url.startsWith(base) || url.startsWith('data:') || url.startsWith('blob:') ? route.continue() : route.abort('blockedbyclient')
  })
  await context.addInitScript(() => {
    window.__controlPrint = { html: [], impresiones: 0 }
    window.open = () => ({ closed: false, opener: window, document: { open() {}, write(html) { window.__controlPrint.html.push(html) }, close() {} }, addEventListener() {}, focus() {}, print() { window.__controlPrint.impresiones++ }, close() { this.closed = true } })
    window.__controlCanvasText = []
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) { window.__controlCanvasText.push(String(text)); return fillText.call(this, text, ...args) }
  })
  page = await context.newPage()
  await page.clock.install({ time: new Date('2026-11-10T14:00:00Z') })
  page.on('pageerror', error => errores.push(error.message))
  const navegar = async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Hoja de seguimiento CMI', exact: true }).waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Descargar filtrados como imagen') && !b.disabled))
    await page.getByLabel(/^Mes del control/).selectOption('11')
    await page.getByRole('button', { name: 'Imprimir filtrados', exact: true }).waitFor({ state: 'visible' })
  }
  await navegar()
  const control = page.getByRole('region', { name: 'Control imprimible de preventivos', exact: true })
  const fila = codigo => control.locator(`tr[data-clave-control="GRANJERO:${codigo}:2026:11"]`)
  const estado = codigo => fila(codigo).locator('td').last().locator('span').first()
  const color = codigo => page.getByLabel(`Resaltado de GRANJERO ${codigo} Noviembre`, { exact: true })
  const esperarColor = async (codigo, valor) => {
    await page.waitForFunction(({ codigo, valor }) => document.querySelector(`[data-clave-control="GRANJERO:${codigo}:2026:11"]`)?.dataset.resaltado === valor, { codigo, valor })
  }
  await esperarColor('413', 'verde')
  assert.equal(await estado('413').textContent(), 'Realizado', 'El adelanto de octubre cuenta para noviembre aunque no esté finalizado')
  assert.equal(await fila('413').getByText('2 en Excel', { exact: true }).count(), 1)
  await esperarColor('393', 'no')
  assert.equal(await estado('393').textContent(), 'Pendiente')
  const inicial = await page.evaluate(() => window.__controlBackend.snapshot())
  await color('413').selectOption('sin-color')
  await esperarColor('413', 'no')
  assert.equal(await estado('413').textContent(), 'Realizado', 'Quitar verde conserva el estado real')
  let guardado = await page.evaluate(() => window.__controlBackend.snapshot())
  assert.deepEqual(guardado.ordenes, inicial.ordenes)
  assert.deepEqual(guardado.declaraciones, inicial.declaraciones)
  assert.equal(guardado.resaltados.find(r => r.codigo === '413').modo, 'sin-color')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Hoja de seguimiento CMI', exact: true }).waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Descargar filtrados como imagen') && !b.disabled))
  await page.getByLabel(/^Mes del control/).selectOption('11')
  await esperarColor('413', 'no')
  assert.equal(await color('413').inputValue(), 'sin-color', 'La preferencia se recupera después de recargar')
  await color('413').selectOption('automatico')
  await esperarColor('413', 'verde')
  await color('393').selectOption('verde')
  await esperarColor('393', 'verde')
  assert.equal(await estado('393').textContent(), 'Pendiente', 'El verde manual nunca inventa un realizado')
  guardado = await page.evaluate(() => window.__controlBackend.snapshot())
  assert.deepEqual(guardado.ordenes, inicial.ordenes)
  assert.deepEqual(guardado.declaraciones, inicial.declaraciones)
  await color('393').selectOption('automatico')
  await esperarColor('393', 'no')
  await fila('393').getByRole('button', { name: 'Marcar realizado', exact: true }).click()
  const dialogo = page.getByRole('dialog', { name: 'Reportar preventivo realizado', exact: true })
  await dialogo.getByLabel('Fecha en que se realizó', { exact: true }).fill('2026-11-09')
  await dialogo.getByLabel('Equipos trabajados (opcional)', { exact: true }).fill('3')
  await dialogo.getByLabel('Observación (opcional)', { exact: true }).fill('Trabajo ficticio para verificar el estado independiente del color.')
  await dialogo.getByRole('button', { name: 'Guardar realizado', exact: true }).click()
  await dialogo.waitFor({ state: 'hidden' })
  await esperarColor('393', 'no')
  assert.equal(await estado('393').textContent(), 'Pendiente de liquidar', 'La marca manual queda pendiente de liquidar y sin verde automático')
  const despuesMarca = await page.evaluate(() => window.__controlBackend.snapshot())
  assert.deepEqual(despuesMarca.ordenes, inicial.ordenes)
  assert.equal(despuesMarca.declaraciones.length, 1)
  assert.equal(despuesMarca.declaraciones[0].equipos_declarados, 3)
  assert.equal(despuesMarca.resaltados.find(r => r.codigo === '393').modo, 'automatico')

  await page.getByLabel(/^Marca del control/).selectOption('GRANJERO')
  await page.getByLabel(/^Semana programada/).selectOption(local413.semana)
  await page.getByLabel('Buscar punto', { exact: true }).fill('Huehuetenango')
  assert.ok(await control.locator('tbody tr').count() <= 5, 'La captura de revisión muestra un listado compacto')
  await control.screenshot({ path: join(capturas, 'control-imprimible-pc-listado.png') })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  const coloresOscuros = await fila('413').evaluate(n => ({ fondo: getComputedStyle(n.cells[0]).backgroundColor, texto: getComputedStyle(n.cells[0]).color, encabezado: getComputedStyle(n.closest('table').querySelector('th')).backgroundColor }))
  assert.deepEqual(coloresOscuros, { fondo: 'rgb(220, 252, 231)', texto: 'rgb(20, 83, 45)', encabezado: 'rgb(255, 192, 0)' }, 'El verde y encabezado naranja conservan legibilidad en modo oscuro')
  await control.screenshot({ path: join(capturas, 'control-imprimible-pc-oscuro.png') })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.getByLabel(/^Semana programada/).selectOption(local413.semana)
  await page.getByLabel(/^Estado del control/).selectOption('finalizado')
  await page.getByLabel('Buscar punto', { exact: true }).fill('Aguacatan')
  assert.equal(await control.locator('tbody tr').count(), 1, 'Todos los filtros se combinan, incluida búsqueda sin acentos')
  assert.equal(await fila('413').count(), 1)
  assert.equal(await control.locator('thead th').last().textContent(), 'Estado', 'El estado queda en la columna derecha')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No hay desbordamiento global en PC')
  await control.screenshot({ path: join(capturas, 'control-imprimible-pc.png') })

  await page.evaluate(() => { window.__controlCanvasText = [] })
  const [download] = await Promise.all([page.waitForEvent('download'), control.getByRole('button', { name: 'Descargar filtrados como imagen', exact: true }).click()])
  assert.equal(download.suggestedFilename(), 'Control_Preventivos_2026_V3.png')
  await download.saveAs(join(capturas, 'control-filtrado.png'))
  const textosImagen = await page.evaluate(() => window.__controlCanvasText)
  assert.ok(textosImagen.includes('413') && textosImagen.includes('Realizado'))
  assert.ok(!textosImagen.includes('644') && !textosImagen.includes('393'), 'El PNG contiene únicamente lo filtrado')
  assert.ok(textosImagen.join(' ').includes(local413.direccion), 'El PNG conserva la dirección completa aunque ocupe varias líneas')

  await control.getByRole('button', { name: 'Imprimir filtrados', exact: true }).click()
  let salida = await page.evaluate(() => window.__controlPrint)
  assert.equal(salida.impresiones, 1)
  const html = salida.html.at(-1)
  assert.ok(html.includes('background-color:#dcfce7') && html.includes('Realizado'))
  assert.ok(!html.includes('<button') && !html.includes('<script'), 'La impresión no incluye la interfaz de gestión')
  assert.ok(!html.includes('CAMPERO 644') && !html.includes(local393.nombre), 'Sólo se imprime lo filtrado')
  assert.equal((html.match(/<tbody><tr/g) || []).length, 1)
  await writeFile(join(capturas, 'control-filtrado-impresion.html'), html, 'utf8')
  const impresion = await context.newPage()
  await impresion.setViewportSize({ width: 1123, height: 794 })
  await impresion.emulateMedia({ media: 'print' })
  await impresion.setContent(html)
  assert.equal(await impresion.locator('tbody tr').count(), 1)
  await impresion.screenshot({ path: join(capturas, 'control-filtrado-impresion.png'), fullPage: true })
  await impresion.close()
  await page.getByLabel('Incluir resaltado al imprimir y descargar', { exact: true }).uncheck()
  await control.getByRole('button', { name: 'Imprimir filtrados', exact: true }).click()
  salida = await page.evaluate(() => window.__controlPrint)
  assert.ok(!salida.html.at(-1).includes('background-color:#dcfce7'))
  assert.ok(salida.html.at(-1).includes('Realizado'), 'Imprimir sin color preserva el estado')
  await page.getByLabel('Incluir resaltado al imprimir y descargar', { exact: true }).check()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No hay desbordamiento global en móvil')
  const tablaScroll = control.getByLabel('Tabla de control; desplaza para ver todas las columnas', { exact: true })
  assert.ok(await tablaScroll.evaluate(n => n.scrollWidth > n.clientWidth), 'La tabla permite desplazamiento horizontal propio en móvil')
  await page.screenshot({ path: join(capturas, 'control-imprimible-movil.png'), fullPage: true })
  await tablaScroll.evaluate(n => { n.scrollLeft = n.scrollWidth })
  await tablaScroll.screenshot({ path: join(capturas, 'control-imprimible-movil-estado.png') })

  const tecnico = await context.newPage()
  await tecnico.clock.install({ time: new Date('2026-11-10T14:00:00Z') })
  tecnico.on('pageerror', error => errores.push(error.message))
  await tecnico.goto(base + '?tecnico', { waitUntil: 'domcontentloaded' })
  await tecnico.getByRole('heading', { name: 'Preventivos CMI', exact: true }).waitFor()
  await tecnico.getByLabel(/^Mes programado/).waitFor()
  assert.equal(await tecnico.getByRole('button', { name: 'Control imprimible', exact: true }).count(), 0, 'La nueva vista sigue reservada al administrador')
  assert.equal(await tecnico.getByRole('region', { name: 'Control imprimible de preventivos', exact: true }).count(), 0)
  assert.equal(await tecnico.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await tecnico.close()
  assert.deepEqual(errores, [], 'La interfaz no produce errores JavaScript')
  console.log(JSON.stringify({ resultado: 'OK', pruebas: ['Adelantos a noviembre', 'Color separado del estado', 'Persistencia al recargar', 'Marca manual pendiente de liquidar', 'Filtros combinados', 'PNG filtrado', 'Impresión filtrada con y sin color', 'PC y móvil sin desbordamiento global', 'Vista administrativa'], capturas }))
} catch (error) {
  console.error(error)
  if (page) { await page.screenshot({ path: join(capturas, 'control-error.png'), fullPage: true }).catch(() => {}); console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 5000)) }
  throw error
} finally {
  if (browser) await browser.close()
  await new Promise(resolve => server.close(resolve))
}
