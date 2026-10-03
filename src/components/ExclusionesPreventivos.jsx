import { useState } from 'react'
import { Archive, RotateCcw, X } from 'lucide-react'
import Dialogo from './Dialogo'
import DetalleOrdenesPreventivos from './DetalleOrdenesPreventivos'
import { MARCAS_PREVENTIVOS } from '../utils/preventivos.js'
import { validarExclusionOrden } from '../utils/exclusionesPreventivos.js'

const fechaVisible = fecha => fecha ? new Date(fecha).toLocaleString('es-GT', {timeZone:'America/Guatemala',dateStyle:'short',timeStyle:'short'}) : 'Sin fecha registrada'

export function DialogoExclusionOrden({ orden, guardar, cerrar }) {
  const excluyendo = !orden.exclusion?.excluida
  const [motivo,setMotivo] = useState(excluyendo ? 'Servicio eliminado / no realizado' : 'Orden válida; incluir nuevamente en preventivos')
  const [guardando,setGuardando] = useState(false)
  const [error,setError] = useState('')
  async function enviar(evento) {
    evento.preventDefault();setError('');setGuardando(true)
    try { await guardar(orden,excluyendo,validarExclusionOrden(motivo)) }
    catch(fallo) { setError(fallo.message || 'No se pudo guardar. Intenta de nuevo.') }
    finally { setGuardando(false) }
  }
  const titulo = excluyendo ? 'Excluir orden de preventivo' : 'Restaurar orden de preventivo'
  return <Dialogo titulo={titulo} onCerrar={()=>{if(!guardando)cerrar()}}>
    <form onSubmit={enviar} className="app-dialog-panel">
      <div className="app-dialog-header"><h2 className="text-base font-black">{titulo}</h2><button type="button" aria-label="Cerrar formulario" disabled={guardando} onClick={cerrar}><X size={20}/></button></div>
      <div className="app-dialog-body space-y-4">
        <p className="text-sm font-bold">Orden #{orden.numero_orden} · {orden.local?.nombre || orden.negocio || MARCAS_PREVENTIVOS[orden.marca]}</p>
        <p className="text-sm text-slate-600">{excluyendo ? 'Esta orden dejará de contar en avances, equipos y Por ubicar. Se conservará en Órdenes excluidas y no se reactivará al cargar otro Excel.' : 'La orden volverá a contar en su mes programado. Si no tiene mes asignado, aparecerá en Por ubicar.'}</p>
        <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700">Las demás órdenes y marcas manuales no cambian. Un preventivo sólo vuelve a Pendiente si no le queda ninguna orden válida ni una marca manual de Realizado.</p>
        <label className="grid gap-1 text-xs font-bold">{excluyendo ? 'Motivo de la exclusión' : 'Motivo de la restauración'}<textarea required rows={3} maxLength={1500} disabled={guardando} value={motivo} onChange={e=>setMotivo(e.target.value)} className="control-field"/></label>
        {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
      </div>
      <div className="app-dialog-footer"><button type="button" disabled={guardando} onClick={cerrar} className="btn-ghost min-h-11">Cancelar</button><button type="submit" disabled={guardando} className="btn-primary min-h-11">{guardando ? 'Guardando…' : excluyendo ? 'Confirmar exclusión' : 'Confirmar restauración'}</button></div>
    </form>
  </Dialogo>
}

export default function ExclusionesPreventivos({ ordenes, historial, listo, ocupado, restaurar }) {
  const [marca,setMarca] = useState('')
  const [busqueda,setBusqueda] = useState('')
  const termino=busqueda.trim().toLocaleLowerCase('es')
  const visibles=ordenes.filter(o=>(!marca || o.marca===marca) && `${o.numero_orden} ${o.codigo||''} ${o.local?.nombre||o.negocio} ${o.tecnico||''}`.toLocaleLowerCase('es').includes(termino))
    .sort((a,b)=>(b.exclusion.actualizado_en||'').localeCompare(a.exclusion.actualizado_en||'') || a.numero_orden.localeCompare(b.numero_orden,'es',{numeric:true}))
  return <section className="space-y-4" aria-label="Órdenes excluidas">
    <div className="card space-y-3 p-4">
      <div><h2 className="flex items-center gap-2 text-lg font-black"><Archive size={20}/> Órdenes excluidas</h2><p className="mt-1 text-sm text-slate-600">Archivo de todos los meses y años. Estas órdenes no cuentan en avances ni equipos. Sólo un administrador puede restaurarlas.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold">Marca de la orden<select className="control-field" value={marca} onChange={e=>setMarca(e.target.value)}><option value="">Todas las marcas</option>{Object.entries(MARCAS_PREVENTIVOS).map(([id,nombre])=><option key={id} value={id}>{nombre}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-bold">Buscar orden excluida<input className="control-field" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Orden, código, restaurante o técnico"/></label>
      </div>
      <p className="text-xs font-semibold text-slate-600">{visibles.length} de {ordenes.length} órdenes excluidas</p>
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">{visibles.map(orden=>{
      const movimientos=historial.filter(h=>h.numero_orden===orden.numero_orden).sort((a,b)=>b.revision-a.revision)
      return <article key={orden.numero_orden} className="card min-w-0 space-y-3 p-4" data-orden-excluida={orden.numero_orden}>
        <h3 className="break-words text-base font-black">{orden.local?.nombre || orden.negocio || 'Sin negocio'}</h3>
        <p className="text-xs text-sky-700">{MARCAS_PREVENTIVOS[orden.marca]} · {orden.codigo ? `Código ${orden.codigo}` : 'Sin código'}</p>
        <DetalleOrdenesPreventivos ordenes={[orden]} mostrarPeriodo/>
        <div className="space-y-2 border-y border-slate-300 py-3 text-xs">
          <p className="font-bold">Excluida el {fechaVisible(orden.exclusion.actualizado_en)}</p>
          <p className="break-words text-slate-600">Por: {orden.exclusion.autor_nombre}</p>
          <p className="whitespace-pre-wrap break-words text-slate-600">{orden.exclusion.motivo}</p>
        </div>
        {movimientos.length>0 && <details className="text-xs"><summary className="cursor-pointer py-2 font-bold">Historial de cambios ({movimientos.length})</summary><ul className="max-h-64 space-y-3 overflow-y-auto pt-2">{movimientos.map(m=><li key={m.id} className="border-b border-slate-300 pb-2"><p className="font-bold">{m.excluida?'Exclusión':'Restauración'} · {fechaVisible(m.registrado_en)}</p><p className="mt-1 break-words text-slate-600">{m.autor_nombre}</p><p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{m.motivo}</p></li>)}</ul></details>}
        <button type="button" disabled={!listo||ocupado} onClick={()=>restaurar(orden)} className="btn-ghost flex min-h-11 w-full items-center justify-center gap-2" aria-label={`Restaurar orden ${orden.numero_orden}`}><RotateCcw size={15}/> Restaurar orden</button>
      </article>
    })}</div>
    {!visibles.length && <p className="card p-5 text-sm text-slate-600">{ordenes.length ? 'No hay órdenes excluidas con estos filtros.' : 'No hay órdenes excluidas.'}</p>}
  </section>
}
