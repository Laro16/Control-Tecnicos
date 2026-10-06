import { supabase } from '../supabase.jsx'
import { extraerOrdenesTrimestrales, validarProgramacionTrimestral } from './preventivosTrimestrales.js'

async function leerTabla(tabla, campo='id', marca) {
  const filas=[]
  for(let inicio=0;;inicio+=1000) {
    let consulta=supabase.from(tabla).select('*').order(campo)
    if(marca)consulta=consulta.eq('marca',marca)
    const {data,error}=await consulta.range(inicio,inicio+999)
    if(error)throw Object.assign(new Error(error.message||'No se pudo consultar la programación trimestral.'),{code:error.code})
    filas.push(...(data||[]));if((data||[]).length<1000)return filas
  }
}
async function ejecutar(nombre, parametros) {
  const {data,error}=await supabase.rpc(nombre,parametros)
  if(error)throw new Error(error.message||'No se guardó el cambio.')
  return data
}
export async function cargarTrimestrales(marca, calendario, tecnico=false) {
  if(!tecnico)await ejecutar('sincronizar_programacion_trimestral',{p_locales:calendario.filter(p=>p.marca===marca).map(validarProgramacionTrimestral)})
  const [programacion,ordenes,configuraciones]=await Promise.all([
    leerTabla('preventivos_trimestrales_programacion','id',marca),
    leerTabla('preventivos_trimestrales_ordenes','numero_orden',marca),
    tecnico?Promise.resolve([]):leerTabla('preventivos_trimestrales_config','marca',marca),
  ])
  return {programacion,ordenes,configuracion:configuraciones[0]||null}
}
export const guardarMarcaTrimestral=(local,datos)=>ejecutar('marcar_realizado_trimestral',{
  p_id:local.id,p_revision:local.revision,p_realizado:datos.realizado,p_fecha:datos.fecha||null,
  p_equipos:datos.equipos??null,p_observaciones:datos.observaciones||'',
})
export const guardarTiendaTrimestral=(form,local)=>ejecutar('guardar_tienda_trimestral',{
  p_datos:validarProgramacionTrimestral(form),p_nuevo:!local,p_revision:local?.revision??0,
})
export const cerrarTiendaTrimestral=(local,motivo)=>ejecutar('cerrar_tienda_trimestral',{
  p_id:local.id,p_cerrado:!local.cerrado,p_motivo:motivo,p_revision:local.revision,
})
export const ajustarOrdenTrimestral=(orden,programacionId,excluida,motivo)=>ejecutar('ajustar_orden_trimestral',{
  p_orden:orden.numero_orden,p_programacion:programacionId||null,p_excluida:excluida,
  p_motivo:motivo,p_revision:orden.revision,
})
export const guardarConfigTrimestral=(marca,clientes,encabezado)=>ejecutar('configurar_excel_trimestral',{
  p_marca:marca,p_clientes:clientes,p_encabezado:encabezado,
})
export async function importarTrimestrales(filas) {
  let configuraciones
  try { configuraciones=await leerTabla('preventivos_trimestrales_config','marca') }
  catch(error) {
    if(['42P01','PGRST205'].includes(error.code)&&/preventivos_trimestrales_config/i.test(error.message))return {pendienteActivacion:true,ordenes:[],sinOrden:0}
    throw error
  }
  const resultado=extraerOrdenesTrimestrales(filas,configuraciones)
  for(let inicio=0;inicio<resultado.ordenes.length;inicio+=200) await ejecutar('importar_ordenes_trimestrales',{p_ordenes:resultado.ordenes.slice(inicio,inicio+200)})
  return resultado
}
