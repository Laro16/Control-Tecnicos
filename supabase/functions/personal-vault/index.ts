import { createClient } from 'npm:@supabase/supabase-js@2'
import { cifrarClave, descifrarClave } from './crypto.js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function responder(estado, datos) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
  })
}

const esUuid = valor => typeof valor === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)

async function buscarUsuarioPorCorreo(admin, correo) {
  for (let pagina = 1; pagina <= 100; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 })
    if (error) throw error
    const usuarios = data?.users || []
    const encontrado = usuarios.find(usuario => usuario.email?.trim().toLowerCase() === correo)
    if (encontrado) return encontrado
    if (usuarios.length < 1000) return null
  }
  throw new Error('Demasiados usuarios para localizar el correo.')
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return responder(405, { error: 'Método no permitido.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vaultKey = Deno.env.get('PERSONAL_VAULT_KEY_B64')
  if (!supabaseUrl || !anonKey || !serviceKey || !vaultKey) return responder(503, { error: 'La bóveda aún no está configurada en Supabase.' })

  try {
    const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!bearer) return responder(401, { error: 'Inicia sesión como administrador.' })
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: usuario, error: errorUsuario } = await admin.auth.getUser(bearer)
    if (errorUsuario || !usuario?.user?.id || !usuario.user.email) return responder(401, { error: 'La sesión expiró. Ingresa de nuevo.' })
    const { data: rol, error: errorRol } = await admin.from('viaticos_admins').select('user_id').eq('user_id', usuario.user.id).maybeSingle()
    if (errorRol) throw errorRol
    if (!rol) return responder(403, { error: 'Solo un administrador puede usar la bóveda.' })

    const cuerpo = await request.json().catch(() => null)
    if (!cuerpo || !['status', 'set', 'reveal'].includes(cuerpo.action)) return responder(400, { error: 'Solicitud inválida.' })
    if (cuerpo.action === 'status') {
      const { data, error } = await admin.from('personal_claves_boveda').select('empleado_id,actualizado_en').eq('vigente', true)
      if (error) throw error
      return responder(200, { registros: data || [] })
    }

    if (!esUuid(cuerpo.empleado_id)) return responder(400, { error: 'Selecciona una persona válida.' })
    if (typeof cuerpo.admin_password !== 'string' || !cuerpo.admin_password) return responder(400, { error: 'Ingresa tu contraseña de administrador.' })

    // Cliente efímero: validar la contraseña no cambia la sesión del navegador.
    const verificador = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: reautenticado, error: errorClaveAdmin } = await verificador.auth.signInWithPassword({ email: usuario.user.email, password: cuerpo.admin_password })
    if (errorClaveAdmin || reautenticado?.user?.id !== usuario.user.id) return responder(403, { error: 'La contraseña de administrador no coincide.' })

    if (cuerpo.action === 'reveal') {
      const { data: registro, error } = await admin.from('personal_claves_boveda').select('auth_user_id,cifrado,nonce,actualizado_en').eq('empleado_id', cuerpo.empleado_id).eq('vigente', true).maybeSingle()
      if (error) throw error
      if (!registro) return responder(404, { error: 'Esta persona aún no tiene una contraseña guardada en la bóveda. Asigna una nueva desde Editar.' })
      const { data: empleado, error: errorEmpleado } = await admin.from('vac_empleados').select('correo_viaticos').eq('id', cuerpo.empleado_id).maybeSingle()
      if (errorEmpleado) throw errorEmpleado
      const { data: cuenta, error: errorCuenta } = await admin.auth.admin.getUserById(registro.auth_user_id)
      if (errorCuenta || !empleado?.correo_viaticos || cuenta?.user?.email?.toLowerCase() !== empleado.correo_viaticos.trim().toLowerCase()) {
        return responder(409, { error: 'El correo del personal ya no coincide con la cuenta guardada. Asigna una nueva contraseña desde Editar.' })
      }
      const password = await descifrarClave(registro.cifrado, registro.nonce, vaultKey, cuerpo.empleado_id)
      return responder(200, { password, actualizado_en: registro.actualizado_en })
    }

    if (typeof cuerpo.password !== 'string' || cuerpo.password.length < 8 || cuerpo.password.length > 128) {
      return responder(400, { error: 'La nueva contraseña debe tener entre 8 y 128 caracteres.' })
    }
    const { data: empleado, error: errorEmpleado } = await admin.from('vac_empleados').select('id,correo_viaticos').eq('id', cuerpo.empleado_id).maybeSingle()
    if (errorEmpleado) throw errorEmpleado
    const correo = empleado?.correo_viaticos?.trim().toLowerCase()
    if (!correo) return responder(400, { error: 'Agrega primero el correo de Viáticos en Personal.' })

    const existente = await buscarUsuarioPorCorreo(admin, correo)
    if (existente) {
      const { data: adminExistente, error: errorAdminExistente } = await admin.from('viaticos_admins').select('user_id').eq('user_id', existente.id).maybeSingle()
      if (errorAdminExistente) throw errorAdminExistente
      if (adminExistente) return responder(409, { error: 'Ese correo pertenece a un administrador. No se puede cambiar su contraseña desde Personal.' })
    }
    const secreto = await cifrarClave(cuerpo.password, vaultKey, cuerpo.empleado_id)
    // Marcar pendiente ANTES de tocar Auth impide revelar una clave antigua si falla el guardado final.
    const { error: errorPendiente } = await admin.from('personal_claves_boveda').upsert({
      empleado_id: cuerpo.empleado_id,
      auth_user_id: existente?.id || null,
      ...secreto,
      actualizado_en: new Date().toISOString(),
      actualizado_por: usuario.user.id,
      vigente: false,
    }, { onConflict: 'empleado_id' })
    if (errorPendiente) throw errorPendiente
    const resultadoAuth = existente
      ? await admin.auth.admin.updateUserById(existente.id, { password: cuerpo.password, email_confirm: true })
      : await admin.auth.admin.createUser({ email: correo, password: cuerpo.password, email_confirm: true })
    if (resultadoAuth.error) return responder(400, { error: `No se pudo actualizar la cuenta: ${resultadoAuth.error.message}. Reintenta desde Personal.` })
    const authUserId = resultadoAuth.data?.user?.id || existente?.id
    if (!authUserId) throw new Error('Supabase Auth no devolvió el usuario creado.')

    const { error: errorBoveda } = await admin.from('personal_claves_boveda').update({
      auth_user_id: authUserId,
      actualizado_en: new Date().toISOString(),
      vigente: true,
    }).eq('empleado_id', cuerpo.empleado_id).eq('nonce', secreto.nonce).select('empleado_id').single()
    if (errorBoveda) return responder(500, { error: 'La contraseña cambió en Supabase Auth, pero no pudo guardarse en la bóveda. Repite con la misma contraseña.' })
    return responder(200, { ok: true, creada: !existente })
  } catch (_error) {
    return responder(500, { error: 'No se pudo completar la operación de la bóveda. Revisa la configuración y los registros de la función.' })
  }
})
