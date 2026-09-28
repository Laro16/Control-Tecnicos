import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, ChevronDown, Loader2, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'
import Dialogo from './Dialogo'
import { supabase, crearAccesoViaticos } from '../supabase'

const JORNADAS = [
  { valor: '0,6', etiqueta: 'Lunes a viernes (descansa sábado y domingo)' },
  { valor: '0', etiqueta: 'Lunes a sábado (descansa solo domingo)' },
]

const jornadaTexto = dias => (dias || []).join(',') === '0' ? 'Lun–Sáb' : 'Lun–Vie'
const fechaVisible = valor => valor ? valor.split('-').reverse().join('/') : '—'

export default function Personal() {
  const [empleados, setEmpleados] = useState([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    const { data, error: fallo } = await supabase.from('vac_empleados').select('*').order('nombre')
    if (fallo) setError(fallo.message || 'No se pudo cargar el personal.')
    else setEmpleados(data || [])
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es')
    return termino ? empleados.filter(e => `${e.codigo || ''} ${e.nombre || ''} ${e.puesto || ''} ${e.correo_viaticos || ''}`.toLocaleLowerCase('es').includes(termino)) : empleados
  }, [empleados, busqueda])

  const cerrarModal = () => { setModalAbierto(false); setEditando(null) }
  const abrirNuevo = () => { setEditando(null); setModalAbierto(true) }
  const abrirEdicion = empleado => { setEditando(empleado); setModalAbierto(true) }

  async function borrarEmpleado(empleado) {
    if (!window.confirm(`Eliminar a ${empleado.nombre} borra también todos sus registros de vacaciones. ¿Continuar?`)) return
    const { error: fallo } = await supabase.from('vac_empleados').delete().eq('id', empleado.id)
    if (fallo) setError(fallo.message)
    else cargar()
  }

  return <div className="space-y-5 fade-in">
    <section className="workspace-hero">
      <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky-300"><Users size={13} /> Catálogo general</div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Personal</h1>
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-300 sm:text-sm">Administra a los compañeros desde un solo lugar. Vacaciones y Viáticos utilizan este mismo registro.</p>
        </div>
        <button type="button" onClick={abrirNuevo} className="flex items-center justify-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-[10px] font-extrabold text-slate-900 shadow-lg transition hover:bg-sky-50">
          <Plus size={13} /> Agregar compañero
        </button>
      </div>
    </section>

    {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
      <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
      <p className="flex-1 text-[11px] text-red-700">{error}</p>
      <button type="button" onClick={() => setError('')} aria-label="Cerrar aviso" className="text-red-500"><X size={13} /></button>
    </div>}

    <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, código, puesto o correo…" aria-label="Buscar personal" className="control-field w-full pl-9" />
      </div>
      <span className="text-xs font-bold text-slate-500">{visibles.length} de {empleados.length} personas</span>
    </div>

    {cargando ? <div className="flex items-center justify-center py-16 text-sm text-slate-500"><Loader2 size={17} className="mr-2 animate-spin" /> Cargando personal…</div>
      : visibles.length === 0 ? <div className="card p-8 text-center text-sm text-slate-500">{empleados.length ? 'No hay personas con esa búsqueda.' : 'Todavía no hay personal registrado.'}</div>
        : <section aria-label="Personal registrado" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map(empleado => <article key={empleado.id} className="card overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-slate-300 p-4">
              <div className="min-w-0">
                <span className="font-mono text-[10px] font-bold text-sky-700">{empleado.codigo || 'Sin código'}</span>
                <h2 className="mt-1 text-sm font-black text-slate-900">{empleado.nombre}</h2>
                <p className="mt-1 text-xs text-slate-600">{empleado.puesto || 'Sin puesto'}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => abrirEdicion(empleado)} title="Editar" aria-label={`Editar a ${empleado.nombre}`} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-sky-50"><Pencil size={14} /></button>
                <button type="button" onClick={() => borrarEmpleado(empleado)} title="Eliminar" aria-label={`Eliminar a ${empleado.nombre}`} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="grid gap-2 p-4 text-xs text-slate-600">
              <p><CalendarDays size={13} className="mr-1 inline" /> Ingreso: <strong>{fechaVisible(empleado.fecha_ingreso)}</strong></p>
              <p>Jornada: <strong>{jornadaTexto(empleado.dias_descanso)}</strong></p>
              <p className="break-all">Correo de Viáticos: <strong>{empleado.correo_viaticos || 'Sin asignar'}</strong></p>
              {empleado.activo === false && <p className="font-bold text-amber-700">Inactivo</p>}
            </div>
          </article>)}
        </section>}

    {modalAbierto && <ModalEmpleado
      empleado={editando}
      guardando={guardando}
      setGuardando={setGuardando}
      onCerrar={cerrarModal}
      onGuardado={() => { cerrarModal(); cargar() }}
      onError={setError}
    />}
  </div>
}

