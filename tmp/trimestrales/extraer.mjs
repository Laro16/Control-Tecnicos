import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'
const resultado=[]
for(const [i,archivo] of process.argv.slice(2).entries()) {
  const libro=await SpreadsheetFile.importXlsx(await FileBlob.load(archivo))
  const hoja=libro.worksheets.getItemAt(0)
  const matriz=hoja.getRange(i===0?'A1:P91':'A1:M18').values
  const marca=i===0?'SHELL':'TACO_BELL'
  const tiendas=matriz.slice(2).map((r,index)=> {
    if(String(r[9]??'').trim().toUpperCase()!=='OCCIDENTE'||!r[3])return null
    const fecha=new Date(Date.UTC(1899,11,30)+Number(r[10])*86400000).toISOString().slice(0,10)
    const anio=Number(fecha.slice(0,4)),trimestre=Math.ceil(Number(fecha.slice(5,7))/3),codigo=String(r[3]).trim()
    return {id:`${marca}:${anio}:${trimestre}:${codigo}`,marca,anio,trimestre,codigo,nombre:String(r[2]).trim(),fecha_programada:fecha,
      direccion:String(r[5]??'').trim(),zona:String(r[6]??'').trim(),municipio:String(r[7]??'').trim(),departamento:String(r[8]??'').trim(),region:'OCCIDENTE',
      equipos:i===1&&Number.isInteger(Number(r[4]))?Number(r[4]):null,marca_tienda:i===0?String(r[4]??'').trim():'Taco Bell',
      archivo_origen:archivo.split('/').at(-1),fila_origen:index+3}
  }).filter(Boolean)
  if(tiendas.length!==16||new Set(tiendas.map(t=>t.id)).size!==16||tiendas.some(t=>t.anio!==2026||t.trimestre!==4))throw new Error('Revisar cobertura del calendario '+marca)
  resultado.push(...tiendas)
}
console.log('CATALOGO_JSON='+JSON.stringify(resultado))
