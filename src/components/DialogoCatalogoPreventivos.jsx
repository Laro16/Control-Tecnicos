import { useState } from 'react'
import { X } from 'lucide-react'
import Dialogo from './Dialogo'
import { MARCAS_PREVENTIVOS, MESES_PREVENTIVOS } from '../utils/preventivos.js'
import { validarLocalPreventivo } from '../utils/catalogoPreventivos.js'

export default function DialogoCatalogoPreventivos({ local, catalogo, mesInicial, guardar, cerrar }) {
  const [form,setForm]=useState(()=>({marca:local?.marca||'GRANJERO',codigo:local?.codigo||'',nombre:local?.nombre||'',
    mes_base:local?.meses?.[0]||((Number(mesInicial)-1)%4+1),direccion:local?.direccion||'',telefono:local?.telefono||'',semana:local?.semana||'',equipos:local?.equipos??''}))
  const [guardando,setGuardando]=useState(false),[error,setError]=useState('')
  const titulo=local?'Editar programación':'Nueva tienda'
  const cambiar=(clave,valor)=>setForm(actual=>({...actual,[clave]:valor}))
  async function enviar(evento) {
    evento.preventDefault();setError('');setGuardando(true)
    try { await guardar(validarLocalPreventivo(form,catalogo,!local),local) }
    catch(fallo){setError(fallo.message||'No se pudo guardar. Intenta de nuevo.')}
    finally{setGuardando(false)}
  }
  return <Dialogo titulo={titulo} onCerrar={()=>{if(!guardando)cerrar()}}>
    <form onSubmit={enviar} className="app-dialog-panel">
      <div className="app-dialog-header"><h2 className="text-base font-black">{titulo}</h2><button type="button" aria-label="Cerrar formulario" disabled={guardando} onClick={cerrar}><X size={20}/></button></div>
      <div className="app-dialog-body space-y-4">
        <p className="text-sm text-slate-600">Programa un mantenimiento por vuelta. El mes se repite cada cuatro meses y la tienda se conserva entre cargas del Excel.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold">Marca<select className="control-field" value={form.marca} disabled={guardando||Boolean(local)} onChange={e=>cambiar('marca',e.target.value)}>{Object.entries(MARCAS_PREVENTIVOS).map(([id,nombre])=><option key={id} value={id}>{nombre}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-bold">Código de tienda<input className="control-field" required inputMode="numeric" maxLength={20} value={form.codigo} disabled={guardando||Boolean(local)} onChange={e=>cambiar('codigo',e.target.value)}/></label>
        </div>
        <label className="grid gap-1 text-xs font-bold">Nombre de tienda<input className="control-field" required maxLength={200} value={form.nombre} disabled={guardando} onChange={e=>cambiar('nombre',e.target.value)}/></label>
        <label className="grid gap-1 text-xs font-bold">Meses de mantenimiento<select className="control-field" value={form.mes_base} disabled={guardando} onChange={e=>cambiar('mes_base',Number(e.target.value))}>{[1,2,3,4].map(m=><option key={m} value={m}>{[m,m+4,m+8].map(n=>MESES_PREVENTIVOS[n-1]).join(' · ')}</option>)}</select></label>
        {local&&<p className="text-xs text-slate-600">Cambiar la programación no borra órdenes ni marcas anteriores. Si necesita cierre, usa «Marcar cerrado»; editarla no la reactiva.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold">Semana (opcional)<input className="control-field" list="semanas-preventivos" maxLength={100} placeholder="Por ejemplo: SEMANA 1" value={form.semana} disabled={guardando} onChange={e=>cambiar('semana',e.target.value)}/><datalist id="semanas-preventivos">{[1,2,3,4,5].map(n=><option key={n} value={`SEMANA ${n}`}/>)}</datalist></label>
          <label className="grid gap-1 text-xs font-bold">Equipos previstos (opcional)<input className="control-field" type="number" min="1" max="500" step="1" value={form.equipos} disabled={guardando} onChange={e=>cambiar('equipos',e.target.value)}/></label>
        </div>
        <label className="grid gap-1 text-xs font-bold">Dirección (opcional)<textarea className="control-field" rows={2} maxLength={1000} value={form.direccion} disabled={guardando} onChange={e=>cambiar('direccion',e.target.value)}/></label>
        <label className="grid gap-1 text-xs font-bold">Teléfono (opcional)<input className="control-field" type="tel" maxLength={80} value={form.telefono} disabled={guardando} onChange={e=>cambiar('telefono',e.target.value)}/></label>
        {error&&<p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
      </div>
      <div className="app-dialog-footer"><button type="button" className="btn-ghost min-h-11" disabled={guardando} onClick={cerrar}>Cancelar</button><button type="submit" className="btn-primary min-h-11" disabled={guardando}>{guardando?'Guardando…':local?'Guardar programación':'Guardar tienda'}</button></div>
    </form>
  </Dialogo>
}
