import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { CalendarCheck, Download, RefreshCw } from 'lucide-react'
import calendarioUrl from '../Mantenimientos.xlsx?url'
import { supabase } from '../supabase.jsx'
import { leerPreventivos } from '../utils/preventivosPersistencia.js'
import { catalogoDesdeMatriz, prepararAvance, rangoSemana, MESES_PREVENTIVOS, MARCAS_PREVENTIVOS } from '../utils/preventivos.js'
import { datosImagenAvance, descargarImagenPreventivos } from '../utils/preventivosImagen.js'

const hoy = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guatemala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const fechaVisible = fecha => fecha ? fecha.split('-').reverse().join('/') : 'Sin fecha realizada'
const porcentaje = valor => `${valor.toFixed(2)}%`
let catalogoCache
async function leerCatalogo() {
  if(catalogoCache) return catalogoCache
  const respuesta=await fetch(calendarioUrl)
  if(!respuesta.ok) throw new Error('No se pudo abrir el calendario de restaurantes.')
  const libro=XLSX.read(await respuesta.arrayBuffer(),{type:'array'})
  const hoja=libro.SheetNames.find(n=>n!=='Mexico')
  catalogoCache=catalogoDesdeMatriz(XLSX.utils.sheet_to_json(libro.Sheets[hoja],{header:1,defval:''}))
  return catalogoCache
}
export default function Preventivos() {
  const [catalogo,setCatalogo]=useState([]),[ordenes,setOrdenes]=useState([])
  const [cargando,setCargando]=useState(true),[error,setError]=useState(''),[ocupado,setOcupado]=useState(false),[aviso,setAviso]=useState('')
  const [fechaSemana,setFechaSemana]=useState(hoy),[anio,setAnio]=useState(()=>Number(hoy().slice(0,4))),[vuelta,setVuelta]=useState(()=>Math.floor((Number(hoy().slice(5,7))-1)/4)+1)
  const [mes,setMes]=useState(()=>Number(hoy().slice(5,7))),[marca,setMarca]=useState(''),[busqueda,setBusqueda]=useState(''),[vista,setVista]=useState('programacion')
  const [mesManual,setMesManual]=useState(()=>hoy().slice(0,7)),[localManual,setLocalManual]=useState({})
  async function cargar() {
    setCargando(true);setError('')
    try { setCatalogo(await leerCatalogo());setOrdenes(await leerPreventivos()) }
    catch(fallo){setError(fallo.message || 'No se pudo consultar el historial de preventivos.')}
    finally{setCargando(false)}
  }
  useEffect(()=>{cargar()},[])
  const semana=useMemo(()=>rangoSemana(fechaSemana),[fechaSemana])
  const avance=useMemo(()=>prepararAvance(catalogo,ordenes,Number(anio),Number(vuelta),semana.fin),[catalogo,ordenes,anio,vuelta,semana.fin])
  const delMes=catalogo.filter(l=>l.activo&&l.meses.includes(Number(mes))&&(!marca||l.marca===marca)&&`${l.codigo} ${l.nombre} ${l.direccion}`.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')))
  const ordenesDelMes=avance.atribuidas.filter(o=>o.programado?.anio===Number(anio)&&o.programado?.mes===Number(mes))
  const cuentaLocal=id=>ordenesDelMes.filter(o=>o.local?.id===id).length
  const deSemana=avance.atribuidas.filter(o=>o.fecha_realizada>=semana.inicio&&o.fecha_realizada<=semana.fin)
  const porUbicar=avance.atribuidas.filter(o=>!o.local||!o.programado)
  const gruposRevision=Object.values(porUbicar.reduce((grupos,o)=>{const clave=`${o.marca}:${o.codigo||o.negocio}`;const g=grupos[clave]||{clave,marca:o.marca,codigo:o.codigo,negocio:o.negocio,local:o.local,ordenes:[]};g.ordenes.push(o);grupos[clave]=g;return grupos},{}))
  async function exportarAvance(){setOcupado(true);setError('');try{await descargarImagenPreventivos(datosImagenAvance(avance.resumen,{anio,vuelta,semana}),`Preventivos_Avance_${anio}_Vuelta_${vuelta}_${semana.fin}.png`)}catch(e){setError(e.message)}finally{setOcupado(false)}}
  async function exportarMes(tipo){setOcupado(true);setError('');try{
    const locales=catalogo.filter(l=>l.activo&&l.marca===tipo&&l.meses.includes(Number(mes))).sort((a,b)=>(a.semana||'ZZ').localeCompare(b.semana||'ZZ')||a.codigo.localeCompare(b.codigo,'es',{numeric:true}))
    await descargarImagenPreventivos({titulo:`${MARCAS_PREVENTIVOS[tipo].toUpperCase()} · ${MESES_PREVENTIVOS[mes-1].toUpperCase()} ${anio}`,subtitulo:`Occidente · ${locales.length} restaurantes programados`,secciones:[{titulo:'PROGRAMACIÓN MENSUAL',anchos:[105,655,160,150,170],encabezados:['Código','Restaurante','Semana','Equipos previstos','Avance'],filas:locales.map(l=>[l.codigo,l.nombre,l.semana||'—',l.equipos??'—',cuentaLocal(l.id)?`${cuentaLocal(l.id)} equipos`:'Pendiente'])}],pie:'La cantidad atendida cuenta órdenes únicas. Los locales cerrados están excluidos.'},`Preventivos_${tipo}_${anio}_${String(mes).padStart(2,'0')}.png`)
  }catch(e){setError(e.message)}finally{setOcupado(false)}}
  async function ubicar(grupo){setOcupado(true);setError('');try{
    const codigo=grupo.local?.codigo||localManual[grupo.clave]
    if(!codigo) throw new Error('Selecciona el restaurante al que pertenecen las órdenes.')
    const [y,m]=mesManual.split('-').map(Number),local=catalogo.find(l=>l.activo&&l.marca===grupo.marca&&l.codigo===codigo)
    if(!local?.meses.includes(m)) throw new Error('Ese mes no está programado para el restaurante seleccionado.')
    for(let i=0;i<grupo.ordenes.length;i+=200){const {error:fallo}=await supabase.from('preventivos_ordenes').update({codigo,anio_programado:y,mes_programado:m}).in('numero_orden',grupo.ordenes.slice(i,i+200).map(o=>o.numero_orden));if(fallo)throw fallo}
    setAviso(`${grupo.ordenes.length} órdenes ubicadas en ${MESES_PREVENTIVOS[m-1]} ${y}.`);await cargar()
  }catch(e){setError(e.message)}finally{setOcupado(false)}}
  return <div className="space-y-5 fade-in">
    <section className="workspace-hero"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-sky-300"><CalendarCheck size={15}/> Mantenimientos programados</p><h1 className="text-3xl font-black">Preventivos</h1><p className="mt-2 max-w-xl text-sm text-slate-300">Calendario de restaurantes y avance por vuelta. Cada orden conserva su registro entre cargas del Excel.</p></div><button className="btn-ghost bg-white text-slate-900" onClick={cargar} disabled={cargando||ocupado}><RefreshCw size={14} className="mr-1 inline"/> Actualizar</button></div></section>
    {error&&<div role="alert" className="rounded-xl border-2 border-rose-500 bg-rose-50 p-4 text-sm text-rose-900">{error}<p className="mt-1">Si el historial aún no está activado, ejecuta activar_preventivos.sql en Supabase y vuelve a cargar el Excel diario en Técnicos.</p></div>}
    {aviso&&<p role="status" className="rounded-xl border border-emerald-500 bg-emerald-50 p-3 text-sm text-emerald-900">{aviso}</p>}
    <section className="card grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
      <label className="text-xs font-bold">Año<input type="number" min="2020" max="2100" value={anio} onChange={e=>setAnio(e.target.value)} className="control-field mt-1 w-full"/></label>
      <label className="text-xs font-bold">Vuelta<select value={vuelta} onChange={e=>setVuelta(Number(e.target.value))} className="control-field mt-1 w-full">{[1,2,3].map(v=><option key={v} value={v}>{MESES_PREVENTIVOS[(v-1)*4]} – {MESES_PREVENTIVOS[v*4-1]}</option>)}</select></label>
      <label className="text-xs font-bold">Semana del reporte<input type="date" value={fechaSemana} onChange={e=>e.target.value&&setFechaSemana(e.target.value)} className="control-field mt-1 w-full"/></label>
      <button onClick={exportarAvance} disabled={ocupado||cargando||Boolean(error)||!catalogo.length} className="btn-primary self-end disabled:opacity-50"><Download size={14} className="mr-1 inline"/> Descargar avance PNG</button>
      <p className="text-xs text-slate-500 sm:col-span-3 lg:col-span-4">Corte: {fechaVisible(semana.inicio)} al {fechaVisible(semana.fin)}. Los porcentajes corresponden a la vuelta y al mes programado.</p>
    </section>
    <section className="grid gap-4 md:grid-cols-2">{avance.resumen.map(r=><article className="card p-5" key={r.marca}><h2 className="text-base font-black">{r.nombre}</h2><div className="mt-4 grid grid-cols-3 gap-3"><Dato nombre="Asignados" valor={r.asignados}/><Dato nombre="Atendidos" valor={r.atendidos}/><Dato nombre="Equipos" valor={r.equipos}/></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500" style={{width:porcentaje(r.porcentaje)}}/></div><p className="mt-2 flex justify-between text-xs font-bold"><span className="text-emerald-700">{porcentaje(r.porcentaje)} atendido</span><span>{r.pendiente} pendientes · {porcentaje(100-r.porcentaje)}</span></p></article>)}</section>
    <div className="flex flex-wrap gap-2">{[['programacion','Programación mensual'],['semana',`Actividad semanal (${deSemana.length})`],['revision',`Por ubicar (${porUbicar.length})`]].map(([id,nombre])=><button className={vista===id?'btn-primary':'btn-ghost'} key={id} onClick={()=>setVista(id)}>{nombre}</button>)}</div>
    {cargando&&<p role="status" className="text-sm text-slate-500">Consultando calendario e historial…</p>}
    {!cargando&&!error&&!ordenes.length&&<p className="card p-4 text-sm text-slate-600">Todavía no hay órdenes registradas. Vuelve a cargar tu Excel diario en Técnicos para iniciar el historial.</p>}
    {vista==='programacion'&&<>
      <div className="card grid gap-3 p-4 sm:grid-cols-3"><label className="text-xs font-bold">Mes<select className="control-field mt-1 w-full" value={mes} onChange={e=>setMes(Number(e.target.value))}>{MESES_PREVENTIVOS.map((m,i)=><option value={i+1} key={m}>{m}</option>)}</select></label><label className="text-xs font-bold">Marca<select className="control-field mt-1 w-full" value={marca} onChange={e=>setMarca(e.target.value)}><option value="">Todas</option>{Object.entries(MARCAS_PREVENTIVOS).map(([id,n])=><option key={id} value={id}>{n}</option>)}</select></label><label className="text-xs font-bold">Buscar< input className="control-field mt-1 w-full" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Código, restaurante o dirección"/></label><div className="flex flex-wrap gap-2 sm:col-span-3">{Object.entries(MARCAS_PREVENTIVOS).map(([id,n])=><button key={id} onClick={()=>exportarMes(id)} disabled={ocupado||cargando||Boolean(error)} className="btn-ghost disabled:opacity-50"><Download size={14} className="mr-1 inline"/> {n} · PNG</button>)}</div></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{delMes.map(l=><article className="card p-4" key={l.id}><div className="flex items-start justify-between gap-2"><div><span className="text-xs font-black text-sky-700">{MARCAS_PREVENTIVOS[l.marca]} · #{l.codigo}</span><h3 className="mt-1 text-sm font-black">{l.nombre}</h3></div><span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${cuentaLocal(l.id)?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-900'}`}>{cuentaLocal(l.id)?`${cuentaLocal(l.id)} equipos`:'Pendiente'}</span></div><p className="mt-3 text-xs text-slate-600">{l.direccion||'Sin dirección en calendario'}</p><p className="mt-2 text-xs font-semibold text-slate-600">{l.semana||'Sin semana asignada'} · Equipos previstos: {l.equipos??'—'}</p></article>)}</div>
    </>}
    {vista==='semana'&&<section className="card overflow-x-auto"><div className="border-b border-slate-400 p-4"><h2 className="font-black">Órdenes con fecha realizada esta semana</h2><p className="mt-1 text-xs text-slate-600">{avance.sinFecha.length} órdenes sin fecha realizada se conservan en el historial; no se atribuyen a una semana.</p></div><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-100"><tr>{['Orden','Restaurante','Fecha realizada','Mes programado','Técnico'].map(t=><th className="p-3" key={t}>{t}</th>)}</tr></thead><tbody>{deSemana.map(o=><tr className="border-t border-slate-300" key={o.numero_orden}><td className="p-3 font-bold">#{o.numero_orden}</td><td className="p-3">{o.local?.nombre||o.negocio}<span className="block text-xs text-slate-500">{MARCAS_PREVENTIVOS[o.marca]} · {o.codigo||'Sin código'}</span></td><td className="p-3">{fechaVisible(o.fecha_realizada)}</td><td className="p-3">{o.programado?`${MESES_PREVENTIVOS[o.programado.mes-1]} ${o.programado.anio}`:'Por ubicar'}{o.tarde&&<span className="block text-xs text-slate-500">Atendido después del mes programado</span>}</td><td className="p-3">{o.tecnico||'—'}</td></tr>)}</tbody></table>{!deSemana.length&&<p className="p-5 text-sm text-slate-500">Sin fechas realizadas dentro de esta semana.</p>}</section>}
    {vista==='revision'&&<section className="space-y-3"><div className="card p-4"><h2 className="font-black">Ubicar órdenes en el calendario</h2><p className="mt-1 text-sm text-slate-600">El estado del servicio no limita el conteo. Cuando falta la fecha realizada o no se identifica el restaurante, indica el local y su mes programado para incluir sus órdenes en la vuelta.</p><label className="mt-3 block max-w-xs text-xs font-bold">Mes programado<input type="month" className="control-field mt-1 w-full" value={mesManual} onChange={e=>setMesManual(e.target.value)}/></label></div>{gruposRevision.map(g=><article key={g.clave} className="card p-4"><h3 className="font-black">{MARCAS_PREVENTIVOS[g.marca]} · {g.local?.nombre||g.negocio||'Sin negocio'}</h3><p className="mt-1 text-xs text-slate-500">{g.ordenes.length} equipos · Órdenes: {g.ordenes.map(o=>o.numero_orden).join(', ')}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row">{!g.local&&<select value={localManual[g.clave]||''} onChange={e=>setLocalManual(p=>({...p,[g.clave]:e.target.value}))} className="control-field flex-1"><option value="">Seleccionar restaurante</option>{catalogo.filter(l=>l.activo&&l.marca===g.marca).map(l=><option key={l.id} value={l.codigo}>#{l.codigo} · {l.nombre}</option>)}</select>}<button disabled={ocupado||!mesManual} onClick={()=>ubicar(g)} className="btn-primary disabled:opacity-50">Asignar al mes</button></div></article>)}{!gruposRevision.length&&<p className="card p-5 text-sm text-emerald-700">Todas las órdenes están ubicadas en el calendario.</p>}</section>}
  </div>
}
function Dato({nombre,valor}){return <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{nombre}</p><p className="mt-1 text-2xl font-black">{valor}</p></div>}
