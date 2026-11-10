import { supabase } from '../supabase.jsx'

const MODOS = new Set(['automatico','verde','sin-color'])

export async function leerResaltadosPreventivos() {
  const resaltados = []
  for (let desde=0; ; desde+=1000) {
    const { data, error } = await supabase.from('preventivos_resaltados').select('*')
      .order('marca').order('codigo').order('anio').order('mes').range(desde,desde+999)
    if (error) {
      if (['42P01','PGRST205'].includes(error.code) && /preventivos_resaltados/i.test(error.message || '')) {
        return { disponible:false, resaltados:[] }
      }
      throw new Error(error.message || 'No se pudieron consultar los resaltados.')
    }
    if (!Array.isArray(data)) throw new Error('No se confirmó la consulta de resaltados. Pulsa Actualizar.')
    resaltados.push(...data)
    if (data.length<1000) return { disponible:true, resaltados }
  }
}

export async function guardarResaltadoPreventivo(local, anio, mes, modo, revision=0) {
  const marca=String(local?.marca??'').trim().toUpperCase(), codigo=String(local?.codigo??'').trim()
  const year=Number(anio), month=Number(mes), version=Number(revision)
  if (!['GRANJERO','CAMPERO'].includes(marca) || !/^\d{1,20}$/.test(codigo)
    || !Number.isInteger(year) || year<2020 || year>2100
    || !Number.isInteger(month) || month<1 || month>12
    || !MODOS.has(modo) || !Number.isInteger(version) || version<0) {
    throw new Error('Datos o revisión del resaltado inválidos.')
  }
  const { data, error } = await supabase.rpc('guardar_resaltado_preventivo', {
    p_marca:marca, p_codigo:codigo, p_anio:year, p_mes:month, p_modo:modo, p_revision:version,
  })
  if (error) throw new Error(error.message || 'No se pudo guardar el resaltado.')
  if (!data || data.marca!==marca || data.codigo!==codigo || data.anio!==year || data.mes!==month
    || data.modo!==modo || data.revision!==version+1) {
    throw new Error('No se confirmó el guardado del resaltado. Pulsa Actualizar antes de reintentar.')
  }
  return data
}
