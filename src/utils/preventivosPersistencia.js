import { supabase } from '../supabase.jsx'
import { extraerOrdenesPreventivas } from './preventivos.js'
import { validarExclusionOrden } from './exclusionesPreventivos.js'
import { validarLocalPreventivo } from './catalogoPreventivos.js'
export async function importarPreventivos(filas) {
  const resultado = extraerOrdenesPreventivas(filas)
  for (let inicio=0; inicio<resultado.ordenes.length; inicio+=200) {
    const { error } = await supabase.from('preventivos_ordenes').upsert(resultado.ordenes.slice(inicio,inicio+200), { onConflict: 'numero_orden' })
    if (error) throw new Error(`No se guardaron los preventivos: ${error.message}`)
  }
  return resultado
}
export async function leerPreventivos({ tecnico = false } = {}) {
  const filas=[]
  for (let inicio=0;;inicio+=1000) {
    const consulta = tecnico ? supabase.rpc('consultar_ordenes_preventivos') : supabase.from('preventivos_ordenes').select('*')
    const {data,error}=await consulta.order('numero_orden').range(inicio,inicio+999)
    if(error) throw error
    filas.push(...data)
    if(data.length<1000) return filas
  }
}

export async function leerSeguimientoPreventivos() {
  const filas = []
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase.from('preventivos_realizados').select('*')
      .order('anio').order('mes').order('marca').order('codigo').range(inicio, inicio + 999)
    if (error) throw error
    filas.push(...(data || []))
    if ((data || []).length < 1000) return filas
  }
}

export async function sincronizarCatalogoPreventivos(catalogo) {
  const payload = catalogo.map(({ marca, codigo, nombre, meses, activo }) => ({ marca, codigo, nombre, meses, activo }))
  // La función sólo acepta administradores. No afecta órdenes ni declaraciones.
  const { error } = await supabase.rpc('sincronizar_catalogo_preventivos', { p_locales: payload })
  if (error) throw error
}

export async function leerLocalesPreventivos() {
  const filas = []
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase.from('preventivos_locales').select('*')
      .order('marca').order('codigo').range(inicio, inicio + 999)
    if (error) throw error
    filas.push(...(data || []))
    if ((data || []).length < 1000) return filas
  }
}

export async function leerHistorialCierres() {
  const filas = []
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase.from('preventivos_cierres_historial').select('*')
      .order('registrado_en', { ascending: false }).order('id').range(inicio, inicio + 999)
    if (error) throw error
    filas.push(...(data || []))
    if ((data || []).length < 1000) return filas
  }
}

export async function guardarEstadoLocalPreventivo(local, datos) {
  const { data, error } = await supabase.rpc('cambiar_estado_local_preventivo', {
    p_marca: local.marca, p_codigo: local.codigo, p_cerrado: datos.cerrado,
    p_fecha: datos.fecha, p_motivo: datos.motivo, p_revision: local.revision_estado ?? 0,
  })
  if (error) throw error
  if (!data?.revision_estado) throw new Error('No se recibió la confirmación del cambio. Actualiza antes de intentar de nuevo.')
  return data
}

export async function guardarRealizadoPreventivo(local, anio, mes, datos, revision) {
  const { data, error } = await supabase.rpc('marcar_realizado_preventivo', {
    p_marca: local.marca, p_codigo: local.codigo, p_anio: Number(anio), p_mes: Number(mes),
    p_realizado: datos.realizado, p_fecha: datos.fecha || null, p_equipos: datos.equipos ?? null,
    p_observaciones: datos.observaciones || '', p_revision: revision ?? 0,
  })
  if (error) throw error
  if (!data?.revision) throw new Error('No se recibió la confirmación del guardado. Actualiza antes de intentar de nuevo.')
  return data
}

export async function leerExclusionesPreventivos() {
  async function leerTabla(tabla, campo) {
    const filas=[]
    for(let inicio=0;;inicio+=1000) {
      const {data,error}=await supabase.from(tabla).select('*').order(campo).range(inicio,inicio+999)
      if(error) throw error
      filas.push(...data)
      if(data.length<1000) return filas
    }
  }
  try {
    const exclusiones=await leerTabla('preventivos_ordenes_exclusiones','numero_orden')
    const historial=await leerTabla('preventivos_exclusiones_historial','id')
    return { disponible:true, exclusiones, historial }
  } catch(error) {
    if(['42P01','PGRST205'].includes(error.code) && String(error.message).includes('preventivos_ordenes_exclusiones')) {
      return { disponible:false, exclusiones:[], historial:[] }
    }
    // Un fallo de conexión no debe hacer que las órdenes excluidas vuelvan a contarse.
    throw error
  }
}

export async function guardarExclusionPreventivo(orden, excluida, motivo) {
  const {data,error}=await supabase.rpc('cambiar_exclusion_orden_preventivo',{
    p_numero_orden:orden.numero_orden, p_excluida:excluida,
    p_motivo:validarExclusionOrden(motivo), p_revision:orden.exclusion?.revision ?? 0,
  })
  if(error) throw error
  if(!data?.revision) throw new Error('No se recibió confirmación. Actualiza antes de intentar de nuevo.')
  return data
}

export async function guardarCatalogoLocalPreventivo(form, local) {
  const {data,error}=await supabase.rpc('guardar_local_preventivo',{
    p_datos:validarLocalPreventivo(form,[],!local),p_nuevo:!local,p_revision:local?.revision_catalogo??0,
  })
  if(error) throw error
  if(!data?.revision_catalogo) throw new Error('No se recibió confirmación. Actualiza antes de intentar de nuevo.')
  return data
}