function ModalEmpleado({ empleado, guardando, setGuardando, onCerrar, onGuardado, onError }) {
  const [personalGuardado, setPersonalGuardado] = useState(false)
  const [codigo, setCodigo] = useState(empleado?.codigo || '')
  const [nombre, setNombre] = useState(empleado?.nombre || '')
  const [puesto, setPuesto] = useState(empleado?.puesto || '')
  const [ingreso, setIngreso] = useState(empleado?.fecha_ingreso || '')
  const [correoViaticos, setCorreoViaticos] = useState(empleado?.correo_viaticos || '')
  const [claveViaticos, setClaveViaticos] = useState('')
  const [jornada, setJornada] = useState(empleado?.dias_descanso?.join(',') || '0,6')

  async function guardar() {
    if (!nombre.trim()) return
    if (claveViaticos && !correoViaticos.trim()) { onError('Agrega el correo antes de crear el acceso a Viáticos.'); return }
    setGuardando(true)
    const datos = {
      codigo: codigo.trim() || null,
      nombre: nombre.trim(),
      puesto: puesto.trim() || null,
      fecha_ingreso: ingreso || null,
      dias_descanso: jornada.split(',').map(Number),
      correo_viaticos: correoViaticos.trim().toLowerCase() || null,
    }
    try {
      const { error: fallo } = personalGuardado ? { error: null } : empleado
        ? await supabase.from('vac_empleados').update(datos).eq('id', empleado.id)
        : await supabase.from('vac_empleados').insert(datos)
      if (fallo) {
        onError(fallo.code === '23505' ? 'Ya existe un compañero con ese nombre, código o correo de Viáticos.' : fallo.message)
        return
      }
      if (claveViaticos) {
        setPersonalGuardado(true)
        const { error: errorAcceso } = await crearAccesoViaticos(datos.correo_viaticos, claveViaticos)
        if (errorAcceso) {
          onError(`El personal se guardó, pero no se pudo crear el acceso: ${errorAcceso.message}. Puedes reintentar aquí o cerrar y editar a esta persona.`)
          return
        }
      }
      onGuardado()
    } finally { setGuardando(false) }
  }

  const titulo = empleado ? 'Editar compañero' : 'Agregar compañero'
  const campo = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900'
  return <Dialogo titulo={titulo} onCerrar={onCerrar} cerrarFuera>
    <div className="app-dialog-panel">
      <div className="app-dialog-header"><h3 className="text-xs font-bold text-slate-800">{titulo}</h3><button type="button" aria-label="Cerrar formulario" onClick={onCerrar} className="text-slate-500"><X size={20} /></button></div>
      <div className="app-dialog-body space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Código"><input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="T-01" title="Opcional, pero no se puede repetir" className={campo} /></Campo>
          <div className="sm:col-span-2"><Campo etiqueta="Nombre"><input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo" className={campo} /></Campo></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Puesto"><input value={puesto} onChange={e => setPuesto(e.target.value)} placeholder="Ej. Técnico" className={campo} /></Campo>
          <Campo etiqueta="Ingreso"><input type="date" value={ingreso} onChange={e => setIngreso(e.target.value)} className={campo} /></Campo>
        </div>
        <Campo etiqueta="Jornada"><div className="relative"><select value={jornada} onChange={e => setJornada(e.target.value)} className={`${campo} appearance-none pr-7`}>{JORNADAS.map(j => <option key={j.valor} value={j.valor}>{j.etiqueta}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" /></div></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Correo para Viáticos"><input type="email" autoComplete="off" value={correoViaticos} onChange={e => setCorreoViaticos(e.target.value)} placeholder="tecnico@empresa.com" className={campo} /></Campo>
          <Campo etiqueta="Contraseña de acceso"><input type="password" autoComplete="new-password" value={claveViaticos} onChange={e => setClaveViaticos(e.target.value)} placeholder="Solo para crear la cuenta" className={campo} /></Campo>
        </div>
        <p className="text-xs text-slate-500">La contraseña crea la cuenta en Supabase Auth y no se guarda en Personal. Déjala vacía si la cuenta ya existe. El técnico debe confirmar su correo si Supabase lo solicita.</p>
        {personalGuardado && <p className="text-xs font-bold text-amber-700">El personal ya quedó guardado. Este intento solo volverá a crear el acceso; para cambiar otros datos, edita la persona después.</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCerrar} className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-600">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando || !nombre.trim()} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-xs font-semibold text-white disabled:opacity-40">{guardando && <Loader2 size={13} className="animate-spin" />} Guardar</button>
        </div>
      </div>
    </div>
  </Dialogo>
}

function Campo({ etiqueta, children }) {
  return <div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{etiqueta}</label>{children}</div>
}
