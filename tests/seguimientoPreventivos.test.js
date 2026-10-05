import test from 'node:test'
import assert from 'node:assert/strict'
import { prepararSeguimiento, validarRealizado, tipoRestaurantePreventivo } from '../src/utils/seguimientoPreventivos.js'
import { prepararAvance } from '../src/utils/preventivos.js'
import { datosImagenProgramacion, datosImagenAvance } from '../src/utils/preventivosImagen.js'

const local = { id:'GRANJERO:267',marca:'GRANJERO',codigo:'267',nombre:'Granjero',meses:[2,6,10],activo:true,semana:'1' }
const otro = { ...local,id:'CAMPERO:267',marca:'CAMPERO',nombre:'Campero' }
const marca = { marca:'GRANJERO',codigo:'267',anio:2026,mes:10,realizado:true,fecha_realizado:'2026-10-02',realizado_por:'tecnico-1',revision:1 }
const orden = { numero_orden:'123',marca:'GRANJERO',codigo:'267',fecha_realizada:'2026-10-02',estado:'Asignada a Técnico' }

test('clasifica el prefijo 7 como Siciliana sólo dentro de Granjero', () => {
  assert.equal(tipoRestaurantePreventivo({...local,codigo:'745'}),'SICILIANA')
  assert.equal(tipoRestaurantePreventivo({...local,codigo:745}),'SICILIANA')
  assert.equal(tipoRestaurantePreventivo({...local,codigo:'267'}),'GRANJERO')
  assert.equal(tipoRestaurantePreventivo({...otro,codigo:'727'}),'CAMPERO')
  const original = {...local,codigo:'745'}
  tipoRestaurantePreventivo(original)
  assert.equal(original.marca,'GRANJERO')
  assert.equal(original.codigo,'745')
})

test('tres estados: pendiente, marca manual por liquidar y finalizado por Excel', () => {
  const [pendiente] = prepararSeguimiento([local],[],[],2026,10)
  assert.equal(pendiente.realizado,false);assert.equal(pendiente.enExcel,false);assert.equal(pendiente.estado,'pendiente')
  const [declarado] = prepararSeguimiento([local],[],[marca],2026,10)
  assert.equal(declarado.realizado,true);assert.equal(declarado.enExcel,false);assert.equal(declarado.estado,'por-liquidar')
  const [detectado] = prepararSeguimiento([local],[orden],[marca],2026,10)
  assert.equal(detectado.realizado,true);assert.equal(detectado.enExcel,true);assert.equal(detectado.estado,'finalizado');assert.equal(detectado.ordenes.length,1)
})
test('el Excel finaliza sin declaración y sin filtrar ningún estado', () => {
  for (const estado of ['Asignada a Técnico','Asignada a Agencia','En Proceso','Orden Finalizada','Cancelada','',null]) {
    const [r] = prepararSeguimiento([local],[{...orden,estado}],[],2026,10)
    assert.equal(r.realizado,true);assert.equal(r.enExcel,true);assert.equal(r.declaracion,null);assert.equal(r.estado,'finalizado')
  }
})
test('las declaraciones nunca suman equipos oficiales ni duplican órdenes', () => {
  const [r] = prepararSeguimiento([local],[orden,orden],[marca],2026,10)
  assert.equal(r.ordenes.length,1)
  assert.equal(prepararAvance([local],[],2026,3).resumen[0].equipos,0)
})
test('no mezcla marcas, años o meses; declaración deshecha regresa a pendiente', () => {
  const r = prepararSeguimiento([local,otro],[],[marca],2026,10)
  assert.equal(r.find(x=>x.local.marca==='CAMPERO').realizado,false)
  assert.equal(prepararSeguimiento([local],[],[marca],2027,10)[0].realizado,false)
  assert.equal(prepararSeguimiento([local],[],[marca],2026,6)[0].realizado,false)
  assert.equal(prepararSeguimiento([local],[],[{...marca,realizado:false}],2026,10)[0].realizado,false)
})
test('no inventa mes de órdenes sin fecha; conserva asignación manual y atención tardía', () => {
  assert.equal(prepararSeguimiento([local],[{...orden,fecha_realizada:null}],[marca],2026,10)[0].enExcel,false)
  const asignada = {...orden,fecha_realizada:null,anio_programado:2026,mes_programado:10}
  assert.equal(prepararSeguimiento([local],[asignada],[],2026,10)[0].estado,'finalizado')
  const tardia = {...orden,fecha_realizada:'2026-11-01'}
  assert.equal(prepararSeguimiento([local],[tardia],[],2026,10)[0].enExcel,true)
  assert.equal(prepararSeguimiento([{...local,activo:false}],[orden],[marca],2026,10).length,0)
})

