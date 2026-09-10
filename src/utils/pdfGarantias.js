import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { prepararGarantiasExportacion } from './exportacionesTecnicos.js'
import { referenciaTicketGarantia } from './expedientesGarantia.js'

const textoPdf = valor => String(valor ?? '-').replace(/[—–]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF\n\r]/g, '')

export function crearPDFGarantias(alertas, { nombreArchivo = '', generado = new Date() } = {}) {
  const registros = prepararGarantiasExportacion(alertas)
  if (!registros.length) throw new Error('No hay garantías pendientes para exportar.')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const grupos = [
    ['VENCIDA', 'Tickets ingresados fuera de cobertura - No atender sin garantía', [190, 18, 60]],
    ['NORMAL - REVISAR', 'TIPO Normal - Revisar cobertura antes de atender', [109, 40, 217]],
    ['VERIFICAR DATOS', 'Garantías con datos por verificar', [146, 64, 14]],
    ['VIGENTE', 'Tickets cubiertos al momento de ingresar', [4, 120, 87]],
  ]
  let y = 43
  for (const [estado, titulo, color] of grupos) {
    const filas = registros.filter(r => r.estado === estado)
    if (!filas.length) continue
    if (y > 158) { doc.addPage(); y = 43 }
    autoTable(doc, {
      startY: y, margin: { top: 43, bottom: 20, left: 12, right: 12 }, theme: 'grid',
      head: [[{ content: `${titulo} (${filas.length})`, colSpan: 5, styles: { fillColor: color, fontSize: 11 } }], ['Referencia / Técnico', 'Cliente / Negocio', 'Serie / Tipo', 'Plazo', 'Diagnóstico / Acción']],
      body: filas.map(r => [
        textoPdf(`${referenciaTicketGarantia(r.ticket) || '-'}\n${r.ticket.tecnico || '-'}`),
        textoPdf(`${r.ticket.CLIENTE || '-'}\n${r.ticket.NEGOCIO || '-'}`),
        textoPdf(`${r.serie}\nTIPO: ${r.ticket.TIPO || '-'}\nOrigen: ${r.origen}`),
        textoPdf(r.garantia.sinDatosSerie
          ? `${r.garantia.aniosGarantia} años\nSerie no verificable`
          : r.garantia.sinFechaIngreso
            ? `${r.garantia.fechaVerificada ? 'Vencimiento confirmado' : `Fab: ${r.garantia.fabDisplay}`}\nVence: ${r.garantia.vencDisplay}\nCobertura hasta: ${r.garantia.coberturaHastaDisplay}\nFalta FECHA INGRESO`
            : `${r.garantia.fechaVerificada ? 'Vencimiento confirmado' : `Fab: ${r.garantia.fabDisplay}`}\nIngresó: ${r.garantia.fechaIngresoDisplay}\nVence: ${r.garantia.vencDisplay}\nCobertura hasta: ${r.garantia.coberturaHastaDisplay}\n${r.garantia.diasMargenIngreso < 0 ? `${Math.abs(r.garantia.diasMargenIngreso)} días fuera de cobertura` : `${r.garantia.diasMargenIngreso} días de margen al ingresar`}`),
        textoPdf(`${r.accion}\nDirección: ${r.ticket['DIRECCIÓN'] || '-'}\nFalla reportada: ${r.ticket['DESCRIPCIÓN INICIAL'] || '-'}`),
      ]),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.5, overflow: 'linebreak', valign: 'top', lineColor: [51, 65, 85], lineWidth: 0.25, textColor: [15, 23, 42] },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 53 }, 2: { cellWidth: 43 }, 3: { cellWidth: 40 }, 4: { cellWidth: 102 } },
      rowPageBreak: 'avoid', showHead: 'everyPage',
    })
    y = doc.lastAutoTable.finalY + 8
  }
  const totalPaginas = doc.getNumberOfPages()
  const conteos = grupos.map(([estado]) => `${estado}: ${registros.filter(r => r.estado === estado).length}`).join(' | ')
  for (let n = 1; n <= totalPaginas; n++) {
    doc.setPage(n)
    doc.setFillColor(15, 23, 42).rect(0, 0, 297, 36, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(255)
    doc.text('CONTROL DE GARANTÍAS', 12, 12)
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text(textoPdf(`Generado: ${generado.toLocaleString('es-GT')} | ${registros.length} tickets no finalizados de clientes del catálogo`), 12, 19)
    doc.text(doc.splitTextToSize(textoPdf(`Fuente: ${nombreArchivo || 'Base cargada'}`), 273), 12, 25)
    doc.setFontSize(7.5).setTextColor(51, 65, 85)
    doc.text(textoPdf(conteos), 12, 40)
    doc.text('La FECHA INGRESO decide la cobertura y todo el mes de vencimiento está cubierto. TIPO Normal siempre requiere revisión.', 12, 198)
    doc.text(`Control de técnicos | Página ${n} de ${totalPaginas}`, 12, 204)
  }
  return doc
}
