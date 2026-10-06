import { MESES_PREVENTIVOS, fechaPreventivo } from './preventivos.js'
import { ESTADOS_PREVENTIVOS } from './seguimientoPreventivos.js'

export const MARCAS_TRIMESTRALES = { SHELL: 'Shell', TACO_BELL: 'Taco Bell' }
export const normalizarTrimestral = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase()
export const codigoTrimestral = v => normalizarTrimestral(v)==='-'?'':normalizarTrimestral(v).replace(/\.0$/, '')
export const periodoTrimestral = local => `${local.anio}:${local.trimestre}`
export const idTrimestral = local => `${local.marca}:${Number(local.anio)}:${Number(local.trimestre)}:${codigoTrimestral(local.codigo)}`
export const fechaTrimestral = fecha => fecha ? String(fecha).slice(0,10).split('-').reverse().join('/') : 'Sin fecha'
export function tituloTrimestre(anio, trimestre) {
  const inicio = (Number(trimestre)-1)*3
  return `${MESES_PREVENTIVOS[inicio]} – ${MESES_PREVENTIVOS[inicio+2]} ${anio}`
}
export function validarProgramacionTrimestral(form) {
  const marca=form.marca, codigo=codigoTrimestral(form.codigo), nombre=String(form.nombre??'').trim(), fecha=String(form.fecha_programada??'')
  if (!MARCAS_TRIMESTRALES[marca] || !/^[A-Z0-9_-]{1,40}$/.test(codigo) || !nombre || nombre.length>250) throw new Error('Indica marca, código y nombre de tienda válidos.')
  const prueba=new Date(`${fecha}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||Number.isNaN(prueba.getTime())||prueba.toISOString().slice(0,10)!==fecha||Number(fecha.slice(0,4))<2020||Number(fecha.slice(0,4))>2100) throw new Error('Indica una fecha programada válida entre 2020 y 2100.')
  const equipos=form.equipos===''||form.equipos==null?null:Number(form.equipos)
  if(equipos!==null&&(!Number.isInteger(equipos)||equipos<1||equipos>500))throw new Error('Indica entre 1 y 500 equipos o deja el dato vacío.')
  const anio=Number(fecha.slice(0,4)),trimestre=Math.ceil(Number(fecha.slice(5,7))/3)
  const resultado={marca,codigo,nombre,anio,trimestre,fecha_programada:fecha,equipos,region:'OCCIDENTE'}
  for(const campo of ['direccion','zona','municipio','departamento','marca_tienda','archivo_origen']) {
    resultado[campo]=String(form[campo]??'').trim()
    if(resultado[campo].length>1000)throw new Error('Un dato de la tienda supera 1000 caracteres.')
  }
  return {...resultado,id:idTrimestral(resultado)}
}

// Una ficha sólo acredita su trimestre explícito. No se generan vueltas futuras.
export function vincularOrdenTrimestral(orden, programacion) {
  if(orden.programacion_id) return programacion.find(p=>p.id===orden.programacion_id&&p.marca===orden.marca)||null
  const candidatos=programacion.filter(p=>p.marca===orden.marca && (orden.codigo
    ? codigoTrimestral(p.codigo)===codigoTrimestral(orden.codigo)
    : normalizarTrimestral(p.nombre)===normalizarTrimestral(orden.negocio)))
  if(!orden.fecha_realizada)return null
  const anio=Number(orden.fecha_realizada.slice(0,4)),trimestre=Math.ceil(Number(orden.fecha_realizada.slice(5,7))/3)
  const delTrimestre=candidatos.filter(p=>Number(p.anio)===anio&&Number(p.trimestre)===trimestre)
  return delTrimestre.length===1?delTrimestre[0]:null
}
export function prepararTrimestrales(programacion, ordenes) {
  const porFicha=new Map()
  const sinUbicar=[]
  for(const orden of ordenes) {
    const ficha=vincularOrdenTrimestral(orden,programacion)
    if(!ficha) { if(!orden.excluida)sinUbicar.push(orden); continue }
    const grupo=porFicha.get(ficha.id)||new Map()
    grupo.set(orden.numero_orden,orden);porFicha.set(ficha.id,grupo)
  }
  const prioridad={pendiente:0,'por-liquidar':1,finalizado:2}
  const registros=programacion.map(local=> {
    const todas=[...(porFicha.get(local.id)?.values()||[])],validas=todas.filter(o=>!o.excluida)
    return {local,ordenes:validas,todas,estado:validas.length?'finalizado':local.realizado?'por-liquidar':'pendiente'}
  }).sort((a,b)=>prioridad[a.estado]-prioridad[b.estado]||a.local.fecha_programada.localeCompare(b.local.fecha_programada)||a.local.codigo.localeCompare(b.local.codigo,'es',{numeric:true}))
  return {registros,sinUbicar}
}
export function extraerOrdenesTrimestrales(filas, configuraciones) {
  const porCliente=new Map()
  for(const config of configuraciones)for(const cliente of config.clientes||[]) {
    const clave=normalizarTrimestral(cliente)
    if(porCliente.has(clave)&&porCliente.get(clave).marca!==config.marca)throw new Error('Un mismo CLIENTE está configurado para dos marcas de preventivos.')
    porCliente.set(clave,config)
  }
  const ordenes=new Map();let sinOrden=0
  for(const original of filas) {
    const fila=Object.fromEntries(Object.entries(original).map(([k,v])=>[normalizarTrimestral(k),v]))
    const config=porCliente.get(normalizarTrimestral(fila.CLIENTE))
    if(!config)continue
    const numero=String(fila['N° ORDEN']??fila['Nº ORDEN']??fila['NO ORDEN']??'').trim()
    if(!numero||numero==='-'){sinOrden++;continue}
    const dato={numero_orden:numero,marca:config.marca,codigo:codigoTrimestral(fila[normalizarTrimestral(config.encabezado_codigo)]),
      negocio:String(fila.NEGOCIO??fila['NOMBRE NEGOCIO']??'').trim(),tecnico:String(fila.TECNICO??'').trim(),
      fecha_realizada:fechaPreventivo(fila['FECHA REALIZADA']),cliente:String(fila.CLIENTE??'').trim()}
    if(ordenes.has(numero)&&ordenes.get(numero).marca!==dato.marca)throw new Error(`La orden ${numero} aparece en dos marcas. Revisa el Excel.`)
    ordenes.set(numero,{...dato,fecha_realizada:dato.fecha_realizada||ordenes.get(numero)?.fecha_realizada||null})
  }
  return {ordenes:[...ordenes.values()],sinOrden}
}
export function datosImagenTrimestral(registros, marca, titulo, subtitulo='') {
  return {titulo:`Preventivos ${MARCAS_TRIMESTRALES[marca]}`,subtitulo:`${titulo} · Occidente${subtitulo?` · ${subtitulo}`:''}`,tema:'anaranjado',
    secciones:[{titulo:`${registros.length} ${registros.length===1?'tienda':'tiendas'}`,anchos:[110,280,140,390,200,120],encabezados:['CÓDIGO','TIENDA','FECHA PROG.','DIRECCIÓN','ESTADO','EQUIPOS'],multilinea:true,
      filas:registros.map(r=>[r.local.codigo,r.local.nombre,fechaTrimestral(r.local.fecha_programada),r.local.direccion||'Sin dirección registrada',r.local.cerrado?'Cerrado':ESTADOS_PREVENTIVOS[r.estado],r.ordenes.length?`${r.ordenes.length} en Excel`:r.local.realizado&&r.local.equipos_declarados!=null?`${r.local.equipos_declarados} declarados`:r.local.equipos!=null?`${r.local.equipos} previstos`:'Sin cantidad']),estados:registros.map(r=>r.local.cerrado?'cerrado':r.estado)}],
    pie:'Pendiente: sin registro. Pendiente de liquidar: marca manual. Finalizado: orden válida en Excel.'}
}
export function prepararAvanceTrimestral(registros, corte) {
  const activos=registros.filter(r=>!r.local.cerrado)
  const enCorte=o=>!o.fecha_realizada||o.fecha_realizada<=corte
  const finalizados=activos.filter(r=>r.ordenes.some(enCorte)).length
  const porLiquidar=activos.filter(r=>!r.ordenes.some(enCorte)&&r.local.realizado&&r.local.fecha_realizado<=corte).length
  const equipos=new Set(activos.flatMap(r=>r.ordenes.filter(enCorte).map(o=>o.numero_orden))).size
  const realizados=finalizados+porLiquidar,asignados=activos.length
  return {asignados,finalizados,porLiquidar,equipos,realizados,pendientes:asignados-realizados,porcentaje:asignados?realizados/asignados*100:0}
}
