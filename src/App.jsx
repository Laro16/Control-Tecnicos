import { useState, useEffect, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabase.jsx'
import ModuloTecnicos from './components/Tecnicos'
import ModuloPendientes from './components/Gestion'
import ModuloTablas from './components/Tablas'
import { Wrench, ClipboardList, BarChart3, Cloud, CloudOff, Loader2 } from 'lucide-react'

function normalizarTexto(texto) {
  if (!texto) return ''
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
}

export default function App() {
  const [tab, setTab] = useState('tecnicos')
  const [syncStatus, setSyncStatus] = useState('cargando')
  const nubeCargada = useRef(false)
  
  // ── Datos compartidos ──
  const [allTickets, setAllTickets] = useState(() => {
    const guardado = localStorage.getItem('tickets_data')
    return guardado ? JSON.parse(guardado) : []
  })
  const [nombreArchivo, setNombreArchivo] = useState(() => localStorage.getItem('tickets_filename') || '')
  const [fechaSubidaExcel, setFechaSubidaExcel] = useState(() => localStorage.getItem('tickets_date') || '')

  // ── Rutas compartidas entre Técnicos y Tablas ──
  const [rutasTecnicos, setRutasTecnicos] = useState({})
  const [baseMunicipios, setBaseMunicipios] = useState([])

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

    const ticketsActivos = allTickets.filter(t => 
      t.ESTADO_LIMPIO.includes('TECNICO') || t.ESTADO_LIMPIO.includes('PROCESO') || t.ESTADO_LIMPIO.includes('AGENCIA')
    )
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
  useEffect(() => {
    async function cargarDesdeNube() {
      try {
        const { data, error } = await supabase.from('excel_sync').select('*').eq('id', 1).single()
        if (data && !error) {
          const ticketsNube = JSON.parse(data.tickets_json || '[]')
          if (ticketsNube.length > 0) {
            setAllTickets(ticketsNube)
            setNombreArchivo(data.filename || '')
            setFechaSubidaExcel(data.upload_date || '')
          }
          setSyncStatus('sincronizado')
        } else {
          setSyncStatus('sincronizado')
        }
      } catch (e) {
        console.warn('Sin conexión a Supabase:', e)
        setSyncStatus('error')
      }
      setTimeout(() => { nubeCargada.current = true }, 500)
    }
    cargarDesdeNube()
  }, [])

  useEffect(() => {
    localStorage.setItem('tickets_data', JSON.stringify(allTickets))
    localStorage.setItem('tickets_filename', nombreArchivo)
    localStorage.setItem('tickets_date', fechaSubidaExcel)
  }, [allTickets, nombreArchivo, fechaSubidaExcel])

  useEffect(() => {
    if (!nubeCargada.current || allTickets.length === 0) return
    supabase.from('excel_sync').upsert({
      id: 1,
      tickets_json: JSON.stringify(allTickets),
      filename: nombreArchivo,
      upload_date: fechaSubidaExcel,
      updated_at: new Date().toISOString()
    }).then(({ error }) => {
      setSyncStatus(error ? 'error' : 'sincronizado')
    }).catch(() => setSyncStatus('error'))
  }, [allTickets, nombreArchivo, fechaSubidaExcel])

  // ── Función para obtener ruta de un técnico (usada por ambos módulos) ──
  const valorRutaTecnico = (tecnico) => {
    return rutasTecnicos[tecnico] !== undefined ? rutasTecnicos[tecnico] : (rutasAutomaticas[tecnico] || '')
  }

  const tabs = [
    { id: 'tecnicos', label: 'Técnicos', icon: Wrench },
    { id: 'tablas', label: 'Reportes', icon: BarChart3 },
    { id: 'pendientes', label: 'Gestión', icon: ClipboardList },
  ]

  const SyncIcon = syncStatus === 'sincronizado' ? Cloud 
    : syncStatus === 'error' ? CloudOff 
    : Loader2

  const syncColor = syncStatus === 'sincronizado' ? 'text-emerald-400' 
    : syncStatus === 'error' ? 'text-rose-400' 
    : 'text-slate-400 animate-spin'

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      {/* ── HEADER ── */}
      <header className="bg-slate-900 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Wrench size={13} strokeWidth={2.5} />
            </div>
            <span className="font-bold text-white text-sm tracking-tight hidden sm:block">TicketManager</span>
            <SyncIcon size={12} className={syncColor} />
          </div>

          <nav className="flex bg-slate-800/60 p-0.5 rounded-lg">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-semibold transition-all ${
                  tab === t.id 
                    ? 'bg-white text-slate-900 shadow-sm' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <t.icon size={13} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── CONTENT ── */}
      <main className="max-w-5xl mx-auto px-4 py-5">
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
      </main>
    </div>
  )
}
