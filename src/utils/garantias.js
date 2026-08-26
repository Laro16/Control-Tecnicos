export function normalizarTextoGarantia(texto) {
  if (texto === null || texto === undefined) return ''
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

export function normalizarClienteGarantia(cliente) {
  let limpio = normalizarTextoGarantia(cliente)
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\bSOCIEDAD ANONIMA\b/g, ' ')
    .replace(/\bS A\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Algunos archivos diarios anteponen "GARANTIA" al nombre real del cliente.
  // La fila cuyo cliente es exactamente "GARANTIA" sigue siendo válida.
  if (limpio.startsWith('GARANTIA ') && limpio.length > 'GARANTIA '.length) {
    limpio = limpio.slice('GARANTIA '.length).trim()
  }
  return limpio
}

export function buscarClienteGarantia(clienteTexto, clientesGarantia = []) {
  if (!clienteTexto || clienteTexto === '-') return null
  const clienteNormalizado = normalizarClienteGarantia(clienteTexto)
  if (!clienteNormalizado) return null

  return clientesGarantia.find(cliente => {
    const baseNormalizada = normalizarClienteGarantia(cliente.nombre)
    if (!baseNormalizada) return false
    if (clienteNormalizado === baseNormalizada) return true

    // Permite descripciones adicionales solo en nombres suficientemente
    // específicos; evita que una fila genérica como "GARANTIA" haga match
    // con cualquier cliente que contenga esa palabra.
    const nombreEspecifico = baseNormalizada.length >= 10 && baseNormalizada.includes(' ')
    return nombreEspecifico && (
      clienteNormalizado.includes(baseNormalizada) || baseNormalizada.includes(clienteNormalizado)
    )
  }) || null
}

export function extraerSerieDescripcion(descripcion) {
  if (descripcion === null || descripcion === undefined) return ''
  // En DESCRIPCIÓN solo se aceptan secuencias de 7 a 12 dígitos que
  // comiencen con 0, 1 o 2. Esto reduce falsos positivos con teléfonos.
  const coincidencia = String(descripcion).match(/(?:^|\D)([012]\d{6,11})(?!\d)/)
  return coincidencia?.[1] || ''
}

export function resolverSerie(serieDirecta, descripcion) {
  const serieLimpia = serieDirecta === null || serieDirecta === undefined
    ? ''
    : String(serieDirecta).trim()

  if (serieLimpia && serieLimpia !== '-') {
    return { valor: serieLimpia, origen: 'SERIE' }
  }

  const serieDescripcion = extraerSerieDescripcion(descripcion)
  return {
    valor: serieDescripcion || '-',
    origen: serieDescripcion ? 'DESCRIPCIÓN' : '',
  }
}

export function obtenerSerieTicket(ticket) {
  return resolverSerie(ticket?.SERIE, ticket?.DESCRIPCIÓN).valor
}

export function parsearFechaSerie(serie) {
  if (!serie || serie === '-') return null
  const limpio = String(serie).replace(/\D/g, '')
  if (limpio.length < 6) return null

  const anio = parseInt(limpio.substring(0, 2), 10)
  const mes = parseInt(limpio.substring(2, 4), 10)
  const dia = parseInt(limpio.substring(4, 6), 10)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null

  const anioCompleto = anio <= 50 ? 2000 + anio : 1900 + anio
  const fecha = new Date(anioCompleto, mes - 1, dia)
  if (
    Number.isNaN(fecha.getTime()) ||
    fecha.getFullYear() !== anioCompleto ||
    fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia
  ) return null

  return fecha
}

export function verificarGarantiaTicket(ticket, clientesGarantia = []) {
  const clienteGarantia = buscarClienteGarantia(ticket?.CLIENTE, clientesGarantia)
  if (!clienteGarantia) return null

  const fechaFabricacion = parsearFechaSerie(obtenerSerieTicket(ticket))
  if (!fechaFabricacion) {
    return {
      esClienteGarantia: true,
      sinDatosSerie: true,
      clienteNombre: clienteGarantia.nombre,
      aniosGarantia: clienteGarantia.anios,
    }
  }

  const fechaVencimiento = new Date(fechaFabricacion)
  fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + clienteGarantia.anios)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const vencida = hoy > fechaVencimiento
  const diasRestantes = Math.ceil((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24))
  const formatear = fecha => `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()}`

  return {
    esClienteGarantia: true,
    sinDatosSerie: false,
    vencida,
    diasRestantes,
    fechaFabricacion,
    fechaVencimiento,
    clienteNombre: clienteGarantia.nombre,
    aniosGarantia: clienteGarantia.anios,
    fabDisplay: formatear(fechaFabricacion),
    vencDisplay: formatear(fechaVencimiento),
  }
}
