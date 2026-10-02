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
let ordenes=[],declaraciones=[],fallar=false;
const copiar=d=>JSON.parse(JSON.stringify(d));
export function setOrdenes(d){ordenes=d}
export function setFallar(d){fallar=d}
function query(datos){return {select(){return this},order(){return this},eq(){return this},ilike(){return this},limit(){return this},async maybeSingle(){return {data:datos[0]||null,error:null}},async range(i,f){return {data:copiar(datos.slice(i,f+1)),error:null}},then(resolve,reject){return Promise.resolve({data:copiar(datos),error:null}).then(resolve,reject)}}}
export const supabase={auth:{async getSession(){return {data:{session:{user:{id:usuario,email:'ana@example.test'}}}}},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},async signOut(){}},
from(tabla){if(tabla==='viaticos_admins')return query([]);if(tabla==='vac_empleados')return query([{id:usuario,nombre:'Ana Técnica',activo:true}]);if(tabla==='preventivos_realizados')return query(declaraciones);throw Error('Tabla inesperada: '+tabla)},
rpc(nombre,p){if(nombre==='consultar_ordenes_preventivos')return query(ordenes);if(nombre==='marcar_realizado_preventivo'){if(fallar)return Promise.resolve({data:null,error:{message:'Conexión de prueba falló'}});const anterior=declaraciones.find(d=>d.codigo===p.p_codigo&&d.marca===p.p_marca&&d.anio===p.p_anio&&d.mes===p.p_mes);if((anterior?.revision||0)!==p.p_revision)return Promise.resolve({error:{message:'Revisión desactualizada'}});const data={marca:p.p_marca,codigo:p.p_codigo,anio:p.p_anio,mes:p.p_mes,realizado:p.p_realizado,fecha_realizado:p.p_fecha,equipos_declarados:p.p_equipos,observaciones:p.p_observaciones,realizado_nombre:'Ana Técnica',realizado_por:usuario,revision:p.p_revision+1,actualizado_en:'2026-10-02T14:00:00Z'};declaraciones=declaraciones.filter(d=>d!==anterior);declaraciones.push(data);return Promise.resolve({data:copiar(data),error:null})}throw Error('RPC inesperada: '+nombre)}};
`
const compilado=await build({stdin:{contents:'import React from "react";import{createRoot}from"react-dom/client";import App from"./src/App.jsx";import*as backend from"./src/supabase.jsx";window.__preventivosTest=backend;createRoot(document.getElementById("root")).render(React.createElement(App));',resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,outdir:'prueba-en-memoria',jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'prueba-sin-red',setup(api){
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
  await page.evaluate(({codigo})=>window.__preventivosTest.setOrdenes([{numero_orden:'ORD-123',marca:'GRANJERO',codigo,fecha_realizada:'2026-10-02',negocio:'Preventivo'}]),local)
  await page.getByRole('button',{name:'Actualizar',exact:true}).click()
  await page.getByLabel(/^Mostrar/).selectOption('liquidado')
  await ficha.getByText('Liquidado en Excel',{exact:true}).waitFor()
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
  await page.getByLabel(/^Restaurantes/).selectOption('SICILIANA')
  assert.ok(await page.locator('article').count()>0)
  assert.equal(await page.locator('article:not([data-restaurante-tipo="SICILIANA"])').count(),0)
  await page.getByLabel(/^Restaurantes/).selectOption('CAMPERO')
  assert.equal(await page.locator('article:not([data-restaurante-tipo="CAMPERO"])').count(),0)
  assert.deepEqual(errores,[])
  console.log('UI verificada: acceso real del portal técnico, guardar/reintentar, liquidación automática, cambio de mes, móvil sin desbordamiento y PC. Backend simulado, sin usar Supabase.')
} catch(error) {
  if(pagina){console.log((await pagina.locator('body').innerText()).slice(0,2000));await pagina.screenshot({path:join(process.argv[3],'preventivos-error-prueba.png')})}
  throw error
} finally { await browser?.close();await new Promise(resolve=>server.close(resolve)) }
