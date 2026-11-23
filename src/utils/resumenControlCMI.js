export function resumenControlCMI(registros){
 const unicos=[...new Map(registros.map(r=>[`${r.local.marca}:${r.local.codigo}:${r.anio}:${r.mes}`,r])).values()]
 const activos=unicos.filter(r=>r.local.activo!==false)
 const realizados=activos.filter(r=>r.enExcel).length
 const porLiquidar=activos.filter(r=>!r.enExcel&&r.declaracion).length
 return {total:unicos.length,programados:activos.length,realizados,porLiquidar,pendientes:activos.length-realizados-porLiquidar,cerrados:unicos.length-activos.length,equipos:new Set(activos.flatMap(r=>(r.ordenes||[]).map(o=>o.numero_orden)).filter(Boolean)).size,porcentaje:activos.length?Math.round(realizados/activos.length*100):0}
}
