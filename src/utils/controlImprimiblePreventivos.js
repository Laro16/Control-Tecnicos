import { MESES_PREVENTIVOS, MARCAS_PREVENTIVOS, normalizarPreventivo } from './preventivos.js'
import { prepararSeguimiento } from './seguimientoPreventivos.js'

export const claveControlImprimible = registro => `${registro.local.marca}:${registro.local.codigo}:${Number(registro.anio)}:${Number(registro.mes)}`

export function prepararControlImprimible(catalogo, ordenes, declaraciones, anio, vuelta) {
  const y = Number(anio), v = Number(vuelta)
  if (!Number.isInteger(y) || y < 2020 || y > 2100 || ![1, 2, 3].includes(v)) return []
  const inicio = (v - 1) * 4 + 1
  return Array.from({ length: 4 }, (_, i) => inicio + i)
    .flatMap(mes => prepararSeguimiento(catalogo, ordenes, declaraciones, y, mes).map(registro => ({ ...registro, anio: y, mes })))
    // El control de pared no cambia el orden de sus filas al finalizar un servicio.
    .sort((a, b) => a.mes - b.mes || a.local.marca.localeCompare(b.local.marca, 'es')
      || String(a.local.semana || '').localeCompare(String(b.local.semana || ''), 'es', { numeric: true })
      || String(a.local.codigo).localeCompare(String(b.local.codigo), 'es', { numeric: true }))
}

export function filtrarControlImprimible(registros, { mes = '', marca = '', semana = '', estado = 'todos', busqueda = '' } = {}) {
  const consulta = normalizarPreventivo(busqueda)
  return registros.filter(registro => (!mes || registro.mes === Number(mes))
    && (!marca || registro.local.marca === marca)
    && (!semana || normalizarPreventivo(registro.local.semana) === normalizarPreventivo(semana))
    && (!estado || estado === 'todos' || registro.estado === estado)
    && (!consulta || normalizarPreventivo(`${registro.local.codigo} ${registro.local.nombre} ${registro.local.direccion || ''}`).includes(consulta)))
}

export function combinarResaltadosControl(registros, resaltados = []) {
  const preferencias = new Map(resaltados.map(preferencia => [
    `${preferencia.marca}:${String(preferencia.codigo)}:${Number(preferencia.anio)}:${Number(preferencia.mes)}`, preferencia,
  ]))
  return registros.map(registro => {
    const preferencia = preferencias.get(claveControlImprimible(registro))
    const modoResaltado = ['automatico', 'verde', 'sin-color'].includes(preferencia?.modo) ? preferencia.modo : 'automatico'
    return {
      ...registro,
      modoResaltado,
      revisionResaltado: Number.isInteger(preferencia?.revision) ? preferencia.revision : 0,
      resaltado: modoResaltado === 'verde' || modoResaltado === 'automatico' && Boolean(registro.enExcel),
    }
  })
}

export function estadoControlImprimible(registro) {
  return registro.enExcel ? 'Realizado' : registro.declaracion ? 'Pendiente de liquidar' : 'Pendiente'
}

const cantidadOrdenes = registro => new Set((registro.ordenes || []).map(orden => String(orden.numero_orden || '').trim()).filter(Boolean)).size
const equiposControl = registro => `${cantidadOrdenes(registro)} en Excel\n${registro.local.equipos == null ? 'Sin cantidad prevista' : `${registro.local.equipos} previstos`}`
const resaltadoControl = registro => typeof registro.resaltado === 'boolean' ? registro.resaltado : Boolean(registro.enExcel)
const colorFila = (registro, colores, indice) => colores && resaltadoControl(registro) ? '#dcfce7' : colores && indice % 2 ? '#f8fafc' : '#ffffff'
const tituloPeriodo = (anio, vuelta) => {
  const inicio = (Number(vuelta) - 1) * 4
  return `${MESES_PREVENTIVOS[inicio] || 'Mes'} – ${MESES_PREVENTIVOS[inicio + 3] || 'Mes'} ${anio}`
}

export function dividirControlImprimible(registros, limite = 24) {
  if (!Number.isInteger(limite) || limite < 1) throw new Error('Indica una cantidad de filas válida por imagen.')
  const lotes = []
  for (let i = 0; i < registros.length; i += limite) lotes.push(registros.slice(i, i + limite))
  return lotes
}

