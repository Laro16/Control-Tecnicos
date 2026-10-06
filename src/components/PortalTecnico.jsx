import { useEffect, useState } from 'react'
import { CalendarCheck, LogOut, Wallet } from 'lucide-react'
import { supabase } from '../supabase.jsx'
import Preventivos from './Preventivos'
import PreventivosTrimestrales from './PreventivosTrimestrales'
import Viaticos from './Viaticos'

export default function PortalTecnico({ persona, usuarioId, inicial = 'viaticos' }) {
  const [menu, setMenu] = useState(inicial)
  useEffect(() => {
    const actualizar = () => setMenu(['#preventivos', '#preventivos-shell', '#preventivos-taco-bell'].includes(window.location.hash) ? window.location.hash.slice(1) : 'viaticos')
    window.addEventListener('hashchange', actualizar)
    return () => window.removeEventListener('hashchange', actualizar)
  }, [])
  function abrir(id) { setMenu(id); window.location.hash = `#${id}` }
  return <div className="min-h-screen bg-slate-50 px-3 py-4 sm:p-8">
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0"><p className="text-lg font-black">Ticket Manager</p><p className="break-words text-xs text-slate-600">{persona?.nombre} · Portal del técnico</p></div>
        <button type="button" className="btn-ghost inline-flex items-center gap-2" onClick={() => supabase.auth.signOut()}><LogOut size={15}/> Salir</button>
        <nav aria-label="Menús del técnico" className="grid w-full grid-cols-2 gap-2 border-t border-slate-800 pt-3 sm:grid-cols-4">
          <button type="button" aria-current={menu === 'viaticos' ? 'page' : undefined} className={`${menu === 'viaticos' ? 'btn-primary' : 'btn-ghost'} flex min-h-11 flex-1 items-center justify-center gap-2`} onClick={() => abrir('viaticos')}><Wallet size={17}/> Viáticos</button>
          <button type="button" aria-current={menu === 'preventivos' ? 'page' : undefined} className={`${menu === 'preventivos' ? 'btn-primary' : 'btn-ghost'} flex min-h-11 flex-1 items-center justify-center gap-2`} onClick={() => abrir('preventivos')}><CalendarCheck size={17}/> Preventivos</button>
          {['shell','taco-bell'].map(m=><button key={m} type="button" aria-current={menu === `preventivos-${m}` ? 'page' : undefined} className={`${menu === `preventivos-${m}` ? 'btn-primary' : 'btn-ghost'} flex min-h-11 items-center justify-center gap-2`} onClick={()=>abrir(`preventivos-${m}`)}><CalendarCheck size={17}/> {m==='shell'?'Shell':'Taco Bell'}</button>)}
        </nav>
      </header>
      {menu === 'preventivos' ? <Preventivos tecnico usuarioId={usuarioId}/> : menu === 'preventivos-shell' || menu === 'preventivos-taco-bell' ? <PreventivosTrimestrales key={menu} marca={menu==='preventivos-shell'?'SHELL':'TACO_BELL'} tecnico usuarioId={usuarioId}/> : <Viaticos portal/>}
    </div>
  </div>
}
