export function resultadoAltaViaticos({ data, error }) {
  if (error) {
    const yaExiste = ['user_already_exists', 'email_exists'].includes(error.code) || /already registered/i.test(error.message || '')
    return {
      error: yaExiste
        ? 'Ese correo ya tiene una cuenta en Supabase Auth. La contraseña escrita en Personal no cambia la anterior; pide restablecerla al administrador.'
        : `No se pudo crear el acceso: ${error.message}`,
    }
  }
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: 'Ese correo ya tiene una cuenta en Supabase Auth. La contraseña escrita en Personal no cambia la anterior; pide restablecerla al administrador.' }
  }
  if (!data?.user) return { error: 'Supabase no confirmó la creación de la cuenta. Revisa Authentication > Users antes de entregar el acceso.' }
  return {
    aviso: data.session
      ? 'Cuenta de Viáticos creada. El técnico ya puede iniciar sesión.'
      : 'Cuenta de Viáticos creada. El técnico debe confirmar el correo recibido antes de iniciar sesión; revisa también la carpeta de spam.',
  }
}

export function mensajeErrorIngresoViaticos(error) {
  if (error?.code === 'email_not_confirmed') return 'El correo todavía no está confirmado en Supabase Auth. Revisa el mensaje de confirmación o solicita ayuda al administrador.'
  if (error?.code === 'invalid_credentials') return 'No existe una cuenta con esos datos o la contraseña no coincide. Si ya usabas ese correo, la contraseña escrita en Personal no cambia la anterior; consulta al administrador.'
  if (['over_request_rate_limit', 'over_email_send_rate_limit'].includes(error?.code)) return 'Demasiados intentos. Espera unos minutos antes de probar otra vez.'
  return 'No se pudo iniciar sesión. Intenta de nuevo o consulta al administrador.'
}
