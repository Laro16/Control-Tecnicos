import { CalendarDays } from 'lucide-react'
import ExpedientesGarantia from './ExpedientesGarantia'
import { obtenerSerieTicket } from '../utils/garantias.js'
import { claveSerieGarantia } from '../utils/vencimientosGarantia.js'

export function ControlVencimiento({ ticket, garantia, onEditar }) {
  const serie = claveSerieGarantia(obtenerSerieTicket(ticket))
  return <div className="space-y-2 border-t border-slate-200 pt-2">
    {garantia?.fechaVerificada && <p className={`rounded-md border px-3 py-2 text-sm font-bold ${garantia.vencida ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}>
      {garantia.vencida ? 'Vencida' : 'Vigente'} · Vencimiento real confirmado: {garantia.vencDisplay}
    </p>}
    <button type="button" className="btn-ghost inline-flex items-center gap-2" disabled={!serie} onClick={() => onEditar(ticket)}>
      <CalendarDays size={15} /> {garantia?.fechaVerificada ? 'Editar vencimiento real' : 'Registrar vencimiento real'}
    </button>
    {!serie && <p className="text-xs text-slate-500">Primero se necesita una serie válida en el Excel para recordar su vencimiento.</p>}
  </div>
}

export default function EditorVencimientoGarantia({ ticket, datos, onCerrar }) {
  return <ExpedientesGarantia ticketInicial={ticket} datos={datos} onCerrar={onCerrar}/>
}
