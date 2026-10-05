import test from 'node:test'
import assert from 'node:assert/strict'
import { combinarExclusionesOrdenes, validarExclusionOrden } from '../src/utils/exclusionesPreventivos.js'
import { prepararAvance } from '../src/utils/preventivos.js'
import { prepararSeguimiento } from '../src/utils/seguimientoPreventivos.js'
import { datosImagenProgramacion } from '../src/utils/preventivosImagen.js'

const local={id:'CAMPERO:632',marca:'CAMPERO',codigo:'632',nombre:'Campero 632',meses:[1,5,9],activo:true,semana:'SEMANA 3'}
const orden={numero_orden:'407456',marca:'CAMPERO',codigo:'632',negocio:'CAMPERO 632',fecha_realizada:'2026-09-29',tecnico:'Ana',estado:'Asignada a Técnico'}
const otra={...orden,numero_orden:'407457'}
const exclusion={numero_orden:orden.numero_orden,excluida:true,motivo:'Servicio no realizado',revision:1}
const declaracion={marca:'CAMPERO',codigo:'632',anio:2026,mes:9,realizado:true,fecha_realizado:'2026-09-29'}

test('la exclusión se une por N° ORDEN y sobrevive a una nueva carga sin alterar el Excel',()=>{
  const originales=[orden,otra]
  const revisadas=combinarExclusionesOrdenes(originales,[exclusion])
  assert.equal(revisadas[0].exclusion,exclusion)
  assert.equal(revisadas[1].exclusion,null)
  assert.equal(orden.exclusion,undefined)
  const recarga=combinarExclusionesOrdenes([{...orden,tecnico:'Otro técnico'}],[exclusion])
  assert.equal(recarga[0].exclusion.excluida,true)
  assert.equal(recarga[0].tecnico,'Otro técnico')
})

test('excluir una orden no quita otra del mismo restaurante ni duplica equipos',()=>{
  const revisadas=combinarExclusionesOrdenes([orden,otra,otra],[exclusion])
  const [r]=prepararSeguimiento([local],revisadas,[],2026,9)
  assert.equal(r.estado,'finalizado');assert.deepEqual(r.ordenes.map(o=>o.numero_orden),['407457'])
  const avance=prepararAvance([local],revisadas,2026,3,'2026-10-04')
  assert.equal(avance.resumen[1].atendidos,1);assert.equal(avance.resumen[1].equipos,1)
  assert.equal(avance.atribuidas.length,1)
})

test('sin órdenes válidas vuelve a pendiente, salvo que exista una marca manual',()=>{
  const revisadas=combinarExclusionesOrdenes([orden],[exclusion])
  const seguimiento=prepararSeguimiento([local],revisadas,[],2026,9)
  assert.equal(seguimiento[0].estado,'pendiente')
  const avance=prepararAvance([local],revisadas,2026,3,'2026-10-04')
  assert.equal(avance.resumen[1].atendidos,0);assert.equal(avance.resumen[1].equipos,0);assert.equal(avance.resumen[1].pendiente,1)
  assert.equal(datosImagenProgramacion(seguimiento,{tipo:'CAMPERO',anio:2026,mes:9}).secciones[0].filas[0][4],'Pendiente')
  assert.equal(prepararSeguimiento([local],revisadas,[declaracion],2026,9)[0].estado,'por-liquidar')
  const manual=prepararAvance([local],revisadas,2026,3,'2026-10-04',[declaracion]).resumen[1]
  assert.equal(manual.atendidos,1);assert.equal(manual.equipos,0)
})

test('excluidas sin fecha o sin restaurante no aparecen en Por ubicar; restaurar recupera el periodo',()=>{
  for(const datos of [{...orden,fecha_realizada:null},{...orden,codigo:'DESCONOCIDO'}]) {
    const avance=prepararAvance([local],combinarExclusionesOrdenes([datos],[exclusion]),2026,3)
    assert.equal(avance.atribuidas.length,0);assert.equal(avance.sinLocal.length,0);assert.equal(avance.sinFecha.length,0)
  }
  const restauradas=combinarExclusionesOrdenes([orden],[{...exclusion,excluida:false,revision:2}])
  assert.equal(prepararSeguimiento([local],restauradas,[],2026,9)[0].estado,'finalizado')
  assert.equal(prepararSeguimiento([local],restauradas,[],2026,5)[0].estado,'pendiente')
  assert.equal(restauradas[0].exclusion.revision,2)
})

test('el motivo es obligatorio y limitado',()=>{
  assert.equal(validarExclusionOrden(' Servicio eliminado '),'Servicio eliminado')
  for(const motivo of ['',null,'   ','x'.repeat(1501)]) assert.throws(()=>validarExclusionOrden(motivo),/motivo/)
})
