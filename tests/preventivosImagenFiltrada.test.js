import test from 'node:test'
import assert from 'node:assert/strict'
import { datosImagenFiltradaProgramacion, dibujarImagenPreventivos } from '../src/utils/preventivosImagen.js'

const registro=(marca,codigo,estado='pendiente',direccion='Dirección de prueba')=>({local:{marca,codigo,nombre:`Tienda ${codigo}`,direccion,semana:'SEMANA 4',equipos:3},estado,ordenes:estado==='finalizado'?[{}]:[],declaracion:estado==='por-liquidar'?{equipos_declarados:2}:null})
test('exporta sólo los registros visibles y separa las marcas sin mutar filtros ni datos',()=>{
  const todos=[registro('GRANJERO','413'),registro('GRANJERO','492','finalizado'),registro('CAMPERO','492','por-liquidar')]
  const visibles=todos.slice(1),antes=JSON.stringify(todos)
  const imagen=datosImagenFiltradaProgramacion(visibles,{anio:2026,mes:11})
  assert.equal(imagen.tema,'anaranjado');assert.match(imagen.titulo,/NOVIEMBRE 2026/);assert.match(imagen.subtitulo,/2 puntos de venta/)
  assert.equal(imagen.secciones.length,2)
  assert.deepEqual(imagen.secciones.map(s=>s.estados),[['finalizado'],['por-liquidar']])
  assert.deepEqual(imagen.secciones.flatMap(s=>s.filas.map(f=>f[0])),['492','492'])
  assert.ok(!JSON.stringify(imagen).includes('413'),'El registro oculto no se exporta')
  assert.match(imagen.secciones[1].filas[0][4],/2 declarados/)
  assert.equal(JSON.stringify(todos),antes)
  assert.throws(()=>datosImagenFiltradaProgramacion([],{anio:2026,mes:11}),/No hay preventivos/)
})
test('las direcciones completas se envuelven en líneas sin cortar filas ni perder colores',()=>{
  const direccion='Kilómetro 200 carretera principal, frente al centro comercial. '.repeat(5)+'A'.repeat(90)
  const imagen=datosImagenFiltradaProgramacion([registro('GRANJERO','413','finalizado',direccion),registro('GRANJERO','414','pendiente','   ')],{anio:2026,mes:11})
  const textos=[],rellenos=[],ctx={measureText:t=>({width:String(t).length*8}),fillText(t,x,y){textos.push({t,x,y})},strokeRect(){},fillRect(x,y,w,h){rellenos.push({x,y,w,h,color:this.fillStyle})}}
  const canvas={getContext:()=>ctx}
  dibujarImagenPreventivos(canvas,imagen)
  const lineas=textos.filter(t=>t.x===430&&t.y>220&&t.t!=='Sin dirección registrada').map(t=>t.t)
  assert.ok(lineas.length>2)
  assert.equal(lineas.join('').replace(/\s/g,''),direccion.replace(/\s/g,''))
  assert.ok(lineas.every(l=>ctx.measureText(l).width<=410))
  assert.ok(textos.some(t=>t.t==='Sin dirección registrada'))
  assert.ok(rellenos.some(r=>r.color==='#dcfce7'&&r.h>48))
  assert.ok(textos.every(t=>t.y<canvas.height),'Ninguna línea queda fuera de la imagen')
})
