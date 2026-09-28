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
