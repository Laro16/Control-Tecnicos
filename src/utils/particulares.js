import { SSF } from 'xlsx/xlsx.mjs'
import { normalizarTextoGarantia, resolverSerie } from './garantias.js'

const texto = valor => valor == null ? '' : String(valor).trim()
const dato = valor => texto(valor) === '-' ? '' : texto(valor)
export const claveReferenciaParticular = valor => normalizarTextoGarantia(dato(valor))

function fechaTexto(valor) {
  if (typeof valor === 'number') return SSF.parse_date_code(valor) ? SSF.format('dd/mm/yyyy', valor) : texto(valor)
  return dato(valor)
}

// Identidad estable para la misma referencia, incluso desde dos dispositivos.
// UUIDv8 derivado de SHA-256 (RFC 9562, 5.8); no se usa como credencial.
// No cambiar el prefijo ni la normalización: son parte de la identidad guardada.
export async function idParticularReferencia(referencia) {
  const clave = claveReferenciaParticular(referencia)
  if (!clave) throw new Error('La particular necesita N° REFERENCIA.')
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`control-tecnicos/particular/v1:${clave}`))
  const bytes = new Uint8Array(hash).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function prepararParticularesExcel(filas, archivo = '') {
  const unicas = new Map()
  let detectadas = 0, repetidas = 0, sinReferencia = 0
  for (const original of filas) {
    const fila = Object.fromEntries(Object.entries(original).map(([campo, valor]) => [normalizarTextoGarantia(campo), valor]))
    if (normalizarTextoGarantia(fila.CLIENTE) !== 'PARTICULAR') continue
    detectadas++
    const referencia = dato(fila['N° REFERENCIA'])
    const clave = claveReferenciaParticular(referencia)
    if (!clave) { sinReferencia++; continue }
    if (unicas.has(clave)) { repetidas++; continue }
    const negocio = dato(fila.NEGOCIO)
    const descripcionInicial = dato(fila['DESCRIPCION INICIAL'])
    const extraida = ['DESCRIPCION', 'DESCRIPCION INICIAL'].includes(normalizarTextoGarantia(fila['ORIGEN DE SERIE']))
    const serie = resolverSerie(extraida ? '' : fila.SERIE, descripcionInicial)
    const detalles = [
      ['Archivo de origen', archivo], ['Cliente', 'PARTICULAR'], ['Estado en el Excel', dato(fila.ESTADO)],
      ['Fecha de ingreso', fechaTexto(fila['FECHA INGRESO'])], ['Fecha realizada', fechaTexto(fila['FECHA REALIZADA'])],
      ['Técnico', dato(fila.TECNICO)], ['Teléfono', dato(fila.TELEFONO)], ['Serie', dato(serie.valor)],
      ['Origen de la serie', serie.origen], ['Modelo', dato(fila.MODELO)], ['Tipo de servicio', dato(fila['TIPO DE SERVICIO'])],
      ['TIPO del reporte', dato(fila.TIPO)], ['Falla reportada', descripcionInicial], ['Descripción del servicio', dato(fila.DESCRIPCION)],
    ].filter(([, valor]) => valor).map(([etiqueta, valor]) => `${etiqueta}: ${valor}`)
    unicas.set(clave, {
      tipo: 'Particular', titulo: `Particular ${referencia}${negocio ? ` · ${negocio}` : ''}`,
      correlativo: referencia, orden: dato(fila['N° ORDEN']), negocio, nit: dato(fila.NIT), direccion: dato(fila.DIRECCION),
      // La fecha de Gestión es de seguimiento, no la fecha de ingreso del
      // reporte. No inventar vencimientos por importar servicios anteriores.
      fecha: null, prioridad: 'Media', estado: 'Pendiente de pago', archivos: [],
      descripcion: detalles.join('\n'),
    })
  }
  return { fichas: [...unicas.values()], detectadas, repetidas, sinReferencia }
}

export async function leerParticularesExistentes(cliente) {
  const registros = []
  for (let desde = 0; ; desde += 500) {
    const { data, error } = await cliente.from('pendientes').select('id,correlativo').eq('tipo', 'Particular').order('id').range(desde, desde + 499)
    if (error || !Array.isArray(data)) throw new Error('No se pudieron consultar las particulares existentes. No se crearán fichas sin comprobar duplicados.')
    registros.push(...data)
    if (data.length < 500) return registros
  }
}

export async function importarParticularesExcel(cliente, filas, archivo = '') {
  const preparado = prepararParticularesExcel(filas, archivo)
  const resultado = { archivo, detectadas: preparado.detectadas, repetidas: preparado.repetidas, sinReferencia: preparado.sinReferencia, creadas: 0, existentes: 0 }
  if (!preparado.fichas.length) return resultado
  const existentes = await leerParticularesExistentes(cliente)
  const referencias = new Set(existentes.map(p => claveReferenciaParticular(p.correlativo)).filter(Boolean))
  const ids = new Set(existentes.map(p => p.id))
  const nuevas = []
  for (const ficha of preparado.fichas) {
    const id = await idParticularReferencia(ficha.correlativo)
    if (referencias.has(claveReferenciaParticular(ficha.correlativo)) || ids.has(id)) { resultado.existentes++; continue }
    nuevas.push({ ...ficha, id })
  }
  for (let desde = 0; desde < nuevas.length; desde += 100) {
    const lote = nuevas.slice(desde, desde + 100)
    // ON CONFLICT DO NOTHING: jamás actualizar notas, pagos ni adjuntos.
    // La clave primaria ya existente protege cargas simultáneas y reintentos.
    const { data, error } = await cliente.from('pendientes').upsert(lote, { onConflict: 'id', ignoreDuplicates: true }).select('id')
    if (error || !Array.isArray(data)) {
      const fallo = new Error('No se pudo completar la importación de particulares. Puedes reintentar sin duplicar las fichas ya guardadas.')
      fallo.resultado = resultado
      throw fallo
    }
    resultado.creadas += data.length
    resultado.existentes += lote.length - data.length
  }
  return resultado
}
