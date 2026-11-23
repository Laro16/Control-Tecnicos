import { anioCMIValido } from '../hooks/useVueltaActivaCMI'
import { MESES_PREVENTIVOS } from '../utils/preventivos'

export function nombreVueltaCMI(vuelta) {
  return `${MESES_PREVENTIVOS[(vuelta - 1) * 4]} – ${MESES_PREVENTIVOS[vuelta * 4 - 1]}`
}

export default function VueltaActivaCMI({ periodo, importando = false, children }) {
  const { anio, vuelta, destino, ocupado, error, elegir } = periodo
  const deshabilitado = ocupado || importando
  return <section className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Vuelta activa de carga CMI">
    <label className="text-xs font-bold">Año del reporte y de carga
      <input className="control-field mt-1 w-full" type="number" min="2020" max="2100" value={anio}
        disabled={deshabilitado} onChange={e => elegir(e.target.value, vuelta)} />
    </label>
    <label className="text-xs font-bold">Vuelta del reporte y de carga
      <select className="control-field mt-1 w-full" value={vuelta} disabled={deshabilitado}
        onChange={e => elegir(anio, Number(e.target.value))}>
        {[1, 2, 3].map(v => <option key={v} value={v}>{nombreVueltaCMI(v)}</option>)}
      </select>
    </label>
    {children}
    <div className="col-span-full flex flex-wrap items-center gap-2 text-sm">
      <span role="status">{ocupado ? 'Confirmando la vuelta de carga…' : destino
        ? `Las órdenes CMI nuevas del Excel se cargarán en ${nombreVueltaCMI(vuelta)} de ${anio}.`
        : anioCMIValido(anio) ? 'Elige una vuelta o activa la que se muestra para cargar órdenes CMI.' : 'Ingresa un año entre 2020 y 2100.'}</span>
      {!destino && !ocupado && anioCMIValido(anio) && <button type="button" className="btn-ghost" disabled={importando} onClick={() => elegir(anio, vuelta)}>Usar esta vuelta</button>}
      {error && <span role="alert" className="basis-full text-rose-700">{error}</span>}
    </div>
  </section>
}
