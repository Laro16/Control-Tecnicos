import { fechaPreventivo, MESES_PREVENTIVOS } from '../utils/preventivos.js'

export default function DetalleOrdenesPreventivos({ ordenes, mostrarPeriodo = false }) {
  if (!ordenes.length) return null
  return <div className="space-y-2 text-xs">
    <p className="font-bold">Órdenes registradas en Excel</p>
    <ul className="divide-y divide-slate-300" aria-label="Órdenes registradas">
      {ordenes.map(orden => {
        const fecha = fechaPreventivo(orden.fecha_realizada)
        return <li key={orden.numero_orden} className="space-y-1 break-words py-3 first:pt-0 last:pb-0">
          <p className="font-bold">Orden #{orden.numero_orden}</p>
          <p className="text-slate-600"><span className="font-semibold">Técnico: </span>{String(orden.tecnico ?? '').trim() || 'No informado'}</p>
          <p className="text-slate-600"><span className="font-semibold">Fecha realizada: </span>{fecha ? fecha.split('-').reverse().join('/') : 'Sin fecha en el Excel'}</p>
          {mostrarPeriodo && orden.programado && <p className="text-slate-600">Mes programado: {MESES_PREVENTIVOS[orden.programado.mes-1]} {orden.programado.anio}</p>}
        </li>
      })}
    </ul>
  </div>
}
