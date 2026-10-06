import { MESES_PREVENTIVOS, MARCAS_PREVENTIVOS } from './preventivos.js'
import { ESTADOS_PREVENTIVOS } from './seguimientoPreventivos.js'
const color = { oscuro: '#0f172a', azul: '#d9eef5', borde: '#172033', texto: '#172033' }
function texto(ctx,valor,x,y,maximo) {
  let t=String(valor ?? '')
  if(maximo) while(ctx.measureText(t).width>maximo && t.length>1) t=t.slice(0,-2)+'…'
  ctx.fillText(t,x,y)
}
function lineasTexto(ctx,valor,ancho) {
  const lineas=[]
  for(const parrafo of String(valor??'').split('\n')) {
    let actual=''
    for(const palabra of parrafo.trim().split(/\s+/)) {
      const candidata=actual?`${actual} ${palabra}`:palabra
      if(ctx.measureText(candidata).width<=ancho){actual=candidata;continue}
      if(actual){lineas.push(actual);actual=''}
      for(const letra of palabra){
        if(actual&&ctx.measureText(actual+letra).width>ancho){lineas.push(actual);actual=''}
        actual+=letra
      }
    }
    lineas.push(actual)
  }
  return lineas
}
function tabla(ctx,y,anchos,encabezados,filas,estados=[],anaranjado=false,envoltura=null) {
  const alto=48, x0=40
  ctx.font='bold 17px Arial'
  let x=x0
  encabezados.forEach((t,i)=>{ctx.fillStyle=anaranjado?'#fb923c':color.azul;ctx.fillRect(x,y,anchos[i],alto);ctx.strokeStyle=color.borde;ctx.strokeRect(x,y,anchos[i],alto);ctx.fillStyle=color.texto;texto(ctx,t,x+10,y+30,anchos[i]-18);x+=anchos[i]})
  let top=y+alto
  filas.forEach((fila,r)=>{let x=x0;const altoFila=envoltura?.[r].alto||alto;const estado=estados[r];ctx.font=estado==='finalizado'?'bold 17px Arial':'17px Arial';fila.forEach((t,i)=>{ctx.fillStyle=estado==='finalizado'?'#dcfce7':estado==='por-liquidar'?'#fef3c7':r%2?'#f1f5f9':'#ffffff';ctx.fillRect(x,top,anchos[i],altoFila);ctx.strokeStyle=color.borde;ctx.strokeRect(x,top,anchos[i],altoFila);ctx.fillStyle=estado==='finalizado'?'#14532d':estado==='por-liquidar'?'#78350f':color.texto;if(envoltura)envoltura[r].celdas[i].forEach((linea,n)=>texto(ctx,linea,x+10,top+30+n*22));else texto(ctx,t,x+10,top+30,anchos[i]-18);x+=anchos[i]});top+=altoFila})
  return top
}
export function dibujarImagenPreventivos(canvas,{titulo,subtitulo,secciones,pie,tema}) {
  const anaranjado=tema==='anaranjado'
  canvas.width=1320
  const ctx=canvas.getContext('2d')
  const preparadas=secciones.map(s=>({...s,envoltura:s.multilinea?s.filas.map((fila,r)=>{
    ctx.font=s.estados?.[r]==='finalizado'?'bold 17px Arial':'17px Arial'
    const celdas=fila.map((valor,i)=>lineasTexto(ctx,valor,s.anchos[i]-20))
    return {celdas,alto:Math.max(48,Math.max(...celdas.map(c=>c.length))*22+22)}
  }):null}))
  canvas.height=190+preparadas.reduce((n,s)=>n+75+48+(s.envoltura?s.envoltura.reduce((alto,f)=>alto+f.alto,0):s.filas.length*48),0)+(pie?40:0)
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height)
  ctx.fillStyle=anaranjado?'#f59e0b':color.oscuro;ctx.fillRect(0,0,canvas.width,110);ctx.fillStyle=anaranjado?color.texto:'#fff';ctx.font='bold 30px Arial';texto(ctx,titulo,40,46,1240);ctx.font='18px Arial';texto(ctx,subtitulo,40,81,1240)
  let y=140
  for(const s of preparadas){ctx.fillStyle=color.oscuro;ctx.font='bold 22px Arial';texto(ctx,s.titulo,40,y+24,1240);y=tabla(ctx,y+40,s.anchos,s.encabezados,s.filas,s.estados,anaranjado,s.envoltura)+35}
  if(pie){ctx.fillStyle='#475569';ctx.font='16px Arial';texto(ctx,pie,40,y+10,1240)}
  return canvas
}
export async function descargarImagenPreventivos(datos,nombre) {
  const canvas=dibujarImagenPreventivos(document.createElement('canvas'),datos)
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
  if(!blob) throw new Error('No se pudo generar la imagen.')
  const url=URL.createObjectURL(blob), enlace=document.createElement('a');enlace.href=url;enlace.download=nombre;enlace.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export function datosImagenAvance(resumen,{anio,vuelta,semana}) {
  const inicio=(vuelta-1)*4
  return {titulo:`PREVENTIVOS · ${MESES_PREVENTIVOS[inicio].toUpperCase()} – ${MESES_PREVENTIVOS[inicio+3].toUpperCase()} ${anio}`,subtitulo:`Occidente · Corte semanal: ${semana.inicio} al ${semana.fin}`,secciones:resumen.map(r=>({titulo:r.nombre.toUpperCase(),anchos:[150,120,150,160,185,150,150,175],encabezados:['Agencia','Asignados','Finalizados','Por liquidar','Equipos en Excel','% realizado','Pendientes','% pendiente'],filas:[['OCCIDENTE',r.asignados,r.finalizados,r.porLiquidar,r.equipos,`${r.porcentaje.toFixed(2)}%`,r.pendiente,`${(100-r.porcentaje).toFixed(2)}%`]]})),pie:'Por liquidar: marca manual sin Excel. Finalizado: orden válida en Excel. % realizado: ambos. Equipos: órdenes únicas.'}
}

export function datosImagenProgramacion(seguimiento, { tipo, anio, mes }) {
  const registros = seguimiento.filter(r => r.local.marca === tipo)
    .sort((a,b) => (a.local.semana||'ZZ').localeCompare(b.local.semana||'ZZ') || a.local.codigo.localeCompare(b.local.codigo,'es',{numeric:true}))
  return {
    tema: 'anaranjado',
    titulo: `${MARCAS_PREVENTIVOS[tipo].toUpperCase()} · ${MESES_PREVENTIVOS[mes-1].toUpperCase()} ${anio}`,
    subtitulo: `Occidente · ${registros.length} restaurantes programados`,
    secciones: [{ titulo: 'PROGRAMACIÓN MENSUAL', anchos: [90,380,150,180,230,210],
      encabezados: ['Código','Restaurante','Semana','Equipos previstos','Estado','Equipos en Excel'],
      filas: registros.map(({local,estado,ordenes}) => [local.codigo,local.nombre,local.semana||'—',local.equipos??'—',ESTADOS_PREVENTIVOS[estado],ordenes.length||'—']),
      estados: registros.map(r=>r.estado),
    }],
    pie: 'Verde: Finalizado (Excel). Amarillo: Pendiente de liquidar (marca manual). Blanco/gris: Pendiente. Equipos: órdenes únicas.',
  }
}

export function datosImagenFiltradaProgramacion(registros,{anio,mes}) {
  if(!registros.length) throw new Error('No hay preventivos con estos filtros para descargar.')
  return {
    tema:'anaranjado',titulo:`PREVENTIVOS · ${MESES_PREVENTIVOS[mes-1].toUpperCase()} ${anio}`,
    subtitulo:`Listado filtrado · ${registros.length} ${registros.length===1?'punto de venta':'puntos de venta'}`,
    secciones:Object.entries(MARCAS_PREVENTIVOS).flatMap(([marca,nombre])=>{
      const visibles=registros.filter(r=>r.local.marca===marca)
      if(!visibles.length)return []
      return [{titulo:nombre.toUpperCase(),multilinea:true,anchos:[100,280,430,240,190],
        encabezados:['Código','Punto de venta / semana','Dirección','Estado','Equipos'],
        filas:visibles.map(({local,estado,ordenes,declaracion})=>[local.codigo,`${local.nombre}\n${local.semana||'Sin semana asignada'}`,local.direccion?.trim()||'Sin dirección registrada',ESTADOS_PREVENTIVOS[estado],`${local.equipos??'—'} previstos\n${ordenes.length} en Excel${declaracion?.equipos_declarados?`\n${declaracion.equipos_declarados} declarados`:''}`]),
        estados:visibles.map(r=>r.estado),
      }]
    }),
    pie:'Verde: Finalizado (Excel). Amarillo: Pendiente de liquidar (marca manual). Blanco/gris: Pendiente.',
  }
}
