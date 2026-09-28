import { supabase } from '../supabase.jsx'

export async function usarBovedaPersonal(action, datos = {}) {
  const { data, error } = await supabase.functions.invoke('personal-vault', { body: { action, ...datos } })
  if (!error) return data
  let mensaje = error.message || 'No se pudo conectar con la bóveda.'
  try {
    const respuesta = await error.context?.json?.()
    if (respuesta?.error) mensaje = respuesta.error
  } catch { /* Si no hay respuesta JSON, conservar el mensaje original. */ }
  throw new Error(mensaje)
}
