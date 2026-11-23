import {jsPDF} from 'jspdf'
import autoTable from 'jspdf-autotable'
import {MESES_PREVENTIVOS,MARCAS_PREVENTIVOS} from './preventivos.js'
import {resumenControlCMI} from './resumenControlCMI.js'
const limpio=v=>String(v??'').replace(/[–—]/g,'-')
export function crearPDFControlCMI(registros,{anio,vuelta,mes}={}){
 if(!registros.length)throw new Error('No hay puntos con estos filtros.')
 const resumen=resumenControlCMI(registros)
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'})
 const periodo=mes?`${MESES_PREVENTIVOS[Number(mes)-1]} ${anio}`:`Vuelta ${vuelta} · ${anio}`
 const marcas=[...new Set(registros.map(r=>MARCAS_PREVENTIVOS[r.local.marca]))].join(' / ')
 const resumenTexto=`Programados: ${resumen.programados} | Realizados (Excel): ${resumen.realizados} | Por liquidar: ${resumen.porLiquidar} | Pendientes: ${resumen.pendientes} | Cerrados: ${resumen.cerrados}`
 autoTable(doc,{startY:42,margin:{top:42,bottom:17,left:10,right:10},theme:'grid',showHead:'everyPage',rowPageBreak:'avoid',
 head:[['Código','Punto de venta','Ubicación','Semana','Mes','Equipos Excel','Estado']],
 body:registros.map(r=>[r.local.codigo,r.local.nombre,r.local.direccion||'Sin dirección',r.local.semana||'-',MESES_PREVENTIVOS[r.mes-1],new Set((r.ordenes||[]).map(o=>o.numero_orden).filter(Boolean)).size,r.local.activo===false?'Cerrado':r.enExcel?'Realizado':r.declaracion?'Pendiente de liquidar':'Pendiente'].map(limpio)),
 styles:{font:'helvetica',fontSize:8,cellPadding:2,overflow:'linebreak',valign:'top',lineColor:[30,41,59],lineWidth:.2},headStyles:{fillColor:[255,192,0],textColor:[17,24,39]},columnStyles:{0:{cellWidth:17},1:{cellWidth:55},2:{cellWidth:90},3:{cellWidth:25},4:{cellWidth:24},5:{cellWidth:22},6:{cellWidth:44}},
 didParseCell:({section,row,cell})=>{if(section!=='body')return;const r=registros[row.index];if(r.local.activo===false){cell.styles.textColor=[153,27,27];cell.styles.fillColor=[255,241,242]}else if(r.enExcel){cell.styles.textColor=[22,101,52];cell.styles.fillColor=[220,252,231]}else if(r.declaracion){cell.styles.fillColor=[254,249,195]}},
 didDrawCell:({section,row,cell,column})=>{if(section!=='body'||column.index===6)return;const r=registros[row.index];if(r.local.activo!==false&&!r.enExcel)return;doc.setDrawColor(...(r.local.activo===false?[153,27,27]:[22,101,52]));doc.setLineWidth(.18);const alto=8*1.15/ doc.internal.scaleFactor;cell.text.forEach((t,i)=>{const y=cell.y+cell.padding('top')+alto*(i+.55);doc.line(cell.x+cell.padding('left'),y,Math.min(cell.x+cell.width-cell.padding('right'),cell.x+cell.padding('left')+doc.getTextWidth(t)),y)})}
 })
 for(let n=1;n<=doc.getNumberOfPages();n++){doc.setPage(n);doc.setFillColor(251,146,60).rect(10,8,277,14,'F');doc.setTextColor(17,24,39).setFont('helvetica','bold').setFontSize(14);doc.text('CONTROL DE PREVENTIVOS CMI',13,17);doc.setFont('helvetica','normal').setFontSize(9);doc.text(limpio(`${periodo} | ${marcas}`),10,28);doc.setFontSize(8);doc.text(resumenTexto,10,34);doc.text(`Equipos registrados: ${resumen.equipos} | Avance confirmado: ${resumen.porcentaje}%`,10,39);doc.setFontSize(7);doc.text('Verde tachado: realizado en Excel. Amarillo: reportado, pendiente de liquidar. Rojo tachado: punto cerrado.',10,199);doc.text(`Página ${n} de ${doc.getNumberOfPages()} · Resumen de lo filtrado`,10,204)}
 return doc
}
