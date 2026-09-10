import { claveSerieGarantia, fechaGarantiaManual } from './vencimientosGarantia.js'

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
  // En DESCRIPCIÓN INICIAL solo se aceptan secuencias de 7 a 12 dígitos que
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
    origen: serieDescripcion ? 'DESCRIPCIÓN INICIAL' : '',
  }
}

export function obtenerSerieTicket(ticket) {
  // Las cargas anteriores guardaban en SERIE lo extraído de DESCRIPCIÓN.
  // Si conocemos ese origen, recalculamos desde la falla reportada correcta;
  // nunca reemplazamos una serie capturada en la columna SERIE.
  const origen = normalizarTextoGarantia(ticket?.SERIE_ORIGEN)
  const fueExtraida = ['DESCRIPCION', 'DESCRIPCION INICIAL'].includes(origen)
  return resolverSerie(fueExtraida ? '' : ticket?.SERIE, ticket?.['DESCRIPCIÓN INICIAL']).valor
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

function parsearFechaCalendario(valor) {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null
    return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate())
  }
  const texto = String(valor ?? '').trim()
  let partes = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if (partes) {
    const [, dia, mes, anio] = partes.map(Number)
    const fecha = new Date(anio, mes - 1, dia)
    return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia ? fecha : null
  }
  partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
  if (partes) {
    const [, anio, mes, dia] = partes.map(Number)
    const fecha = new Date(anio, mes - 1, dia)
    return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia ? fecha : null
  }
  return null
}

export function obtenerFechaIngresoTicket(ticket = {}) {
  return parsearFechaCalendario(ticket.FECHA_INGRESO_OBJ) || parsearFechaCalendario(ticket['FECHA INGRESO'])
}

export function finMesGarantia(fecha) {
  return fecha instanceof Date && !Number.isNaN(fecha.getTime())
    ? new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0)
    : null
}

export function verificarGarantiaTicket(ticket, clientesGarantia = [], vencimientos = {}) {
  const clienteGarantia = buscarClienteGarantia(ticket?.CLIENTE, clientesGarantia)
  if (!clienteGarantia) return null

  const tipoActual = ticket?.TIPO === null || ticket?.TIPO === undefined
    ? ''
    : String(ticket.TIPO).trim()

  // Normal siempre requiere revisión para estos clientes, incluso si la
  // serie está dentro del plazo. Calculamos el plazo sin autorizar atención
  // ni modificar la clasificación emitida por el sistema de origen.
  const base = {
    esClienteGarantia: true,
    tipoIncorrecto: normalizarTextoGarantia(tipoActual) === 'NORMAL',
    tipoActual,
    tipoEsperado: 'Garantia',
    clienteNombre: clienteGarantia.nombre,
    aniosGarantia: clienteGarantia.anios,
  }

  const fechaFabricacion = parsearFechaSerie(obtenerSerieTicket(ticket))
  const confirmado = vencimientos[claveSerieGarantia(obtenerSerieTicket(ticket))]
  const fechaConfirmada = fechaGarantiaManual(confirmado?.fecha_vencimiento)
  const fechaIngreso = obtenerFechaIngresoTicket(ticket)
  const formatear = fecha => `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()}`
  if (!fechaFabricacion && !fechaConfirmada) {
    return {
      ...base,
      sinDatosSerie: true,
      sinFechaIngreso: !fechaIngreso,
      fechaIngreso,
      fechaIngresoDisplay: fechaIngreso ? formatear(fechaIngreso) : 'No disponible',
    }
  }

  const fechaVencimiento = fechaConfirmada || new Date(fechaFabricacion)
  if (!fechaConfirmada) fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + clienteGarantia.anios)
  const fechaLimiteIngreso = finMesGarantia(fechaVencimiento)
  const sinFechaIngreso = !fechaIngreso
  const vencida = sinFechaIngreso ? null : fechaIngreso > fechaLimiteIngreso
  const diasMargenIngreso = sinFechaIngreso ? null : Math.round((fechaLimiteIngreso - fechaIngreso) / (1000 * 60 * 60 * 24))

  return {
    ...base,
    sinDatosSerie: false,
    sinFechaIngreso,
    vencida,
    diasRestantes: diasMargenIngreso,
    diasMargenIngreso,
    fechaIngreso,
    fechaIngresoDisplay: fechaIngreso ? formatear(fechaIngreso) : 'No disponible',
    fechaFabricacion,
    fechaVencimiento,
    fechaLimiteIngreso,
    fechaVerificada: Boolean(fechaConfirmada),
    origenVencimiento: fechaConfirmada ? 'Vencimiento confirmado manualmente' : 'Calculado por fabricación',
    fabDisplay: fechaFabricacion ? formatear(fechaFabricacion) : 'No verificable',
    vencDisplay: formatear(fechaVencimiento),
    coberturaHastaDisplay: formatear(fechaLimiteIngreso),
  }
}