test('deshacer marca no revierte una orden del Excel y los pendientes van primero', () => {
  const registros = prepararSeguimiento([local,otro],[orden],[{...marca,realizado:false}],2026,10)
  assert.equal(registros[0].estado,'pendiente')
  assert.equal(registros[1].estado,'finalizado')
  assert.equal(registros[1].local.id,local.id)
})

test('el resumen cuenta marcas manuales y Excel una vez sin sumar equipos declarados', () => {
  const resumen = (ordenes,marcas,corte='2026-10-04') => prepararAvance([local,otro],ordenes,2026,3,corte,marcas).resumen
  const manual=resumen([],[{...marca,equipos_declarados:8}])[0]
  assert.equal(manual.atendidos,1);assert.equal(manual.pendiente,0);assert.equal(manual.equipos,0)
  assert.equal(manual.porLiquidar,1);assert.equal(manual.finalizados,0)
  const combinado=resumen([orden,orden],[marca,marca])[0]
  assert.equal(combinado.atendidos,1);assert.equal(combinado.equipos,1);assert.equal(combinado.porcentaje,100)
  assert.equal(combinado.porLiquidar,0);assert.equal(combinado.finalizados,1)
  assert.equal(resumen([],[marca])[1].atendidos,0,'No afecta a otra marca con el mismo código')
  for(const declaracion of [{...marca,realizado:false},{...marca,anio:2025},{...marca,mes:6},{...marca,mes:11},{...marca,fecha_realizado:'2026-10-05'}]) {
    assert.equal(resumen([],[declaracion])[0].atendidos,0,'Respeta correcciones, año, mes y corte')
  }
  assert.equal(prepararAvance([{...local,activo:false}],[],2026,3,undefined,[marca]).resumen[0].atendidos,0)
})

test('las imágenes distinguen marca manual por liquidar y finalizado por Excel', () => {
  for(const ordenes of [[],[orden]]) {
    const seguimiento=prepararSeguimiento([local,otro],ordenes,[marca],2026,10)
    const imagen=datosImagenProgramacion(seguimiento,{tipo:'GRANJERO',anio:2026,mes:10})
    assert.equal(imagen.secciones[0].filas.length,1)
    assert.equal(imagen.secciones[0].filas[0][4],ordenes.length?'Finalizado':'Pendiente de liquidar')
    assert.equal(imagen.secciones[0].filas[0][5],ordenes.length||'—')
  }
  const pendientes=datosImagenProgramacion(prepararSeguimiento([local],[],[],2026,10),{tipo:'GRANJERO',anio:2026,mes:10})
  assert.equal(pendientes.secciones[0].filas[0][4],'Pendiente')
  const avance=prepararAvance([local],[],2026,3,'2026-10-04',[marca])
  const imagen=datosImagenAvance(avance.resumen,{anio:2026,vuelta:3,semana:{inicio:'2026-09-28',fin:'2026-10-04'}})
  assert.equal(imagen.secciones[0].filas[0][2],0,'Sin finalizados')
  assert.equal(imagen.secciones[0].filas[0][3],1,'Una marca manual por liquidar')
  assert.equal(imagen.secciones[0].filas[0][6],0,'Sin pendientes de realizar')
})
test('valida datos declarados sin fabricar cantidad de equipos', () => {
  assert.deepEqual(validarRealizado({fecha:'2026-10-02',equipos:'',observaciones:' Hecho '},'2026-10-02'),{fecha:'2026-10-02',equipos:null,observaciones:'Hecho'})
  assert.throws(()=>validarRealizado({fecha:'2026-10-03'},'2026-10-02'),/futura/)
  assert.throws(()=>validarRealizado({fecha:'2026-02-30'},'2026-10-02'),/válida/)
  assert.throws(()=>validarRealizado({fecha:'2026-10-02',equipos:'1.5'},'2026-10-02'),/equipos/)
})
