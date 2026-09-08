import { useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock3, Copy, FileSpreadsheet,
  History, ShieldAlert, Users, Wrench,
} from 'lucide-react'
import { gruposAlertasDashboard, obtenerResumenDashboard, ordenarEquipoDashboard } from '../utils/dashboard.js'
import './Dashboard.css'

const numero = valor => valor.toLocaleString('es-GT')
const iconosAlertas = { duplicados: Copy, reincidencias: History }
const tonosEdad = ['emerald', 'sky', 'amber', 'rose', 'slate']

export default function Dashboard({ allTickets, nombreArchivo, fechaSubidaExcel, onNavigate, controlAlertas, estadoCatalogoGarantias, estadoHistorial, onVerAlertas }) {
  const stats = useMemo(() => obtenerResumenDashboard(allTickets), [allTickets])
  const [orden, setOrden] = useState('pendientes')
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const [mostrarTodosClientes, setMostrarTodosClientes] = useState(false)
  const equipo = useMemo(() => ordenarEquipoDashboard(stats.equipo, orden), [stats.equipo, orden])
  const abrirTecnicos = () => onNavigate('tecnicos')
  const abrirReportes = () => onNavigate('tablas')

  if (!stats.total) return (
    <section className="operations-dashboard dashboard-empty dashboard-panel">
      <FileSpreadsheet size={36} aria-hidden="true" />
      <h1>Tu operación, en un vistazo</h1>
      <p>Carga la base de tickets para revisar pendientes, garantías y carga por técnico.</p>
      <button type="button" className="dashboard-button dashboard-button--primary" onClick={abrirTecnicos}>Cargar base en Técnicos <ArrowRight size={17} /></button>
    </section>
  )

  const grupos = gruposAlertasDashboard(controlAlertas)
  const catalogoListo = estadoCatalogoGarantias === 'listo'
  const historialListo = estadoHistorial === 'listo'
  const avisos = [
    !catalogoListo && (estadoCatalogoGarantias === 'cargando' ? 'Comprobando el catálogo de garantías…' : 'Catálogo de garantías no disponible. No se puede confirmar la cobertura; recarga la página para reintentar.'),
    !historialListo && (['cargando', 'guardando'].includes(estadoHistorial) ? 'Sincronizando el historial de series. Las reincidencias pueden estar incompletas.' : 'Historial de series no sincronizado. Las reincidencias pueden estar incompletas; revísalo en Técnicos.'),
  ].filter(Boolean)

  return (
    <div className="operations-dashboard">
      <header className="dashboard-heading">
        <div className="dashboard-heading-copy">
          <p className="dashboard-eyebrow">Dashboard / gestión de servicio</p>
          <h1>Control de la operación</h1>
          <p className="dashboard-source"><FileSpreadsheet size={15} aria-hidden="true" /><span>{nombreArchivo || 'Base de tickets cargada'}</span></p>
          <p className="dashboard-caption">Última carga: {fechaSubidaExcel || 'sin fecha registrada'} · Datos del Excel, no en tiempo real.</p>
        </div>
        <div className="dashboard-actions">
          <button type="button" className="dashboard-button" onClick={abrirReportes}>Ver reportes <ArrowRight size={16} /></button>
          <button type="button" className="dashboard-button dashboard-button--primary" onClick={abrirTecnicos}>Abrir Técnicos <ArrowRight size={16} /></button>
        </div>
      </header>

      <section aria-label="Resumen de la base" className="dashboard-overview">
        <div className="dashboard-metrics">
          <Metric label="Pendientes" value={stats.pendientes} detail="Incluye los que están en proceso" icon={Clock3} tone="sky" onClick={abrirTecnicos} />
          <Metric label="En proceso" value={stats.enProceso} detail="Seguimiento de trabajos iniciados" icon={Wrench} tone="amber" onClick={abrirTecnicos} />
          <Metric label="72 h o más" value={stats.criticos} detail="Pendientes con mayor antigüedad" icon={AlertTriangle} tone="rose" onClick={abrirReportes} />
          <Metric label="Finalizados" value={stats.finalizados} detail={stats.avance + '% de los ' + numero(stats.total) + ' tickets de la base'} icon={CheckCircle2} tone="emerald" onClick={abrirReportes} />
        </div>
        <div className="dashboard-overview-footer">
          <span><Users size={15} aria-hidden="true" /><strong>{stats.tecnicosConCarga}</strong> técnicos con carga pendiente</span>
          <span><strong>{stats.asignados}</strong> asignados a técnico · <strong>{stats.agencia}</strong> a agencia</span>
          <span className={stats.sinAsignar ? 'dashboard-unassigned' : ''}><strong>{stats.sinAsignar}</strong> pendientes sin técnico identificado</span>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-panel" aria-labelledby="dashboard-alertas">
          <PanelHeading id="dashboard-alertas" title="Revisar primero" subtitle="Las mismas alertas de Técnicos y la campana" icon={ShieldAlert} badge={numero(controlAlertas.total) + ' incidencias'} />
          {avisos.length > 0 && <div className="dashboard-notices" role="status">{avisos.map(aviso => <p key={aviso}>{aviso}</p>)}</div>}
          <div className="dashboard-alert-list">
            {grupos.map(grupo => {
              const Icon = iconosAlertas[grupo.id] || ShieldAlert
              const noVerificado = !catalogoListo && !iconosAlertas[grupo.id]
              return (
                <button key={grupo.id} type="button" className={'dashboard-alert dashboard-tone-' + grupo.tono} disabled={noVerificado || !grupo.cantidad} onClick={() => onVerAlertas(grupo.id)}>
                  <span className="dashboard-alert-icon"><Icon size={19} aria-hidden="true" /></span>
                  <span className="dashboard-alert-copy"><strong>{grupo.titulo}</strong><span>{grupo.detalle}</span></span>
                  <span className="dashboard-alert-count">{noVerificado ? '—' : numero(grupo.cantidad)}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              )
            })}
          </div>
          <div className="dashboard-panel-footnote">
            {catalogoListo && <p><CheckCircle2 size={15} aria-hidden="true" />{numero(controlAlertas.vigentes.length)} garantías vigentes según la serie.</p>}
            <span>Un ticket puede tener más de una incidencia. «Normal» siempre requiere revisión.</span>
          </div>
        </section>

        <section className="dashboard-panel" aria-labelledby="dashboard-antiguedad">
          <PanelHeading id="dashboard-antiguedad" title="Antigüedad de pendientes" subtitle="Tiempo transcurrido registrado en el Excel" icon={Clock3} />
          <div className="dashboard-age-body">
            <div className="dashboard-age-lead"><strong>{numero(stats.criticos)}</strong><div><b>con 72 horas o más</b><span>{stats.pendientes ? Math.round(stats.criticos / stats.pendientes * 100) : 0}% de la carga pendiente</span></div></div>
            <div className="dashboard-age-strip" aria-hidden="true">{stats.antiguedad.map((grupo, i) => <span key={grupo.id} className={'dashboard-tone-' + tonosEdad[i]} style={{ width: (stats.pendientes ? grupo.cantidad / stats.pendientes * 100 : 0) + '%' }} />)}</div>
            <dl className="dashboard-age-list">
              {stats.antiguedad.map((grupo, i) => (
                <div key={grupo.id} className={'dashboard-tone-' + tonosEdad[i]}>
                  <dt><span className="dashboard-dot" />{grupo.label}</dt>
                  <dd><strong>{numero(grupo.cantidad)}</strong><span>{stats.pendientes ? Math.round(grupo.cantidad / stats.pendientes * 100) : 0}%</span></dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="dashboard-panel-footnote">{stats.sinTiempo ? numero(stats.sinTiempo) + ' pendientes sin tiempo válido: no se consideran recientes ni se usan para calcular atrasos.' : 'Los intervalos no se superponen. Un ticket de exactamente 72 h ya cuenta en el último grupo.'}</div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid--workload">
        <section className="dashboard-panel" aria-labelledby="dashboard-equipo">
          <PanelHeading id="dashboard-equipo" title="Carga y cierres por técnico" subtitle="Todos los registros del archivo cargado, sin limitar por fecha" icon={Users} />
          <div className="dashboard-sort" role="group" aria-label="Ordenar técnicos por">
            <button type="button" aria-pressed={orden === 'pendientes'} onClick={() => setOrden('pendientes')}>Mayor carga</button>
            <button type="button" aria-pressed={orden === 'finalizados'} onClick={() => setOrden('finalizados')}>Más cierres</button>
          </div>
          <div className="dashboard-team" id="dashboard-lista-equipo">
            <div className="dashboard-team-head" aria-hidden="true"><span>Técnico / carga</span><span>Pendientes</span><span>En proceso</span><span>72 h o más</span><span>Cierres</span></div>
            <ul>
              {equipo.slice(0, mostrarTodos ? equipo.length : 6).map(persona => (
                <li key={persona.clave} className={persona.sinTecnico ? 'dashboard-team-unassigned' : ''}>
                  <div className="dashboard-team-name"><strong>{persona.nombre}</strong><div className="dashboard-load-track" aria-hidden="true"><span style={{ width: persona.pendientes / stats.maxCarga * 100 + '%' }} /></div></div>
                  <TeamNumber value={persona.pendientes} label="Pendientes" />
                  <TeamNumber value={persona.enProceso} label="En proceso" />
                  <TeamNumber value={persona.criticos} label="72 h o más" critical={persona.criticos > 0} />
                  <TeamNumber value={persona.finalizados} label="Cierres" />
                </li>
              ))}
            </ul>
          </div>
          {equipo.length > 6 && <button type="button" className="dashboard-show-all" aria-expanded={mostrarTodos} aria-controls="dashboard-lista-equipo" onClick={() => setMostrarTodos(actual => !actual)}>{mostrarTodos ? 'Mostrar sólo 6' : 'Ver toda la lista (' + equipo.length + ')'}</button>}
          <div className="dashboard-panel-footnote">En proceso y 72 h o más son parte de Pendientes; no se suman. Los cierres corresponden a la base cargada, no necesariamente al día de hoy.</div>
        </section>

        <section className="dashboard-panel" aria-labelledby="dashboard-antiguos">
          <PanelHeading id="dashboard-antiguos" title="Los más antiguos" subtitle="Hasta 5 pendientes para dar seguimiento" icon={History} />
          {stats.masAntiguos.length ? <ol className="dashboard-oldest">
            {stats.masAntiguos.map(({ ticket, horas, indice }) => <li key={indice}>
              <div className="dashboard-oldest-top"><strong>#{ticket['N° REFERENCIA'] || 'Sin referencia'}</strong><span className={horas >= 72 ? 'dashboard-hours-critical' : ''}>{numero(horas)} h</span></div>
              <p>{ticket.CLIENTE && ticket.CLIENTE !== '-' ? ticket.CLIENTE : 'Sin cliente registrado'}</p>
              <span>{ticket.NEGOCIO && ticket.NEGOCIO !== '-' ? ticket.NEGOCIO + ' · ' : ''}{ticket.tecnico || 'Sin técnico'}</span>
            </li>)}
          </ol> : <p className="dashboard-no-rows">{stats.pendientes ? 'No hay tiempos válidos para ordenar los pendientes.' : 'No hay tickets pendientes en esta base.'}</p>}
          <div className="dashboard-panel-action"><button type="button" className="dashboard-button" onClick={abrirTecnicos}>Gestionar en Técnicos <ArrowRight size={16} /></button></div>
        </section>
      </div>

      <section className="dashboard-panel" aria-labelledby="dashboard-clientes">
        <PanelHeading id="dashboard-clientes" title="Tickets por cliente" subtitle="Solo la carga activa de atención del archivo subido" icon={Users} badge={numero(stats.clientesActivos.reduce((total, cliente) => total + cliente.cantidad, 0)) + ' tickets'} />
        {stats.clientesActivos.length ? <ol className="dashboard-clients" id="dashboard-lista-clientes">
          {stats.clientesActivos.slice(0, mostrarTodosClientes ? stats.clientesActivos.length : 10).map(cliente => <li key={cliente.clave}>
            <span>{cliente.nombre}</span>
            <div className="dashboard-client-track" aria-hidden="true"><span style={{ width: cliente.cantidad / stats.clientesActivos[0].cantidad * 100 + '%' }} /></div>
            <strong>{numero(cliente.cantidad)}</strong>
          </li>)}
        </ol> : <p className="dashboard-no-rows">No hay tickets de clientes en la carga activa.</p>}
        {stats.clientesActivos.length > 10 && <button type="button" className="dashboard-show-all" aria-expanded={mostrarTodosClientes} aria-controls="dashboard-lista-clientes" onClick={() => setMostrarTodosClientes(actual => !actual)}>{mostrarTodosClientes ? 'Mostrar sólo 10' : 'Ver todos los clientes (' + stats.clientesActivos.length + ')'}</button>}
        <div className="dashboard-panel-footnote">Cada cliente muestra un único total. Solo se cuentan En Proceso, Asignada a Técnico y Asignada a Agencia.</div>
      </section>
    </div>
  )
}

function Metric({ label, value, detail, icon: Icon, tone, onClick }) {
  return <button type="button" className={'dashboard-metric dashboard-tone-' + tone} onClick={onClick}>
    <span className="dashboard-metric-label"><Icon size={18} aria-hidden="true" />{label}<ArrowRight size={15} aria-hidden="true" /></span>
    <strong>{numero(value)}</strong><span className="dashboard-metric-detail">{detail}</span>
  </button>
}

function PanelHeading({ id, title, subtitle, icon: Icon, badge }) {
  return <div className="dashboard-panel-heading"><div><h2 id={id}><Icon size={18} aria-hidden="true" />{title}</h2><p>{subtitle}</p></div>{badge && <span className="dashboard-count-badge">{badge}</span>}</div>
}

function TeamNumber({ value, label, critical }) {
  return <div className={'dashboard-team-number' + (critical ? ' dashboard-team-number--critical' : '')}><span>{label}</span><strong>{numero(value)}</strong></div>
}
