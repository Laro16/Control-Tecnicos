import { Briefcase, RotateCcw } from 'lucide-react'

export default function EstadoParticulares({ importacion }) {
  if (!importacion || importacion.estado === 'inactivo') return null
  const { estado, resultado, error, reintentar } = importacion
  return (
    <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-start" aria-label="Importación de servicios particulares" role="status">
      <Briefcase size={20} className="shrink-0 text-sky-600" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="text-sm font-extrabold text-slate-900">{estado === 'importando' ? 'Creando fichas de particulares…' : estado === 'error' ? 'Particulares: importación pendiente' : 'Particulares revisadas'}</h2>
        <p className="break-words text-xs text-slate-500">{resultado?.archivo}</p>
        {estado === 'listo' && <>
          <p className="text-sm font-semibold text-slate-700">{resultado.creadas} fichas nuevas · {resultado.existentes} ya registradas · {resultado.repetidas} filas repetidas omitidas</p>
          {resultado.sinReferencia > 0 && <p className="text-sm text-rose-700">{resultado.sinReferencia} particulares sin N° REFERENCIA: no se crearon. Corrige la referencia y vuelve a cargar el Excel.</p>}
          <p className="text-xs text-slate-500">Disponibles en Gestión → Servicios particulares. Las fichas nuevas quedan en Pendiente de pago; los documentos los agregas al editar.</p>
        </>}
        {estado === 'error' && <p className="text-sm text-rose-700">{error}</p>}
        {estado === 'error' && resultado?.creadas > 0 && <p className="text-xs text-slate-500">Se confirmaron {resultado.creadas} fichas antes del error. El reintento conserva lo guardado.</p>}
      </div>
      {estado === 'importando' && <RotateCcw size={18} className="shrink-0 animate-spin text-sky-600" aria-label="Guardando" />}
      {estado === 'error' && <button type="button" onClick={reintentar} className="btn-ghost min-h-11">Reintentar particulares</button>}
    </section>
  )
}
