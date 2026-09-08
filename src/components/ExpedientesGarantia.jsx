import { useEffect, useState } from 'react'
import { supabase } from '../supabase.jsx'
import Dialogo from './Dialogo'
import { ESTADOS, MOTIVOS, candidatosExpedienteGarantia, leerExpedientes, nuevoExpediente, validarExpediente } from '../utils/expedientesGarantia.js'
import { claveSerieGarantia } from '../utils/vencimientosGarantia.js'

async function abrirArchivo(archivo) {
  const { data, error } = await supabase.storage.from('respaldos-garantia').createSignedUrl(archivo.path, 300)
  if (error) throw error
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

export function EditorExpediente({ inicial, registros, onCerrar, onGuardado }) {
  const [form, setForm] = useState(() => ({ ...inicial, fecha_vencimiento: inicial.fecha_vencimiento || '' }))
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [revisiones, setRevisiones] = useState(null)
  const cambiar = (campo, valor) => setForm(prev => ({ ...prev, [campo]: valor }))
  const antecedentes = registros.filter(r => r.serie === claveSerieGarantia(form.serie) && r.referencia !== form.referencia)
  const puntual = ['Reparación', 'Excepción'].includes(form.motivo)
  async function subir(files) {
    setOcupado(true); setError('')
    try {
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 10485760) throw new Error('Solo imágenes JPG, PNG, WebP o PDF de hasta 10 MB por archivo.')
        const path = `${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error: fallo } = await supabase.storage.from('respaldos-garantia').upload(path, file, { upsert: false, contentType: file.type })
        if (fallo) throw fallo
        setForm(prev => ({ ...prev, archivos: [...prev.archivos, { nombre: file.name, path }] }))
      }
    } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }
  async function guardar(e) {
    e.preventDefault(); setError(''); setOcupado(true)
    try {
      const payload = { ...form, serie: claveSerieGarantia(form.serie), fecha_vencimiento: puntual ? '' : form.fecha_vencimiento }
      validarExpediente(payload)
      const { data, error: fallo } = await supabase.rpc('guardar_expediente_garantia', { p_datos: payload, p_revision: inicial.revision || 0 })
      if (fallo) throw fallo
      if (!data) throw new Error('No se confirmó el guardado. Recarga antes de reintentar.')
      window.dispatchEvent(new Event('expediente-garantia-guardado'))
      onGuardado(); onCerrar()
    } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }
  async function historial() {
    setError('')
    try {
      const rows = []
      for (let desde = 0; ; desde += 500) {
        const { data, error: fallo } = await supabase.from('garantias_expedientes_revisiones').select('*').eq('expediente_id', inicial.id).order('id', { ascending: false }).range(desde, desde + 499)
        if (fallo) throw fallo
        rows.push(...data)
        if (data.length < 500) break
      }
      setRevisiones(rows)
    } catch (e) { setError(e.message) }
  }
  return <Dialogo titulo="Expediente de garantía" onCerrar={() => { if (!ocupado) onCerrar() }}>
    <form className="app-dialog-panel" onSubmit={guardar}>
      <div className="app-dialog-header"><h3>Expediente de garantía</h3><button type="button" disabled={ocupado} onClick={onCerrar}>Cerrar</button></div>
      <div className="app-dialog-body space-y-4">
        <p className="text-sm">Una ficha por ticket. Las autorizaciones puntuales no se heredan. Los vencimientos respaldados solo se aplican al guardar en estado Autorizado.</p>
        {antecedentes.length > 0 && <div role="status" className="rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">Esta serie tiene {antecedentes.length} expediente(s) anterior(es): {antecedentes.map(r => `${r.referencia} · ${r.motivo} · ${r.estado}`).join('; ')}. Esta atención necesita su propio respaldo.</div>}
        <fieldset disabled={ocupado} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {[['referencia', 'N° referencia / N° orden'], ['serie', 'Serie'], ['cliente', 'Cliente']].map(([campo, titulo]) => <label key={campo}>{titulo}<input className="control-field mt-1" required value={form[campo]} readOnly={Boolean(inicial.id)} onChange={e => cambiar(campo, e.target.value)}/></label>)}
          <label>Motivo<select className="control-field mt-1" value={form.motivo} onChange={e => cambiar('motivo', e.target.value)}>{MOTIVOS.map(v => <option key={v}>{v}</option>)}</select></label>
          <label>Estado<select className="control-field mt-1" value={form.estado} onChange={e => cambiar('estado', e.target.value)}>{ESTADOS.map(v => <option key={v}>{v}</option>)}</select></label>
          {!puntual && <label>Vencimiento confirmado<input type="date" min="1900-01-01" max="9999-12-31" className="control-field mt-1" value={form.fecha_vencimiento} onChange={e => cambiar('fecha_vencimiento', e.target.value)}/></label>}
          {puntual && <p className="text-sm font-bold">Solo este servicio. No modifica el vencimiento de la serie.</p>}
          <label className="sm:col-span-2">Quién confirmó / autorizó<input className="control-field mt-1" value={form.autorizado_por} onChange={e => cambiar('autorizado_por', e.target.value)}/></label>
          <label className="sm:col-span-2">Explicación y seguimiento<textarea required rows={4} className="control-field mt-1" value={form.explicacion} onChange={e => cambiar('explicacion', e.target.value)}/></label>
          <label className="sm:col-span-2">Adjuntar captura, factura o autorización (PDF o imagen, hasta 10 MB)<input className="mt-2 block w-full min-w-0 text-sm" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => { subir([...e.target.files]); e.target.value = '' }}/></label>
        </fieldset>
        <p className="text-xs text-slate-500">Los archivos se cargan primero; pulsa Guardar expediente para vincularlos. Se conservan las revisiones. Cerrar o rechazar una ficha no elimina un vencimiento confirmado anteriormente.</p>
        {form.archivos.map(a => <button type="button" key={a.path} className="block max-w-full break-all text-left text-sm underline" onClick={() => abrirArchivo(a).catch(e => setError(e.message))}>{a.nombre}</button>)}
        {inicial.id && <button type="button" className="btn-ghost" onClick={historial}>Consultar revisiones de esta ficha</button>}
        {revisiones?.map(r => <div key={r.id} className="rounded-lg border-2 border-slate-500 p-3 text-sm"><p>{new Date(r.registrado_en).toLocaleString()} · {r.datos.estado} · {r.datos.motivo}</p><p>Vencimiento: {r.datos.fecha_vencimiento || 'No aplica'} · Responsable: {r.datos.autorizado_por || 'Pendiente'}</p><p className="whitespace-pre-wrap break-words">{r.datos.explicacion}</p>{r.datos.archivos?.map(a => <button type="button" className="block break-all text-left underline" key={a.path} onClick={() => abrirArchivo(a).catch(e => setError(e.message))}>{a.nombre}</button>)}</div>)}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      </div>
      <div className="app-dialog-footer"><button type="button" className="btn-ghost" disabled={ocupado} onClick={onCerrar}>Cancelar</button><button type="submit" className="btn-primary" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar expediente'}</button></div>
    </form>
  </Dialogo>
}

function SelectorTicketExpediente({ candidatos, onElegir, onManual, onCerrar }) {
  const [buscar, setBuscar] = useState('')
  const termino = buscar.trim().toLowerCase()
  const visibles = candidatos.filter(({ ficha }) => `${ficha.referencia} ${ficha.serie} ${ficha.cliente}`.toLowerCase().includes(termino))
  return <Dialogo titulo="Elegir ticket para el expediente" onCerrar={onCerrar}>
    <div className="app-dialog-panel">
      <div className="app-dialog-header"><h3>Elegir una alerta de garantía</h3><button type="button" onClick={onCerrar}>Cerrar</button></div>
      <div className="app-dialog-body space-y-4">
        <p className="text-sm">Selecciona el ticket y se completarán automáticamente la referencia u orden, la serie y el cliente.</p>
        <label className="block">Buscar cliente, referencia o serie<input autoFocus className="control-field mt-1" value={buscar} onChange={e => setBuscar(e.target.value)}/></label>
        <div className="space-y-2">{visibles.map(({ ticket, ficha, diagnostico }) => <button type="button" key={ficha.referencia} className="block w-full rounded-lg border-2 border-orange-500 bg-orange-50 p-3 text-left text-slate-900 transition hover:bg-orange-100" onClick={() => onElegir(ticket)}>
          <strong className="block break-words">#{ficha.referencia} · {ficha.cliente || 'Sin cliente'}</strong>
          <span className="mt-1 block break-all text-sm">Serie: {ficha.serie}</span>
          <span className="mt-1 block text-xs font-bold text-orange-800">{diagnostico}</span>
        </button>)}</div>
        {!visibles.length && <p className="rounded-lg border-2 border-slate-400 p-3 text-sm">{candidatos.length ? 'No hay coincidencias para esta búsqueda.' : 'No hay alertas con serie válida y sin ficha pendiente de crear.'}</p>}
      </div>
      <div className="app-dialog-footer"><button type="button" className="btn-ghost" onClick={onCerrar}>Cancelar</button><button type="button" className="btn-ghost" onClick={onManual}>Crear manualmente</button></div>
    </div>
  </Dialogo>
}

export default function ExpedientesGarantia({ datos, tickets = [], ticketInicial, onCerrar, controlAlertas }) {
  const [registros, setRegistros] = useState([])
  const [estado, setEstado] = useState('cargando')
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('Todos')
  const [revision, setRevision] = useState(0)
  const [selector, setSelector] = useState(false)
  useEffect(() => {
    let vivo = true
    setEstado('cargando')
    leerExpedientes(supabase).then(rows => {
      if (!vivo) return
      setRegistros(rows); setEstado('listo'); setError('')
      if (ticketInicial) {
        const nuevo = nuevoExpediente(ticketInicial)
        setEditor(rows.find(r => r.referencia === nuevo.referencia) || { ...nuevo, fecha_vencimiento: datos.porSerie[nuevo.serie]?.fecha_vencimiento || '' })
      }
    }).catch(e => { if (vivo) { setEstado('error'); setError(`No se pudieron consultar los expedientes. Activa activar_expedientes_garantia.sql en Supabase o revisa la conexión. ${e.message || ''}`) } })
    return () => { vivo = false }
  }, [revision, ticketInicial])
  const cerrarEditor = () => { setEditor(null); if (ticketInicial) onCerrar() }
  const guardar = () => { datos.reintentar(); setRevision(r => r + 1) }
  if (ticketInicial) return editor ? <EditorExpediente inicial={editor} registros={registros} onCerrar={cerrarEditor} onGuardado={guardar}/> : <Dialogo titulo="Expediente de garantía" onCerrar={onCerrar}><div className="app-dialog-panel"><div className="app-dialog-body"><p role="status">{error || 'Consultando expedientes…'}</p><button className="btn-ghost" onClick={() => setRevision(r => r + 1)}>Reintentar</button><button className="btn-ghost" onClick={onCerrar}>Cerrar</button></div></div></Dialogo>
  const visibles = registros.filter(r => (filtro === 'Todos' || r.estado === filtro) && `${r.referencia} ${r.serie} ${r.cliente}`.toLowerCase().includes(busqueda.toLowerCase()))
  const candidatos = candidatosExpedienteGarantia(controlAlertas, registros)
  const nuevas = tickets.filter(t => { const n = nuevoExpediente(t); return n.referencia && n.serie && registros.some(r => r.serie === n.serie) && !registros.some(r => r.referencia === n.referencia) }).filter((t,i,a) => a.findIndex(x => nuevoExpediente(x).referencia === nuevoExpediente(t).referencia) === i)
  return <section className="space-y-4">
    <div className="card space-y-3 p-4"><h2 className="text-xl font-bold">Expedientes de garantía</h2><p className="text-sm">Respaldos por despacho, factura, reparación o excepción. Las nuevas atenciones requieren su propia ficha.</p><button className="btn-primary" disabled={estado !== 'listo'} onClick={() => setSelector(true)}>Nuevo expediente desde Técnicos{candidatos.length ? ` (${candidatos.length})` : ''}</button><button className="btn-ghost" onClick={() => setRevision(r => r + 1)}>Actualizar</button>
      <label className="block">Buscar referencia, serie o cliente<input className="control-field mt-1" value={busqueda} onChange={e => setBusqueda(e.target.value)}/></label><label className="block">Estado<select className="control-field mt-1" value={filtro} onChange={e => setFiltro(e.target.value)}>{['Todos', ...ESTADOS].map(v => <option key={v}>{v}</option>)}</select></label>
      {estado === 'cargando' && <p role="status">Consultando expedientes…</p>}{error && <p role="alert">{error}</p>}
    </div>
    {estado === 'listo' && nuevas.length > 0 && <div className="card space-y-2 border-2 border-amber-500 p-4"><h3 className="font-bold">Series con antecedentes en otros reportes</h3>{nuevas.map(t => { const ficha = nuevoExpediente(t); return <div key={ficha.referencia} className="flex flex-wrap items-center gap-2 border-t border-slate-400 pt-2"><span className="break-all text-sm">#{ficha.referencia} · {t.CLIENTE} · Serie {ficha.serie}</span><button className="btn-ghost" onClick={() => setEditor(ficha)}>Crear ficha de esta atención</button></div> })}</div>}
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">{visibles.map(r => <article key={r.id} className="card min-w-0 space-y-3 border-2 border-slate-600 p-4"><h3 className="break-words font-bold">#{r.referencia} · {r.cliente}</h3><p className="break-all text-sm">Serie {r.serie}</p><p className="text-sm font-bold">{r.motivo} · {r.estado}</p><p className="text-sm">{['Reparación', 'Excepción'].includes(r.motivo) ? 'Autorización limitada a este ticket' : `Vencimiento: ${r.fecha_vencimiento || 'Pendiente'}`}</p><p className="whitespace-pre-wrap break-words text-sm">{r.explicacion}</p>{r.archivos.map(a => <button key={a.path} className="block max-w-full break-all text-left text-sm underline" onClick={() => abrirArchivo(a).catch(e => setError(e.message))}>{a.nombre}</button>)}{!r.archivos.length && <p className="text-sm">Sin documentos adjuntos</p>}<button className="btn-primary" onClick={() => setEditor(r)}>Abrir / subir respaldo</button></article>)}</div>
    {estado === 'listo' && !visibles.length && <p>No hay expedientes para esta búsqueda.</p>}
    {editor && <EditorExpediente inicial={editor} registros={registros} onCerrar={cerrarEditor} onGuardado={guardar}/>}
    {selector && <SelectorTicketExpediente candidatos={candidatos} onCerrar={() => setSelector(false)} onManual={() => { setSelector(false); setEditor(nuevoExpediente()) }} onElegir={ticket => { setSelector(false); setEditor(nuevoExpediente(ticket)) }}/>} 
  </section>
}
