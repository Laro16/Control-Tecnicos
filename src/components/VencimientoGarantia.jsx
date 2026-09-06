import { useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import Dialogo from './Dialogo'
import { obtenerSerieTicket } from '../utils/garantias.js'
import { claveSerieGarantia, fechaGarantiaManual } from '../utils/vencimientosGarantia.js'

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
  const serie = claveSerieGarantia(obtenerSerieTicket(ticket))
  const anterior = datos.porSerie[serie]?.fecha_vencimiento || ''
  const [fecha, setFecha] = useState(anterior)
  const [confirmada, setConfirmada] = useState(false)
  const [error, setError] = useState('')
  async function guardar(valor) {
    setError('')
    try { await datos.guardar(serie, valor); onCerrar() }
    catch (e) { setError(`No se confirmó el guardado: ${e.message || 'revisa la conexión e inténtalo de nuevo.'}`) }
  }
  return <Dialogo titulo="Vencimiento real de garantía" onCerrar={() => { if (!datos.guardando) onCerrar() }}>
    <form className="app-dialog-panel" onSubmit={e => { e.preventDefault(); if (confirmada && fechaGarantiaManual(fecha) && datos.estado === 'listo') guardar(fecha) }}>
      <div className="app-dialog-header"><h3>Vencimiento real de garantía</h3><button type="button" disabled={datos.guardando} onClick={onCerrar} aria-label="Cerrar vencimiento"><X size={20}/></button></div>
      <div className="app-dialog-body space-y-4">
        <p className="text-sm break-words"><strong>Cliente:</strong> {ticket.CLIENTE || 'Sin cliente'}<br/><strong>Serie:</strong> {serie}<br/><strong>Referencia:</strong> {ticket['N° REFERENCIA']}</p>
        <p className="text-sm">Introduce el vencimiento que corroboraste en la web de la empresa. Se aplicará a esta misma serie en todas las cargas futuras, aunque cambie el número de reporte.</p>
        <label className="block">Fecha real de vencimiento
          <input type="date" required min="1900-01-01" max="9999-12-31" value={fecha} disabled={datos.guardando} onChange={e => { setFecha(e.target.value); setConfirmada(false) }} className="control-field mt-1" />
        </label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmada} disabled={datos.guardando} onChange={e => setConfirmada(e.target.checked)} className="mt-1 h-5 w-5 shrink-0"/><span>Corroboré esta fecha para esta serie en la web de la empresa.</span></label>
        <p className="text-xs text-slate-500">La cobertura incluye el día de vencimiento. No se modifica el TIPO ni ningún dato del Excel.</p>
        {anterior && <button type="button" className="btn-ghost" disabled={datos.guardando || datos.estado !== 'listo'} onClick={() => { if (window.confirm('¿Volver al cálculo automático por fabricación para esta serie? Se conservará el registro de la corrección.')) guardar(null) }}>Volver al cálculo automático</button>}
        {datos.estado !== 'listo' && <p role="status" className="text-sm text-amber-700">Primero debes tener disponible la tabla de vencimientos en Supabase. Cierra este formulario y reintenta la consulta.</p>}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      </div>
      <div className="app-dialog-footer"><button type="button" className="btn-ghost" disabled={datos.guardando} onClick={onCerrar}>Cancelar</button><button type="submit" className="btn-primary" disabled={datos.guardando || datos.estado !== 'listo' || !confirmada || !fechaGarantiaManual(fecha)}>{datos.guardando ? 'Guardando…' : 'Guardar vencimiento'}</button></div>
    </form>
  </Dialogo>
}
