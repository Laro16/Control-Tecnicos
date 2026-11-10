import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let servidor, persistencia, supabasePrueba
before(async()=>{
  servidor=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',plugins:[{
    name:'resaltados-sin-red',enforce:'pre',load(id){
      if(id.replace(/\\/g,'/').endsWith('/src/supabase.jsx'))return "export const supabase={from(){throw Error('Sin red en prueba')},rpc(){throw Error('Sin red en prueba')}}"
    },
  }]})
  persistencia=await servidor.ssrLoadModule('/src/utils/resaltadosPreventivosPersistencia.js')
  supabasePrueba=(await servidor.ssrLoadModule('/src/supabase.jsx')).supabase
})
after(()=>servidor?.close())

const local={marca:'GRANJERO',codigo:'413'}
test('resaltados: consulta todas las páginas con un orden estable',async()=>{
  const rangos=[],orden=[]
  supabasePrueba.from=tabla=>{
    assert.equal(tabla,'preventivos_resaltados')
    return {select(){return this},order(campo){orden.push(campo);return this},async range(desde,hasta){
      rangos.push([desde,hasta]);return {data:desde===0?Array.from({length:1000},(_,i)=>({codigo:String(i)})):[{codigo:'FINAL'}],error:null}
    }}
  }
  const resultado=await persistencia.leerResaltadosPreventivos()
  assert.equal(resultado.disponible,true);assert.equal(resultado.resaltados.length,1001)
  assert.deepEqual(rangos,[[0,999],[1000,1999]])
  assert.deepEqual(orden.slice(0,4),['marca','codigo','anio','mes'])
})
test('resaltados: únicamente una tabla no instalada se trata como activación pendiente',async()=>{
  for(const code of ['42P01','PGRST205']){
    supabasePrueba.from=()=>({select(){return this},order(){return this},async range(){return {data:null,error:{code,message:'No existe public.preventivos_resaltados'}}}})
    assert.deepEqual(await persistencia.leerResaltadosPreventivos(),{disponible:false,resaltados:[]})
  }
  for(const error of [{code:'PGRST205',message:'No existe otra_tabla'},{code:'42501',message:'Permiso denegado'},{code:'NETWORK',message:'Conexión fallida'}]){
    supabasePrueba.from=()=>({select(){return this},order(){return this},async range(){return {data:null,error}}})
    await assert.rejects(persistencia.leerResaltadosPreventivos(),new RegExp(error.message))
  }
  supabasePrueba.from=()=>({select(){return this},order(){return this},async range(){return {data:null,error:null}}})
  await assert.rejects(persistencia.leerResaltadosPreventivos(),/No se confirmó/)
})
test('resaltados: guarda modo visual y revisión sin datos de realización ni órdenes',async()=>{
  for(const modo of ['verde','sin-color','automatico']){
    supabasePrueba.rpc=async(nombre,datos)=>{
      assert.equal(nombre,'guardar_resaltado_preventivo')
      assert.deepEqual(datos,{p_marca:'GRANJERO',p_codigo:'413',p_anio:2026,p_mes:11,p_modo:modo,p_revision:2})
      return {data:{...local,anio:2026,mes:11,modo,revision:3},error:null}
    }
    const resultado=await persistencia.guardarResaltadoPreventivo(local,'2026','11',modo,2)
    assert.equal(resultado.modo,modo);assert.equal(resultado.revision,3)
  }
})
test('resaltados: valida modos y período antes de llamar al servidor',async()=>{
  supabasePrueba.rpc=()=>{throw Error('No debe consultar RPC')}
  for(const args of [[local,2026,11,'rojo',0],[local,2026,0,'verde',0],[local,2026,13,'verde',0],[local,2019,11,'verde',0],[local,2101,11,'verde',0],[local,2026,11,'verde',-1],[{marca:'SHELL',codigo:'413'},2026,11,'verde',0],[{marca:'GRANJERO',codigo:''},2026,11,'verde',0]]){
    await assert.rejects(persistencia.guardarResaltadoPreventivo(...args),/inválidos/)
  }
})
test('resaltados: el rechazo de revisión y la falta de confirmación no se ocultan como éxito',async()=>{
  supabasePrueba.rpc=async()=>({data:null,error:{message:'El resaltado cambió en otra sesión'}})
  await assert.rejects(persistencia.guardarResaltadoPreventivo(local,2026,11,'verde',0),/otra sesión/)
  for(const data of [null,{...local,anio:2026,mes:11,modo:'verde',revision:0},{...local,anio:2026,mes:12,modo:'verde',revision:1}]){
    supabasePrueba.rpc=async()=>({data,error:null})
    await assert.rejects(persistencia.guardarResaltadoPreventivo(local,2026,11,'verde',0),/No se confirmó/)
  }
})
