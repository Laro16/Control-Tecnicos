import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente independiente: crear un técnico no reemplaza la sesión abierta del administrador.
export async function crearAccesoViaticos(correo, contrasena) {
  const cliente = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  return cliente.auth.signUp({ email: correo, password: contrasena })
}
