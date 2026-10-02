// Prueba de navegador con Supabase simulado: nunca accede a datos reales.
// Uso: node tests/preventivos-ui.mjs <playwright/index.mjs> <carpeta capturas>
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import { catalogoDesdeMatriz } from '../src/utils/preventivos.js'
const { chromium } = await import(pathToFileURL(process.argv[2]).href)
const libro=XLSX.readFile('src/Mantenimientos.xlsx')
const catalogo=catalogoDesdeMatriz(XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]],{header:1,defval:''}))
const local=catalogo.find(l=>l.activo&&l.marca==='GRANJERO'&&l.meses.includes(10))
const backend=`
const usuario='00000000-0000-0000-0000-000000000002';
let ordenes=JSON.parse(sessionStorage.getItem('ordenes')||'[]'),declaraciones=[],fallar=false;
let locales=JSON.parse(sessionStorage.getItem('locales')||'null')||${JSON.stringify(catalogo.map(l=>({...l,activo_calendario:l.activo,activo_manual:null,revision_estado:0})))},cierres=JSON.parse(sessionStorage.getItem('cierres')||'[]');
const copiar=d=>JSON.parse(JSON.stringify(d));
export function setOrdenes(d){ordenes=d;sessionStorage.setItem('ordenes',JSON.stringify(d))}
export function setFallar(d){fallar=d}
function query(datos){return {select(){return this},order(){return this},eq(){return this},ilike(){return this},limit(){return this},async maybeSingle(){return {data:datos[0]||null,error:null}},async range(i,f){return {data:copiar(datos.slice(i,f+1)),error:null}},then(resolve,reject){return Promise.resolve({data:copiar(datos),error:null}).then(resolve,reject)}}}
export const supabase={auth:{async getSession(){return {data:{session:{user:{id:usuario,email:'ana@example.test'}}}}},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},async signOut(){}},
from(tabla){if(tabla==='viaticos_admins')return query([]);if(tabla==='vac_empleados')return query([{id:usuario,nombre:'Ana Técnica',activo:true}]);if(tabla==='preventivos_realizados')return query(declaraciones);if(tabla==='preventivos_locales')return query(locales);if(tabla==='preventivos_cierres_historial')return query(cierres);if(tabla==='preventivos_ordenes')return query(ordenes);throw Error('Tabla inesperada: '+tabla)},
rpc(nombre,p){
if(nombre==='sincronizar_catalogo_preventivos'){for(const l of p.p_locales){const actual=locales.find(a=>a.codigo===l.codigo&&a.marca===l.marca);if(actual)Object.assign(actual,{...l,activo_calendario:l.activo,activo:actual.activo_manual??l.activo});}return Promise.resolve({error:null})}
if(nombre==='cambiar_estado_local_preventivo'){if(fallar)return Promise.resolve({data:null,error:{message:'Conexión de prueba falló'}});const actual=locales.find(l=>l.codigo===p.p_codigo&&l.marca===p.p_marca);if(actual.revision_estado!==p.p_revision)return Promise.resolve({error:{message:'Revisión desactualizada'}});Object.assign(actual,{activo:!p.p_cerrado,activo_manual:!p.p_cerrado,fecha_cierre:p.p_cerrado?p.p_fecha:null,motivo_cierre:p.p_motivo,revision_estado:p.p_revision+1});cierres.push({id:String(cierres.length+1),marca:p.p_marca,codigo:p.p_codigo,cerrado:p.p_cerrado,fecha_cierre:actual.fecha_cierre,motivo:p.p_motivo,registrado_en:'2026-10-02T14:00:00Z'});sessionStorage.setItem('locales',JSON.stringify(locales));sessionStorage.setItem('cierres',JSON.stringify(cierres));return Promise.resolve({data:copiar(actual),error:null})}
if(nombre==='consultar_ordenes_preventivos')return query(ordenes);if(nombre==='marcar_realizado_preventivo'){if(fallar)return Promise.resolve({data:null,error:{message:'Conexión de prueba falló'}});const anterior=declaraciones.find(d=>d.codigo===p.p_codigo&&d.marca===p.p_marca&&d.anio===p.p_anio&&d.mes===p.p_mes);if((anterior?.revision||0)!==p.p_revision)return Promise.resolve({error:{message:'Revisión desactualizada'}});const data={marca:p.p_marca,codigo:p.p_codigo,anio:p.p_anio,mes:p.p_mes,realizado:p.p_realizado,fecha_realizado:p.p_fecha,equipos_declarados:p.p_equipos,observaciones:p.p_observaciones,realizado_nombre:'Ana Técnica',realizado_por:usuario,revision:p.p_revision+1,actualizado_en:'2026-10-02T14:00:00Z'};declaraciones=declaraciones.filter(d=>d!==anterior);declaraciones.push(data);return Promise.resolve({data:copiar(data),error:null})}throw Error('RPC inesperada: '+nombre)}};
`
const compilado=await build({stdin:{contents:'import React from "react";import{createRoot}from"react-dom/client";import App from"./src/App.jsx";import Preventivos from"./src/components/Preventivos.jsx";import*as backend from"./src/supabase.jsx";window.__preventivosTest=backend;createRoot(document.getElementById("root")).render(location.search.includes("modo=admin")?React.createElement("main",{className:"mx-auto max-w-7xl p-4"},React.createElement(Preventivos)):React.createElement(App));',resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,outdir:'prueba-en-memoria',jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'prueba-sin-red',setup(api){
  api.onLoad({filter:/supabase\.jsx$/},()=>({contents:backend,loader:'js'}))
  api.onResolve({filter:/\.xlsx\?url$/},args=>({path:join(args.resolveDir,args.path.replace('?url','')),namespace:'excel-url'}))
  api.onLoad({filter:/.*/,namespace:'excel-url'},async args=>({contents:`export default ${JSON.stringify('data:application/octet-stream;base64,'+(await readFile(args.path)).toString('base64'))}`,loader:'js'}))
}}]})
const js=compilado.outputFiles.find(f=>f.path.endsWith('.js')).text
const cssNombre=(await readFile('dist/index.html','utf8')).match(/href="\/assets\/([^" ]+\.css)"/)[1]
const css=await readFile(join('dist/assets',cssNombre))
const server=createServer((req,res)=>{if(req.url==='/prueba.js'){res.setHeader('Content-Type','application/javascript');res.end(js)}else if(req.url==='/prueba.css'){res.setHeader('Content-Type','text/css');res.end(css)}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/prueba.css"></head><body><div id="root"></div><script src="/prueba.js"></script></body></html>')}})
let browser, pagina
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  browser=await chromium.launch({headless:true,...(process.argv[4]?{executablePath:process.argv[4]}:{})})
  const page=await browser.newPage({viewport:{width:390,height:844}})
  pagina=page
  await page.clock.install({time:new Date('2026-10-02T14:00:00Z')})
  const errores=[];page.on('pageerror',error=>{errores.push(error.message);console.log('Error UI: '+error.message)})
  const puerto=server.address().port
  await page.goto(`http://127.0.0.1:${puerto}/__preventivos_test#preventivos`,{waitUntil:'domcontentloaded'})
  await page.getByRole('heading',{name:'Preventivos',exact:true}).waitFor()
  await page.getByLabel(/^Mes programado/).waitFor()
  await page.getByLabel(/^Restaurantes/).selectOption('GRANJERO')
  const ficha=page.locator('article').filter({hasText:`#${local.codigo}`}).first()
  await ficha.getByRole('button',{name:'Marcar realizado'}).click()
  await page.getByLabel('Equipos trabajados (opcional)').fill('3')
  await page.getByLabel('Observación (opcional)').fill('Preventivo realizado, falta subir la liquidación.')
  await page.evaluate(()=>window.__preventivosTest.setFallar(true))
  await page.getByRole('button',{name:'Guardar realizado'}).click()
  await page.getByRole('alert').filter({hasText:'Conexión de prueba falló'}).waitFor()
  assert.equal(await page.getByRole('dialog').count(),1)
  await page.evaluate(()=>window.__preventivosTest.setFallar(false))
  await page.getByRole('button',{name:'Guardar realizado'}).click()
  await ficha.getByRole('button',{name:'Detalle',exact:true}).click()
  await ficha.getByText('Ana Técnica',{exact:true}).waitFor()
  await ficha.getByText('Realizado · por liquidar',{exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,'Sin desbordamiento móvil')
  await page.getByLabel(/^Mostrar/).selectOption('por-liquidar')
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:join(process.argv[3],'preventivos-movil.png'),fullPage:true})
  await page.evaluate(({codigo})=>window.__preventivosTest.setOrdenes([
    {numero_orden:'ORD-123',marca:'GRANJERO',codigo,fecha_realizada:'2026-10-01',tecnico:'Carlos Reyes',negocio:'Preventivo'},
    {numero_orden:'ORD-124',marca:'GRANJERO',codigo,fecha_realizada:'2026-10-02',tecnico:'Daniel López',negocio:'Preventivo'},
  ]),local)
  await page.getByRole('button',{name:'Actualizar',exact:true}).click()
  await page.getByLabel(/^Mostrar/).selectOption('liquidado')
  await ficha.getByText('Liquidado en Excel',{exact:true}).waitFor()
  const ordenesLiquidadas=ficha.getByRole('list',{name:'Órdenes liquidadas'}).locator('li')
  assert.equal(await ordenesLiquidadas.count(),2)
  await ordenesLiquidadas.filter({hasText:'ORD-123'}).getByText('Técnico: Carlos Reyes',{exact:true}).waitFor()
  await ordenesLiquidadas.filter({hasText:'ORD-123'}).getByText('Fecha realizada: 01/10/2026',{exact:true}).waitFor()
  await ordenesLiquidadas.filter({hasText:'ORD-124'}).getByText('Técnico: Daniel López',{exact:true}).waitFor()
  await ordenesLiquidadas.filter({hasText:'ORD-124'}).getByText('Fecha realizada: 02/10/2026',{exact:true}).waitFor()
  await ficha.screenshot({path:join(process.argv[3],'preventivo-liquidado-detalle.png')})
  assert.equal(await ficha.getByText('Realizado: sí',{exact:true}).count(),1)
  assert.equal(await ficha.getByText('Liquidado: sí',{exact:true}).count(),1)
  assert.equal(await ficha.getByRole('button',{name:'Deshacer marca'}).count(),0)
  await page.setViewportSize({width:1440,height:1000})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,'Sin desbordamiento PC')
  await page.screenshot({path:join(process.argv[3],'preventivos-pc.png'),fullPage:true})
  await page.getByLabel(/^Mes programado/).selectOption('6')
  await page.getByLabel(/^Mostrar/).selectOption('todos')
  await ficha.getByRole('button',{name:'Marcar realizado'}).waitFor()
  assert.equal(await page.getByText('Ana Técnica',{exact:true}).count(),0,'No hereda marcas de otro mes')
  assert.equal(await page.getByLabel(/^Restaurantes/).locator('option[value="SICILIANA"]').count(),0)
  assert.equal(await page.locator('article').count(),catalogo.filter(l=>l.activo&&l.marca==='GRANJERO'&&l.meses.includes(6)).length,'El filtro unificado conserva todos los Granjero y Siciliana del mes')
  assert.ok(await page.locator('article[data-restaurante-tipo="SICILIANA"]').count()>0)
  assert.ok(await page.locator('article[data-restaurante-tipo="GRANJERO"]').count()>0)
  const fichasPC=await page.locator('article').evaluateAll(fichas=>fichas.slice(0,2).map(f=>{const r=f.getBoundingClientRect();return {x:r.x,y:r.y}}))
  assert.equal(fichasPC[0].y,fichasPC[1].y,'PC: fichas en columnas')
  assert.ok(fichasPC[1].x>fichasPC[0].x)
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:join(process.argv[3],'preventivos-pc.png')})
  await page.locator('article').first().scrollIntoViewIfNeeded()
  await page.screenshot({path:join(process.argv[3],'preventivos-pc-fichas.png')})
  await page.setViewportSize({width:390,height:844})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,'Todas las fichas caben en móvil')
  const fichasMovil=await page.locator('article').evaluateAll(fichas=>fichas.slice(0,2).map(f=>{const r=f.getBoundingClientRect();return {x:r.x,y:r.y}}))
  assert.equal(fichasMovil[0].x,fichasMovil[1].x,'Móvil: una columna')
  assert.ok(fichasMovil[1].y>fichasMovil[0].y)
  await page.getByLabel(/^Restaurantes/).selectOption('CAMPERO')
  assert.equal(await page.locator('article:not([data-restaurante-tipo="CAMPERO"])').count(),0)
  assert.equal(await page.getByRole('button',{name:'Marcar cerrado',exact:true}).count(),0,'El técnico no puede cerrar puntos de venta')
  await page.getByRole('button',{name:/^Cerrados \(/}).click()
  assert.equal(await page.locator('[data-local-cerrado]').count(),catalogo.filter(l=>!l.activo).length)
  assert.equal(await page.getByRole('button',{name:'Reactivar punto de venta'}).count(),0,'El técnico no puede reactivar')
  // Administración: cerrar, reintentar, conservar al recargar y reactivar.
  await page.goto(`http://127.0.0.1:${puerto}/__preventivos_test?modo=admin`,{waitUntil:'domcontentloaded'})
  await page.getByLabel(/^Mes programado/).waitFor()
  await page.getByLabel(/^Mostrar/).selectOption('todos')
  await page.getByLabel('Buscar',{exact:true}).fill(local.codigo)
  await ficha.getByRole('button',{name:'Detalle',exact:true}).click()
  await ficha.getByRole('button',{name:'Marcar cerrado',exact:true}).click()
  await page.getByLabel('Motivo del cierre (opcional)').fill('El punto de venta cerró definitivamente.')
  await page.evaluate(()=>window.__preventivosTest.setFallar(true))
  await page.getByRole('button',{name:'Confirmar cierre'}).click()
  await page.getByRole('alert').filter({hasText:'Conexión de prueba falló'}).waitFor()
  await page.evaluate(()=>window.__preventivosTest.setFallar(false))
  await page.getByRole('button',{name:'Confirmar cierre'}).click()
  await page.getByRole('heading',{name:'Puntos de venta cerrados'}).waitFor()
  await page.getByLabel('Buscar cerrado').fill(local.codigo)
  const archivado=page.locator(`[data-local-cerrado="${local.id}"]`)
  await archivado.getByText('Fecha de cierre: 02/10/2026',{exact:true}).waitFor()
  await archivado.locator('summary').click()
  await archivado.getByText('Orden #ORD-123',{exact:true}).waitFor()
  await archivado.getByText('Técnico: Carlos Reyes',{exact:true}).waitFor()
  await archivado.getByText('Fecha realizada: 01/10/2026',{exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Cerrados sin desbordamiento móvil')
  await page.screenshot({path:join(process.argv[3],'preventivos-cerrados-movil.png'),fullPage:true})
  await page.reload({waitUntil:'domcontentloaded'})
  await page.getByLabel(/^Mes programado/).waitFor()
  await page.getByLabel(/^Mostrar/).selectOption('todos')
  await page.getByLabel('Buscar',{exact:true}).fill(local.codigo)
  assert.equal(await ficha.count(),0,'Volver a cargar y sincronizar el Excel no reactiva la ficha')
  await page.getByRole('button',{name:/^Cerrados \(/}).click()
  await page.getByLabel('Buscar cerrado').fill(local.codigo)
  await archivado.getByRole('button',{name:'Reactivar punto de venta'}).click()
  await page.getByRole('button',{name:'Confirmar reactivación'}).click()
  await archivado.waitFor({state:'detached'})
  await page.getByRole('button',{name:'Programación y seguimiento'}).click()
  await page.getByLabel(/^Mostrar/).selectOption('todos')
  await page.getByLabel('Buscar',{exact:true}).fill(local.codigo)
  await ficha.getByText('Liquidado en Excel',{exact:true}).waitFor()
  assert.deepEqual(errores,[])
  console.log('UI verificada: portal técnico, seguimiento, fichas en PC/móvil, archivo Cerrados, permisos de interfaz, cierre con reintento, persistencia al recargar y reactivación. Backend simulado, sin usar Supabase.')
} catch(error) {
  if(pagina){console.log((await pagina.locator('body').innerText()).slice(0,2000));await pagina.screenshot({path:join(process.argv[3],'preventivos-error-prueba.png')})}
  throw error
} finally { await browser?.close();await new Promise(resolve=>server.close(resolve)) }
