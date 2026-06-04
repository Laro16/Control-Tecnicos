import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase.jsx'
import ModuloTecnicos from './components/Tecnicos'
import ModuloPendientes from './components/Gestion'
import ModuloTablas from './components/Tablas'
import { Wrench, ClipboardList, BarChart3, Cloud, CloudOff } from 'lucide-react'

export default function App() {
  const [tab, setTab] = useState('tecnicos')
  const [syncStatus, setSyncStatus] = useState('cargando') // 'cargando' | 'sincronizado' | 'error'
  const nubeCargada = useRef(false)
  
  // Cargar datos iniciales desde localStorage (carga rápida)
  const [allTickets, setAllTickets] = useState(() => {
    const guardado = localStorage.getItem('tickets_data')
    return guardado ? JSON.parse(guardado) : []
  })
  const [nombreArchivo, setNombreArchivo] = useState(() => {
    return localStorage.getItem('tickets_filename') || ''
  })
  const [fechaSubidaExcel, setFechaSubidaExcel] = useState(() => {
    return localStorage.getItem('tickets_date') || ''
  })

  // Al montar: intentar cargar desde Supabase (sobrescribe localStorage si hay datos)
  useEffect(() => {
    async function cargarDesdeNube() {
      try {
        const { data, error } = await supabase
          .from('excel_sync')
          .select('*')
          .eq('id', 1)
          .single()

        if (data && !error) {
          const ticketsNube = JSON.parse(data.tickets_json || '[]')
          if (ticketsNube.length > 0) {
            setAllTickets(ticketsNube)
            setNombreArchivo(data.filename || '')
            setFechaSubidaExcel(data.upload_date || '')
          }
          setSyncStatus('sincronizado')
        } else {
          // No hay datos en la nube, usar localStorage
          setSyncStatus('sincronizado')
        }
      } catch (e) {
        console.warn('No se pudo cargar desde Supabase, usando datos locales:', e)
        setSyncStatus('error')
      }
      // Pequeño delay para evitar guardar de vuelta los datos que acabamos de cargar
      setTimeout(() => { nubeCargada.current = true }, 500)
    }
    cargarDesdeNube()
  }, [])

  // Guardar en localStorage siempre (cache local rápido)
  useEffect(() => {
    localStorage.setItem('tickets_data', JSON.stringify(allTickets))
    localStorage.setItem('tickets_filename', nombreArchivo)
    localStorage.setItem('tickets_date', fechaSubidaExcel)
  }, [allTickets, nombreArchivo, fechaSubidaExcel])

  // Guardar en Supabase cuando el usuario sube un Excel nuevo
  useEffect(() => {
    if (!nubeCargada.current) return
    if (allTickets.length === 0) return

    async function guardarEnNube() {
      try {
        const { error } = await supabase
          .from('excel_sync')
          .upsert({
            id: 1,
            tickets_json: JSON.stringify(allTickets),
            filename: nombreArchivo,
            upload_date: fechaSubidaExcel,
            updated_at: new Date().toISOString()
          })
        
        if (!error) {
          setSyncStatus('sincronizado')
        } else {
          console.warn('Error al guardar en Supabase:', error)
          setSyncStatus('error')
        }
      } catch (e) {
        console.warn('No se pudo guardar en Supabase:', e)
        setSyncStatus('error')
      }
    }
    guardarEnNube()
  }, [allTickets, nombreArchivo, fechaSubidaExcel])

  return (
    <div className="min-h-screen bg-gray-50 font-sans antialiased text-gray-800">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <Wrench size={16} />
            </div>
            <span className="font-black text-gray-900 text-xl tracking-tight">TicketManager Pro</span>
            {/* Indicador de sincronización */}
            <div className="flex items-center gap-1" title={syncStatus === 'sincronizado' ? 'Datos sincronizados en la nube' : syncStatus === 'error' ? 'Sin conexión a la nube' : 'Sincronizando...'}>
              {syncStatus === 'sincronizado' ? (
                <Cloud size={14} className="text-green-500" />
              ) : syncStatus === 'error' ? (
                <CloudOff size={14} className="text-red-400" />
              ) : (
                <Cloud size={14} className="text-gray-300 animate-pulse" />
              )}
            </div>
          </div>

          <nav className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto">
            <button 
              onClick={() => setTab('tecnicos')} 
              className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-bold transition-all ${tab === 'tecnicos' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <Wrench size={14} /> Técnicos
            </button>
            <button 
              onClick={() => setTab('tablas')} 
              className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-bold transition-all ${tab === 'tablas' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <BarChart3 size={14} /> Tablas Reporte
            </button>
            <button 
              onClick={() => setTab('pendientes')} 
              className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-bold transition-all ${tab === 'pendientes' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <ClipboardList size={14} /> Gestión Personal
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className={tab === 'tecnicos' ? 'block' : 'hidden'}>
          <ModuloTecnicos 
            allTickets={allTickets} 
            setAllTickets={setAllTickets} 
            nombreArchivo={nombreArchivo} 
            setNombreArchivo={setNombreArchivo}
            fechaSubidaExcel={fechaSubidaExcel}
            setFechaSubidaExcel={setFechaSubidaExcel}
          />
        </div>
        <div className={tab === 'tablas' ? 'block' : 'hidden'}>
          <ModuloTablas 
            allTickets={allTickets} 
            setAllTickets={setAllTickets} 
            nombreArchivo={nombreArchivo} 
            setNombreArchivo={setNombreArchivo}
            fechaSubidaExcel={fechaSubidaExcel}
            setFechaSubidaExcel={setFechaSubidaExcel}
          />
        </div>
        <div className={tab === 'pendientes' ? 'block' : 'hidden'}>
          <ModuloPendientes />
        </div>
      </main>
    </div>
  )
}
