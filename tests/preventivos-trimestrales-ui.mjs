// Prueba aislada de navegador, sólo con datos ficticios y backend en memoria.
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const {chromium}=await import(pathToFileURL(process.argv[2]).href)
const fuente=JSON.parse(await readFile('src/data/preventivosTrimestrales.json','utf8'))
const shell=fuente[0],taco=fuente.find(l=>l.marca==='TACO_BELL')
const backend=`
let locales=${JSON.stringify(fuente.map(l=>({...l,revision:1,cerrado:false,realizado:false})))},ordenes=[],config=[],fallar=false;
const copiar=d=>JSON.parse(JSON.stringify(d));
export function setOrdenes(d){ordenes=d.map(o=>({revision:1,excluida:false,...o}))}
export function setFallar(v){fallar=v}
export function agregarPeriodo(l){locales.push({...l,revision:1,realizado:false,cerrado:false})}
export function snapshot(){return copiar({locales,ordenes,config})}
function query(datos){return {select(){return this},order(){return this},eq(k,v){datos=datos.filter(d=>d[k]===v);return this},async range(i,f){return {data:copiar(datos.slice(i,f+1)),error:null}}}}
export const supabase={auth:{async getSession(){return {data:{session:{user:{id:'t1',email:'ana@example.test'}}}}},async signOut(){}},
from(t){if(t==='preventivos_trimestrales_programacion')return query(locales);if(t==='preventivos_trimestrales_ordenes')return query(ordenes);if(t==='preventivos_trimestrales_config')return query(config);throw Error('Tabla inesperada '+t)},
async rpc(n,p){if(fallar)return {error:{message:'Conexión de prueba falló'}};
if(n==='sincronizar_programacion_trimestral')return {error:null};
if(n==='configurar_excel_trimestral'){config=config.filter(c=>c.marca!==p.p_marca);config.push({marca:p.p_marca,clientes:p.p_clientes,encabezado_codigo:p.p_encabezado});return {error:null}}
if(n==='marcar_realizado_trimestral'){const l=locales.find(l=>l.id===p.p_id);if(l.revision!==p.p_revision)return {error:{message:'Ficha desactualizada'}};Object.assign(l,{realizado:p.p_realizado,fecha_realizado:p.p_fecha,equipos_declarados:p.p_equipos,observaciones:p.p_observaciones,realizado_nombre:'Ana Técnica',realizado_por:'t1',revision:l.revision+1});return {data:copiar(l),error:null}}
if(n==='cerrar_tienda_trimestral'){const l=locales.find(l=>l.id===p.p_id);Object.assign(l,{cerrado:p.p_cerrado,motivo_cierre:p.p_motivo,revision:l.revision+1});return {data:copiar(l),error:null}}
if(n==='guardar_tienda_trimestral'){const l=locales.find(l=>l.id===p.p_datos.id);if(p.p_nuevo&&l)return {error:{message:'Ya existe esa tienda'}};if(l)Object.assign(l,p.p_datos,{revision:l.revision+1});else locales.push({...p.p_datos,revision:1,realizado:false,cerrado:false});return {data:copiar(p.p_datos),error:null}}
if(n==='ajustar_orden_trimestral'){const o=ordenes.find(o=>o.numero_orden===p.p_orden);Object.assign(o,{programacion_id:p.p_programacion,excluida:p.p_excluida,motivo:p.p_motivo,revision:o.revision+1});return {data:copiar(o),error:null}}
throw Error('RPC inesperada '+n)}};
`
const compilado=await build({stdin:{contents:'import React from"react";import{createRoot}from"react-dom/client";import Portal from"./src/components/PortalTecnico.jsx";import Modulo from"./src/components/PreventivosTrimestrales.jsx";import*as backend from"./src/supabase.jsx";window.__trimestrales=backend;createRoot(document.getElementById("root")).render(location.search.includes("admin")?React.createElement("main",{className:"mx-auto max-w-6xl p-4"},React.createElement(Modulo,{marca:"SHELL"})):React.createElement(Portal,{persona:{nombre:"Ana Técnica"},usuarioId:"t1",inicial:"preventivos-shell"}));',resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,outdir:'prueba-en-memoria',jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'backend-local',setup(api){api.onLoad({filter:/supabase\.jsx$/},()=>({contents:backend,loader:'js'}));api.onResolve({filter:/\.xlsx\?url$/},a=>({path:join(a.resolveDir,a.path.replace('?url','')),namespace:'excel'}));api.onLoad({filter:/.*/,namespace:'excel'},async a=>({contents:`export default ${JSON.stringify('data:application/octet-stream;base64,'+(await readFile(a.path)).toString('base64'))}`,loader:'js'}))}}]})
const js=compilado.outputFiles.find(f=>f.path.endsWith('.js')).text
const cssNombre=(await readFile('dist/index.html','utf8')).match(/href="\/assets\/([^" ]+\.css)"/)[1],css=await readFile(join('dist/assets',cssNombre))
const server=createServer((req,res)=>{if(req.url==='/test.js'){res.setHeader('Content-Type','application/javascript');res.end(js)}else if(req.url==='/test.css'){res.setHeader('Content-Type','text/css');res.end(css)}else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"></head><body><div id="root"></div><script src="/test.js"></script></body></html>')}})
let browser
try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,executablePath:process.argv[4]})
  const page=await browser.newPage({viewport:{width:390,height:844}}),base=`http://127.0.0.1:${server.address().port}`
  await page.clock.install({time:new Date('2026-10-06T14:00:00Z')})
  const errores=[];page.on('pageerror',e=>errores.push(e.message))
  await page.goto(base+'/#preventivos-shell')
  await page.getByRole('heading',{name:'Preventivos Shell',exact:true}).waitFor()
  await page.locator('article').first().waitFor();assert.equal(await page.locator('article').count(),16)
  assert.equal(await page.getByRole('button',{name:'Configurar Excel diario'}).count(),0)
  assert.equal(await page.getByRole('button',{name:'Nueva tienda'}).count(),0)
  const ficha=page.locator(`article[data-tienda="${shell.codigo}"]`)
  await ficha.getByText(shell.direccion,{exact:true}).waitFor()
  await ficha.getByRole('button',{name:'Marcar realizado'}).click()
  await page.getByLabel('Equipos trabajados (opcional)').fill('3');await page.getByLabel('Observación (opcional)').fill('Se trabajaron tres equipos.')
  await page.evaluate(()=>window.__trimestrales.setFallar(true));await page.getByRole('button',{name:'Guardar',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'Conexión de prueba falló'}).waitFor();assert.equal(await page.getByRole('dialog').count(),1)
  await page.evaluate(()=>window.__trimestrales.setFallar(false));await page.getByRole('button',{name:'Guardar',exact:true}).click()
  await ficha.getByText('Pendiente de liquidar',{exact:true}).waitFor()
  await ficha.getByText(/Marcado por: Ana Técnica/).waitFor()
  await ficha.getByRole('button',{name:'Detalle',exact:true}).click()
  await ficha.getByRole('button',{name:'Editar reporte'}).waitFor()
  await page.getByLabel(/^Mostrar/).selectOption('por-liquidar')
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:join(process.argv[3],'trimestrales-shell-movil.png'),fullPage:true})
  await page.getByLabel(/^Mostrar/).selectOption('todos')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.getByRole('button',{name:'Taco Bell',exact:true}).click()
  await page.getByRole('heading',{name:'Preventivos Taco Bell',exact:true}).waitFor();assert.equal(await page.locator('article').count(),16)
  assert.equal(await page.locator(`article[data-tienda="${shell.codigo}"]`).count(),0)
  await page.getByLabel('Mes programado').selectOption('11');assert.equal(await page.locator('article').count(),6)
  await page.getByRole('button',{name:'Shell',exact:true}).click();await page.locator(`article[data-tienda="${shell.codigo}"]`).getByText('Pendiente de liquidar',{exact:true}).waitFor()
  await page.evaluate(({local})=>window.__trimestrales.setOrdenes([{numero_orden:'O-1',marca:'SHELL',codigo:local.codigo,fecha_realizada:'2026-10-06',tecnico:'Carlos Técnico'}]),{local:shell})
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();await ficha.getByText('Finalizado',{exact:true}).waitFor()
  await ficha.getByRole('button',{name:'Detalle',exact:true}).click();await ficha.getByText('Técnico: Carlos Técnico',{exact:true}).waitFor()
  await page.getByLabel(/^Mostrar/).selectOption('finalizado');assert.equal(await page.locator('article').count(),1)
  const descarga=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar filtrados PNG'}).click();const archivo=await descarga
  assert.match(archivo.suggestedFilename(),/shell.*\.png$/);await archivo.saveAs(join(process.argv[3],'trimestrales-shell-finalizado.png'))
  await page.evaluate(({local})=>window.__trimestrales.agregarPeriodo({...local,id:'SHELL:2027:1:'+local.codigo,anio:2027,trimestre:1,fecha_programada:'2027-01-12'}),{local:shell})
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();await page.getByLabel(/^Trimestre/).selectOption('2027:1');await page.getByLabel(/^Mostrar/).selectOption('todos')
  await ficha.getByText('Pendiente',{exact:true}).waitFor();assert.equal(await ficha.getByText(/Marcado por:/).count(),0)
  await page.goto(base+'/?admin')
  await page.locator('article').first().waitFor();await page.getByRole('button',{name:'Configurar Excel diario'}).click()
  await page.getByLabel('CLIENTE exacto del Excel diario (uno por línea)').fill('PREVENTIVO SHELL PRUEBA')
  await page.getByLabel('Encabezado del código de tienda').fill('ID Solicitante');await page.getByRole('button',{name:'Guardar',exact:true}).click()
  assert.equal((await page.evaluate(()=>window.__trimestrales.snapshot())).config[0].encabezado_codigo,'ID Solicitante')
  await page.getByRole('button',{name:'Nueva tienda'}).click()
  await page.getByLabel('Código de tienda',{exact:true}).fill('S-NUEVO');await page.getByLabel('Tienda',{exact:true}).fill('Nueva tienda de prueba')
  await page.getByLabel('Fecha programada',{exact:true}).fill('2026-11-10');await page.getByLabel('Dirección',{exact:true}).fill('Km 200, dirección de prueba.')
  await page.getByRole('button',{name:'Guardar',exact:true}).click();const nueva=page.locator('article[data-tienda="S-NUEVO"]');await nueva.waitFor()
  await nueva.getByRole('button',{name:'Detalle',exact:true}).click();await nueva.getByRole('button',{name:'Marcar cerrado'}).click()
  await page.getByLabel('Motivo del cambio').fill('El negocio cerró.');await page.getByRole('button',{name:'Guardar',exact:true}).click()
  await nueva.getByText('Cerrado',{exact:true}).waitFor();await page.getByRole('button',{name:'Programación',exact:true}).click();assert.equal(await nueva.count(),0)
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();assert.equal(await nueva.count(),0)
  await page.setViewportSize({width:1440,height:1000});await page.locator('article').first().scrollIntoViewIfNeeded()
  const positions=await page.locator('article').evaluateAll(a=>a.slice(0,2).map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})))
  assert.equal(positions[0].y,positions[1].y);assert.ok(positions[1].x>positions[0].x)
  assert.ok(await page.locator('article').first().evaluate(e=>e.getBoundingClientRect().width)>300,'Las fichas usan el ancho del contenido en PC')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.screenshot({path:join(process.argv[3],'trimestrales-shell-pc.png')})
  assert.deepEqual(errores,[])
  console.log('UI: Shell/Taco Bell separados, móvil/PC, portal técnico, reportes manuales, Excel, PNG, nueva vuelta y cierres verificados.')
}finally {await browser?.close();await new Promise(r=>server.close(r))}
