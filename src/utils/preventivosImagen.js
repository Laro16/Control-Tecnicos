import { MESES_PREVENTIVOS, MARCAS_PREVENTIVOS } from './preventivos.js'
const color = { oscuro: '#0f172a', azul: '#d9eef5', borde: '#172033', texto: '#172033' }
function texto(ctx,valor,x,y,maximo) {
  let t=String(valor ?? '')
  if(maximo) while(ctx.measureText(t).width>maximo && t.length>1) t=t.slice(0,-2)+'…'
  ctx.fillText(t,x,y)
}
function tabla(ctx,y,anchos,encabezados,filas) {
  const alto=48, x0=40
  ctx.font='bold 17px Arial'
  let x=x0
  encabezados.forEach((t,i)=>{ctx.fillStyle=color.azul;ctx.fillRect(x,y,anchos[i],alto);ctx.strokeStyle=color.borde;ctx.strokeRect(x,y,anchos[i],alto);ctx.fillStyle=color.texto;texto(ctx,t,x+10,y+30,anchos[i]-18);x+=anchos[i]})
  filas.forEach((fila,r)=>{let x=x0;const top=y+(r+1)*alto;ctx.font='17px Arial';fila.forEach((t,i)=>{ctx.fillStyle=r%2?'#f1f5f9':'#ffffff';ctx.fillRect(x,top,anchos[i],alto);ctx.strokeStyle=color.borde;ctx.strokeRect(x,top,anchos[i],alto);ctx.fillStyle=color.texto;texto(ctx,t,x+10,top+30,anchos[i]-18);x+=anchos[i]})})
  return y+(filas.length+1)*alto
}
export function dibujarImagenPreventivos(canvas,{titulo,subtitulo,secciones,pie}) {
  canvas.width=1320
  canvas.height=190+secciones.reduce((n,s)=>n+75+(s.filas.length+1)*48,0)+(pie?40:0)
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height)
  ctx.fillStyle=color.oscuro;ctx.fillRect(0,0,canvas.width,110);ctx.fillStyle='#fff';ctx.font='bold 30px Arial';texto(ctx,titulo,40,46,1240);ctx.font='18px Arial';texto(ctx,subtitulo,40,81,1240)
  let y=140
  for(const s of secciones){ctx.fillStyle=color.oscuro;ctx.font='bold 22px Arial';texto(ctx,s.titulo,40,y+24,1240);y=tabla(ctx,y+40,s.anchos,s.encabezados,s.filas)+35}
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
  return {titulo:`PREVENTIVOS · ${MESES_PREVENTIVOS[inicio].toUpperCase()} – ${MESES_PREVENTIVOS[inicio+3].toUpperCase()} ${anio}`,subtitulo:`Occidente · Corte semanal: ${semana.inicio} al ${semana.fin}`,secciones:resumen.map(r=>({titulo:r.nombre.toUpperCase(),anchos:[170,150,185,185,170,180,200],encabezados:['Agencia','Asignados','Realizados','Equipos en Excel','% realizado','Pendientes','% pendiente'],filas:[['OCCIDENTE',r.asignados,r.atendidos,r.equipos,`${r.porcentaje.toFixed(2)}%`,r.pendiente,`${(100-r.porcentaje).toFixed(2)}%`]]})),pie:'Realizados: marca manual o Excel, sin duplicar negocios. Equipos: órdenes únicas del Excel. Se respeta el mes programado.'}
}

export function datosImagenProgramacion(seguimiento, { tipo, anio, mes }) {
  const registros = seguimiento.filter(r => r.local.marca === tipo)
    .sort((a,b) => (a.local.semana||'ZZ').localeCompare(b.local.semana||'ZZ') || a.local.codigo.localeCompare(b.local.codigo,'es',{numeric:true}))
  return {
    titulo: `${MARCAS_PREVENTIVOS[tipo].toUpperCase()} · ${MESES_PREVENTIVOS[mes-1].toUpperCase()} ${anio}`,
    subtitulo: `Occidente · ${registros.length} restaurantes programados`,
    secciones: [{ titulo: 'PROGRAMACIÓN MENSUAL', anchos: [90,460,150,160,150,230],
      encabezados: ['Código','Restaurante','Semana','Equipos previstos','Estado','Equipos en Excel'],
      filas: registros.map(({local,realizado,ordenes}) => [local.codigo,local.nombre,local.semana||'—',local.equipos??'—',realizado?'Realizado':'Pendiente',ordenes.length||'—']),
    }],
    pie: 'Realizado: marca manual o Excel, sin importar el estado de la orden. Equipos: órdenes únicas. Se excluyen los puntos cerrados.',
  }
}
