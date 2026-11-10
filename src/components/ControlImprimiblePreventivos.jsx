import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, Printer, RefreshCw, X } from 'lucide-react'
import Dialogo from './Dialogo'
import { MESES_PREVENTIVOS, MARCAS_PREVENTIVOS } from '../utils/preventivos.js'
import { validarRealizado } from '../utils/seguimientoPreventivos.js'
import { leerResaltadosPreventivos, guardarResaltadoPreventivo } from '../utils/resaltadosPreventivosPersistencia.js'
import { prepararControlImprimible, combinarResaltadosControl, filtrarControlImprimible, estadoControlImprimible, datosImagenControlImprimible, dividirControlImprimible, imprimirControlImprimible } from '../utils/controlImprimiblePreventivos.js'
import { descargarImagenPreventivos } from '../utils/preventivosImagen.js'

const clave = r => `${r.local.marca}:${r.local.codigo}:${r.anio}:${r.mes}`
const clavePreferencia = r => `${r.marca}:${r.codigo}:${r.anio}:${r.mes}`
const campo = 'control-field mt-1 w-full'

export default function ControlImprimiblePreventivos({ catalogo, ordenes, declaraciones, anio, vuelta, listo, ocupado, hoy, guardar, revisionDatos }) {
  const [filtros, setFiltros] = useState({ mes: '', marca: '', semana: '', estado: 'todos', busqueda: '' })
  const [preferencias, setPreferencias] = useState([])
  const [disponible, setDisponible] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [errorLectura, setErrorLectura] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [guardandoColor, setGuardandoColor] = useState('')
  const [exportando, setExportando] = useState(false)
  const [colores, setColores] = useState(true)
  const [seleccion, setSeleccion] = useState(null)
  const [form, setForm] = useState({ fecha: hoy, equipos: '', observaciones: '' })
  const [enviando, setEnviando] = useState(false)
  const [errorForm, setErrorForm] = useState('')
  const cargaActual = useRef(0)
  const vivo = useRef(true)
  const escribiendoColor = useRef(false)

  async function cargarPreferencias() {
    // El refresco del padre no puede reemplazar una escritura por una lectura vieja.
    if (escribiendoColor.current) return
    const consulta = ++cargaActual.current
    setCargando(true)
    try {
      const datos = await leerResaltadosPreventivos()
      if (!vivo.current || consulta !== cargaActual.current) return
      setPreferencias(datos.resaltados); setDisponible(datos.disponible); setErrorLectura('')
    } catch (fallo) {
      if (vivo.current && consulta === cargaActual.current) setErrorLectura(fallo.message || 'No se pudieron consultar los resaltados guardados.')
    } finally {
      if (vivo.current && consulta === cargaActual.current) setCargando(false)
    }
  }
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; cargaActual.current++ } }, [])
  useEffect(() => { cargarPreferencias() }, [revisionDatos])
  useEffect(() => { setFiltros(f => ({ ...f, mes: '', semana: '' })) }, [anio, vuelta])

  const base = useMemo(() => prepararControlImprimible(catalogo, ordenes, declaraciones, Number(anio), Number(vuelta)), [catalogo, ordenes, declaraciones, anio, vuelta])
  const registros = useMemo(() => combinarResaltadosControl(base, preferencias), [base, preferencias])
  const visibles = useMemo(() => filtrarControlImprimible(registros, filtros), [registros, filtros])
  const semanas = [...new Set(base.map(r => r.local.semana || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  const meses = Array.from({ length: 4 }, (_, i) => (Number(vuelta) - 1) * 4 + i + 1)
  const bloqueado = ocupado || enviando || Boolean(guardandoColor) || exportando
  const salidaBloqueada = bloqueado || cargando || Boolean(errorLectura) || !listo || !visibles.length
  const opciones = { anio: Number(anio), vuelta: Number(vuelta), colores }
  const cambiarFiltro = (nombre, valor) => setFiltros(f => ({ ...f, [nombre]: valor }))

  async function cambiarColor(registro, modo) {
    if (escribiendoColor.current) return
    escribiendoColor.current = true
    const consulta = ++cargaActual.current
    setGuardandoColor(clave(registro)); setError(''); setAviso('')
    try {
      const fila = await guardarResaltadoPreventivo(registro.local, registro.anio, registro.mes, modo, registro.revisionResaltado || 0)
      if (!vivo.current) return
      setPreferencias(actual => [...actual.filter(p => clavePreferencia(p) !== clavePreferencia(fila)), fila])
      setAviso(`Color guardado para #${registro.local.codigo} · ${MESES_PREVENTIVOS[registro.mes - 1]}. El estado y las órdenes no cambiaron.`)
    } catch (fallo) { if (vivo.current) setError(fallo.message || 'No se confirmó el cambio de color.') }
    finally {
      escribiendoColor.current = false
      if (vivo.current) { setGuardandoColor(''); if (consulta === cargaActual.current) setCargando(false) }
    }
  }
  function abrirRealizado(registro) {
    setErrorForm('')
    setForm({ fecha: registro.declaracion?.fecha_realizado || hoy, equipos: registro.declaracion?.equipos_declarados ?? '', observaciones: registro.declaracion?.observaciones || '' })
    setSeleccion(registro)
  }
  async function guardarMarca(evento) {
    evento.preventDefault(); setErrorForm(''); setEnviando(true)
    try {
      const datos = validarRealizado(form, hoy)
      await guardar(seleccion.local, seleccion.anio, seleccion.mes, { ...datos, realizado: true }, seleccion.declaracion?.revision || 0)
      setSeleccion(null)
    } catch (fallo) { setErrorForm(fallo.message || 'No se pudo guardar el realizado.') }
    finally { setEnviando(false) }
  }
  async function descargar() {
    setExportando(true); setError(''); setAviso('')
    try {
      const partes = dividirControlImprimible(visibles)
      for (const [i, parte] of partes.entries()) {
        const datos = datosImagenControlImprimible(parte, opciones)
        if (partes.length > 1) datos.subtitulo += ` · Imagen ${i + 1} de ${partes.length}`
        await descargarImagenPreventivos(datos, `Control_Preventivos_${anio}_V${vuelta}${partes.length > 1 ? `_${String(i + 1).padStart(2, '0')}_de_${partes.length}` : ''}.png`)
      }
      setAviso(partes.length === 1 ? 'Imagen descargada con las filas filtradas.' : `Se generaron ${partes.length} imágenes PNG con todo lo filtrado. Si el navegador lo solicita, permite varias descargas.`)
    } catch (fallo) { setError(fallo.message || 'No se pudo generar la imagen.') }
    finally { setExportando(false) }
  }
  function imprimir() {
    setError('')
    try { imprimirControlImprimible(visibles, opciones) }
    catch (fallo) { setError(fallo.message || 'No se pudo abrir la impresión.') }
  }

  return <section className="space-y-4 cmi-control" aria-label="Control imprimible de preventivos">
    <header className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">Hoja de seguimiento CMI</h2><p className="mt-1 text-sm text-slate-600">Vista tipo Excel: ubicación, código, semana, equipos, cliente y las tres fechas programadas.</p></div><button type="button" className="btn-ghost inline-flex min-h-11 items-center gap-2" disabled={bloqueado || cargando} onClick={cargarPreferencias}><RefreshCw size={15}/> Actualizar colores</button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-bold">Mes del control<select className={campo} value={filtros.mes} onChange={e => cambiarFiltro('mes', e.target.value)}><option value="">Toda la vuelta</option>{meses.map(m => <option key={m} value={m}>{MESES_PREVENTIVOS[m - 1]}</option>)}</select></label>
        <label className="text-xs font-bold">Marca del control<select className={campo} value={filtros.marca} onChange={e => cambiarFiltro('marca', e.target.value)}><option value="">Todas las marcas</option>{Object.entries(MARCAS_PREVENTIVOS).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select></label>
        <label className="text-xs font-bold">Semana programada<select className={campo} value={filtros.semana} onChange={e => cambiarFiltro('semana', e.target.value)}><option value="">Todas las semanas</option>{semanas.map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="text-xs font-bold">Estado del control<select className={campo} value={filtros.estado} onChange={e => cambiarFiltro('estado', e.target.value)}><option value="todos">Todos</option><option value="pendiente">Pendiente</option><option value="por-liquidar">Pendiente de liquidar</option><option value="finalizado">Realizado (Excel)</option></select></label>
        <label className="text-xs font-bold">Buscar punto<input className={campo} value={filtros.busqueda} onChange={e => cambiarFiltro('busqueda', e.target.value)} placeholder="Código, negocio o dirección"/></label>
      </div>
    </header>
    {cargando && <p role="status" className="text-sm text-slate-600">Consultando los resaltados guardados…</p>}
    {!cargando && !disponible && !errorLectura && <p role="status" className="card border-amber-600 bg-amber-50 p-3 text-sm text-amber-950">Puedes consultar e imprimir con el verde automático. Para guardar colores manuales, ejecuta activar_resaltados_preventivos.sql en Supabase y pulsa «Actualizar colores».</p>}
    {errorLectura && <p role="alert" className="card border-rose-600 p-3 text-sm text-rose-700">{errorLectura} Actualiza los colores antes de imprimir o descargar, para no omitir tus preferencias guardadas.</p>}
    {error && <p role="alert" className="card border-rose-600 p-3 text-sm text-rose-700">{error} Puedes pulsar «Actualizar colores» para revisar la última versión.</p>}
    {aviso && <p role="status" className="card bg-sky-50 p-3 text-sm text-sky-800">{aviso}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-bold">{visibles.length} {visibles.length === 1 ? 'punto filtrado' : 'puntos filtrados'} · {MESES_PREVENTIVOS[meses[0] - 1]} – {MESES_PREVENTIVOS[meses[3] - 1]} {anio}</p>
      <div className="flex flex-wrap items-center gap-2"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={colores} onChange={e => setColores(e.target.checked)}/> Incluir resaltado al imprimir y descargar</label><button type="button" className="btn-ghost inline-flex min-h-11 items-center gap-2" disabled={salidaBloqueada} onClick={imprimir}><Printer size={15}/> Imprimir filtrados</button><button type="button" className="btn-primary inline-flex min-h-11 items-center gap-2" disabled={salidaBloqueada} onClick={descargar}><Download size={15}/>{exportando ? 'Generando imágenes…' : 'Descargar filtrados como imagen'}</button></div>
    </div>
    <p className="text-xs text-slate-600 sm:hidden">Desliza la tabla hacia los lados para ver los controles y el estado.</p>
    <div className="card overflow-hidden">
      <div className="overflow-x-auto" tabIndex={0} aria-label="Tabla de control; desplaza para ver todas las columnas">
        <table className="cmi-control-table w-full min-w-[1620px] table-fixed text-left text-sm">
          <colgroup>{[4,15,22,5,7,5,7,7,7,7,8,6].map((w,i)=><col key={i} style={{width:`${w}%`}}/>)}</colgroup>
          <thead><tr>{['No.', 'Unidades Pollo Granjero', 'Ubicación', 'Código', 'Semana', 'Equipos', 'Cliente', 'Fechas', 'Fechas', 'Fechas', 'Controles', 'Estado'].map((t,i) => <th key={i} scope="col">{t}</th>)}</tr></thead>
          <tbody>{visibles.map(r => <tr key={clave(r)} data-clave-control={clave(r)} data-resaltado={r.resaltado ? 'verde' : 'no'} className={r.resaltado ? 'cmi-control-highlight' : ''}>
            <td>{r.local.numero || r.local.fila - 2 || '—'}</td>
            <td className="font-bold">{r.local.nombre}</td>
            <td>{r.local.direccion?.trim() || 'Sin dirección registrada'}</td>
            <td className="font-bold">#{r.local.codigo}</td>
            <td>{r.local.semana || '—'}</td>
            <td>{r.local.equipos ?? '—'}<span className="block text-xs">{r.ordenes.length} en Excel</span></td>
            <td>{r.local.marca === 'CAMPERO' ? 'CAMPERO' : 'GRANJERO'}</td>
            {[0,1,2].map(i => <td key={i} className={r.local.meses[i] === r.mes ? 'font-extrabold underline' : ''}>{MESES_PREVENTIVOS[r.local.meses[i]-1]?.toUpperCase() || '—'}</td>)}
            <td><div className="space-y-2"><label className="block text-xs font-bold">Resaltado<select className="control-field mt-1 w-full" aria-label={`Resaltado de ${r.local.marca} ${r.local.codigo} ${MESES_PREVENTIVOS[r.mes - 1]}`} value={r.modoResaltado} disabled={!disponible || cargando || Boolean(errorLectura) || bloqueado} onChange={e => cambiarColor(r, e.target.value)}><option value="automatico">Automático</option><option value="verde">Verde manual</option><option value="sin-color">Sin resaltado</option></select></label>{!r.enExcel && <button type="button" className="btn-ghost w-full min-h-11" disabled={!listo || bloqueado} onClick={() => abrirRealizado(r)}><Check size={14} className="mr-1 inline"/>{r.declaracion ? 'Editar realizado' : 'Marcar realizado'}</button>}</div></td>
            <td className="font-extrabold"><span>{estadoControlImprimible(r)}</span>{r.modoResaltado === 'verde' && <span className="mt-1 block text-xs font-normal">Color manual</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!visibles.length && <p className="p-5 text-sm text-slate-600">No hay puntos con estos filtros.</p>}
    </div>
    <p className="text-xs text-slate-600">Automático: verde únicamente al reconocer órdenes del Excel. Verde manual y Sin resaltado solo cambian el color. «Marcar realizado» registra el trabajo como Pendiente de liquidar; no inventa órdenes ni activa por sí solo el verde automático. Para deshacer una marca manual, utiliza Detalle en la ficha.</p>
    {seleccion && <Dialogo titulo="Reportar preventivo realizado" onCerrar={() => { if (!enviando) setSeleccion(null) }}><form onSubmit={guardarMarca} className="app-dialog-panel"><header className="app-dialog-header"><div><h3>Reportar preventivo realizado</h3><p className="mt-1 text-sm">#{seleccion.local.codigo} · {MESES_PREVENTIVOS[seleccion.mes - 1]} {seleccion.anio}</p></div><button type="button" disabled={enviando} aria-label="Cerrar" onClick={() => setSeleccion(null)}><X size={18}/></button></header><div className="app-dialog-body space-y-4"><p className="text-sm">{seleccion.local.nombre}. La marca queda Pendiente de liquidar hasta que el Excel confirme este mantenimiento.</p><label className="block text-sm font-bold">Fecha en que se realizó<input type="date" className={campo} required max={hoy} value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}/></label><label className="block text-sm font-bold">Equipos trabajados (opcional)<input type="number" className={campo} min="1" max="500" step="1" value={form.equipos} onChange={e => setForm(f => ({ ...f, equipos: e.target.value }))}/></label><label className="block text-sm font-bold">Observación (opcional)<textarea className={campo} rows={3} maxLength={1500} value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}/></label>{errorForm && <p role="alert" className="text-sm text-rose-700">{errorForm}</p>}</div><footer className="app-dialog-footer"><button type="button" className="btn-ghost" disabled={enviando} onClick={() => setSeleccion(null)}>Cancelar</button><button type="submit" className="btn-primary" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar realizado'}</button></footer></form></Dialogo>}
  </section>
}
