export function combinarExclusionesOrdenes(ordenes, exclusiones) {
  const porOrden = new Map(exclusiones.map(e => [e.numero_orden, e]))
  return ordenes.map(orden => ({ ...orden, exclusion: porOrden.get(orden.numero_orden) || null }))
}

export function validarExclusionOrden(motivo) {
  const texto = String(motivo ?? '').trim()
  if (!texto || texto.length > 1500) throw new Error('Indica un motivo de entre 1 y 1500 caracteres.')
  return texto
}
