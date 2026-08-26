import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabase.jsx'
import ModuloTecnicos from './components/Tecnicos'
import ModuloPendientes from './components/Gestion'
import ModuloTablas from './components/Tablas'
import Dashboard from './components/Dashboard'
import Vacaciones from './components/Vacaciones'
import garantiasUrl from './Garantias.xlsx?url'
import { Wrench, ClipboardList, BarChart3, Cloud, CloudOff, Loader2, LayoutDashboard, CalendarDays } from 'lucide-react'

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
  const [syncStatus, setSyncStatus] = useState('cargando')
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
      } catch (error) {
        console.warn('No se pudo cargar Garantias.xlsx:', error)
        setClientesGarantia([])
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
        const textoBuscar = normalizarTexto(`${t['DIRECCIÓN']} ${t['NEGOCIO']}`)
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

  return (
    <div className="app-shell min-h-screen font-sans">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 shadow-[0_12px_30px_rgba(15,23,42,0.16)] backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 py-2.5 flex items-center justify-between gap-3">
          {/* Logo + fecha */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/25 ring-1 ring-white/20">
              <Wrench size={16} strokeWidth={2.5} />
            </div>
            <div className="hidden sm:block">
              <p className="font-extrabold text-white text-sm leading-none tracking-tight">TicketManager <span className="text-sky-400">Pro</span></p>
              <p className="text-[9px] font-medium text-slate-400 leading-none mt-1 capitalize">{fechaHoy}</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex bg-white/[0.07] p-1 rounded-xl ring-1 ring-white/10">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 text-[11px] px-2.5 sm:px-3 py-2 rounded-lg font-bold transition-all ${
                  tab === t.id 
                    ? 'bg-white text-slate-900 shadow-md shadow-black/10' 
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <t.icon size={12} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </nav>

          {/* Sync */}
          <button
            onClick={() => { if (nubeCargada.current) cargarDesdeNube(true) }}
            className="flex items-center gap-1.5 shrink-0 px-2 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            title={syncStatus === 'sincronizado' ? 'Sincronizado · Tap para refrescar' : syncStatus === 'error' ? 'Sin conexión · Tap para reintentar' : 'Sincronizando...'}
          >
            {syncStatus === 'cargando' 
              ? <Loader2 size={11} className="text-slate-400 animate-spin" />
              : syncStatus === 'error'
                ? <CloudOff size={11} className="text-rose-400" />
                : <Cloud size={11} className="text-emerald-400" />
            }
            <span className={`text-[9px] font-medium hidden sm:inline ${syncStatus === 'sincronizado' ? 'text-emerald-500' : syncStatus === 'error' ? 'text-rose-400' : 'text-slate-500'}`}>
              {syncStatus === 'sincronizado' ? 'Sync OK' : syncStatus === 'error' ? 'Offline' : 'Sync...'}
            </span>
          </button>
        </div>
      </header>

      {/* ── CONTENT ── */}
      <main className="max-w-7xl mx-auto px-3 sm:px-5 py-5 sm:py-7">
        <div className={tab === 'dashboard' ? 'block fade-in' : 'hidden'}>
          <Dashboard 
            allTickets={allTickets}
            nombreArchivo={nombreArchivo}
            fechaSubidaExcel={fechaSubidaExcel}
            onNavigate={setTab}
            clientesGarantia={clientesGarantia}
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
          <ModuloPendientes />
        </div>
        <div className={tab === 'vacaciones' ? 'block fade-in' : 'hidden'}>
          {vacacionesMontado && <Vacaciones />}
        </div>
      </main>
    </div>
  )
}
