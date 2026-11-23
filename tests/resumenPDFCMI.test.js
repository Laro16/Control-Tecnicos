import test from 'node:test'
import assert from 'node:assert/strict'
import {resumenControlCMI} from '../src/utils/resumenControlCMI.js'
import {crearPDFControlCMI} from '../src/utils/pdfControlCMI.js'
const fila=(codigo,extra={})=>({anio:2026,mes:11,local:{codigo,marca:'GRANJERO',nombre:`Punto ${codigo}`,direccion:'Calle principal',semana:'SEMANA 1',activo:true},enExcel:false,ordenes:[],...extra})
test('resumen separa Excel, marca manual, pendiente y cerrado sin contar el color manual',()=>{
 const uno=fila('1',{enExcel:true,ordenes:[{numero_orden:'O1'},{numero_orden:'O1'}]})
 const filas=[uno,uno,fila('2',{declaracion:{realizado:true}}),fila('3',{resaltado:true}),fila('4',{local:{codigo:'4',marca:'GRANJERO',activo:false},enExcel:true,ordenes:[{numero_orden:'OC'}]})]
 const antes=JSON.stringify(filas)
 assert.deepEqual(resumenControlCMI(filas),{total:4,programados:3,realizados:1,porLiquidar:1,pendientes:1,cerrados:1,equipos:1,porcentaje:33})
 assert.equal(JSON.stringify(filas),antes)
 assert.equal(resumenControlCMI([]).porcentaje,0)
})
test('PDF incluye resumen del filtro, mes elegido y ninguna fila ajena',()=>{
 const doc=crearPDFControlCMI([fila('413',{enExcel:true,ordenes:[{numero_orden:'A'}]})],{anio:2026,vuelta:3,mes:11})
 const texto=doc.output().replaceAll(String.fromCharCode(92),'')
 assert.ok(texto.includes('Realizados (Excel): 1'))
 assert.ok(texto.includes('Noviembre 2026'))
 assert.ok(texto.includes('Punto 413'))
 assert.ok(!texto.includes('Campero'))
 assert.throws(()=>crearPDFControlCMI([]),/No hay/)
})
test('PDF pagina listados largos y conserva el último punto',()=>{
 const filas=Array.from({length:60},(_,i)=>fila(String(i+1)))
 const doc=crearPDFControlCMI(filas,{anio:2026,vuelta:3,mes:11})
 assert.ok(doc.getNumberOfPages()>1)
 assert.ok(doc.output().includes('Punto 60'))
})
