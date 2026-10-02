import { useState } from 'react'
import { Archive, RotateCcw, X } from 'lucide-react'
import Dialogo from './Dialogo'
import { MARCAS_PREVENTIVOS, MESES_PREVENTIVOS } from '../utils/preventivos.js'
import { tipoRestaurantePreventivo, TIPOS_RESTAURANTE_PREVENTIVO } from '../utils/seguimientoPreventivos.js'
import { validarEstadoLocal } from '../utils/cierresPreventivos.js'
import DetalleOrdenesPreventivos from './DetalleOrdenesPreventivos'

const fechaVisible = valor => valor ? valor.slice(0,10).split('-').reverse().join('/') : 'Sin fecha registrada'

export function DialogoEstadoLocal({ local, hoy, guardar, cerrar }) {
  const [fecha, setFecha] = useState(hoy)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const cerrando = local.activo
  async function enviar(evento) {
    evento.preventDefault(); setError(''); setGuardando(true)
    try { await guardar(local, validarEstadoLocal({ cerrado: cerrando, fecha, motivo }, hoy)) }
    catch (fallo) { setError(fallo.message || 'No se pudo guardar el cambio. Intenta de nuevo.') }
    finally { setGuardando(false) }
  }
  return <Dialogo titulo={cerrando ? 'Cerrar punto de venta' : 'Reactivar punto de venta'} onCerrar={() => { if (!guardando) cerrar() }}>
    <form onSubmit={enviar} className="app-dialog-panel">
      <div className="app-dialog-header"><h2 className="text-base font-black">{cerrando ? 'Cerrar punto de venta' : 'Reactivar punto de venta'}</h2><button type="button" aria-label="Cerrar formulario" disabled={guardando} onClick={cerrar}><X size={20}/></button></div>
      <div className="app-dialog-body space-y-4">
        <p className="text-sm font-bold">#{local.codigo} · {local.nombre}</p>
        <p className="text-sm text-slate-600">{cerrando ? 'La ficha se moverá a Cerrados y dejará de aparecer en la programación y los pendientes. Sus órdenes y reportes se conservarán.' : 'El punto de venta volverá a aparecer en sus meses programados. Se conservarán sus órdenes, reportes y el registro del cierre.'}</p>
        {cerrando && <label className="grid gap-1 text-xs font-bold">Fecha de cierre<input type="date" required max={hoy} value={fecha} disabled={guardando} onChange={e=>setFecha(e.target.value)} className="control-field"/></label>}
        <label className="grid gap-1 text-xs font-bold">{cerrando ? 'Motivo del cierre (opcional)' : 'Motivo de la reactivación (opcional)'}<textarea rows={3} maxLength={1500} disabled={guardando} value={motivo} onChange={e=>setMotivo(e.target.value)} className="control-field" placeholder={cerrando ? 'Por ejemplo: cierre definitivo del negocio.' : 'Por ejemplo: el negocio volvió a operar.'}/></label>
        {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
      </div>
      <div className="app-dialog-footer"><button type="button" disabled={guardando} onClick={cerrar} className="btn-ghost min-h-11">Cancelar</button><button type="submit" disabled={guardando} className="btn-primary min-h-11">{guardando ? 'Guardando…' : cerrando ? 'Confirmar cierre' : 'Confirmar reactivación'}</button></div>
    </form>
  </Dialogo>
}

export default function CierresPreventivos({ locales, ordenes, declaraciones, historial, tecnico, listo, ocupado, reactivar }) {
  const [marca, setMarca] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const termino = busqueda.trim().toLocaleLowerCase('es')
  const visibles = locales.filter(l => (!marca || l.marca === marca) && `${l.codigo} ${l.nombre} ${l.direccion}`.toLocaleLowerCase('es').includes(termino))
    .sort((a,b) => (b.fecha_cierre || '').localeCompare(a.fecha_cierre || '') || a.nombre.localeCompare(b.nombre, 'es'))
  return <section className="space-y-4" aria-label="Puntos de venta cerrados">
    <div className="card space-y-3 p-4">
      <div><h2 className="flex items-center gap-2 text-lg font-black"><Archive size={20}/> Puntos de venta cerrados</h2><p className="mt-1 text-sm text-slate-600">Archivo de todos los cierres, incluidos los del calendario original. Conserva la información de todos los meses y años.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold">Restaurantes cerrados<select className="control-field" value={marca} onChange={e=>setMarca(e.target.value)}><option value="">Todas las marcas</option>{Object.entries(MARCAS_PREVENTIVOS).map(([id,nombre])=><option key={id} value={id}>{nombre}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-bold">Buscar cerrado<input className="control-field" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Código, nombre o dirección"/></label>
      </div>
      <p className="text-xs font-semibold text-slate-600">{visibles.length} de {locales.length} puntos de venta cerrados</p>
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">{visibles.map(local => {
      const delLocal = registro => registro.marca===local.marca && registro.codigo===local.codigo
      const trabajos = ordenes.filter(o=>o.local?.id===local.id)
      const reportes = declaraciones.filter(delLocal).filter(d=>d.realizado)
      const movimientos = historial.filter(delLocal)
      return <article key={local.id} className="card min-w-0 space-y-3 p-4" data-local-cerrado={local.id}>
        <div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-sky-700">#{local.codigo} · {TIPOS_RESTAURANTE_PREVENTIVO[tipoRestaurantePreventivo(local)]}</p><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">Cerrado</span></div>
        <h3 className="text-base font-black">{local.nombre}</h3>
        <p className="break-words text-xs text-slate-600">{local.direccion || 'Sin dirección en calendario'}</p>
        <div className="space-y-2 border-y border-slate-300 py-3 text-xs">
          <p className="font-bold">{local.fecha_cierre ? `Fecha de cierre: ${fechaVisible(local.fecha_cierre)}` : 'Cerrado en el calendario · sin fecha de cierre registrada'}</p>
          {local.motivo_cierre && <p className="whitespace-pre-wrap break-words text-slate-600">{local.motivo_cierre}</p>}
          <p className="text-slate-600">Meses programados: {local.meses.map(m=>MESES_PREVENTIVOS[m-1]).join(' · ')}</p>
          <p className="text-slate-600">{local.equipos == null ? 'Sin cantidad prevista en el calendario' : `${local.equipos} equipos previstos en el calendario`}</p>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer py-2 font-bold">Ver historial · {trabajos.length} órdenes · {reportes.length} reportes</summary>
          <div className="max-h-80 space-y-3 overflow-y-auto pt-2">
            {!trabajos.length && !reportes.length && <p className="text-slate-600">No hay órdenes ni reportes registrados para este punto de venta.</p>}
            <DetalleOrdenesPreventivos ordenes={trabajos} mostrarPeriodo/>
            {reportes.map(d=><div className="border-b border-slate-300 pb-2" key={`${d.anio}:${d.mes}`}><p className="font-bold">Reporte de {d.realizado_nombre} · {MESES_PREVENTIVOS[d.mes-1]} {d.anio}</p><p className="mt-1 text-slate-600">{fechaVisible(d.fecha_realizado)}{d.equipos_declarados ? ` · ${d.equipos_declarados} equipos declarados` : ''}</p>{d.observaciones && <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{d.observaciones}</p>}</div>)}
            {movimientos.length>0 && <div className="space-y-2"><p className="font-bold">Cierres y reactivaciones</p>{movimientos.map(m=><p key={m.id} className="text-slate-600">{m.cerrado ? `Cierre: ${fechaVisible(m.fecha_cierre)}` : 'Reactivación'} · Registrado {new Date(m.registrado_en).toLocaleString('es-GT',{timeZone:'America/Guatemala',dateStyle:'short',timeStyle:'short'})}{m.motivo && <span className="block whitespace-pre-wrap break-words">{m.motivo}</span>}</p>)}</div>}
          </div>
        </details>
        {!tecnico && <button type="button" className="btn-ghost flex min-h-11 w-full items-center justify-center gap-2" disabled={!listo || ocupado} onClick={()=>reactivar(local)}><RotateCcw size={15}/> Reactivar punto de venta</button>}
      </article>
    })}</div>
    {!visibles.length && <p className="card p-5 text-sm text-slate-600">{locales.length ? 'No hay puntos cerrados con esos filtros.' : 'Todavía no hay puntos de venta cerrados.'}</p>}
  </section>
}
