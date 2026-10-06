import test from 'node:test'
import assert from 'node:assert/strict'
import { validarLocalPreventivo } from '../src/utils/catalogoPreventivos.js'
import { combinarCatalogoLocales } from '../src/utils/cierresPreventivos.js'
import { datosImagenProgramacion, dibujarImagenPreventivos } from '../src/utils/preventivosImagen.js'

const datos={marca:'granjero',codigo:'00789',nombre:' Nueva tienda ',mes_base:2,equipos:'12',direccion:' Dirección ',telefono:'12345678',semana:'SEMANA 2'}
test('valida identidad, ciclo y datos opcionales sin confundir marcas',()=>{
  assert.deepEqual(validarLocalPreventivo(datos),{...datos,marca:'GRANJERO',codigo:'789',nombre:'Nueva tienda',equipos:12,direccion:'Dirección'})
  assert.equal(validarLocalPreventivo({...datos,equipos:''}).equipos,null)
  assert.equal(validarLocalPreventivo(datos,[{marca:'CAMPERO',codigo:'789'}]).codigo,'789')
  assert.throws(()=>validarLocalPreventivo(datos,[{marca:'GRANJERO',codigo:'789',activo:false}]),/ya existe/)
  assert.doesNotThrow(()=>validarLocalPreventivo(datos,[{marca:'GRANJERO',codigo:'789'}],false))
  for(const cambio of [{codigo:'X'}, {marca:'OTRA'}, {nombre:' '}, {mes_base:0}, {mes_base:5}, {mes_base:1.5}, {equipos:501}, {equipos:0}, {equipos:1.5}, {direccion:'a'.repeat(1001)}]) assert.throws(()=>validarLocalPreventivo({...datos,...cambio}))
})
test('los campos nulos de la migración mantienen detalles del calendario; edición manual prevalece',()=>{
  const local={id:'GRANJERO:789',marca:'GRANJERO',codigo:'789',nombre:'Tienda',meses:[2,6,10],activo:true,direccion:'Original',telefono:'123',semana:'SEMANA 2',equipos:12}
  const guardado={marca:'GRANJERO',codigo:'789',revision_catalogo:0,direccion:null,telefono:null,semana:null,equipos:null}
  assert.equal(combinarCatalogoLocales([local],[guardado])[0].direccion,'Original')
  assert.equal(combinarCatalogoLocales([local],[guardado])[0].equipos,12)
  const editado=combinarCatalogoLocales([local],[{...guardado,revision_catalogo:1,nombre:'Nuevo',meses:[3,7,11],direccion:'',equipos:null,activo:false}])[0]
  assert.equal(editado.direccion,'');assert.equal(editado.equipos,null);assert.equal(editado.activo,false);assert.deepEqual(editado.meses,[3,7,11])
  const nuevo=combinarCatalogoLocales([local],[{...local,codigo:'999',origen_manual:true,revision_catalogo:1}])
  assert.equal(nuevo.length,2);assert.equal(nuevo[1].id,'GRANJERO:999')
})
test('la imagen mantiene colores asociados a cada estado aunque cambie el orden',()=>{
  const registros=['finalizado','pendiente','por-liquidar'].map((estado,i)=>({estado,ordenes:estado==='finalizado'?[{}]:[],local:{marca:'GRANJERO',codigo:String(3-i),nombre:`Tienda ${i}`,semana:'SEMANA 1'}}))
  const imagen=datosImagenProgramacion(registros,{tipo:'GRANJERO',anio:2026,mes:10})
  assert.equal(imagen.tema,'anaranjado');assert.deepEqual(imagen.secciones[0].estados,['por-liquidar','pendiente','finalizado'])
  const rellenos=[],ctx={measureText:t=>({width:t.length*7}),fillText(){},strokeRect(){},fillRect(x,y,w,h){rellenos.push({x,y,w,h,color:this.fillStyle})}}
  dibujarImagenPreventivos({getContext:()=>ctx},imagen)
  assert.equal(rellenos.find(r=>r.y===0&&r.h===110).color,'#f59e0b')
  assert.equal(rellenos.find(r=>r.y===180).color,'#fb923c')
  assert.equal(rellenos.find(r=>r.y===228).color,'#fef3c7')
  assert.equal(rellenos.find(r=>r.y===324).color,'#dcfce7')
})
