import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabase.jsx'
import ModuloTecnicos from './components/Tecnicos'
import ModuloPendientes from './components/Gestion'
import ModuloTablas from './components/Tablas'
import Dashboard from './components/Dashboard'
import Vacaciones from './components/Vacaciones'
import Notificaciones from './components/Notificaciones'
import { obtenerControlAlertas } from './utils/alertas'
import useHistorialSeries from './hooks/useHistorialSeries'
import useVencimientosGarantia from './hooks/useVencimientosGarantia'
import useImportacionParticulares from './hooks/useImportacionParticulares'
import garantiasUrl from './Garantias.xlsx?url'
import { Wrench, ClipboardList, BarChart3, Cloud, CloudOff, Loader2, LayoutDashboard, CalendarDays, Menu, Moon, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Sun, X } from 'lucide-react'

function normalizarTexto(texto) {
  if (!texto) return ''
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
}

const ESTADOS_ACTIVOS_RUTA = new Set([
  'EN PROCESO',
  'ASIGNADA A TECNICO',
  'ASIGNADA A AGENCIA',
])

function esEstadoActivoRuta(ticket) {
  return ESTADOS_ACTIVOS_RUTA.has(normalizarTexto(ticket?.ESTADO || ticket?.ESTADO_LIMPIO))
}

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)
  const [esVistaMovil, setEsVistaMovil] = useState(() => window.matchMedia('(max-width: 1023px)').matches)
  const [barraLateralOculta, setBarraLateralOculta] = useState(() => localStorage.getItem('ticketmanager_sidebar_hidden') === 'true')
  const [syncStatus, setSyncStatus] = useState('cargando')
  const [solicitudAlerta, setSolicitudAlerta] = useState(null)
  const [diaAlertas, setDiaAlertas] = useState(() => new Date().toDateString())
  useEffect(() => {
    const actualizarDia = () => setDiaAlertas(new Date().toDateString())
    const intervalo = window.setInterval(actualizarDia, 60000)
    window.addEventListener('focus', actualizarDia)
    return () => {
      window.clearInterval(intervalo)
      window.removeEventListener('focus', actualizarDia)
    }
  }, [])
  const [tema, setTema] = useState(() => localStorage.getItem('ticketmanager_theme') || 'claro')
  useEffect(() => {
    const oscuro = tema === 'oscuro'
    document.documentElement.classList.toggle('dark', oscuro)
    localStorage.setItem('ticketmanager_theme', tema)
  }, [tema])
  // Vacaciones se monta hasta la primera vez que se abre la pestaña, para no
  // pegarle a Supabase en cada arranque de la app. Una vez montado se queda,
  // conservando filtros y datos al cambiar de pestaña.
  const [vacacionesMontado, setVacacionesMontado] = useState(false)
  useEffect(() => { if (tab === 'vacaciones') setVacacionesMontado(true) }, [tab])
  const nubeCargada = useRef(false)
  // Cuando aplicamos datos que vienen de la nube, marcamos esto para NO volver
  // a re-subir lo mismo (evita un upsert eco innecesario).
  const omitirPush = useRef(false)

  // ── Datos compartidos ──
  const [allTickets, setAllTicketsRaw] = useState(() => {
    const guardado = localStorage.getItem('tickets_data')
    return guardado ? JSON.parse(guardado) : []
  })
  const [nombreArchivo, setNombreArchivo] = useState(() => localStorage.getItem('tickets_filename') || '')
  const [fechaSubidaExcel, setFechaSubidaExcel] = useState(() => localStorage.getItem('tickets_date') || '')

  // Marca de tiempo (epoch ms) de la última vez que CAMBIARON los datos.
  // Es el árbitro del "last-write-wins": un re-sync solo pisa lo local si la
  // nube es más nueva que esta marca.
  const [dataTs, setDataTs] = useState(() => Number(localStorage.getItem('tickets_ts')) || 0)
  const dataTsRef = useRef(dataTs)
  useEffect(() => { dataTsRef.current = dataTs }, [dataTs])

  // setAllTickets "envuelto": cualquier cambio LOCAL (ej. subir un Excel desde
  // el módulo Técnicos) estampa una marca de tiempo nueva. Así, si un re-sync
  // se dispara al volver del selector de archivos, no puede pisar este Excel
  // recién cargado con una versión vieja de la nube.
  const setAllTickets = useCallback((value) => {
    setAllTicketsRaw(value)
    setDataTs(Date.now())
  }, [])

  // ── Rutas compartidas entre Técnicos y Tablas ──
  const [rutasTecnicos, setRutasTecnicos] = useState({})
  const [baseMunicipios, setBaseMunicipios] = useState([])
  const [clientesGarantia, setClientesGarantia] = useState([])
  const [estadoCatalogoGarantias, setEstadoCatalogoGarantias] = useState('cargando')
  const historialSeries = useHistorialSeries(allTickets)
  const vencimientosGarantia = useVencimientosGarantia()
  const importacionParticulares = useImportacionParticulares()
  const controlAlertas = useMemo(
    () => obtenerControlAlertas(allTickets, clientesGarantia, historialSeries.historial, vencimientosGarantia.porSerie),
    [allTickets, clientesGarantia, diaAlertas, historialSeries.historial, vencimientosGarantia.porSerie]
  )

  function verAlertas(tipo) {
    setTab('tecnicos')
    setSolicitudAlerta(actual => ({ tipo, secuencia: (actual?.secuencia || 0) + 1 }))
  }

  // El catálogo de garantías vive en el Excel para que pueda mantenerse sin
  // tocar el código. Se toma únicamente la pestaña GENERAL.
  useEffect(() => {
    async function cargarGarantias() {
      try {
        const response = await fetch(garantiasUrl)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const wb = XLSX.read(await response.arrayBuffer(), { type: 'array' })
        const nombreHoja = wb.SheetNames.find(nombre => normalizarTexto(nombre) === 'GENERAL')
        if (!nombreHoja) throw new Error('No existe la pestaña GENERAL')

        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: '' })
        let filaEncabezado = -1
        let columnaCliente = -1
        let columnaAnios = -1

        for (let i = 0; i < matrix.length; i++) {
          const encabezados = matrix[i].map(normalizarTexto)
          const cliente = encabezados.indexOf('CLIENTE')
          const anios = encabezados.indexOf('ANOS')
          if (cliente !== -1 && anios !== -1) {
            filaEncabezado = i
            columnaCliente = cliente
            columnaAnios = anios
            break
          }
        }
        if (filaEncabezado === -1) throw new Error('No se encontraron los encabezados CLIENTE y Años')

        const catalogo = new Map()
        for (let i = filaEncabezado + 1; i < matrix.length; i++) {
          const nombre = String(matrix[i][columnaCliente] || '').trim()
          const anios = Number(matrix[i][columnaAnios])
          if (!nombre || !Number.isFinite(anios) || anios <= 0) continue
          catalogo.set(normalizarTexto(nombre), { nombre, anios })
        }
        setClientesGarantia(Array.from(catalogo.values()))
        setEstadoCatalogoGarantias('listo')
      } catch (error) {
        console.warn('No se pudo cargar Garantias.xlsx:', error)
        setClientesGarantia([])
        setEstadoCatalogoGarantias('error')
      }
    }
    cargarGarantias()
  }, [])

  // Cargar Rutas.xlsx UNA sola vez aquí (no en cada módulo)
  useEffect(() => {
    async function cargarRutas() {
      try {
        const response = await fetch('/Rutas.xlsx')
        if (!response.ok) return
        const arrayBuffer = await response.arrayBuffer()
        const wb = XLSX.read(arrayBuffer, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rawMatrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        
        let munis = new Set()
        // Buscar columna DATOS primero, si no existe, tomar todas las celdas de texto
        let colIndex = -1
        for (let i = 0; i < rawMatrix.length; i++) {
          const rowNorm = rawMatrix[i].map(c => normalizarTexto(c))
          const idx = rowNorm.indexOf('DATOS')
          if (idx !== -1) {
            colIndex = idx
            for (let j = i + 1; j < rawMatrix.length; j++) {
              const cellVal = rawMatrix[j][colIndex]
              if (typeof cellVal === 'string' && cellVal.trim().length > 2) munis.add(cellVal.trim())
            }
            break
          }
        }
        // Fallback: si no hay columna DATOS, leer todas las celdas
        if (colIndex === -1) {
          for (let row of rawMatrix) {
            for (let cell of row) {
              if (typeof cell === 'string' && cell.trim().length > 2) munis.add(cell.trim())
            }
          }
        }
        setBaseMunicipios(Array.from(munis))
      } catch (e) {
        console.warn('No se pudo cargar Rutas.xlsx:', e)
      }
    }
    cargarRutas()
  }, [])

  // Rutas automáticas computadas (compartidas)
  const rutasAutomaticas = useMemo(() => {
    const autoRutas = {}
    if (baseMunicipios.length === 0 || allTickets.length === 0) return autoRutas

    const ticketsActivos = allTickets.filter(esEstadoActivoRuta)
    const ticketsPorTecnico = {}
    ticketsActivos.forEach(t => {
      let tec = t.tecnico === 'SIN TÉCNICO' || !t.tecnico || t.tecnico === '-' ? 'SIN ASIGNAR' : t.tecnico
      if(!ticketsPorTecnico[tec]) ticketsPorTecnico[tec] = []
      ticketsPorTecnico[tec].push(t)
    })

    Object.keys(ticketsPorTecnico).forEach(tec => {
      let encontrados = new Set()
      ticketsPorTecnico[tec].forEach(t => {
        // La ruta se deduce exclusivamente del encabezado DIRECCIÓN. El nombre
        // del negocio puede contener municipios que no corresponden a la visita.
        const textoBuscar = normalizarTexto(t['DIRECCIÓN'])
        baseMunicipios.forEach(muniOriginal => {
          const muniLimpio = normalizarTexto(muniOriginal)
          const escaped = muniLimpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const regex = new RegExp(`\\b${escaped}\\b`, 'i')
          if (regex.test(textoBuscar)) encontrados.add(muniOriginal.toUpperCase())
        })
      })
      autoRutas[tec] = Array.from(encontrados).slice(0, 10).join(' - ')
    })
    return autoRutas
  }, [baseMunicipios, allTickets])

  // ── Supabase sync ──
  const cargarDesdeNube = useCallback(async (esRecarga = false) => {
    try {
      setSyncStatus('cargando')
      const { data, error } = await supabase.from('excel_sync').select('*').eq('id', 1).single()
      if (data && !error) {
        const ticketsNube = JSON.parse(data.tickets_json || '[]')
        const tsNube = data.updated_at ? new Date(data.updated_at).getTime() : 0
        // LAST-WRITE-WINS: solo aplicamos la nube si es MÁS NUEVA que lo local.
        // Esto evita que un re-sync (ej. al volver del selector de archivos, o
        // al desbloquear el cel) pise un Excel recién subido con una versión vieja.
        if (ticketsNube.length > 0 && tsNube > dataTsRef.current) {
          omitirPush.current = true   // no re-subir lo que acabamos de bajar
          setAllTicketsRaw(ticketsNube)
          setNombreArchivo(data.filename || '')
          setFechaSubidaExcel(data.upload_date || '')
          setDataTs(tsNube)
        }
        setSyncStatus('sincronizado')
      } else {
        setSyncStatus(error ? 'error' : 'sincronizado')
      }
    } catch (e) {
      console.warn('Sin conexión a Supabase:', e)
      setSyncStatus('error')
    }
    if (!esRecarga) setTimeout(() => { nubeCargada.current = true }, 500)
  }, [])

  // Cargar al montar
  useEffect(() => { cargarDesdeNube(false) }, [cargarDesdeNube])

  // Re-sync cuando la app vuelve a primer plano (cambio de tab, desbloqueo, etc.)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && nubeCargada.current) {
        cargarDesdeNube(true)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [cargarDesdeNube])

  useEffect(() => {
    localStorage.setItem('tickets_data', JSON.stringify(allTickets))
    localStorage.setItem('tickets_filename', nombreArchivo)
    localStorage.setItem('tickets_date', fechaSubidaExcel)
    localStorage.setItem('tickets_ts', String(dataTs))
  }, [allTickets, nombreArchivo, fechaSubidaExcel, dataTs])

  useEffect(() => {
    if (!nubeCargada.current || allTickets.length === 0) return
    // Si este cambio vino de la nube, no lo volvemos a subir (evita el eco).
    if (omitirPush.current) { omitirPush.current = false; return }
    supabase.from('excel_sync').upsert({
      id: 1,
      tickets_json: JSON.stringify(allTickets),
      filename: nombreArchivo,
      upload_date: fechaSubidaExcel,
      // Subimos la MISMA marca de tiempo del dato local, así la nube y lo local
      // quedan alineados y el last-write-wins funciona entre dispositivos.
      updated_at: new Date(dataTs || Date.now()).toISOString()
    }).then(({ error }) => {
      setSyncStatus(error ? 'error' : 'sincronizado')
    }).catch(() => setSyncStatus('error'))
  }, [allTickets, nombreArchivo, fechaSubidaExcel, dataTs])

  // ── Función para obtener ruta de un técnico (usada por ambos módulos) ──
  const valorRutaTecnico = (tecnico) => {
    return rutasTecnicos[tecnico] !== undefined ? rutasTecnicos[tecnico] : (rutasAutomaticas[tecnico] || '')
  }

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tecnicos', label: 'Técnicos', icon: Wrench },
    { id: 'tablas', label: 'Reportes', icon: BarChart3 },
    { id: 'pendientes', label: 'Gestión', icon: ClipboardList },
    { id: 'vacaciones', label: 'Vacaciones', icon: CalendarDays },
  ]

  const hoy = new Date()
  const fechaHoy = hoy.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const tabActiva = tabs.find(item => item.id === tab) || tabs[0]
  const botonMenuRef = useRef(null)
  const botonCerrarMenuRef = useRef(null)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)')
    const actualizarVista = (event) => {
      setEsVistaMovil(event.matches)
      if (!event.matches) setMenuMovilAbierto(false)
    }
    media.addEventListener('change', actualizarVista)
    return () => media.removeEventListener('change', actualizarVista)
  }, [])

  useEffect(() => {
    localStorage.setItem('ticketmanager_sidebar_hidden', String(barraLateralOculta))
  }, [barraLateralOculta])

  useEffect(() => {
    if (!menuMovilAbierto) return undefined

    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    botonCerrarMenuRef.current?.focus()
    const cerrarConEscape = (event) => {
      if (event.key === 'Escape') setMenuMovilAbierto(false)
    }
    document.addEventListener('keydown', cerrarConEscape)

    return () => {
      document.body.style.overflow = overflowAnterior
      document.removeEventListener('keydown', cerrarConEscape)
      botonMenuRef.current?.focus()
    }
  }, [menuMovilAbierto])

  const seleccionarTab = (id) => {
    setTab(id)
    setMenuMovilAbierto(false)
  }

  const menuExpandido = esVistaMovil ? menuMovilAbierto : !barraLateralOculta
  const etiquetaBotonMenu = esVistaMovil
    ? (menuMovilAbierto ? 'Cerrar menú' : 'Abrir menú')
    : (barraLateralOculta ? 'Mostrar panel lateral' : 'Ocultar panel lateral')

  const alternarMenu = () => {
    if (esVistaMovil) {
      setMenuMovilAbierto(actual => !actual)
      return
    }
    setBarraLateralOculta(actual => !actual)
  }

  return (
    <div className="app-shell min-h-screen font-sans">
      <div className={`app-layout ${barraLateralOculta ? 'is-sidebar-hidden' : ''}`}>
        {menuMovilAbierto && (
          <button
            type="button"
            className="app-sidebar-backdrop is-visible"
            aria-label="Cerrar menú"
            onClick={() => setMenuMovilAbierto(false)}
          />
        )}

        <aside
          id="menu-principal"
          className={`app-sidebar ${menuMovilAbierto ? 'is-open' : ''} ${barraLateralOculta ? 'is-desktop-hidden' : ''}`}
          aria-label="Navegación principal"
          aria-hidden={(esVistaMovil && !menuMovilAbierto) || (!esVistaMovil && barraLateralOculta) ? true : undefined}
          inert={(esVistaMovil && !menuMovilAbierto) || (!esVistaMovil && barraLateralOculta) ? '' : undefined}
        >
          <div className="app-sidebar-brand">
            <div className="app-brand-mark" aria-hidden="true">
              <Wrench size={18} strokeWidth={2.5} />
            </div>
            <div className="app-brand-copy">
              <p>TicketManager</p>
              <small>Control de operación</small>
            </div>
            <button ref={botonCerrarMenuRef} type="button" className="app-sidebar-close" aria-label="Cerrar menú" onClick={() => setMenuMovilAbierto(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="app-sidebar-date">
            <span>Jornada actual</span>
            <time dateTime={hoy.toISOString().slice(0, 10)}>{fechaHoy}</time>
          </div>

          <nav aria-label="Secciones principales" className="app-sidebar-nav">
            <p>Espacios de trabajo</p>
            {tabs.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => seleccionarTab(item.id)}
                aria-current={tab === item.id ? 'page' : undefined}
                className={tab === item.id ? 'is-active' : ''}
              >
                <span className="app-sidebar-nav-icon" aria-hidden="true"><item.icon size={18} /></span>
                <span>{item.label}</span>
                <span className="app-sidebar-active-mark" aria-hidden="true" />
              </button>
            ))}
          </nav>
        </aside>

        <section className="app-workspace" inert={menuMovilAbierto ? '' : undefined}>
          <header className="app-topbar">
            <div className="app-topbar-title">
              <button
                ref={botonMenuRef}
                type="button"
                className="app-menu-button"
                aria-label={etiquetaBotonMenu}
                title={etiquetaBotonMenu}
                aria-controls="menu-principal"
                aria-expanded={menuExpandido}
                onClick={alternarMenu}
              >
                {esVistaMovil
                  ? <Menu size={21} />
                  : barraLateralOculta
                    ? <PanelLeftOpen size={20} />
                    : <PanelLeftClose size={20} />}
              </button>
              <div>
                <span>Vista actual</span>
                <h1>{tabActiva.label}</h1>
              </div>
            </div>

            <div className="app-topbar-actions">
            <Notificaciones control={controlAlertas} estadoCatalogo={estadoCatalogoGarantias} estadoHistorial={historialSeries.estado} onVerAlertas={verAlertas} />
            <details className="app-options" open={!esVistaMovil || undefined}
              onBlur={event => { if (esVistaMovil && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }}
              onKeyDown={event => { if (esVistaMovil && event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() } }}>
              <summary className="app-topbar-icon-button" aria-label="Opciones de apariencia y sincronización" title="Más opciones"><MoreHorizontal size={21} /></summary>
              <div className="app-options-content">
            <button
              type="button"
              onClick={() => setTema(actual => actual === 'oscuro' ? 'claro' : 'oscuro')}
              className="app-topbar-icon-button"
              title={tema === 'oscuro' ? 'Usar modo claro' : 'Usar modo oscuro'}
              aria-label={tema === 'oscuro' ? 'Usar modo claro' : 'Usar modo oscuro'}
            >
              {tema === 'oscuro' ? <Sun size={17} /> : <Moon size={17} />}
              <span className="theme-label">{tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro'}</span>
            </button>

            <button
              type="button"
              onClick={() => { if (nubeCargada.current) cargarDesdeNube(true) }}
              className={`app-sync-button app-sync-button--${syncStatus}`}
              title={syncStatus === 'sincronizado' ? 'Sincronizado · Toca para actualizar' : syncStatus === 'error' ? 'Sin conexión · Toca para reintentar' : 'Sincronizando…'}
              aria-label={syncStatus === 'sincronizado' ? 'Sincronizado. Actualizar datos' : syncStatus === 'error' ? 'Sin conexión. Reintentar sincronización' : 'Sincronizando datos'}
            >
              {syncStatus === 'cargando' 
                ? <Loader2 size={15} className="animate-spin" />
                : syncStatus === 'error'
                  ? <CloudOff size={15} />
                  : <Cloud size={15} />
              }
              <span>
                {syncStatus === 'sincronizado' ? 'Al día' : syncStatus === 'error' ? 'Sin conexión' : 'Sincronizando'}
              </span>
            </button>
              </div>
            </details>
          </div>
          </header>

          {/* ── CONTENT ── */}
          <main className="app-main">
          {vencimientosGarantia.estado !== 'listo' && (
            <div className="card mb-4 p-3 text-sm" role="status">
              <strong>Vencimientos confirmados: </strong>
              {vencimientosGarantia.estado === 'cargando' ? 'Consultando fechas guardadas…' : vencimientosGarantia.estado === 'sin-configurar' ? 'Falta activar la tabla garantias_vencimientos en Supabase. Por ahora se usa el cálculo por serie.' : 'No se pudieron actualizar las fechas confirmadas. Las garantías y exportaciones pueden estar incompletas.'}
              <button type="button" className="btn-ghost ml-2" disabled={vencimientosGarantia.estado === 'cargando' || vencimientosGarantia.guardando} onClick={vencimientosGarantia.reintentar}>Reintentar consulta</button>
            </div>
          )}
        <div className={tab === 'dashboard' ? 'block fade-in' : 'hidden'}>
          <Dashboard 
            allTickets={allTickets}
            nombreArchivo={nombreArchivo}
            fechaSubidaExcel={fechaSubidaExcel}
            onNavigate={setTab}
            controlAlertas={controlAlertas}
            estadoCatalogoGarantias={estadoCatalogoGarantias}
            estadoHistorial={historialSeries.estado}
            onVerAlertas={verAlertas}
          />
        </div>
        <div className={tab === 'tecnicos' ? 'block fade-in' : 'hidden'}>
          <ModuloTecnicos 
            allTickets={allTickets} 
            setAllTickets={setAllTickets} 
            nombreArchivo={nombreArchivo} 
            setNombreArchivo={setNombreArchivo}
            fechaSubidaExcel={fechaSubidaExcel}
            setFechaSubidaExcel={setFechaSubidaExcel}
            rutasTecnicos={rutasTecnicos}
            setRutasTecnicos={setRutasTecnicos}
            rutasAutomaticas={rutasAutomaticas}
            valorRutaTecnico={valorRutaTecnico}
            baseMunicipios={baseMunicipios}
            clientesGarantia={clientesGarantia}
            estadoCatalogoGarantias={estadoCatalogoGarantias}
            controlAlertas={controlAlertas}
            vencimientosGarantia={vencimientosGarantia}
            solicitudAlerta={solicitudAlerta}
            historialSeries={historialSeries}
            importacionParticulares={importacionParticulares}
          />
        </div>
        <div className={tab === 'tablas' ? 'block fade-in' : 'hidden'}>
          <ModuloTablas 
            allTickets={allTickets}
            rutasTecnicos={rutasTecnicos}
            setRutasTecnicos={setRutasTecnicos}
            rutasAutomaticas={rutasAutomaticas}
            valorRutaTecnico={valorRutaTecnico}
          />
        </div>
        <div className={tab === 'pendientes' ? 'block fade-in' : 'hidden'}>
          <ModuloPendientes importacionParticulares={importacionParticulares} />
        </div>
        <div className={tab === 'vacaciones' ? 'block fade-in' : 'hidden'}>
          {vacacionesMontado && <Vacaciones />}
        </div>
          </main>
        </section>
      </div>
    </div>
  )
}
