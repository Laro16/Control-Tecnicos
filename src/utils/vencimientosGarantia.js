export function claveSerieGarantia(valor) {
  const serie = String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s-]+/g, '')
  return /^[A-Z0-9]{7,40}$/.test(serie) && /\d/.test(serie) && !/^(\d)\1+$/.test(serie) ? serie : ''
}

export function fechaGarantiaManual(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor ?? ''))) return null
  const [anio, mes, dia] = valor.split('-').map(Number)
  const fecha = new Date(anio, mes - 1, dia)
  return anio >= 1900 && fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia ? fecha : null
}

export function combinarVencimientosGarantia(confirmados = {}, expedientes = []) {
  const resultado = { ...confirmados }
  const ordenados = [...expedientes].sort((a, b) =>
    String(b.actualizado_en || '').localeCompare(String(a.actualizado_en || '')) || Number(b.id || 0) - Number(a.id || 0))
  for (const expediente of ordenados) {
    const serie = claveSerieGarantia(expediente.serie)
    if (!serie || Object.hasOwn(resultado, serie)) continue
    if (expediente.estado !== 'Autorizado' || !['Despacho', 'Factura de venta'].includes(expediente.motivo)) continue
    if (!fechaGarantiaManual(expediente.fecha_vencimiento)) continue
    resultado[serie] = {
      serie,
      fecha_vencimiento: expediente.fecha_vencimiento,
      registrado_en: expediente.actualizado_en || null,
      origen: 'expediente',
    }
  }
  return resultado
}

// Cada corrección agrega una revisión; nunca se borran las confirmaciones anteriores.
export async function leerVencimientosGarantia(db) {
  const porSerie = {}
  for (let desde = 0; ; desde += 500) {
    const { data, error } = await db.from('garantias_vencimientos')
      .select('id,serie,fecha_vencimiento,registrado_en').order('id', { ascending: false }).range(desde, desde + 499)
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Respuesta inválida al consultar los vencimientos.')
    for (const registro of data) {
      const clave = claveSerieGarantia(registro.serie)
      if (clave && !Object.hasOwn(porSerie, clave)) porSerie[clave] = registro
    }
    if (data.length < 500) return porSerie
  }
}

export async function guardarVencimientoGarantia(db, serie, fecha) {
  const clave = claveSerieGarantia(serie)
  if (!clave) throw new Error('Se necesita una serie válida para recordar su vencimiento.')
  if (fecha !== null && !fechaGarantiaManual(fecha)) throw new Error('Selecciona una fecha de vencimiento válida.')
  const { data, error } = await db.from('garantias_vencimientos')
    .insert({ serie: clave, fecha_vencimiento: fecha }).select('id,serie,fecha_vencimiento,registrado_en').single()
  if (error) throw error
  if (!data || data.serie !== clave || data.fecha_vencimiento !== fecha) throw new Error('No se pudo confirmar que la fecha quedó guardada. Reintenta la consulta antes de volver a guardar.')
  return data
}
