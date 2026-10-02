import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { prepararSeguimiento } from '../src/utils/seguimientoPreventivos.js'

let servidor, Programacion, Preventivos, PortalTecnico
before(async()=>{
  servidor=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',plugins:[{name:'sin-red',enforce:'pre',load(id){if(id.replace(/\\/g,'/').endsWith('/src/supabase.jsx'))return "export const supabase={from(){throw Error('Sin red en prueba')},auth:{}}"}}]})
  Programacion=(await servidor.ssrLoadModule('/src/components/ProgramacionPreventivos.jsx')).default
  Preventivos=(await servidor.ssrLoadModule('/src/components/Preventivos.jsx')).default
  PortalTecnico=(await servidor.ssrLoadModule('/src/components/PortalTecnico.jsx')).default
})
after(()=>servidor?.close())
const local={id:'GRANJERO:1',marca:'GRANJERO',codigo:'1',nombre:'Granjero de prueba',direccion:'Ciudad',meses:[2,6,10],semana:'1',activo:true}
const marca={...local,anio:2026,mes:10,realizado:true,fecha_realizado:'2026-10-02',realizado_nombre:'Ana',realizado_por:'t1',revision:1,equipos_declarados:3,observaciones:'Faltó acceso a un equipo'}
const mostrar=(declaraciones=[],usuarioId='t1',tecnico=true)=>renderToStaticMarkup(React.createElement(Programacion,{registros:prepararSeguimiento([local],[],declaraciones,2026,10),declaraciones,anio:2026,mes:10,tecnico,usuarioId,listo:true,hoy:'2026-10-02'}))
test('ficha pendiente permite realizado; liquidado no es editable',()=>{
  const html=mostrar()
  assert.match(html,/Marcar realizado/);assert.match(html,/Realizado/);assert.match(html,/Liquidado/)
  assert.doesNotMatch(html,/type="checkbox"|tachado|line-through|Marcar liquidado/)
  assert.match(html,/Detalle/)
  assert.match(html,/id="detalle-preventivo-GRANJERO-1" hidden=""/)
  assert.match(html,/value="SICILIANA">Siciliana/)
  assert.match(html,/data-restaurante-tipo="GRANJERO"/)
})
test('ficha muestra autor, fecha, equipos y observación; sólo autor o admin pueden editar',()=>{
  const html=mostrar([marca])
  for(const texto of ['Ana','02/10/2026','3 equipos declarados','Faltó acceso','Editar reporte','Deshacer marca'])assert.ok(html.includes(texto),texto)
  assert.doesNotMatch(mostrar([marca],'t2'),/Editar reporte|Deshacer marca/)
  assert.match(mostrar([marca],'admin',false),/Editar reporte/)
})
test('el técnico no ve reportes administrativos ni asignación manual de órdenes',()=>{
  const html=renderToStaticMarkup(React.createElement(Preventivos,{tecnico:true,usuarioId:'t1'}))
  assert.doesNotMatch(html,/Descargar avance|Actividad semanal|Por ubicar|Semana del reporte/)
  assert.match(html,/Consulta lo que falta/)
})
test('el portal sólo ofrece Viáticos y Preventivos, no el panel general',()=>{
  const html=renderToStaticMarkup(React.createElement(PortalTecnico,{persona:{nombre:'Ana'},usuarioId:'t1',inicial:'preventivos'}))
  assert.match(html,/Menús del técnico/);assert.match(html,/Viáticos/);assert.match(html,/Preventivos/)
  assert.doesNotMatch(html,/Dashboard|Particulares|Vacaciones|Alerta de garantías/)
})
