const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesDesdeBase64(valor) {
  return Uint8Array.from(atob(valor), caracter => caracter.charCodeAt(0))
}

function base64DesdeBytes(bytes) {
  return btoa(String.fromCharCode(...bytes))
}

async function importarClave(claveBase64) {
  const bytes = bytesDesdeBase64(claveBase64)
  if (bytes.length !== 32) throw new Error('La clave de la bóveda debe tener 32 bytes.')
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function cifrarClave(clave, claveBase64, empleadoId) {
  const llave = await importarClave(claveBase64)
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(empleadoId) },
    llave,
    encoder.encode(clave),
  )
  return { cifrado: base64DesdeBytes(new Uint8Array(cifrado)), nonce: base64DesdeBytes(nonce) }
}

export async function descifrarClave(cifradoBase64, nonceBase64, claveBase64, empleadoId) {
  const llave = await importarClave(claveBase64)
  const plano = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytesDesdeBase64(nonceBase64), additionalData: encoder.encode(empleadoId) },
    llave,
    bytesDesdeBase64(cifradoBase64),
  )
  return decoder.decode(plano)
}
