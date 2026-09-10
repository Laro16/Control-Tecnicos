import { claveSerieGarantia, fechaGarantiaManual } from './vencimientosGarantia.js'
import { obtenerSerieTicket } from './garantias.js'

export const MOTIVOS = ['Despacho', 'Factura de venta', 'Reparación', 'Excepción', 'Sin garantía confirmada']
export const ESTADOS = ['Pendiente de respaldo', 'En revisión', 'Autorizado', 'Rechazado', 'Cerrado']
export const referenciaExpediente = valor => String(valor ?? '').trim().toUpperCase()

const textoExpediente = valor => String(valor ?? '').trim()
const encabezadoExpediente = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  .replace(/[°º№]/g, ' ').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()

function valorDesdeFila(fila = {}, encabezados = []) {
  const buscados = new Set(encabezados.map(encabezadoExpediente))
  for (const [encabezado, valor] of Object.entries(fila)) {
    if (!buscados.has(encabezadoExpediente(encabezado))) continue
    const texto = textoExpediente(valor)
    if (texto && texto !== '-') return texto
  }
  return ''
}

export function referenciaTicketGarantia(ticket = {}) {
  const referencia = referenciaExpediente(valorDesdeFila(ticket, ['N° REFERENCIA', 'Nº REFERENCIA', 'NUMERO DE REFERENCIA']))
  if (referencia && referencia !== '-') return referencia
  const orden = numeroOrdenDesdeFila(ticket)
  return orden === '-' ? '' : orden
}
export function numeroOrdenDesdeFila(fila = {}) {
  const encabezados = new Set(['N ORDEN', 'NO ORDEN', 'NRO ORDEN', 'NUMERO ORDEN', 'NUMERO DE ORDEN', 'ORDEN'])
  for (const [encabezado, valor] of Object.entries(fila)) {
    const normalizado = encabezadoExpediente(encabezado)
    if (!encabezados.has(normalizado)) continue
    const orden = referenciaExpediente(valor)
    return orden === '-' ? '' : orden
  }
  return ''
}

export function datosTicketExpediente(ticket = {}) {
  return {
    numero_referencia: referenciaExpediente(valorDesdeFila(ticket, ['N° REFERENCIA', 'Nº REFERENCIA', 'NUMERO DE REFERENCIA'])),
    numero_orden: numeroOrdenDesdeFila(ticket),
    negocio: valorDesdeFila(ticket, ['NEGOCIO']),
    modelo: valorDesdeFila(ticket, ['MODELO']),
    tecnico: valorDesdeFila(ticket, ['TÉCNICO', 'TECNICO']),
    estado_ticket: valorDesdeFila(ticket, ['ESTADO']),
    tipo_original: valorDesdeFila(ticket, ['TIPO']),
    direccion: valorDesdeFila(ticket, ['DIRECCIÓN', 'DIRECCION']),
    telefono: valorDesdeFila(ticket, ['TELÉFONO', 'TELEFONO']),
    fecha_ingreso: valorDesdeFila(ticket, ['FECHA INGRESO', 'FECHA DE INGRESO']),
    descripcion_inicial: valorDesdeFila(ticket, ['DESCRIPCIÓN INICIAL', 'DESCRIPCION INICIAL']),
  }
}

export function combinarDatosTicket(...fuentes) {
  const resultado = {}
  fuentes.forEach(fuente => {
    Object.entries(fuente || {}).forEach(([campo, valor]) => {
      const texto = textoExpediente(valor)
      if (texto && texto !== '-') resultado[campo] = texto
    })
  })
  return resultado
}

