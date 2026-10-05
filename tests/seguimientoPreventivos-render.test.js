import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { prepararSeguimiento } from '../src/utils/seguimientoPreventivos.js'

let servidor, Programacion, Preventivos, PortalTecnico, DetalleOrdenes, Persistencia, supabasePrueba
before(async()=>{
  servidor=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',plugins:[{name:'sin-red',enforce:'pre',load(id){if(id.replace(/\\/g,'/').endsWith('/src/supabase.jsx'))return "export const supabase={from(){throw Error('Sin red en prueba')},auth:{}}"}}]})
  Programacion=(await servidor.ssrLoadModule('/src/components/ProgramacionPreventivos.jsx')).default
  Preventivos=(await servidor.ssrLoadModule('/src/components/Preventivos.jsx')).default
  PortalTecnico=(await servidor.ssrLoadModule('/src/components/PortalTecnico.jsx')).default
  DetalleOrdenes=(await servidor.ssrLoadModule('/src/components/DetalleOrdenesPreventivos.jsx')).default
  Persistencia=await servidor.ssrLoadModule('/src/utils/preventivosPersistencia.js')
  supabasePrueba=(await servidor.ssrLoadModule('/src/supabase.jsx')).supabase
})
after(()=>servidor?.close())
const local={id:'GRANJERO:1',marca:'GRANJERO',codigo:'1',nombre:'Granjero de prueba',direccion:'Ciudad',meses:[2,6,10],semana:'1',activo:true}
const marca={...local,anio:2026,mes:10,realizado:true,fecha_realizado:'2026-10-02',realizado_nombre:'Ana',realizado_por:'t1',revision:1,equipos_declarados:3,observaciones:'Faltó acceso a un equipo'}
const mostrar=(declaraciones=[],usuarioId='t1',tecnico=true)=>renderToStaticMarkup(React.createElement(Programacion,{registros:prepararSeguimiento([local],[],declaraciones,2026,10),declaraciones,anio:2026,mes:10,tecnico,usuarioId,listo:true,hoy:'2026-10-02'}))
test('ficha pendiente permite realizado y ofrece los tres estados',()=>{
  const html=mostrar()
  assert.match(html,/Marcar realizado/);assert.match(html,/Finalizado/);assert.match(html,/Pendiente/)
  assert.doesNotMatch(html,/type="checkbox"|tachado|line-through|Liquidado/)
  assert.match(html,/value="pendiente">Pendientes/);assert.match(html,/value="por-liquidar">Pendientes de liquidar/);assert.match(html,/value="finalizado">Finalizados/)
  assert.match(html,/Detalle/)
  assert.match(html,/id="detalle-preventivo-GRANJERO-1" hidden=""/)
  assert.match(html,/value="GRANJERO">Granjero \/ Siciliana/)
  assert.doesNotMatch(html,/value="SICILIANA"/)
  assert.match(html,/data-restaurante-tipo="GRANJERO"/)
})
test('ficha muestra autor, fecha, equipos y observación; sólo autor o admin pueden editar',()=>{
  const html=mostrar([marca])
  for(const texto of ['Ana','02/10/2026','3 equipos declarados','Faltó acceso','Editar reporte','Deshacer marca'])assert.ok(html.includes(texto),texto)
  assert.doesNotMatch(html,/Marcar realizado|Liquidado/)
  assert.match(html,/Pendiente de liquidar/)
  assert.doesNotMatch(mostrar([marca],'t2'),/Editar reporte|Deshacer marca/)
  assert.match(mostrar([marca],'admin',false),/Editar reporte/)
})

test('las órdenes conservan técnico y fecha sin inventar datos faltantes',()=>{
  const html=renderToStaticMarkup(React.createElement(DetalleOrdenes,{ordenes:[
    {numero_orden:'ORD-1',tecnico:'Carlos Reyes',fecha_realizada:'2026-10-01'},
    {numero_orden:'ORD-2',tecnico:'Daniel López',fecha_realizada:'2026-10-02'},
    {numero_orden:'ORD-3',tecnico:' ',fecha_realizada:null,detectado_en:'2026-10-02T14:00:00Z'},
  ]}))
  const filas=html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g)
  assert.equal(filas.length,3)
  assert.match(filas[0],/ORD-1/);assert.match(filas[0],/Carlos Reyes/);assert.match(filas[0],/01\/10\/2026/)
  assert.match(filas[1],/ORD-2/);assert.match(filas[1],/Daniel López/);assert.match(filas[1],/02\/10\/2026/)
  assert.match(filas[2],/No informado/);assert.match(filas[2],/Sin fecha en el Excel/)
  assert.doesNotMatch(filas[2],/02\/10\/2026/,'No usa la fecha de importación como fecha realizada')
})
test('el técnico no ve reportes administrativos ni asignación manual de órdenes',()=>{
  const html=renderToStaticMarkup(React.createElement(Preventivos,{tecnico:true,usuarioId:'t1'}))
  assert.doesNotMatch(html,/Descargar avance|Actividad semanal|Por ubicar|Semana del reporte|Órdenes excluidas/)
  assert.match(html,/Consulta lo que falta/)
})

test('sólo administración recibe el botón individual para excluir',()=>{
  const orden={numero_orden:'O1',marca:'GRANJERO',codigo:'1',fecha_realizada:'2026-10-01'}
  const props={registros:prepararSeguimiento([local],[orden],[],2026,10),declaraciones:[],anio:2026,mes:10,usuarioId:'t1',listo:true,hoy:'2026-10-02',excluirOrden:()=>{},exclusionesListas:true}
  assert.match(renderToStaticMarkup(React.createElement(Programacion,{...props,tecnico:false})),/aria-label="Excluir orden O1"/)
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(Programacion,{...props,tecnico:true})),/Excluir orden/)
})

test('sin migración avisa; una falla de conexión nunca se trata como lista vacía de exclusiones',async()=>{
  const anterior=supabasePrueba.from
  try {
    let error={code:'PGRST205',message:'Could not find public.preventivos_ordenes_exclusiones'}
    supabasePrueba.from=()=>({select(){return this},order(){return this},async range(){return {data:null,error}}})
    assert.equal((await Persistencia.leerExclusionesPreventivos()).disponible,false)
    error={code:'NETWORK',message:'Error de conexión'}
    await assert.rejects(()=>Persistencia.leerExclusionesPreventivos(),e=>e.message==='Error de conexión')
    error={code:'42P01',message:'public.preventivos_exclusiones_historial does not exist'}
    await assert.rejects(()=>Persistencia.leerExclusionesPreventivos(),e=>e.code==='42P01')
  } finally {supabasePrueba.from=anterior}
})
test('el portal sólo ofrece Viáticos y Preventivos, no el panel general',()=>{
  const html=renderToStaticMarkup(React.createElement(PortalTecnico,{persona:{nombre:'Ana'},usuarioId:'t1',inicial:'preventivos'}))
  assert.match(html,/Menús del técnico/);assert.match(html,/Viáticos/);assert.match(html,/Preventivos/)
  assert.doesNotMatch(html,/Dashboard|Particulares|Vacaciones|Alerta de garantías/)
})
