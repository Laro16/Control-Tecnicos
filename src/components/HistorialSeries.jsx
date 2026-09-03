import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, History, RotateCcw, Search, ShieldAlert } from 'lucide-react'

const mostrarFecha = fecha => fecha ? fecha.split('-').reverse().join('/') : 'Sin fecha de cierre'

export default function HistorialSeries({ datos, reincidencias, solicitudAlerta }) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [serieAbierta, setSerieAbierta] = useState('')
  const [limite, setLimite] = useState(12)
  const seccionRef = useRef(null)
  const ultimaSolicitud = useRef(null)
  const { historial, estado, reintentar } = datos
  const ocupado = estado === 'cargando' || estado === 'guardando'
  const aviso = estado === 'sin-configurar'
    ? 'Falta activar el historial en Supabase con activar_historial_series.sql. Por ahora sólo se revisan los datos observados en esta sesión; aún no están guardados.'
    : estado === 'error'
      ? 'No se pudo sincronizar el historial. La revisión puede estar incompleta y hay datos que podrían no estar guardados. Reintenta antes de cerrar.'
      : ocupado ? 'Consultando y guardando atenciones anteriores…' : ''

  useEffect(() => {
    if (solicitudAlerta?.tipo === 'reincidencias') setAbierto(true)
  }, [solicitudAlerta])
  useEffect(() => {
    if (!abierto || solicitudAlerta?.tipo !== 'reincidencias' || ultimaSolicitud.current === solicitudAlerta.secuencia) return
    const frame = requestAnimationFrame(() => {
      seccionRef.current?.focus({ preventScroll: true })
      seccionRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      ultimaSolicitud.current = solicitudAlerta.secuencia
    })
    return () => cancelAnimationFrame(frame)
  }, [abierto, solicitudAlerta])

  const grupos = useMemo(() => {
    const mapa = new Map()
    for (const registro of historial) {
      if (!mapa.has(registro.serie)) mapa.set(registro.serie, [])
      mapa.get(registro.serie).push(registro)
    }
    return [...mapa.entries()]
  }, [historial])
  const consulta = busqueda.trim().toLocaleUpperCase()
  const filtrados = grupos.filter(([serie, registros]) => !consulta || serie.includes(consulta) || registros.some(r => `${r.referencia} ${r.cliente} ${r.negocio}`.toLocaleUpperCase().includes(consulta)))

  return (
    <section ref={seccionRef} id="alertas-reincidencias" tabIndex={-1} className="alert-anchor card-section">
      <button type="button" onClick={() => setAbierto(v => !v)} aria-expanded={abierto} className="flex w-full flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-700"><History size={16} /> Historial de series</span>
        <span className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
          {grupos.length} series · {historial.length} atenciones
          {reincidencias.length > 0 && <span className="rounded bg-sky-100 px-2 py-1 text-sky-800">{reincidencias.length} posibles reincidencias</span>}
          <ChevronDown size={14} className={abierto ? 'rotate-180' : ''} />
        </span>
      </button>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-2">
        <p role="status" className={`text-[10px] font-semibold leading-relaxed ${aviso ? 'text-amber-700' : 'text-emerald-700'}`}>
          {aviso || 'Historial guardado en Supabase. Las cargas siguientes no reemplazan las atenciones anteriores.'}
        </p>
        <button type="button" onClick={reintentar} disabled={ocupado} className="btn-ghost flex shrink-0 items-center gap-1 disabled:opacity-50">
          <RotateCcw size={12} className={ocupado ? 'animate-spin' : ''} /> {ocupado ? 'Sincronizando' : 'Reintentar'}
        </button>
      </div>
      {abierto && (
        <div className="space-y-4 border-t border-slate-200 p-4">
          {reincidencias.length > 0 ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-xs font-extrabold text-sky-700"><ShieldAlert size={15} /> Equipos reportados con una atención finalizada anterior</p>
              {reincidencias.map(({ ticket, serie, anteriores }) => (
                <div key={`${serie}-${ticket['N° REFERENCIA']}`} className="alert-card rounded-lg border border-sky-200 border-l-4 border-l-sky-400 bg-sky-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-black text-slate-800">#{ticket['N° REFERENCIA']} · Serie {serie}</p>
                    <span className="text-[10px] font-bold text-sky-700">POSIBLE REINCIDENCIA</span>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-slate-600">Cliente: {ticket.CLIENTE || '—'} · {ticket.tecnico || 'Sin técnico'}</p>
                  <p className="mt-2 text-[11px] text-slate-700">Ya se trabajó en {anteriores.length} ticket{anteriores.length > 1 ? 's' : ''} distinto{anteriores.length > 1 ? 's' : ''}. Último antecedente: <strong>#{anteriores[0].referencia}</strong> · {mostrarFecha(anteriores[0].fecha_cierre)} · {anteriores[0].tecnico || 'Sin técnico registrado'}.</p>
                  <button type="button" className="btn-ghost mt-2" onClick={() => { setBusqueda(serie); setSerieAbierta(serie); setLimite(12) }}>Ver atenciones de esta serie</button>
                </div>
              ))}
              <p className="text-[10px] text-slate-500">Se señala para revisión: compartir serie no demuestra que sea la misma falla. No se confunden dos tickets abiertos con una reparación anterior.</p>
            </div>
          ) : <p className="text-xs text-slate-500">No hay reincidencias detectadas con el historial disponible.</p>}

          <div className="border-t border-slate-200 pt-4">
            <label className="section-title mb-2 flex items-center gap-2" htmlFor="buscar-historial-series"><Search size={13} /> Consultar atenciones anteriores</label>
            <input id="buscar-historial-series" value={busqueda} onChange={e => { setBusqueda(e.target.value); setLimite(12) }} className="control-field" placeholder="Serie, referencia, cliente o negocio" />
            <p className="my-2 text-[10px] text-slate-500">{filtrados.length} series encontradas. Se conserva una atención por serie y referencia.</p>
            <div className="space-y-2">
              {filtrados.slice(0, limite).map(([serie, registros]) => (
                <div key={serie} className="overflow-hidden rounded-lg border border-slate-300">
                  <button type="button" onClick={() => setSerieAbierta(actual => actual === serie ? '' : serie)} aria-expanded={serieAbierta === serie} className="flex w-full items-center justify-between gap-2 bg-slate-50 px-3 py-3 text-left">
                    <span className="font-mono text-xs font-bold text-slate-800">{serie}</span>
                    <span className="flex items-center gap-2 text-[10px] font-semibold text-slate-600">{registros.length} atenciones <ChevronDown size={13} className={serieAbierta === serie ? 'rotate-180' : ''} /></span>
                  </button>
                  {serieAbierta === serie && <div className="divide-y divide-slate-200 border-t border-slate-200">
                    {registros.map(registro => <div key={registro.referencia} className="space-y-1 px-3 py-3 text-[11px] text-slate-600">
                      <p className="font-bold text-slate-800">#{registro.referencia} · {mostrarFecha(registro.fecha_cierre)}</p>
                      <p>{registro.tecnico || 'Sin técnico registrado'} · {registro.cliente || 'Sin cliente'}</p>
                      <p>{registro.negocio || 'Sin negocio'}</p>
                    </div>)}
                  </div>}
                </div>
              ))}
              {filtrados.length === 0 && <p className="py-3 text-xs text-slate-500">No hay atenciones finalizadas para esa búsqueda.</p>}
              {filtrados.length > limite && <button type="button" onClick={() => setLimite(n => n + 12)} className="btn-ghost">Mostrar más series</button>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
