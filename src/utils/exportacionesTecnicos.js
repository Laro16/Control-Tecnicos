import { normalizarTextoGarantia, obtenerSerieTicket, resolverSerie } from './garantias.js'
import { esTicketFinalizado } from './historialSeries.js'
import { referenciaTicketGarantia } from './expedientesGarantia.js'

const texto = valor => valor == null ? '' : String(valor)
const ordenarTickets = tickets => [...tickets].sort((a, b) => texto(a.tecnico).localeCompare(texto(b.tecnico), 'es') || texto(a['N° REFERENCIA']).localeCompare(texto(b['N° REFERENCIA']), 'es', { numeric: true }))
const esProceso = ticket => normalizarTextoGarantia(ticket.ESTADO_LIMPIO || ticket.ESTADO).includes('PROCESO')
const fechaExcel = fecha => fecha && !Number.isNaN(new Date(fecha).getTime()) ? new Date(Date.UTC(new Date(fecha).getFullYear(), new Date(fecha).getMonth(), new Date(fecha).getDate())) : null
export const fechaArchivo = fecha => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`

export function origenSerieExportada(ticket) {
  const extraida = ['DESCRIPCION', 'DESCRIPCION INICIAL'].includes(normalizarTextoGarantia(ticket.SERIE_ORIGEN))
  return resolverSerie(extraida ? '' : ticket.SERIE, ticket['DESCRIPCIÓN INICIAL']).origen || 'Sin serie'
}

export function clasificarGarantiaExportada(garantia) {
  const fuente = garantia.sinDatosSerie
    ? ''
    : `${garantia.fechaVerificada ? 'Vencimiento confirmado' : 'Vencimiento calculado'}: ${garantia.vencDisplay}; cobertura para ingresos hasta ${garantia.coberturaHastaDisplay}.`
  if (garantia.vencida === true) return {
    prioridad: 0,
    estado: 'VENCIDA',
    accion: `No atender sin garantía. El ticket ingresó el ${garantia.fechaIngresoDisplay}, después de la cobertura hasta ${garantia.coberturaHastaDisplay}. ${fuente}`,
  }
  if (garantia.tipoIncorrecto) return {
    prioridad: 1, estado: 'NORMAL - REVISAR',
    accion: garantia.sinDatosSerie
      ? 'No atender sin garantía. TIPO Normal y serie no verificable.'
      : garantia.sinFechaIngreso
        ? `No atender sin garantía. TIPO Normal y falta FECHA INGRESO para comprobar este ticket. ${fuente}`
        : `No atender sin garantía. El ticket ingresó dentro de cobertura, pero el origen marcó Normal; revisar el motivo. ${fuente}`,
  }
  if (garantia.sinDatosSerie) return { prioridad: 2, estado: 'VERIFICAR DATOS', accion: 'No se pudo calcular el vencimiento. Verificar la serie antes de atender.' }
  if (garantia.sinFechaIngreso) return { prioridad: 2, estado: 'VERIFICAR DATOS', accion: `Falta FECHA INGRESO para decidir si este ticket está cubierto. ${fuente}` }
  return { prioridad: 3, estado: 'VIGENTE', accion: `El ticket ingresó el ${garantia.fechaIngresoDisplay}, dentro de cobertura hasta ${garantia.coberturaHastaDisplay}. ${fuente}` }
}

export function prepararGarantiasExportacion(alertas = []) {
  return alertas.map(({ ticket, garantia }) => {
    const diagnostico = clasificarGarantiaExportada(garantia)
    return { ticket, garantia, ...diagnostico, serie: obtenerSerieTicket(ticket), origen: origenSerieExportada(ticket) }
  })
    .sort((a, b) => a.prioridad - b.prioridad || (a.garantia.diasMargenIngreso ?? Infinity) - (b.garantia.diasMargenIngreso ?? Infinity) || texto(a.ticket.CLIENTE).localeCompare(texto(b.ticket.CLIENTE), 'es'))
}

const columnasBase = [
  ['N°', 7, 'numero'], ['N° REFERENCIA', 19], ['TÉCNICO', 28], ['CLIENTE', 40], ['NEGOCIO', 36],
  ['ESTADO', 25], ['TIPO', 15], ['SERIE', 22], ['ORIGEN DE SERIE', 24], ['MODELO', 21],
  ['DIRECCIÓN', 55], ['TELÉFONO', 21], ['FECHA INGRESO', 20, 'fecha'], ['TIEMPO TRANSCURRIDO', 23, 'decimal'],
  ['FECHA REALIZADA', 20, 'fecha'], ['DESCRIPCIÓN INICIAL', 65], ['DESCRIPCIÓN', 65],
  ['GEOLOCALIZACIÓN', 34], ['SERIE GUARDADA', 22], ['FECHA ORIGINAL', 20],
]
function filaBase(ticket, i) {
  const horas = ticket.TIEMPO_TRANSCURRIDO == null || String(ticket.TIEMPO_TRANSCURRIDO).trim() === '' ? NaN : Number(ticket.TIEMPO_TRANSCURRIDO)
  return [i + 1, texto(ticket['N° REFERENCIA']), texto(ticket.tecnico), texto(ticket.CLIENTE), texto(ticket.NEGOCIO), texto(ticket.ESTADO), texto(ticket.TIPO), obtenerSerieTicket(ticket), origenSerieExportada(ticket), texto(ticket.MODELO), texto(ticket['DIRECCIÓN']), texto(ticket['TELÉFONO']), fechaExcel(ticket.FECHA_INGRESO_OBJ), Number.isFinite(horas) && ticket.TIEMPO_TRANSCURRIDO !== '' ? horas : null, fechaExcel(ticket.FECHA_OBJ), texto(ticket['DESCRIPCIÓN INICIAL']), texto(ticket.DESCRIPCIÓN), texto(ticket.GEOLOCALIZACIÓN), texto(ticket.SERIE), texto(ticket.FECHA_TEXTO)]
}

export function prepararInformeTecnicos({ tickets, control, nombreArchivo = '', fechaSubidaExcel = '', estadoHistorial = 'listo', generado = new Date() }) {
  const garantias = prepararGarantiasExportacion(control.garantias)
  const finalizados = ordenarTickets(tickets.filter(esTicketFinalizado))
  const enProceso = ordenarTickets(tickets.filter(t => !esTicketFinalizado(t) && esProceso(t)))
  const pendientes = ordenarTickets(tickets.filter(t => !esTicketFinalizado(t) && !esProceso(t)))
  const notaHistorial = estadoHistorial === 'listo'
    ? 'Basado en el historial sincronizado disponible; no incluye archivos nunca cargados.'
    : 'ATENCIÓN: historial no sincronizado o sin configurar. La revisión de reincidencias puede estar incompleta.'
  const hojas = [
    {
      nombre: 'Garantías', nota: 'Sólo tickets no finalizados de clientes del catálogo. Fuera de cobertura primero. La FECHA INGRESO se compara con el último día del mes de vencimiento. TIPO Normal siempre requiere revisión.',
      columnas: [['N°', 7, 'numero'], ['N° REFERENCIA', 19], ['CLIENTE', 40], ['NEGOCIO', 36], ['TÉCNICO', 28], ['RESULTADO', 24], ['TIPO ORIGINAL', 18], ['SERIE', 22], ['ORIGEN DE SERIE', 24], ['FECHA INGRESO', 19, 'fecha'], ['FABRICACIÓN', 19, 'fecha'], ['VENCIMIENTO REGISTRADO', 24, 'fecha'], ['COBERTURA HASTA', 21, 'fecha'], ['AÑOS', 11, 'numero'], ['MARGEN AL INGRESO (DÍAS)', 25, 'numero'], ['ACCIÓN / OBSERVACIÓN', 65], ['DIRECCIÓN', 55], ['DESCRIPCIÓN INICIAL', 65], ['ESTADO DEL TICKET', 25]],
      filas: garantias.map((g, i) => [i + 1, referenciaTicketGarantia(g.ticket), texto(g.ticket.CLIENTE), texto(g.ticket.NEGOCIO), texto(g.ticket.tecnico), g.estado, texto(g.ticket.TIPO), g.serie, g.origen, fechaExcel(g.garantia.fechaIngreso), fechaExcel(g.garantia.fechaFabricacion), fechaExcel(g.garantia.fechaVencimiento), fechaExcel(g.garantia.fechaLimiteIngreso), g.garantia.aniosGarantia, { formula: `IF(AND(ISNUMBER(J${i + 6}),ISNUMBER(M${i + 6})),M${i + 6}-J${i + 6},"")`, result: g.garantia.diasMargenIngreso ?? '' }, g.accion, texto(g.ticket['DIRECCIÓN']), texto(g.ticket['DESCRIPCIÓN INICIAL']), texto(g.ticket.ESTADO)]),
    },
    { nombre: 'Pendientes sin proceso', nota: 'No finalizados, excluyendo En Proceso. Incluye asignaciones a técnico y agencia.', columnas: columnasBase, filas: pendientes.map(filaBase) },
    { nombre: 'En proceso', nota: 'Tickets no finalizados cuyo estado indica En Proceso.', columnas: columnasBase, filas: enProceso.map(filaBase) },
    { nombre: 'Finalizados', nota: 'Órdenes finalizadas del Excel cargado; la fecha es la de realización disponible.', columnas: columnasBase, filas: finalizados.map(filaBase) },
    {
      nombre: 'Duplicados', nota: 'Todas las filas de cada referencia repetida, incluidas finalizadas. Las referencias vacías se omiten.',
      columnas: [...columnasBase, ['REPETICIONES', 17, 'numero']],
      filas: control.duplicados.flatMap(grupo => grupo.tickets.map(t => ({ ticket: t, cantidad: grupo.cantidad }))).map(({ ticket, cantidad }, i) => [...filaBase(ticket, i), cantidad]),
    },
    {
      nombre: 'Reincidencias', nota: notaHistorial,
      columnas: [['N°', 7, 'numero'], ['REFERENCIA ACTUAL', 22], ['SERIE', 22], ['CLIENTE', 40], ['NEGOCIO', 36], ['TÉCNICO ACTUAL', 28], ['ATENCIONES ANTERIORES', 23, 'numero'], ['REFERENCIAS ANTERIORES', 48], ['ÚLTIMO CIERRE', 19, 'fecha'], ['TÉCNICO ANTERIOR', 28], ['OBSERVACIÓN', 65]],
      filas: control.reincidencias.map((r, i) => [i + 1, texto(r.ticket['N° REFERENCIA']), r.serie, texto(r.ticket.CLIENTE), texto(r.ticket.NEGOCIO), texto(r.ticket.tecnico), r.anteriores.length, r.anteriores.map(a => a.referencia).join(', '), r.anteriores[0]?.fecha_cierre ? fechaExcel(`${r.anteriores[0].fecha_cierre}T00:00:00`) : null, texto(r.anteriores[0]?.tecnico), 'Posible reincidencia: misma serie en otra atención finalizada. No demuestra que sea la misma falla.']),
    },
    { nombre: 'Base completa', nota: 'Todos los tickets cargados, en su orden original. Se conserva la serie y fecha guardadas junto a los datos interpretados.', columnas: columnasBase, filas: tickets.map(filaBase) },
  ]
  return { hojas, garantias, generado, nombreArchivo, fechaSubidaExcel, notaHistorial }
}

export async function crearLibroTecnicos(informe) {
  const { default: ExcelJS } = await import('exceljs')
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Control de técnicos'
  libro.created = informe.generado
  libro.calcProperties.fullCalcOnLoad = true
  const resumen = libro.addWorksheet('Resumen', { views: [{ showGridLines: false }] })
  const borde = { style: 'thin', color: { argb: 'FF334155' } }
  const encabezado = fila => {
    fila.height = 34
    fila.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { vertical: 'middle', wrapText: true }; c.border = { bottom: { ...borde, style: 'medium' } } })
  }
  for (const hoja of informe.hojas) {
    const ws = libro.addWorksheet(hoja.nombre, { views: [{ state: 'frozen', xSplit: 2, ySplit: 5, showGridLines: false }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
    ws.columns = hoja.columnas.map(([, width]) => ({ width }))
    ws.mergeCells(1, 1, 1, hoja.columnas.length)
    ws.getCell('A1').value = `CONTROL DE TÉCNICOS | ${hoja.nombre.toUpperCase()}`
    encabezado(ws.getRow(1))
    ws.mergeCells(2, 1, 2, hoja.columnas.length)
    ws.getCell('A2').value = `Fuente: ${informe.nombreArchivo || 'Base cargada'} | Generado: ${informe.generado.toLocaleString('es-GT')} | ${hoja.filas.length} registros`
    ws.getRow(2).height = 24
    ws.mergeCells(3, 1, 3, hoja.columnas.length)
    ws.getCell('A3').value = hoja.nota
    ws.getCell('A3').alignment = { wrapText: true, vertical: 'middle' }
    ws.getRow(3).height = 30
    ws.getRow(5).values = hoja.columnas.map(([titulo]) => titulo)
    encabezado(ws.getRow(5))
    hoja.filas.forEach((valores, indice) => {
      const fila = ws.getRow(indice + 6)
      fila.values = valores
      const lineas = Math.max(1, ...valores.map((v, i) => typeof v === 'string' ? v.split(/\r?\n/).reduce((n, parte) => n + Math.max(1, Math.ceil(parte.length / (hoja.columnas[i][1] - 3))), 0) : 1))
      fila.height = Math.min(409, Math.max(32, lineas * 14 + 8))
      fila.eachCell({ includeEmpty: true }, (celda, col) => {
        const tipo = hoja.columnas[col - 1]?.[2]
        celda.font = { name: 'Calibri', size: 11, color: { argb: 'FF0F172A' } }
        celda.alignment = { vertical: 'top', wrapText: true, horizontal: ['numero', 'decimal'].includes(tipo) ? 'right' : 'left' }
        celda.numFmt = tipo === 'fecha' ? 'dd/mm/yyyy' : tipo === 'decimal' ? '#,##0.0' : tipo === 'numero' ? '#,##0' : '@'
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: indice % 2 ? 'FFF1F5F9' : 'FFFFFFFF' } }
        celda.border = { bottom: borde }
      })
    })
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, hoja.filas.length + 5), column: hoja.columnas.length } }
    ws.pageSetup.printTitlesRow = '1:5'
    ws.headerFooter.oddFooter = '&LControl de técnicos&R&P de &N'
    if (hoja.nombre === 'Garantías' && hoja.filas.length) {
      const colores = [['VENCIDA', 'FFBE123C', 'FFFFE4E6'], ['NORMAL - REVISAR', 'FF6D28D9', 'FFEDE9FE'], ['VERIFICAR DATOS', 'FF92400E', 'FFFEF3C7'], ['VIGENTE', 'FF047857', 'FFD1FAE5']]
      ws.addConditionalFormatting({ ref: `F6:F${hoja.filas.length + 5}`, rules: colores.map(([estado, color, fondo], i) => ({ type: 'expression', formulae: [`F6="${estado}"`], priority: i + 1, style: { font: { bold: true, color: { argb: color } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: fondo } } } })) })
    }
  }
  resumen.columns = [{ width: 40 }, { width: 23 }, { width: 88 }]
  resumen.mergeCells('A1:C1'); resumen.getCell('A1').value = 'CONTROL DE TÉCNICOS | RESUMEN'; encabezado(resumen.getRow(1))
  resumen.getCell('A2').value = 'Archivo fuente'; resumen.mergeCells('B2:C2'); resumen.getCell('B2').value = informe.nombreArchivo || 'Base cargada'
  resumen.getCell('A3').value = 'Fecha de generación'; resumen.getCell('B3').value = fechaExcel(informe.generado); resumen.getCell('B3').numFmt = 'dd/mm/yyyy'
  resumen.getCell('C3').value = 'La cobertura se decide con FECHA INGRESO. Todo el mes del vencimiento cuenta como cubierto, sin importar cuándo se atienda el ticket.'
  resumen.getCell('A4').value = 'Última carga'; resumen.mergeCells('B4:C4'); resumen.getCell('B4').value = informe.fechaSubidaExcel || 'No registrada'
  resumen.getRow(6).values = ['INDICADOR', 'CANTIDAD', 'ALCANCE']; encabezado(resumen.getRow(6))
  let fila = 7
  const contarHoja = (nombre, explicacion) => {
    const hoja = informe.hojas.find(h => h.nombre === nombre)
    resumen.getRow(fila++).values = [nombre === 'Base completa' ? 'Total de tickets' : nombre, { formula: `COUNTA('${nombre}'!A6:A${Math.max(6, hoja.filas.length + 5)})`, result: hoja.filas.length }, explicacion]
  }
  contarHoja('Base completa', 'Total de filas de la base cargada. No se eliminan duplicados.')
  contarHoja('Pendientes sin proceso', 'No finalizados, sin incluir los que ya están En Proceso.')
  contarHoja('En proceso', 'No finalizados con estado En Proceso.')
  contarHoja('Finalizados', 'Estos tres grupos suman el total de tickets.')
  contarHoja('Garantías', 'Sólo clientes del catálogo con tickets no finalizados.')
  const finGarantias = Math.max(6, informe.garantias.length + 5)
  for (const estado of ['VENCIDA', 'NORMAL - REVISAR', 'VERIFICAR DATOS', 'VIGENTE']) {
    resumen.getRow(fila++).values = [`Garantías: ${estado}`, { formula: `COUNTIF('Garantías'!F6:F${finGarantias},"${estado}")`, result: informe.garantias.filter(g => g.estado === estado).length }, estado === 'VENCIDA' ? 'El ticket ingresó después del último día del mes de vencimiento. Incluye TIPO Normal en esa condición.' : estado === 'NORMAL - REVISAR' ? 'TIPO Normal siempre es alerta, aunque el ticket haya ingresado dentro de cobertura.' : estado === 'VERIFICAR DATOS' ? 'Falta una serie válida o FECHA INGRESO para clasificar el ticket.' : 'El ticket ingresó dentro del mes de cobertura.']
  }
  contarHoja('Duplicados', 'Filas implicadas, no cantidad de referencias. Incluye tickets finalizados.')
  contarHoja('Reincidencias', informe.notaHistorial)
  resumen.getRow(fila + 1).values = ['Importante', null, 'Las pestañas Garantías, Duplicados y Reincidencias son vistas adicionales: no se suman al total.']
  resumen.getRow(fila + 2).values = ['Uso del archivo', null, 'Exportación de toda la base, sin aplicar filtros de pantalla. Editar este libro no cambia el sistema ni vuelve a evaluar la cobertura.']
  resumen.getRow(fila + 3).values = ['Margen al ingreso', null, 'Número negativo = ingresó después de la cobertura. Cero = ingresó el último día cubierto. Positivo = ingresó dentro de cobertura. TIPO Normal no autoriza atención.']
  resumen.eachRow((row, n) => {
    if (n === 1 || n === 6) return
    row.height = n >= fila + 1 ? 42 : 36
    row.eachCell(c => { c.font = { name: 'Calibri', size: 11, color: { argb: 'FF0F172A' } }; c.alignment = { vertical: 'middle', wrapText: true }; c.border = { bottom: borde } })
    if (n >= 7 && n < fila) { row.getCell(2).numFmt = '#,##0'; row.getCell(2).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0369A1' } } }
  })
  return libro
}

export function descargarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url; enlace.download = nombre
  document.body.appendChild(enlace); enlace.click(); enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
