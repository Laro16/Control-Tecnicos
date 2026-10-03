import test from 'node:test'
import assert from 'node:assert/strict'
import { combinarCatalogoLocales, validarEstadoLocal } from '../src/utils/cierresPreventivos.js'
import { atribuirOrden, prepararAvance } from '../src/utils/preventivos.js'
import { prepararSeguimiento } from '../src/utils/seguimientoPreventivos.js'

const local={id:'GRANJERO:267',marca:'GRANJERO',codigo:'267',nombre:'Local de prueba',activo:true,meses:[2,6,10],direccion:'Dirección original',semana:'SEMANA 1',equipos:5}
const cierre={marca:'GRANJERO',codigo:'267',activo:false,activo_manual:false,fecha_cierre:'2026-10-02',motivo_cierre:'Cierre del negocio',revision_estado:1}
const orden={marca:'GRANJERO',codigo:'267',numero_orden:'10',fecha_realizada:'2026-10-01'}

test('el estado guardado prevalece al cargar de nuevo el calendario y conserva los detalles',()=>{
  const [cerrado]=combinarCatalogoLocales([local],[cierre])
  assert.equal(cerrado.activo,false)
  assert.equal(cerrado.direccion,local.direccion)
  assert.equal(cerrado.equipos,5)
  assert.equal(cerrado.fecha_cierre,'2026-10-02')
  assert.equal(prepararSeguimiento([cerrado],[orden],[],2026,10).length,0)
  const avance=prepararAvance([cerrado],[orden],2026,3)
  assert.equal(avance.resumen[0].asignados,0)
  assert.equal(avance.resumen[0].equipos,0)
  assert.equal(avance.atribuidas[0].local.id,local.id,'El historial no se convierte en un negocio desconocido')
  assert.deepEqual(atribuirOrden(orden,[cerrado]).programado,{anio:2026,mes:10,vuelta:3})
  assert.equal(local.activo,true,'No cambia el archivo ni el catálogo original')
})
test('retiene puntos retirados del archivo, separa marcas con el mismo código y permite reactivar',()=>{
  const guardado={...local,...cierre}
  assert.equal(combinarCatalogoLocales([], [guardado])[0].id,local.id)
  const campero={...local,id:'CAMPERO:267',marca:'CAMPERO'}
  const resultado=combinarCatalogoLocales([local,campero],[cierre])
  assert.equal(resultado.find(l=>l.marca==='CAMPERO').activo,true)
  const reactivado=combinarCatalogoLocales(resultado,[{...guardado,activo:true,activo_manual:true,revision_estado:2}])
  assert.equal(prepararSeguimiento(reactivado,[orden],[],2026,10).find(r=>r.local.id===local.id).estado,'realizado')
})
test('valida fecha del cierre y permite reactivación sin inventar una fecha de cierre',()=>{
  assert.deepEqual(validarEstadoLocal({cerrado:true,fecha:'2026-10-02',motivo:' Cerró '},'2026-10-02'),{cerrado:true,fecha:'2026-10-02',motivo:'Cerró'})
  for(const fecha of ['', '2026-02-30','2026-10-03'])assert.throws(()=>validarEstadoLocal({cerrado:true,fecha},'2026-10-02'),/fecha/)
  assert.deepEqual(validarEstadoLocal({cerrado:false,fecha:'2026-10-02'},'2026-10-02'),{cerrado:false,fecha:null,motivo:''})
  assert.throws(()=>validarEstadoLocal({cerrado:true,fecha:'2026-10-02',motivo:'a'.repeat(1501)},'2026-10-02'),/motivo/)
})
