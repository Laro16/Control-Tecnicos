import test from 'node:test'
import assert from 'node:assert/strict'
import { prepararSeguimiento, validarRealizado, tipoRestaurantePreventivo } from '../src/utils/seguimientoPreventivos.js'
import { prepararAvance } from '../src/utils/preventivos.js'

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

test('dos cheques distintos: pendiente, declarado sin Excel y liquidado por Excel', () => {
  const [pendiente] = prepararSeguimiento([local],[],[],2026,10)
  assert.equal(pendiente.realizado,false);assert.equal(pendiente.liquidado,false)
  const [declarado] = prepararSeguimiento([local],[],[marca],2026,10)
  assert.equal(declarado.realizado,true);assert.equal(declarado.liquidado,false);assert.equal(declarado.estado,'por-liquidar')
  const [detectado] = prepararSeguimiento([local],[orden],[marca],2026,10)
  assert.equal(detectado.realizado,true);assert.equal(detectado.liquidado,true);assert.equal(detectado.ordenes.length,1)
})
test('el Excel activa ambos indicadores sin declaración y sin filtrar estado', () => {
  for (const estado of ['Asignada a Técnico','En Proceso','Orden Finalizada']) {
    const [r] = prepararSeguimiento([local],[{...orden,estado}],[],2026,10)
    assert.equal(r.realizado,true);assert.equal(r.liquidado,true);assert.equal(r.declaracion,null)
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
test('no liquida órdenes sin mes conocido y mantiene la atribución tardía existente', () => {
  assert.equal(prepararSeguimiento([local],[{...orden,fecha_realizada:null}],[marca],2026,10)[0].liquidado,false)
  const tardia = {...orden,fecha_realizada:'2026-11-01'}
  assert.equal(prepararSeguimiento([local],[tardia],[],2026,10)[0].liquidado,true)
  assert.equal(prepararSeguimiento([{...local,activo:false}],[orden],[marca],2026,10).length,0)
})
test('valida datos declarados sin fabricar cantidad de equipos', () => {
  assert.deepEqual(validarRealizado({fecha:'2026-10-02',equipos:'',observaciones:' Hecho '},'2026-10-02'),{fecha:'2026-10-02',equipos:null,observaciones:'Hecho'})
  assert.throws(()=>validarRealizado({fecha:'2026-10-03'},'2026-10-02'),/futura/)
  assert.throws(()=>validarRealizado({fecha:'2026-02-30'},'2026-10-02'),/válida/)
  assert.throws(()=>validarRealizado({fecha:'2026-10-02',equipos:'1.5'},'2026-10-02'),/equipos/)
})
