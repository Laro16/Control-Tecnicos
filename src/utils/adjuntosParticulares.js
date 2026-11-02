export const DOCS_PARTICULAR = [
  'Cotizacion',
  'Voucher de Pago',
  'Recibo de caja',
  'Factura del servicio',
  'Orden de servicio fisica',
  'Orden de servicio SRS',
]

export function leerAdjunto(archivo) {
  if (!archivo) return null
  try {
    const datos = typeof archivo === 'string' ? JSON.parse(archivo) : archivo
    return datos && typeof datos === 'object' ? datos : null
  } catch { return null }
}

const normalizar = texto => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function buscarDocumento(archivos, tipoDoc) {
  return (archivos || []).map(leerAdjunto).find(archivo =>
    archivo?.tipoDoc === tipoDoc || (!archivo?.tipoDoc && normalizar(archivo?.nombre).includes(normalizar(tipoDoc)))
  ) || null
}

const MIME_IMAGEN = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
}

function mimeVistaPrevia(archivo, mime = '') {
  const contenido = String(mime).split(';')[0].trim().toLowerCase()
  if (contenido === 'application/pdf' || Object.values(MIME_IMAGEN).includes(contenido)) return contenido
  // Nunca insertar HTML, SVG ni documentos Office en el visor.
  if (contenido && !['application/octet-stream', 'binary/octet-stream'].includes(contenido)) return null
  let nombre = String(archivo?.nombre || '').trim()
  if (!/\.[^.\/\\]+$/.test(nombre)) {
    try { nombre = decodeURIComponent(new URL(archivo?.url).pathname) } catch { return null }
  }
  const extension = nombre.match(/\.([^.\/\\]+)$/)?.[1].toLowerCase()
  return extension === 'pdf' ? 'application/pdf' : MIME_IMAGEN[extension] || null
}

export function tipoVistaPreviaAdjunto(archivo, mime = '') {
  const contenido = mimeVistaPrevia(leerAdjunto(archivo), mime)
  return contenido === 'application/pdf' ? 'pdf' : contenido ? 'imagen' : null
}

export async function cargarVistaPreviaAdjunto(archivo, { obtener = fetch, signal } = {}) {
  const datos = leerAdjunto(archivo)
  if (!datos?.url) throw new Error('El archivo no tiene un enlace válido.')
  const respuesta = await obtener(datos.url, { signal })
  if (!respuesta.ok) throw new Error(`No se pudo cargar la vista previa${respuesta.status ? ` (HTTP ${respuesta.status})` : ''}.`)
  const contenido = await respuesta.blob()
  const mime = mimeVistaPrevia(datos, contenido.type)
  if (!mime) return { tipo: null, blob: null }
  return {
    tipo: mime === 'application/pdf' ? 'pdf' : 'imagen',
    // Evita que un PDF guardado como octet-stream fuerce la descarga del navegador.
    blob: contenido.type === mime ? contenido : new Blob([contenido], { type: mime }),
  }
}

export async function descargarAdjunto(archivo, { obtener = fetch, documento = document, urls = URL, programar = setTimeout } = {}) {
  const respuesta = await obtener(archivo.url)
  if (!respuesta.ok) throw new Error('No se pudo recuperar el archivo.')
  const enlace = documento.createElement('a')
  const urlTemporal = urls.createObjectURL(await respuesta.blob())
  enlace.href = urlTemporal
  enlace.download = archivo.nombre || 'documento'
  documento.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  programar(() => urls.revokeObjectURL(urlTemporal), 30000)
}
