import { useState } from 'react'
import ModuloTecnicos from './components/Tecnicos'
import ModuloPendientes from './components/Gestion'
import { Wrench } from 'lucide-react'

export default function App() {
  const [tab, setTab] = useState('tecnicos')

  return (
    <div className="min-h-screen bg-gray-50 font-sans antialiased text-gray-800">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <Wrench size={16} />
            </div>
            <span className="font-black text-gray-900 text-xl tracking-tight">TicketManager Pro</span>
          </div>

          {/* Ocultamiento y visualización por display CSS para no perder la carga de archivos */}
          <nav className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto">
            <button 
              onClick={() => setTab('tecnicos')} 
              className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 text-sm px-5 py-2 rounded-lg font-bold transition-all ${tab === 'tecnicos' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}
            >
              Control de Técnicos
            </button>
            <button 
              onClick={() => setTab('pendientes')} 
              className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 text-sm px-5 py-2 rounded-lg font-bold transition-all ${tab === 'pendientes' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}
            >
              Gestión Personal
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className={tab === 'tecnicos' ? 'block' : 'hidden'}>
          <ModuloTecnicos />
        </div>
        <div className={tab === 'pendientes' ? 'block' : 'hidden'}>
          <ModuloPendientes />
        </div>
      </main>
    </div>
  )
}
