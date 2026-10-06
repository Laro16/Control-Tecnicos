import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { prepararTrimestrales, prepararAvanceTrimestral, validarProgramacionTrimestral, extraerOrdenesTrimestrales, vincularOrdenTrimestral, datosImagenTrimestral } from '../src/utils/preventivosTrimestrales.js'
const calendario=JSON.parse(readFileSync(new URL('../src/data/preventivosTrimestrales.json',import.meta.url),'utf8'))
const shell=calendario.find(l=>l.marca==='SHELL'),taco=calendario.find(l=>l.marca==='TACO_BELL')
const configs=[{marca:'SHELL',clientes:['PREVENTIVO SHELL PRUEBA'],encabezado_codigo:'ID Solicitante'}, {marca:'TACO_BELL',clientes:['PREVENTIVO TB PRUEBA'],encabezado_codigo:'Restaurante'}]
test('cobertura Occidente del trimestre y datos originales completos',()=>{
  assert.equal(calendario.length,32);assert.equal(new Set(calendario.map(l=>l.id)).size,32)
  assert.ok(calendario.every(l=>l.region==='OCCIDENTE'&&l.anio===2026&&l.trimestre===4&&l.direccion&&l.municipio))
  assert.deepEqual(calendario.filter(l=>l.marca==='SHELL').map(l=>l.codigo),['659053','658846','659922','657118','659928','657889','190','191','659061','662760','658838','661672','660004','659401','659998','662400'])
  assert.deepEqual(calendario.filter(l=>l.marca==='TACO_BELL').map(l=>l.codigo),['TB08','TB22','TB41','TB43','TB47','TB53','TB55','TB61','TB63','TB68','TB69','TB71','TB73','TB80','TB86','TB91'])
  assert.ok(calendario.filter(l=>l.marca==='SHELL').every(l=>l.equipos===null))
  assert.equal(calendario.filter(l=>l.marca==='TACO_BELL').reduce((a,l)=>a+l.equipos,0),75)
  const meses=marca=>[10,11,12].map(m=>calendario.filter(l=>l.marca===marca&&Number(l.fecha_programada.slice(5,7))===m).length)
  assert.deepEqual(meses('SHELL'),[7,5,4]);assert.deepEqual(meses('TACO_BELL'),[5,6,5])
  for(const local of calendario)assert.equal(validarProgramacionTrimestral(local).id,local.id)
})
test('registros de otro trimestre no heredan la marca y una fecha tardía cuenta en el mes programado',()=>{
  const siguiente={...shell,anio:2027,trimestre:1,id:`SHELL:2027:1:${shell.codigo}`,fecha_programada:'2027-02-01'}
  const marcados=[{...shell,realizado:true,equipos_declarados:3},siguiente,taco]
  const ordenes=[{numero_orden:'1',marca:'SHELL',codigo:shell.codigo,fecha_realizada:'2026-12-29',estado:'Asignada a Técnico'},{numero_orden:'1',marca:'SHELL',codigo:shell.codigo,fecha_realizada:'2026-12-29'}]
  const r=prepararTrimestrales(marcados,ordenes)
  assert.equal(r.registros.find(r=>r.local.id===shell.id).estado,'finalizado')
  assert.equal(r.registros.find(r=>r.local.id===shell.id).ordenes.length,1)
  assert.equal(r.registros.find(r=>r.local.id===siguiente.id).estado,'pendiente')
  assert.equal(r.registros.find(r=>r.local.id===taco.id).estado,'pendiente')
  assert.equal(prepararTrimestrales(marcados,[]).registros.find(r=>r.local.id===shell.id).estado,'por-liquidar')
})
test('sin fecha ni asignación no adivina trimestre; referencia manual manda incluso después de la vuelta',()=>{
  const base={numero_orden:'2',marca:'SHELL',codigo:shell.codigo,fecha_realizada:null}
  assert.equal(vincularOrdenTrimestral(base,calendario),null)
  assert.equal(vincularOrdenTrimestral({...base,fecha_realizada:'2027-01-01'},calendario),null)
  assert.equal(vincularOrdenTrimestral({...base,fecha_realizada:'2027-01-01',programacion_id:shell.id},calendario).id,shell.id)
  assert.equal(vincularOrdenTrimestral({...base,programacion_id:taco.id},calendario),null)
  assert.equal(vincularOrdenTrimestral({...base,codigo:'',negocio:shell.nombre.toLowerCase(),fecha_realizada:'2026-10-09'},calendario).id,shell.id)
  assert.equal(prepararTrimestrales(calendario,[base]).sinUbicar.length,1)
})
test('excluir no suma equipos ni borra la marca manual',()=>{
  const locales=[{...shell,realizado:true,equipos_declarados:8}]
  const ordenes=[{numero_orden:'1',marca:'SHELL',codigo:shell.codigo,fecha_realizada:'2026-10-01',excluida:true}]
  const registro=prepararTrimestrales(locales,ordenes).registros[0]
  assert.equal(registro.estado,'por-liquidar');assert.equal(registro.ordenes.length,0);assert.equal(registro.todas.length,1)
})
test('importación exacta sin filtrar ESTADO, deduplica N° ORDEN y nunca usa FECHA INGRESO',()=>{
  const fila={CLIENTE:'preventivo shell prueba','N° ORDEN':42,'ID SOLICITANTE':shell.codigo,NEGOCIO:shell.nombre,'FECHA INGRESO':'01/10/2026',ESTADO:'Asignada a Técnico','TÉCNICO':'Ana'}
  const resultado=extraerOrdenesTrimestrales([fila,{...fila,ESTADO:'Orden Finalizada'},{...fila,CLIENTE:'SHELL', 'N° ORDEN':43}, {CLIENTE:'PREVENTIVO TB PRUEBA','N° ORDEN':'TB-1',Restaurante:'TB08','FECHA REALIZADA':'10/10/2026'}, {...fila,'N° ORDEN':''}],configs)
  assert.equal(resultado.ordenes.length,2);assert.equal(resultado.sinOrden,1)
  assert.equal(resultado.ordenes[0].fecha_realizada,null);assert.equal(resultado.ordenes[0].tecnico,'Ana')
  assert.equal(resultado.ordenes[1].codigo,'TB08');assert.equal(resultado.ordenes[1].fecha_realizada,'2026-10-10')
  assert.equal(extraerOrdenesTrimestrales([fila],[]).ordenes.length,0)
  assert.throws(()=>extraerOrdenesTrimestrales([fila],[...configs,{marca:'TACO_BELL',clientes:['PREVENTIVO SHELL PRUEBA'],encabezado_codigo:'CÓDIGO'}]),/dos marcas/)
})
test('validaciones y altas explícitas no crean meses recurrentes',()=>{
  const nueva=validarProgramacionTrimestral({...taco,codigo:'tb123',fecha_programada:'2027-01-10',equipos:''})
  assert.equal(nueva.id,'TACO_BELL:2027:1:TB123');assert.equal(nueva.equipos,null);assert.ok(!('meses' in nueva))
  for(const cambio of [{fecha_programada:'2026-02-30'},{equipos:0},{equipos:501},{codigo:'ABC:5'},{nombre:''}])assert.throws(()=>validarProgramacionTrimestral({...shell,...cambio}))
})
test('PNG filtrado naranja conserva dirección y colores por estado; no añade tiendas ocultas',()=>{
  const registros=prepararTrimestrales([{...shell,realizado:true},taco],[]).registros.filter(r=>r.local.marca==='SHELL')
  const imagen=datosImagenTrimestral(registros,'SHELL','Octubre – Diciembre 2026','Octubre')
  assert.equal(imagen.tema,'anaranjado');assert.equal(imagen.secciones[0].multilinea,true)
  assert.deepEqual(imagen.secciones[0].estados,['por-liquidar'])
  assert.ok(imagen.secciones[0].filas[0].includes(shell.direccion));assert.ok(!JSON.stringify(imagen).includes(taco.nombre))
  assert.equal(imagen.secciones[0].anchos.reduce((a,b)=>a+b,0),1240)
})
test('avance por corte distingue equipos, negocios y marcas manuales sin incluir tiendas cerradas',()=>{
  const locales=calendario.filter(l=>l.marca==='SHELL').slice(0,4).map((l,i)=>({...l,cerrado:i===3,realizado:i<=1,fecha_realizado:'2026-10-06',equipos_declarados:10}))
  const ordenes=[{numero_orden:'O1',marca:'SHELL',codigo:locales[0].codigo,fecha_realizada:'2026-10-05'}, {numero_orden:'O2',marca:'SHELL',codigo:locales[0].codigo,fecha_realizada:'2026-10-07'},{numero_orden:'O3',marca:'SHELL',codigo:locales[3].codigo,fecha_realizada:'2026-10-01'}]
  const seguimiento=prepararTrimestrales(locales,ordenes).registros
  const resumen=prepararAvanceTrimestral(seguimiento,'2026-10-06')
  assert.deepEqual(resumen,{asignados:3,finalizados:1,porLiquidar:1,equipos:1,realizados:2,pendientes:1,porcentaje:2/3*100})
  assert.equal(prepararAvanceTrimestral(seguimiento,'2026-10-07').equipos,2)
  assert.equal(prepararAvanceTrimestral([],'2026-10-06').porcentaje,0)
})
