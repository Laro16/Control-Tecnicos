import { useEffect, useRef, useState } from 'react'
import { Archive, Check, ChevronDown, Clock3, MapPin, Phone, X } from 'lucide-react'
import { MESES_PREVENTIVOS, MARCAS_PREVENTIVOS } from '../utils/preventivos.js'
import { claveSeguimiento, validarRealizado, tipoRestaurantePreventivo, TIPOS_RESTAURANTE_PREVENTIVO } from '../utils/seguimientoPreventivos.js'
import DetalleOrdenesPreventivos from './DetalleOrdenesPreventivos'

const estados = { pendiente: 'Pendiente', realizado: 'Realizado' }
const colores = { pendiente: 'bg-slate-100 text-slate-800', realizado: 'bg-emerald-100 text-emerald-900' }
const campo = 'control-field w-full'

export default function ProgramacionPreventivos({ registros, declaraciones, anio, mes, tecnico, usuarioId, listo, ocupado, hoy, guardar, recargar, cambiarMes, cerrarLocal, cierresListos }) {
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [marca, setMarca] = useState('')
  const [seleccion, setSeleccion] = useState(null)
  const [expandido, setExpandido] = useState(null)
  const [form, setForm] = useState({ fecha: hoy, equipos: '', observaciones: '' })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const dialogo = useRef(null)
  useEffect(() => { if (seleccion) dialogo.current?.showModal() }, [seleccion])
  useEffect(() => { setSeleccion(null); setExpandido(null); dialogo.current?.close() }, [anio, mes])
  const revision = local => declaraciones.find(d => Number(d.anio) === Number(anio) && Number(d.mes) === Number(mes) && claveSeguimiento(d, anio, mes) === claveSeguimiento(local, anio, mes))
  const coincidentes = registros.filter(r => (!marca || r.local.marca === marca)
    && `${r.local.codigo} ${r.local.nombre} ${r.local.direccion}`.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')))
  const visibles = coincidentes.filter(r => filtro === 'todos' || r.estado === filtro)
  function abrir(registro, deshacer = false) {
    const anterior = revision(registro.local)
    setError(''); setForm({ fecha: anterior?.fecha_realizado || hoy, equipos: anterior?.equipos_declarados ?? '', observaciones: deshacer ? '' : anterior?.observaciones || '' })
    setSeleccion({ ...registro, deshacer, anterior, anio, mes })
  }
  function cerrar() { if (!enviando) { dialogo.current?.close(); setSeleccion(null) } }
  async function enviar(e) {
    e.preventDefault(); setError(''); setEnviando(true)
    try {
      const datos = seleccion.deshacer ? { fecha: null, equipos: null, observaciones: form.observaciones.trim() } : validarRealizado(form, hoy)
      if (seleccion.deshacer && !datos.observaciones) throw new Error('Indica por qué deshaces la marca para conservar el seguimiento.')
      await guardar(seleccion.local, seleccion.anio, seleccion.mes, { ...datos, realizado: !seleccion.deshacer }, seleccion.anterior?.revision || 0)
      dialogo.current?.close(); setSeleccion(null)
    } catch (fallo) { setError(fallo.message || 'No se pudo guardar. Actualiza e intenta de nuevo.') }
    finally { setEnviando(false) }
  }
  return <section className="space-y-4" aria-label="Seguimiento de los mantenimientos">
    <div className="grid grid-cols-2 gap-2 sm:gap-4">{[['pendiente','Pendientes'],['realizado','Realizados']].map(([estado, titulo]) => <button key={estado} type="button" aria-pressed={filtro === estado} onClick={() => setFiltro(estado)} className={`card min-h-20 p-3 text-left ${filtro === estado ? 'ring-2 ring-sky-500' : ''}`}><span className="block text-[11px] font-bold text-slate-600">{titulo}</span><span className="mt-1 block text-2xl font-black">{coincidentes.filter(r => r.estado === estado).length}</span></button>)}</div>
    <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-bold">Mes programado<select className={`${campo} mt-1`} value={mes} onChange={e => cambiarMes(Number(e.target.value))}>{MESES_PREVENTIVOS.map((nombre, i) => <option key={nombre} value={i+1}>{nombre}</option>)}</select></label>
      <label className="text-xs font-bold">Restaurantes<select className={`${campo} mt-1`} value={marca} onChange={e => setMarca(e.target.value)}><option value="">Todas las marcas</option>{Object.entries(MARCAS_PREVENTIVOS).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select></label>
      <label className="text-xs font-bold">Mostrar<select className={`${campo} mt-1`} value={filtro} onChange={e => setFiltro(e.target.value)}><option value="todos">Todos</option><option value="pendiente">Pendientes</option><option value="realizado">Realizados</option></select></label>
      <label className="text-xs font-bold">Buscar<input className={`${campo} mt-1`} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Código, nombre o dirección"/></label>
      <p className="text-xs leading-relaxed text-slate-600 sm:col-span-2 lg:col-span-4">Realizado: lo marca un administrador o técnico, o se detecta una orden del mes programado en el Excel, sin importar su estado. Pendiente: no hay orden ni marca manual. Las cantidades declaradas y las del Excel se conservan por separado.</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold text-slate-600">{visibles.length} de {coincidentes.length} restaurantes · {MESES_PREVENTIVOS[mes-1]} {anio} · Pendientes primero</p>
      {visibles.length < coincidentes.length && <button type="button" className="btn-ghost min-h-11" onClick={() => setFiltro('todos')}>Ver todos los estados ({coincidentes.length})</button>}
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">{visibles.map(registro => {
      const { local, declaracion, realizado, enExcel } = registro
      const corregible = declaracion && (!tecnico || declaracion.realizado_por === usuarioId)
      const abierto = expandido === local.id
      const idDetalle = `detalle-preventivo-${local.marca}-${local.codigo}`
      const alternar = () => setExpandido(abierto ? null : local.id)
      return <article className="card min-w-0 overflow-hidden" data-restaurante-tipo={tipoRestaurantePreventivo(local)} key={local.id}>
        <div className="space-y-4 p-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black text-sky-700">#{local.codigo} · {TIPOS_RESTAURANTE_PREVENTIVO[tipoRestaurantePreventivo(local)]}</p>
              <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${colores[registro.estado]}`}>{realizado ? <Check size={13} aria-hidden="true"/> : <Clock3 size={13} aria-hidden="true"/>}{estados[registro.estado]}</span>
            </div>
            <h3><button type="button" aria-expanded={abierto} aria-controls={idDetalle} onClick={alternar} className="min-h-7 text-left text-base font-black leading-snug hover:text-sky-700">{local.nombre}</button></h3>
            <p className="mt-2 text-xs font-semibold text-slate-600">{MESES_PREVENTIVOS[mes-1]} · {local.semana || 'Sin semana asignada'}</p>
            <p className="mt-1 text-xs text-slate-600">{local.equipos == null ? 'Sin cantidad prevista' : `${local.equipos} equipos previstos`}{declaracion?.equipos_declarados ? ` · ${declaracion.equipos_declarados} declarados` : ''}</p>
          </div>
          <div className="space-y-1 border-y border-slate-300 py-3 text-xs text-slate-600">
            {declaracion && <p className="break-words">Marcado por: <span className="font-semibold">{declaracion.realizado_nombre || 'Administrador o técnico'}</span></p>}
            {enExcel && <p>{registro.ordenes.length} {registro.ordenes.length === 1 ? 'orden registrada' : 'órdenes registradas'} en el Excel</p>}
            {!realizado && <p>Sin registro en Excel ni marca manual.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!realizado && <button type="button" aria-label="Marcar realizado" className="btn-primary min-h-11 flex-1" disabled={!listo || ocupado} onClick={() => abrir(registro)}><Check size={14} className="mr-1 inline"/>Marcar realizado</button>}
            <button type="button" className="btn-ghost inline-flex min-h-11 flex-1 items-center justify-center gap-1" aria-expanded={abierto} aria-controls={idDetalle} onClick={alternar}>Detalle<ChevronDown size={14} className={abierto ? 'rotate-180' : ''}/></button>
          </div>
        </div>
        <div id={idDetalle} hidden={!abierto} className="border-t border-slate-300 bg-slate-50 px-4 py-4 sm:px-6">
        <p className="text-xs font-bold">{TIPOS_RESTAURANTE_PREVENTIVO[tipoRestaurantePreventivo(local)]} · #{local.codigo} · {MESES_PREVENTIVOS[mes-1]} {anio}</p>
        <p className="mt-3 break-words text-xs text-slate-600">{local.direccion || 'Sin dirección en calendario'}</p>
        <p className="mt-2 text-xs font-semibold text-slate-600">{local.semana || 'Sin semana asignada'} · {local.equipos == null ? 'Sin cantidad prevista' : `${local.equipos} equipos previstos`}</p>
        {declaracion && <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-950"><p className="font-bold">{declaracion.realizado_nombre}</p><p className="mt-1">Realizado: {declaracion.fecha_realizado.split('-').reverse().join('/')}{declaracion.equipos_declarados ? ` · ${declaracion.equipos_declarados} equipos declarados` : ''}</p>{declaracion.actualizado_en && <p className="mt-1 text-[11px]">Registro: {new Date(declaracion.actualizado_en).toLocaleString('es-GT',{timeZone:'America/Guatemala',dateStyle:'short',timeStyle:'short'})}</p>}{declaracion.observaciones && <p className="mt-2 whitespace-pre-wrap break-words">{declaracion.observaciones}</p>}</div>}
        {enExcel && <div className="mt-3 rounded-lg border border-slate-300 bg-white p-3"><DetalleOrdenesPreventivos ordenes={registro.ordenes}/></div>}
        <div className="flex flex-wrap gap-2 pt-4">
          {corregible && <button type="button" className="btn-ghost min-h-11" disabled={!listo || ocupado} onClick={() => abrir(registro)}>Editar reporte</button>}
          {corregible && !enExcel && <button type="button" className="btn-ghost min-h-11" disabled={!listo || ocupado} onClick={() => abrir(registro, true)}>Deshacer marca</button>}
          {local.direccion && <a className="btn-ghost inline-flex min-h-11 items-center gap-1" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(local.direccion)}`}><MapPin size={14}/> Mapa</a>}
          {local.telefono && <a className="btn-ghost inline-flex min-h-11 items-center gap-1" href={`tel:${local.telefono.replace(/[^+\d]/g,'')}`}><Phone size={14}/> Llamar</a>}
          {!tecnico && <button type="button" className="btn-ghost inline-flex min-h-11 items-center gap-1" disabled={!cierresListos || ocupado} onClick={()=>cerrarLocal(local)}><Archive size={14}/> Marcar cerrado</button>}
        </div>
        </div>
      </article>
    })}</div>
    {!visibles.length && <p className="card p-5 text-sm text-slate-600">No hay restaurantes con estos filtros. Puedes cambiar «Mostrar» para ver los demás.</p>}
    <dialog ref={dialogo} onCancel={e => { if (enviando) e.preventDefault(); else setSeleccion(null) }} className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-2xl border-2 border-slate-900 bg-white p-0 text-slate-900 backdrop:bg-slate-950/60" aria-labelledby="titulo-realizado">
      {seleccion && <form onSubmit={enviar} className="grid max-h-[85dvh] gap-4 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3"><div><h2 id="titulo-realizado" className="text-lg font-black">{seleccion.deshacer ? 'Deshacer realizado' : 'Reportar preventivo realizado'}</h2><p className="mt-1 text-sm">#{seleccion.local.codigo} · {seleccion.local.nombre}</p><p className="mt-1 text-xs text-slate-600">{MESES_PREVENTIVOS[seleccion.mes-1]} {seleccion.anio}</p></div><button type="button" aria-label="Cerrar" disabled={enviando} onClick={cerrar} className="btn-ghost"><X size={17}/></button></div>
        {!seleccion.deshacer && <><label className="grid gap-1 text-xs font-bold">Fecha en que se realizó<input required type="date" max={hoy} value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} className={campo}/></label><label className="grid gap-1 text-xs font-bold">Equipos trabajados (opcional)<input type="number" min="1" max="500" step="1" value={form.equipos} onChange={e => setForm(p => ({ ...p, equipos: e.target.value }))} className={campo}/></label></>}
        <label className="grid gap-1 text-xs font-bold">{seleccion.deshacer ? 'Motivo de la corrección' : 'Observación (opcional)'}<textarea required={seleccion.deshacer} rows={3} maxLength={1500} value={form.observaciones} onChange={e => setForm(p => ({ ...p, observaciones: e.target.value }))} className={campo} placeholder="Equipos pendientes, acceso al negocio o detalles para administración…"/></label>
        <p className="flex gap-2 text-xs text-slate-600"><Clock3 size={16} className="shrink-0"/> Esta marca cuenta como realizado. Se guardan tu nombre, la fecha y los equipos declarados, sin modificar ni duplicar las órdenes del Excel.</p>
        {error && <div role="alert" className="text-sm text-rose-700">{error}<button type="button" disabled={enviando} onClick={()=>{cerrar();recargar()}} className="btn-ghost mt-2 block">Actualizar datos</button></div>}
        <div className="flex justify-end gap-2"><button type="button" disabled={enviando} className="btn-ghost min-h-11" onClick={cerrar}>Cancelar</button><button type="submit" disabled={enviando} className="btn-primary min-h-11">{enviando ? 'Guardando…' : seleccion.deshacer ? 'Confirmar corrección' : 'Guardar realizado'}</button></div>
      </form>}
    </dialog>
  </section>
}

