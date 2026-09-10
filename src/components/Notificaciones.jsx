import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Bell, CheckCircle2, Copy, History, ShieldAlert, X } from 'lucide-react'

export default function Notificaciones({ control, estadoCatalogo, estadoHistorial, onVerAlertas }) {
  const [abierta, setAbierta] = useState(false)
  const contenedorRef = useRef(null)
  const botonRef = useRef(null)
  const cerrarRef = useRef(null)
  const panelId = useId()
  const avisoCatalogo = estadoCatalogo === 'cargando'
    ? 'Comprobando el catálogo de garantías…'
    : estadoCatalogo === 'error'
      ? 'No se pudo leer el catálogo de garantías. Recarga la página para reintentar. Los duplicados sí se revisaron.'
      : ''
  const avisoHistorial = estadoHistorial === 'sin-configurar'
    ? 'Falta activar el historial en Supabase. Las reincidencias sólo se revisan con las atenciones observadas en esta sesión.'
    : estadoHistorial === 'error'
      ? 'No se pudo sincronizar el historial de series. La revisión de reincidencias puede estar incompleta.'
      : ['cargando', 'guardando'].includes(estadoHistorial)
        ? 'Comprobando el historial de series…'
        : ''
  const avisos = [avisoCatalogo, avisoHistorial].filter(Boolean)
  const problemaValidacion = estadoCatalogo === 'error' || ['sin-configurar', 'error'].includes(estadoHistorial)

  useEffect(() => {
    if (!abierta) return
    cerrarRef.current?.focus()
    function cerrarFuera(event) {
      if (!contenedorRef.current?.contains(event.target)) setAbierta(false)
    }
    function cerrarConEscape(event) {
      if (event.key !== 'Escape') return
      setAbierta(false)
      botonRef.current?.focus()
    }
    document.addEventListener('pointerdown', cerrarFuera)
    document.addEventListener('keydown', cerrarConEscape)
    return () => {
      document.removeEventListener('pointerdown', cerrarFuera)
      document.removeEventListener('keydown', cerrarConEscape)
    }
  }, [abierta])

  const grupos = [
    { id: 'vencidas', titulo: 'Fuera de cobertura', descripcion: 'El ticket ingresó después del último día del mes de vencimiento.', items: control.vencidas, tono: 'rose' },
    { id: 'tipo-incorrecto', titulo: 'TIPO Normal — Revisar garantía', descripcion: 'No atender sin garantía, aunque el ticket haya ingresado dentro de cobertura. Los Normal fuera de cobertura aparecen primero.', items: control.tipoIncorrecto, tono: 'violet' },
    { id: 'sin-serie', titulo: 'Garantías por verificar', descripcion: 'Falta una serie válida o una FECHA INGRESO para comprobar este ticket.', items: control.sinSerie, tono: 'amber' },
    { id: 'duplicados', titulo: 'Referencias duplicadas', descripcion: 'Una incidencia por cada N° REFERENCIA repetido.', items: control.duplicados, tono: 'orange' },
    { id: 'reincidencias', titulo: 'Posibles reincidencias', descripcion: 'Equipo con una atención finalizada en otro ticket.', items: control.reincidencias, tono: 'sky' },
  ].filter(grupo => grupo.items.length > 0)

  return (
    <div ref={contenedorRef} onBlur={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setAbierta(false)
    }}>
      <button
        ref={botonRef}
        type="button"
        className={`notification-bell ${control.total || problemaValidacion ? 'notification-bell--active' : ''}`}
        aria-label={`Notificaciones: ${control.total} incidencias por revisar. ${avisos.join(' ')}`}
        aria-expanded={abierta}
        aria-controls={panelId}
        aria-haspopup="dialog"
        title={avisos.join(' ') || (control.total ? `${control.total} incidencias por revisar` : 'Sin alertas por revisar')}
        onClick={() => setAbierta(actual => !actual)}
      >
        <Bell size={19} />
        {control.total > 0 && <span className="notification-count" aria-hidden="true">{control.total > 99 ? '99+' : control.total}</span>}
        {!control.total && problemaValidacion && <span className="notification-count" aria-hidden="true">!</span>}
      </button>
      <span className="sr-only" role="status" aria-live="polite">{control.total} incidencias por revisar. {avisos.join(' ')}</span>

      {abierta && (
        <section id={panelId} role="dialog" aria-label="Notificaciones de la operación" className="notification-panel">
          <div className="notification-panel-heading">
            <div>
              <h2>Notificaciones</h2>
              <p>{control.total ? `${control.total} incidencias por revisar` : avisos.length ? 'Hay validaciones pendientes' : 'Todo en orden'}</p>
            </div>
            <button ref={cerrarRef} type="button" aria-label="Cerrar notificaciones" className="notification-close" onClick={() => {
              setAbierta(false)
              botonRef.current?.focus()
            }}><X size={18} /></button>
          </div>
          <div className="notification-list">
            {avisos.map(aviso => <p key={aviso} className="notification-catalog-status" role="status">{aviso}</p>)}
            {grupos.length === 0 ? (
              <div className="notification-empty">
                {avisos.length ? <ShieldAlert size={30} /> : <CheckCircle2 size={30} />}
                <p>{avisos.length ? 'No hay incidencias detectadas con los datos disponibles. Falta completar las comprobaciones indicadas.' : 'No hay garantías por revisar, referencias duplicadas ni reincidencias detectadas.'}</p>
              </div>
            ) : grupos.map(grupo => (
              <button key={grupo.id} type="button" className="notification-item" onClick={() => {
                setAbierta(false)
                onVerAlertas(grupo.id)
              }}>
                <span className={`notification-category notification-category--${grupo.tono}`}>
                  {grupo.id === 'duplicados' ? <Copy size={16} /> : grupo.id === 'reincidencias' ? <History size={16} /> : <ShieldAlert size={16} />}
                  {grupo.items.length}
                </span>
                <span className="notification-item-content">
                  <strong>{grupo.titulo}</strong>
                  <span>{grupo.descripcion}</span>
                  <span className="notification-examples">
                    {grupo.items.slice(0, 2).map((item, i) => (
                      <span key={i}>
                        {grupo.id === 'duplicados'
                          ? `#${item.ref} · ${item.cantidad} registros`
                          : grupo.id === 'reincidencias'
                            ? `Serie ${item.serie} · #${item.ticket['N° REFERENCIA']}`
                            : `#${item.ticket['N° REFERENCIA'] || 'Sin referencia'} · ${item.ticket.CLIENTE || 'Sin cliente'}`}
                      </span>
                    ))}
                    {grupo.items.length > 2 && <span>y {grupo.items.length - 2} más…</span>}
                  </span>
                </span>
                <ArrowRight size={15} className="shrink-0" />
              </button>
            ))}
          </div>
          <p className="notification-footer">Se actualizan con los datos cargados y el historial disponible. Abrir una alerta no la elimina; desaparece cuando deja de cumplir su condición.</p>
        </section>
      )}
    </div>
  )
}
