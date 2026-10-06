import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'
for(const archivo of process.argv.slice(2)) {
  console.log(JSON.stringify({archivo}))
  const libro=await SpreadsheetFile.importXlsx(await FileBlob.load(archivo))
  console.log((await libro.inspect({kind:'workbook,sheet,table',maxChars:7000,tableMaxRows:8,tableMaxCols:12,tableMaxCellChars:100})).ndjson)
  const hoja=libro.worksheets.getItemAt(0),matriz=hoja.getRange(archivo.includes('UNO')?'A1:P91':'A1:M18').values
  const filas=matriz.slice(2).map((fila,i)=>({fila:i+3,mes:fila[1],nombre:fila[2],codigo:fila[3],marca:fila[4],region:fila[9],fecha:fila[10],frecuencia:fila[11],extra:fila.slice(12)})).filter(f=>f.codigo!=null)
  console.log(JSON.stringify({encabezados:matriz[1],registros:filas.length,regiones:filas.reduce((n,f)=>{n[f.region]=(n[f.region]||0)+1;return n},{}),codigosUnicos:new Set(filas.map(f=>f.codigo)).size,duplicados:filas.filter((f,i)=>filas.findIndex(a=>a.codigo===f.codigo)!==i).map(f=>({fila:f.fila,codigo:f.codigo})),ultimasFilas:filas.slice(-7)}))
  if(archivo.includes('UNO'))console.log(JSON.stringify({occidente:filas.filter(f=>f.region==='OCCIDENTE')}))
}
