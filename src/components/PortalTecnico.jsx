import { useEffect, useState } from 'react'
import { CalendarCheck, LogOut, Wallet } from 'lucide-react'
import { supabase } from '../supabase.jsx'
import Preventivos from './Preventivos'
import Viaticos from './Viaticos'

export default function PortalTecnico({ persona, usuarioId, inicial = 'viaticos' }) {
  const [menu, setMenu] = useState(inicial)
  useEffect(() => {
    const actualizar = () => setMenu(window.location.hash === '#preventivos' ? 'preventivos' : 'viaticos')
    window.addEventListener('hashchange', actualizar)
    return () => window.removeEventListener('hashchange', actualizar)
  }, [])
  function abrir(id) { setMenu(id); window.location.hash = id === 'preventivos' ? '#preventivos' : '#viaticos' }
  return <div className="min-h-screen bg-slate-50 px-3 py-4 sm:p-8">
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0"><p className="text-lg font-black">Ticket Manager</p><p className="break-words text-xs text-slate-600">{persona?.nombre} · Portal del técnico</p></div>
        <button type="button" className="btn-ghost inline-flex items-center gap-2" onClick={() => supabase.auth.signOut()}><LogOut size={15}/> Salir</button>
        <nav aria-label="Menús del técnico" className="flex w-full gap-2 border-t border-slate-800 pt-3">
          <button type="button" aria-current={menu === 'viaticos' ? 'page' : undefined} className={`${menu === 'viaticos' ? 'btn-primary' : 'btn-ghost'} flex min-h-11 flex-1 items-center justify-center gap-2`} onClick={() => abrir('viaticos')}><Wallet size={17}/> Viáticos</button>
          <button type="button" aria-current={menu === 'preventivos' ? 'page' : undefined} className={`${menu === 'preventivos' ? 'btn-primary' : 'btn-ghost'} flex min-h-11 flex-1 items-center justify-center gap-2`} onClick={() => abrir('preventivos')}><CalendarCheck size={17}/> Preventivos</button>
        </nav>
      </header>
      {menu === 'preventivos' ? <Preventivos tecnico usuarioId={usuarioId}/> : <Viaticos portal/>}
    </div>
  </div>
}
