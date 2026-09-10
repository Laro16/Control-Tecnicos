import { CalendarDays } from 'lucide-react'
import ExpedientesGarantia from './ExpedientesGarantia'
import { obtenerSerieTicket } from '../utils/garantias.js'
import { claveSerieGarantia } from '../utils/vencimientosGarantia.js'
import { referenciaTicketGarantia } from '../utils/expedientesGarantia.js'

export function ControlVencimiento({ ticket, garantia, onEditar, expediente, estadoExpedientes }) {
  const serie = claveSerieGarantia(obtenerSerieTicket(ticket))
  const numero = referenciaTicketGarantia(ticket)
  return <div className="space-y-2 border-t border-slate-200 pt-2">
    {expediente && <p className="rounded-md border-2 border-orange-600 bg-orange-100 px-3 py-2 text-sm font-bold text-orange-900">Ficha creada · #{expediente.referencia} · {expediente.estado}<span className="block text-xs font-normal">El expediente corresponde a esta referencia. Tener ficha no significa que la atención esté autorizada.</span></p>}
    {estadoExpedientes === 'error' && <p className="text-xs text-amber-800">No se pudo comprobar si esta referencia tiene ficha. Reintenta abriendo el expediente.</p>}
    {!numero && <p role="alert" className="rounded-md border-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">Este ticket cargado no contiene N° REFERENCIA ni N° ORDEN. Vuelve a cargar el Excel para actualizar sus datos.</p>}
    {garantia?.fechaVerificada && garantia.sinFechaIngreso && <p className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
      Vencimiento confirmado: {garantia.vencDisplay} · cobertura del mes hasta {garantia.coberturaHastaDisplay}. Falta FECHA INGRESO para decidir este ticket.
    </p>}
    {garantia?.fechaVerificada && !garantia.sinFechaIngreso && <p className={`rounded-md border px-3 py-2 text-sm font-bold ${garantia.vencida === true ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}>
      {garantia.vencida === true ? 'Fuera de cobertura al ingresar' : 'Cubierta al ingresar'} · Ingresó: {garantia.fechaIngresoDisplay} · vencimiento confirmado: {garantia.vencDisplay} · cobertura hasta: {garantia.coberturaHastaDisplay}
    </p>}
    <button type="button" className="btn-ghost inline-flex items-center gap-2" disabled={!serie} onClick={() => onEditar(ticket)}>
      <CalendarDays size={15} /> {expediente ? 'Abrir ficha creada' : 'Crear ficha / registrar vencimiento'}
    </button>
    {!serie && <p className="text-xs text-slate-500">Primero se necesita una serie válida en el Excel para recordar su vencimiento.</p>}
  </div>
}

export default function EditorVencimientoGarantia({ ticket, datos, onCerrar }) {
  return <ExpedientesGarantia ticketInicial={ticket} datos={datos} onCerrar={onCerrar}/>
}
