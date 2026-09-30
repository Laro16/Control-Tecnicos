import { supabase } from '../supabase.jsx'
import { extraerOrdenesPreventivas } from './preventivos.js'
export async function importarPreventivos(filas) {
  const resultado = extraerOrdenesPreventivas(filas)
  for (let inicio=0; inicio<resultado.ordenes.length; inicio+=200) {
    const { error } = await supabase.from('preventivos_ordenes').upsert(resultado.ordenes.slice(inicio,inicio+200), { onConflict: 'numero_orden' })
    if (error) throw new Error(`No se guardaron los preventivos: ${error.message}`)
  }
  return resultado
}
export async function leerPreventivos() {
  const filas=[]
  for (let inicio=0;;inicio+=1000) {
    const {data,error}=await supabase.from('preventivos_ordenes').select('*').order('numero_orden').range(inicio,inicio+999)
    if(error) throw error
    filas.push(...data)
    if(data.length<1000) return filas
  }
}