export const encabezadosHojaCMI = ['No.', 'Unidades Pollo Granjero', 'Ubicación', 'Código', 'Semana', 'Equipos', 'Cliente', 'Fechas', 'Fechas', 'Fechas', 'Estado']
export const celdasHojaCMI = r => [r.local.numero || r.local.fila - 2 || '—', r.local.nombre, r.local.direccion?.trim() || 'Sin dirección registrada', r.local.codigo, r.local.semana || '—', equiposControl(r), r.local.marca === 'CAMPERO' ? 'CAMPERO' : 'GRANJERO', ...[0,1,2].map(i => MESES_PREVENTIVOS[r.local.meses?.[i]-1]?.toUpperCase() || '—'), estadoControlImprimible(r)]

export function datosImagenControlImprimible(registros, { anio, vuelta, colores = true } = {}) {
  if (!registros.length) throw new Error('No hay preventivos con estos filtros para descargar.')
  return {
    tema: 'anaranjado', tamanoTexto: 13, titulo: `CONTROL DE PREVENTIVOS CMI · ${anio}`,
    subtitulo: `${tituloPeriodo(anio, vuelta)} · ${registros.length} ${registros.length === 1 ? 'punto de venta filtrado' : 'puntos de venta filtrados'}`,
    secciones: [{
      titulo: 'PROGRAMACIÓN Y ESTADO', multilinea: true, anchos: [40, 170, 225, 65, 90, 100, 100, 100, 100, 100, 150],
      encabezados: encabezadosHojaCMI,
      filas: registros.map(celdasHojaCMI),
      estados: registros.map(registro => registro.estado),
      coloresFila: registros.map((registro, indice) => colorFila(registro, colores, indice)),
    }],
    pie: 'El color es visual y no cambia el estado. Realizado: registrado en Excel. Equipos: órdenes únicas.',
  }
}

const escaparHtml = valor => String(valor ?? '').replace(/[&<>"']/g, caracter => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[caracter]))

export function htmlControlImprimible(registros, { anio, vuelta, colores = true } = {}) {
  if (!registros.length) throw new Error('No hay preventivos con estos filtros para imprimir.')
  const filas = registros.map((registro, indice) => '<tr style="background-color:'+colorFila(registro,colores,indice)+'">'+celdasHojaCMI(registro).map((valor,i)=>'<td'+(i===10?' class="estado"':'')+'>'+escaparHtml(valor)+'</td>').join('')+'</tr>').join('')
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Control de preventivos CMI · ${escaparHtml(anio)}</title><style>
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#172033;background:white;font:8pt Arial,sans-serif}header{border-bottom:2px solid #172033;margin-bottom:12px;padding:10px 12px;background:#fb923c}h1{margin:0 0 5px;font-size:17pt}p{margin:4px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th,td{border:1px solid #172033;padding:6px;overflow-wrap:anywhere;vertical-align:top;white-space:pre-line}th{background:#ffc000;text-align:left;font-size:9pt}th:nth-child(1){width:3%}th:nth-child(2){width:15%}th:nth-child(3){width:20%}th:nth-child(4){width:5%}th:nth-child(5){width:7%}th:nth-child(6){width:8%}th:nth-child(7){width:7%}th:nth-child(8),th:nth-child(9),th:nth-child(10){width:8%}th:nth-child(11){width:11%}tr{break-inside:avoid;page-break-inside:avoid}td span{display:block;margin-top:4px;font-size:9pt}.estado{font-weight:bold}footer{margin-top:10px;font-size:9pt}@media print{body,header,th,tr,td{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><header><h1>Control de preventivos CMI</h1><p>${escaparHtml(tituloPeriodo(anio, vuelta))} · ${registros.length} ${registros.length === 1 ? 'punto de venta filtrado' : 'puntos de venta filtrados'}</p></header><table><thead><tr>${encabezadosHojaCMI.map(t=>`<th>${escaparHtml(t)}</th>`).join('')}</tr></thead><tbody>${filas}</tbody></table><footer>El resaltado es visual. Quitar el color no cambia el estado ni las órdenes registradas.</footer></body></html>`
}

export function imprimirControlImprimible(registros, opciones = {}, { abrir = (...args) => window.open(...args) } = {}) {
  const html = htmlControlImprimible(registros, opciones)
  const ventana = abrir('', '_blank', 'width=1200,height=850')
  if (!ventana) throw new Error('El navegador bloqueó la ventana de impresión. Permite abrir ventanas para Ticket Manager y vuelve a intentar.')
  try {
    ventana.opener = null
    ventana.document.open()
    ventana.document.write(html)
    ventana.document.close()
    ventana.addEventListener?.('afterprint', () => ventana.close(), { once: true })
    const imprimir = () => { if (!ventana.closed) { ventana.focus(); ventana.print() } }
    if (ventana.requestAnimationFrame) ventana.requestAnimationFrame(() => ventana.requestAnimationFrame(imprimir))
    else imprimir()
    return ventana
  } catch (error) { ventana.close(); throw error }
}
