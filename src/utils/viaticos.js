export const CONCEPTOS_VIATICOS = [
  'Desayuno', 'Almuerzo', 'Cena', 'Hospedaje', 'Peaje', 'Parqueo',
  'Transporte', 'Caja chica', 'Versatec', 'Tapachula', 'Otro',
]

export const quetzales = monto => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(Number(monto) || 0)

export function resumenViaticos(empleados, entregas, gastos) {
  return empleados.map(empleado => {
    const totalEntregado = entregas.filter(item => item.empleado_id === empleado.id).reduce((n, item) => n + Math.round(Number(item.monto) * 100), 0) / 100
    const totalGastado = gastos.filter(item => item.empleado_id === empleado.id).reduce((n, item) => n + Math.round(Number(item.monto) * 100), 0) / 100
    const sinRespaldo = gastos.filter(item => item.empleado_id === empleado.id && !item.foto_ruta).reduce((n, item) => n + Math.round(Number(item.monto) * 100), 0) / 100
    const saldoCentavos = Math.round(totalEntregado * 100) - Math.round(totalGastado * 100)
    return {
      ...empleado, totalEntregado, totalGastado, sinRespaldo,
      saldo: saldoCentavos / 100,
      saldoDisponible: Math.max(0, saldoCentavos) / 100,
      saldoAFavorTecnico: Math.max(0, -saldoCentavos) / 100,
      estadoCuadre: saldoCentavos > 0 ? 'Pendiente por comprobar' : saldoCentavos < 0 ? 'A favor del técnico' : 'Cuadrado',
    }
  })
}

export async function comprimirFactura(archivo) {
  if (archivo.type === 'application/pdf') {
    if (archivo.size > 10 * 1024 * 1024) throw new Error('El PDF supera los 10 MB.')
    return archivo
  }
  if (!archivo.type.startsWith('image/')) throw new Error('Adjunta una foto o un PDF.')
  let imagen
  if (typeof createImageBitmap === 'function') {
    try { imagen = await createImageBitmap(archivo) } catch { /* Algunos teléfonos requieren la carga por Image. */ }
  }
  if (!imagen) {
    const url = URL.createObjectURL(archivo)
    try {
      imagen = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('No se pudo leer la foto. Usa JPG, PNG o PDF.'))
        img.src = url
      })
    } finally { URL.revokeObjectURL(url) }
  }
  try {
    const escala = Math.min(1, 2000 / Math.max(imagen.width || imagen.naturalWidth, imagen.height || imagen.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round((imagen.width || imagen.naturalWidth) * escala)
    canvas.height = Math.round((imagen.height || imagen.naturalHeight) * escala)
    const contexto = canvas.getContext('2d')
    contexto.fillStyle = '#fff'
    contexto.fillRect(0, 0, canvas.width, canvas.height)
    contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height)
    let calidad = 0.88
    let blob
    do {
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', calidad))
      calidad -= 0.08
    } while (blob?.size > 3 * 1024 * 1024 && calidad >= 0.72)
    canvas.width = 0
    canvas.height = 0
    if (!blob) throw new Error('No se pudo preparar la foto.')
    return new File([blob], `${archivo.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' })
  } finally {
    imagen.close?.()
  }
}