export function fechaOrdenableExpediente(valor) {
  const texto = textoExpediente(valor)
  const partes = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if (partes) {
    const [, dia, mes, anio] = partes.map(Number)
    const fecha = new Date(anio, mes - 1, dia)
    if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) return ''
    return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  }
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const [, anio, mes, dia] = iso.map(Number)
    const fecha = new Date(anio, mes - 1, dia)
    if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) return ''
    return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  }
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '' : `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

export function expedientesAnterioresTicket(ticket = {}, registros = []) {
  const ficha = nuevoExpediente(ticket)
  const mismaSerie = registros.filter(registro => registro.serie === ficha.serie && referenciaExpediente(registro.referencia) !== ficha.referencia)
  if (!mismaSerie.length) return []
  const fechaNueva = fechaOrdenableExpediente(ficha.datos_ticket.fecha_ingreso)
  const conFecha = mismaSerie.map(registro => ({ registro, fecha: fechaOrdenableExpediente(registro.datos_ticket?.fecha_ingreso) }))
  if (!fechaNueva || conFecha.some(({ fecha }) => !fecha)) return mismaSerie
  return conFecha.filter(({ fecha }) => fecha <= fechaNueva).map(({ registro }) => registro)
}

export function expedienteDeTicket(ticket, porReferencia = {}) {
  const referencia = referenciaTicketGarantia(ticket)
  return referencia ? porReferencia[referencia] || null : null
}
export function nuevoExpediente(ticket = {}) {
  return { referencia: referenciaTicketGarantia(ticket), serie: claveSerieGarantia(obtenerSerieTicket(ticket)), cliente: ticket.CLIENTE || '', motivo: 'Despacho', estado: 'Pendiente de respaldo', fecha_vencimiento: '', explicacion: '', autorizado_por: '', archivos: [], datos_ticket: combinarDatosTicket(datosTicketExpediente(ticket)) }
}

export function candidatosExpedienteGarantia(control = {}, registros = []) {
  const existentes = new Set(registros.map(registro => referenciaExpediente(registro.referencia)).filter(Boolean))
  const vistos = new Set()
  const grupos = [
    ['vencidas', 'Ingresó fuera de cobertura'],
    ['tipoIncorrecto', 'TIPO Normal · revisar'],
    ['sinSerie', 'Datos de garantía por verificar'],
  ]
  const resultado = []
  grupos.forEach(([grupo, diagnostico]) => {
    ;(control?.[grupo] || []).forEach(alerta => {
      const ficha = nuevoExpediente(alerta.ticket)
      if (!ficha.referencia || !ficha.serie || existentes.has(ficha.referencia) || vistos.has(ficha.referencia)) return
      vistos.add(ficha.referencia)
      resultado.push({ ticket: alerta.ticket, ficha, diagnostico })
    })
  })
  return resultado
}
export function validarExpediente(form) {
  if (!referenciaExpediente(form.referencia) || !claveSerieGarantia(form.serie)) throw new Error('Se necesitan la referencia y una serie válida.')
  if (!MOTIVOS.includes(form.motivo) || !ESTADOS.includes(form.estado)) throw new Error('Motivo o estado inválido.')
  if (!form.explicacion.trim()) throw new Error('Escribe la explicación de esta atención.')
  if (form.fecha_vencimiento && !fechaGarantiaManual(form.fecha_vencimiento)) throw new Error('Vencimiento inválido.')
  if (form.motivo === 'Sin garantía confirmada' && form.estado === 'Autorizado') throw new Error('Un caso sin garantía confirmada no puede quedar Autorizado.')
  if (form.estado === 'Autorizado') {
    if (!form.archivos.length || !form.autorizado_por.trim()) throw new Error('Para autorizar, adjunta el respaldo e indica quién confirmó o autorizó.')
    if (['Despacho', 'Factura de venta'].includes(form.motivo) && !form.fecha_vencimiento) throw new Error('Indica el vencimiento confirmado.')
  }
  return true
}
export async function leerExpedientes(db) {
  const registros = []
  for (let desde = 0; ; desde += 500) {
    const { data, error } = await db.from('garantias_expedientes').select('*').order('id', { ascending: false }).range(desde, desde + 499)
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('No se pudieron consultar los expedientes.')
    registros.push(...data)
    if (data.length < 500) return registros
  }
}
