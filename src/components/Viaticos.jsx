import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, CheckCircle, FileDown, LogOut, Plus, ReceiptText, Wallet } from 'lucide-react'
import { supabase } from '../supabase.jsx'
import { comprimirFactura, CONCEPTOS_VIATICOS, quetzales, resumenViaticos } from '../utils/viaticos.js'
import { mensajeErrorIngresoViaticos } from '../utils/accesoViaticos.js'
import { descargarReciboEfectivo, estadoRecepcion } from '../utils/reciboViaticos.js'

const hoy = () => {
  const fecha = new Date()
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}
const campo = 'w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900'
const etiqueta = 'grid gap-1 text-xs font-bold text-slate-700'
const fechaVisible = valor => valor ? valor.split('-').reverse().join('/') : '—'

async function leerTodo(tabla, columnas, orden, empleadoId = null) {
  const filas = []
  for (let inicio = 0; ; inicio += 1000) {
    let consulta = supabase.from(tabla).select(columnas)
    if (empleadoId) consulta = consulta.eq('empleado_id', empleadoId)
    const { data, error } = await consulta.order(orden, { ascending: false }).order('id', { ascending: false }).range(inicio, inicio + 999)
    if (error) throw error
    filas.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return filas
}

export default function Viaticos({ portal = false }) {
  const [sesion, setSesion] = useState(undefined)
  const [rol, setRol] = useState('')
  const [usuarioRolId, setUsuarioRolId] = useState(null)
  const [persona, setPersona] = useState(null)
  const [empleados, setEmpleados] = useState([])
  const [entregas, setEntregas] = useState([])
  const [gastos, setGastos] = useState([])
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [filtroPersona, setFiltroPersona] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [vista, setVista] = useState('factura')
  const [entrega, setEntrega] = useState({ empleado_id: '', fecha: hoy(), monto: '', medio: 'Transferencia', referencia: '', observaciones: '' })
  const [gasto, setGasto] = useState({ empleado_id: '', fecha: hoy(), negocio: '', monto: '', concepto: 'Desayuno', departamento: '', municipio: '', observaciones: '' })
  const [foto, setFoto] = useState(null)
  const [fotoTransferencia, setFotoTransferencia] = useState(null)
  const [instalacion, setInstalacion] = useState(null)
  const cargaActual = useRef(0)

  useEffect(() => {
    const ofrecerInstalacion = evento => { evento.preventDefault(); setInstalacion(evento) }
    const instalada = () => setInstalacion(null)
    window.addEventListener('beforeinstallprompt', ofrecerInstalacion)
    window.addEventListener('appinstalled', instalada)
    return () => {
      window.removeEventListener('beforeinstallprompt', ofrecerInstalacion)
      window.removeEventListener('appinstalled', instalada)
    }
  }, [])

  async function instalarApp() {
    if (!instalacion) return
    await instalacion.prompt()
    await instalacion.userChoice
    setInstalacion(null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error: fallo }) => {
      if (fallo) setError(fallo.message)
      setSesion(data?.session || null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento, actual) => setSesion(actual))
    return () => subscription.unsubscribe()
  }, [])

  const cargar = useCallback(async (actual) => {
    const consulta = ++cargaActual.current
    if (!actual) { setRol(''); setUsuarioRolId(null); setPersona(null); return }
    setError('')
    try {
      const { data: admin, error: errorRol } = await supabase.from('viaticos_admins').select('user_id').eq('user_id', actual.user.id).maybeSingle()
      if (consulta !== cargaActual.current) return
      if (errorRol) throw errorRol
      const esAdmin = Boolean(admin)
      let consultaPersonal = supabase.from('vac_empleados').select('id,nombre,puesto,activo,correo_viaticos')
      if (!esAdmin) consultaPersonal = consultaPersonal.ilike('correo_viaticos', actual.user.email || '')
      const { data: personal, error: errorPersonal } = await consultaPersonal.order('nombre')
      if (consulta !== cargaActual.current) return
      if (errorPersonal) throw errorPersonal
      const propios = (personal || []).filter(e => e.correo_viaticos?.toLowerCase() === actual.user.email?.toLowerCase())
      if (!esAdmin && propios.length !== 1) {
        setRol('sin-personal')
        setUsuarioRolId(actual.user.id)
        setError('Este correo no está asociado a una persona en Personal. Revisa el correo registrado allí.')
        return
      }
      setRol(esAdmin ? 'admin' : 'tecnico')
      setUsuarioRolId(actual.user.id)
      setPersona(esAdmin ? null : propios[0])
      setEmpleados(esAdmin ? personal || [] : propios)
      if (!esAdmin) {
        const propias = await leerTodo('viaticos_entregas', 'id,empleado_id,fecha,monto,medio,referencia,observaciones,comprobante_ruta,comprobante_nombre,recibido_en,recibido_por,recibido_nombre', 'fecha', propios[0].id)
        if (consulta !== cargaActual.current) return
        setEntregas(propias)
        setGastos([])
        return
      }
      const [listaEntregas, listaGastos] = await Promise.all([
        leerTodo('viaticos_entregas', '*', 'fecha'),
        leerTodo('viaticos_gastos', '*', 'fecha'),
      ])
      if (consulta !== cargaActual.current) return
      setEntregas(listaEntregas)
      setGastos(listaGastos)
    } catch (fallo) {
      if (consulta === cargaActual.current) setError(`No se pudieron cargar Viáticos: ${fallo.message}. Comprueba que activaste el script de Supabase.`)
    }
  }, [])
  useEffect(() => { cargar(sesion) }, [sesion?.user?.id, cargar])

  const empleadosActivos = empleados.filter(e => e.activo !== false && (rol === 'admin' || e.id === persona?.id))
  const empleadoFormulario = rol === 'admin' ? '' : persona?.id || ''
  const rango = item => (!desde || item.fecha >= desde) && (!hasta || item.fecha <= hasta)
  const entregasVisibles = entregas.filter(item => rango(item) && (!filtroPersona || item.empleado_id === filtroPersona))
  const gastosVisibles = gastos.filter(item => rango(item) && (!filtroPersona || item.empleado_id === filtroPersona))
  const personasVisibles = empleados.filter(e => !filtroPersona || e.id === filtroPersona)
  const resumen = useMemo(() => resumenViaticos(personasVisibles, entregasVisibles, gastosVisibles), [empleados, filtroPersona, entregas, gastos, desde, hasta])
  const totales = resumen.reduce((a, e) => ({ entregado: a.entregado + e.totalEntregado, gastado: a.gastado + e.totalGastado, sinRespaldo: a.sinRespaldo + e.sinRespaldo, disponible: a.disponible + e.saldoDisponible, aFavorTecnicos: a.aFavorTecnicos + e.saldoAFavorTecnico }), { entregado: 0, gastado: 0, sinRespaldo: 0, disponible: 0, aFavorTecnicos: 0 })
  const saldoPendienteTecnico = resumenViaticos(empleados.filter(e => e.id === entrega.empleado_id), entregas, gastos)[0]?.saldoAFavorTecnico || 0
  const sinFoto = gastosVisibles.filter(item => !item.foto_ruta)
  const nombres = Object.fromEntries(empleados.map(e => [e.id, e.nombre]))

  async function entrar(evento) {
    evento.preventDefault()
    setOcupado(true); setError('')
    const { error: fallo } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave })
    if (fallo) setError(mensajeErrorIngresoViaticos(fallo))
    setClave('')
    setOcupado(false)
  }

  async function guardarEntrega(evento) {
    evento.preventDefault()
    if (rol !== 'admin') return
    const formulario = evento.currentTarget
    setOcupado(true); setError(''); setMensaje('')
    let ruta = null
    try {
      if (entrega.medio === 'Transferencia') {
        if (!fotoTransferencia) throw new Error('Adjunta una foto del comprobante de la transferencia.')
        if (!fotoTransferencia.type.startsWith('image/')) throw new Error('El comprobante de transferencia debe ser una foto.')
        const archivo = await comprimirFactura(fotoTransferencia)
        ruta = `transferencias/${entrega.empleado_id}/${crypto.randomUUID()}.jpg`
        const { error: errorFoto } = await supabase.storage.from('facturas-viaticos').upload(ruta, archivo, { contentType: archivo.type, upsert: false })
        if (errorFoto) throw errorFoto
      }
      const { error: fallo } = await supabase.from('viaticos_entregas').insert({
        ...entrega, empleado_id: entrega.empleado_id, monto: Number(entrega.monto), referencia: entrega.referencia.trim(), observaciones: entrega.observaciones.trim(),
        comprobante_ruta: ruta, comprobante_nombre: ruta ? fotoTransferencia.name : null,
      })
      if (fallo) throw fallo
      ruta = null
      setMensaje(entrega.medio === 'Efectivo' ? 'Entrega registrada. Ya puedes descargar el recibo; quedará pendiente hasta que el técnico confirme la recepción.' : 'Transferencia registrada con su foto. Falta la confirmación del técnico.')
      setEntrega({ empleado_id: '', fecha: hoy(), monto: '', medio: 'Transferencia', referencia: '', observaciones: '' })
      setFotoTransferencia(null)
      const entradaArchivo = formulario.querySelector('input[type="file"]')
      if (entradaArchivo) entradaArchivo.value = ''
      await cargar(sesion)
    } catch (fallo) {
      if (ruta) await supabase.storage.from('facturas-viaticos').remove([ruta])
      setError(fallo.message || 'No se pudo registrar la entrega.')
    } finally { setOcupado(false) }
  }

  async function confirmarEntrega(item) {
    if (rol !== 'tecnico' || item.empleado_id !== persona?.id) return
    if (!window.confirm(`Confirmo que recibí ${quetzales(item.monto)} por ${item.medio.toLowerCase()} el ${fechaVisible(item.fecha)}. ¿Registrar mi confirmación?`)) return
    setOcupado(true); setError(''); setMensaje('')
    try {
      const { error: fallo } = await supabase.rpc('confirmar_recepcion_viaticos', { p_entrega: item.id })
      if (fallo) throw fallo
      setMensaje('Recepción confirmada. Quedó registrada con tu usuario y la fecha actual.')
      await cargar(sesion)
    } catch (fallo) { setError(fallo.message || 'No se pudo confirmar la entrega.') }
    finally { setOcupado(false) }
  }

  async function abrirComprobanteEntrega(item) {
    if (!item.comprobante_ruta) return
    const { data, error: fallo } = await supabase.storage.from('facturas-viaticos').createSignedUrl(item.comprobante_ruta, 300)
    if (fallo) setError(fallo.message)
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function obtenerReciboEfectivo(item) {
    try { await descargarReciboEfectivo(item, nombres[item.empleado_id] || persona?.nombre || item.recibido_nombre) }
    catch (fallo) { setError(fallo.message || 'No se pudo generar el recibo.') }
  }

  async function guardarGasto(evento) {
    evento.preventDefault()
    if (rol !== 'admin' && rol !== 'tecnico') return
    const formulario = evento.currentTarget
    const empleado_id = rol === 'admin' ? gasto.empleado_id : empleadoFormulario
    if (!empleado_id) { setError('Selecciona al técnico.'); return }
    setOcupado(true); setError(''); setMensaje('')
    let ruta = null
    try {
      if (foto) {
        const archivo = await comprimirFactura(foto)
        ruta = `${empleado_id}/${crypto.randomUUID()}.${archivo.type === 'application/pdf' ? 'pdf' : 'jpg'}`
        const { error: errorFoto } = await supabase.storage.from('facturas-viaticos').upload(ruta, archivo, { contentType: archivo.type, upsert: false })
        if (errorFoto) throw errorFoto
      }
      const { error: fallo } = await supabase.from('viaticos_gastos').insert({
        ...gasto, empleado_id, monto: Number(gasto.monto), negocio: gasto.negocio.trim(), departamento: gasto.departamento.trim(), municipio: gasto.municipio.trim(),
        observaciones: gasto.observaciones.trim(), foto_ruta: ruta, foto_nombre: foto?.name || null,
      })
      if (fallo) throw fallo
      setGasto({ empleado_id: '', fecha: hoy(), negocio: '', monto: '', concepto: 'Desayuno', departamento: '', municipio: '', observaciones: '' })
      setFoto(null)
      formulario.querySelector('input[type="file"]').value = ''
      setMensaje('Factura o gasto registrado.')
      await cargar(sesion)
    } catch (fallo) {
      if (ruta) await supabase.storage.from('facturas-viaticos').remove([ruta])
      setError(fallo.message || 'No se pudo guardar el gasto.')
    } finally { setOcupado(false) }
  }

  async function abrirFoto(item) {
    const { data, error: fallo } = await supabase.storage.from('facturas-viaticos').createSignedUrl(item.foto_ruta, 300)
    if (fallo) setError(fallo.message)
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function adjuntarPendiente(item, archivo) {
    if (!archivo) return
    setOcupado(true); setError(''); setMensaje('')
    let ruta = null
    try {
      const comprimido = await comprimirFactura(archivo)
      ruta = `${item.empleado_id}/${crypto.randomUUID()}.${comprimido.type === 'application/pdf' ? 'pdf' : 'jpg'}`
      const { error: errorFoto } = await supabase.storage.from('facturas-viaticos').upload(ruta, comprimido, { contentType: comprimido.type, upsert: false })
      if (errorFoto) throw errorFoto
      const { error: errorVinculo } = await supabase.rpc('adjuntar_comprobante_viaticos', { p_gasto: item.id, p_ruta: ruta, p_nombre: archivo.name })
      if (errorVinculo) throw errorVinculo
      setMensaje('Comprobante agregado al gasto existente.')
      await cargar(sesion)
    } catch (fallo) {
      if (ruta) await supabase.storage.from('facturas-viaticos').remove([ruta])
      setError(fallo.message || 'No se pudo adjuntar el comprobante.')
    } finally { setOcupado(false) }
  }

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#viaticos`)
      setMensaje('Enlace del portal copiado. Puedes enviarlo a los técnicos.')
    } catch { setError('No se pudo copiar el enlace. Abre esta página con #viaticos al final de la dirección.') }
  }

  const fechaArchivo = `${desde || 'todo'}_${hasta || hoy()}`
  async function exportarExcel() {
    if (rol !== 'admin') return
    setOcupado(true); setError('')
    try {
      const ExcelJS = (await import('exceljs')).default
      const libro = new ExcelJS.Workbook()
      libro.creator = 'Ticket Manager · Viáticos'
      const agregarHoja = (nombre, columnas, filas) => {
        const hoja = libro.addWorksheet(nombre)
        hoja.columns = columnas.map(([header, key, width]) => ({ header, key, width }))
        hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
        hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
        hoja.views = [{ state: 'frozen', ySplit: 1 }]
        hoja.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columnas.length)}1` }
        filas.forEach(fila => hoja.addRow(fila))
        return hoja
      }
      const moneda = '#,##0.00;[Red]-#,##0.00'
      const hojaResumen = agregarHoja('Resumen', [['Técnico','nombre',32],['Entregado GTQ','totalEntregado',18],['Gastado GTQ','totalGastado',18],['Sin foto GTQ','sinRespaldo',18],['Disponible GTQ','saldoDisponible',19],['A favor técnico GTQ','saldoAFavorTecnico',23],['Estado','estadoCuadre',25]], resumen)
      ;['B','C','D','E','F'].forEach(col => { hojaResumen.getColumn(col).numFmt = moneda })
      const hojaEntregas = agregarHoja('Entregas', [['Fecha','fecha',14],['Técnico','tecnico',32],['Monto GTQ','monto',18],['Medio','medio',18],['Referencia','referencia',25],['Comprobante','comprobante_nombre',32],['Recepción','recepcion',26],['Confirmó','recibido_nombre',32],['Confirmado en','recibido_en',28],['Observaciones','observaciones',45]], entregasVisibles.map(e => ({ ...e, tecnico: nombres[e.empleado_id] || '—', monto: Number(e.monto), comprobante_nombre: e.comprobante_nombre || '—', recepcion: estadoRecepcion(e), recibido_en: e.recibido_en ? new Date(e.recibido_en).toLocaleString('es-GT', { timeZone: 'America/Guatemala' }) : '—' })))
      hojaEntregas.getColumn('C').numFmt = moneda
      const hojaGastos = agregarHoja('Gastos y facturas', [['Fecha','fecha',14],['Técnico','tecnico',32],['Negocio','negocio',30],['Monto GTQ','monto',18],['Concepto','concepto',18],['Departamento','departamento',20],['Municipio','municipio',20],['Comprobante','foto_nombre',32],['Observaciones','observaciones',45]], gastosVisibles.map(e => ({ ...e, tecnico: nombres[e.empleado_id] || '—', monto: Number(e.monto), foto_nombre: e.foto_nombre || 'Sin foto' })))
      hojaGastos.getColumn('D').numFmt = moneda
      const buffer = await libro.xlsx.writeBuffer()
      descargarBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Viaticos_${fechaArchivo}.xlsx`)
    } catch (fallo) { setError(fallo.message || 'No se pudo generar el Excel.') } finally { setOcupado(false) }
  }

  async function exportarPDF() {
    if (rol !== 'admin') return
    setOcupado(true); setError('')
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
      const pdf = new jsPDF({ orientation: 'landscape' })
      pdf.setFontSize(17); pdf.text('CONTROL DE VIÁTICOS', 14, 17)
      pdf.setFontSize(10); pdf.text(`Período: ${desde || 'Inicio'} a ${hasta || hoy()} · Generado: ${new Date().toLocaleString('es-GT')}`, 14, 24)
      pdf.text(`Entregado: ${quetzales(totales.entregado)}    Gastado: ${quetzales(totales.gastado)}    Sin foto: ${quetzales(totales.sinRespaldo)}`, 14, 31)
      pdf.text(`Disponible: ${quetzales(totales.disponible)}    A favor de técnicos: ${quetzales(totales.aFavorTecnicos)}`, 14, 37)
      autoTable(pdf, { startY: 43, head: [['Técnico', 'Entregado', 'Gastado', 'Sin foto', 'Disponible', 'A favor técnico', 'Estado']], body: resumen.map(e => [e.nombre, quetzales(e.totalEntregado), quetzales(e.totalGastado), quetzales(e.sinRespaldo), quetzales(e.saldoDisponible), quetzales(e.saldoAFavorTecnico), e.estadoCuadre]), headStyles: { fillColor: [15, 23, 42] } })
      pdf.addPage(); pdf.setFontSize(13); pdf.text('Entregas de dinero', 14, 17)
      autoTable(pdf, { startY: 22, head: [['Fecha','Técnico','Monto','Medio','Referencia','Comprobante','Recepción','Confirmó','Fecha confirmación']], body: entregasVisibles.map(e => [fechaVisible(e.fecha), nombres[e.empleado_id] || '—', quetzales(e.monto), e.medio, e.referencia || '—', e.comprobante_nombre || '—', estadoRecepcion(e), e.recibido_nombre || '—', e.recibido_en ? new Date(e.recibido_en).toLocaleString('es-GT', { timeZone: 'America/Guatemala' }) : '—']), styles: { fontSize: 7 }, headStyles: { fillColor: [15, 23, 42] } })
      pdf.addPage(); pdf.setFontSize(13); pdf.text('Gastos y facturas', 14, 17)
      autoTable(pdf, { startY: 22, head: [['Fecha','Técnico','Negocio','Monto','Concepto','Departamento','Municipio','Comprobante']], body: gastosVisibles.map(e => [fechaVisible(e.fecha), nombres[e.empleado_id] || '—', e.negocio, quetzales(e.monto), e.concepto, e.departamento, e.municipio, e.foto_nombre || 'Sin foto']), styles: { fontSize: 7 }, headStyles: { fillColor: [15, 23, 42] } })
      pdf.save(`Viaticos_${fechaArchivo}.pdf`)
    } catch (fallo) { setError(fallo.message || 'No se pudo generar el PDF.') } finally { setOcupado(false) }
  }

  if (sesion === undefined) return <div className="card p-6 text-sm">Consultando acceso a Viáticos…</div>
  if (!sesion) return <section className="mx-auto max-w-md card p-6 sm:p-8">
    <img src="/icons/ticket-manager.svg" alt="" className="mb-4 h-14 w-14" />
    <h1 className="text-2xl font-black">Ticket Manager</h1>
    <p className="mt-2 text-sm text-slate-600">Inicia sesión. La cuenta administradora abre el panel completo; los técnicos pueden registrar facturas y confirmar sus entregas de viáticos.</p>
    <form onSubmit={entrar} className="mt-6 grid gap-4">
      <label className={etiqueta}>Correo<input type="email" required autoComplete="username" className={campo} value={correo} onChange={e => setCorreo(e.target.value)} /></label>
      <label className={etiqueta}>Contraseña<input type="password" required autoComplete="current-password" className={campo} value={clave} onChange={e => setClave(e.target.value)} /></label>
      <button type="submit" disabled={ocupado} className="btn-primary disabled:opacity-50">{ocupado ? 'Ingresando…' : 'Ingresar'}</button>
    </form>
    {instalacion && <button type="button" onClick={instalarApp} className="btn-ghost mt-4 w-full">Instalar Ticket Manager</button>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
  </section>
  if (!rol || usuarioRolId !== sesion.user.id) return <section className="card p-6"><p className="text-sm">{error || 'Cargando datos de Viáticos…'}</p><button type="button" className="btn-ghost mt-3" onClick={() => supabase.auth.signOut()}>Salir</button></section>

  return <div className="space-y-5">
    <header className="rounded-2xl border-2 border-slate-900 bg-slate-950 p-5 text-white sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-widest text-sky-300">Ticket Manager · Viáticos</p><h1 className="mt-1 text-2xl font-black">{rol === 'admin' ? 'Dinero entregado y facturas' : 'Facturas y entregas recibidas'}</h1><p className="mt-2 text-sm text-slate-300">{rol === 'admin' ? 'Administración · todos los técnicos' : persona?.nombre || sesion.user.email}</p></div>
        <div className="flex flex-wrap gap-2">{instalacion && <button type="button" onClick={instalarApp} className="rounded-lg border border-white/30 px-3 py-2 text-sm">Instalar app</button>}{rol === 'admin' && <button type="button" onClick={copiarEnlace} className="rounded-lg border border-white/30 px-3 py-2 text-sm">Copiar enlace para técnicos</button>}{portal && rol === 'admin' && <a href={window.location.pathname} className="rounded-lg border border-white/30 px-3 py-2 text-sm">Volver al panel</a>}<button type="button" onClick={() => supabase.auth.signOut()} className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-3 py-2 text-sm"><LogOut size={15}/> Salir</button></div>
      </div>
    </header>
    {error && <p role="alert" className="rounded-lg border border-rose-400 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {mensaje && <p role="status" className="rounded-lg border border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-800">{mensaje}</p>}
    {rol === 'sin-personal' ? null : <>
      {rol === 'admin' && <>
      <section className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          {rol === 'admin' && <label className={etiqueta}>Técnico<select className={campo} value={filtroPersona} onChange={e => setFiltroPersona(e.target.value)}><option value="">Todos</option>{empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>}
          <label className={etiqueta}>Desde<input type="date" className={campo} value={desde} onChange={e => setDesde(e.target.value)}/></label>
          <label className={etiqueta}>Hasta<input type="date" className={campo} value={hasta} onChange={e => setHasta(e.target.value)}/></label>
          {rol === 'admin' && <div className="flex flex-wrap gap-2 sm:ml-auto"><button type="button" disabled={ocupado} onClick={exportarExcel} className="btn-ghost inline-flex items-center gap-2"><ArrowDownToLine size={15}/> Excel detallado</button><button type="button" disabled={ocupado} onClick={exportarPDF} className="btn-ghost inline-flex items-center gap-2"><FileDown size={15}/> PDF detallado</button></div>}
        </div>
      </section>
      {(desde || hasta) && <p className="text-xs text-slate-600">El cuadre y los reportes muestran solo el período filtrado. Para ver el saldo acumulado, limpia las fechas.</p>}
      <section aria-label="Cuadre de viáticos" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[['Entregado',totales.entregado,'text-sky-800'],['Gastado',totales.gastado,'text-amber-800'],['Gastos sin foto',totales.sinRespaldo,'text-rose-700'],['Disponible por comprobar',totales.disponible,'text-sky-800'],[rol === 'admin' ? 'A favor de técnicos' : 'A favor del técnico',totales.aFavorTecnicos,'text-emerald-800']].map(([nombre,valor,color]) => <div key={nombre} className="card p-4"><p className="text-xs font-bold uppercase text-slate-500">{nombre}</p><p className={`mt-1 text-2xl font-black ${color}`}>{quetzales(valor)}</p></div>)}
      </section>
      {rol === 'admin' && <section className="card-section overflow-x-auto">
        <h2 className="border-b border-slate-300 p-4 text-sm font-black">Cuadre por técnico</h2>
        <table className="w-full min-w-[820px] text-sm"><thead className="bg-slate-100"><tr>{['Técnico','Entregado','Gastado','Sin foto','Disponible','A favor técnico','Estado'].map(h => <th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{resumen.map(e => <tr key={e.id} className="border-t border-slate-300"><td className="p-3 font-bold">{e.nombre}</td><td className="p-3">{quetzales(e.totalEntregado)}</td><td className="p-3">{quetzales(e.totalGastado)}</td><td className="p-3 text-rose-700">{quetzales(e.sinRespaldo)}</td><td className="p-3 font-bold text-sky-800">{quetzales(e.saldoDisponible)}</td><td className="p-3 font-black text-emerald-800">{quetzales(e.saldoAFavorTecnico)}</td><td className="p-3">{e.estadoCuadre}</td></tr>)}</tbody></table>
      </section>}
      <div className="flex flex-wrap gap-2">{rol === 'admin' && <button type="button" onClick={() => setVista('entrega')} className={vista === 'entrega' ? 'btn-primary' : 'btn-ghost'}><Wallet size={14} className="mr-1 inline"/> Nueva entrega</button>}<button type="button" onClick={() => setVista('factura')} className={vista === 'factura' ? 'btn-primary' : 'btn-ghost'}><ReceiptText size={14} className="mr-1 inline"/> Nueva factura o gasto</button></div>
      {vista === 'entrega' && rol === 'admin' && <form onSubmit={guardarEntrega} className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="sm:col-span-2 lg:col-span-3 text-lg font-black">Registrar dinero entregado</h2>
        <label className={etiqueta}>Técnico<select required className={campo} value={entrega.empleado_id} onChange={e => setEntrega(p => ({ ...p, empleado_id: e.target.value }))}><option value="">Seleccionar</option>{empleadosActivos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>
        {saldoPendienteTecnico > 0 && <div className="rounded-lg border border-emerald-500 bg-emerald-50 p-3 text-sm text-emerald-950 sm:col-span-2 lg:col-span-3">A favor del técnico: <strong>{quetzales(saldoPendienteTecnico)}</strong>. Una nueva entrega reduce este saldo; puedes hacerla parcial o completa. <button type="button" className="ml-2 font-bold underline" onClick={() => setEntrega(p => ({ ...p, monto: saldoPendienteTecnico.toFixed(2) }))}>Usar este monto</button></div>}
        <label className={etiqueta}>Fecha<input required type="date" className={campo} value={entrega.fecha} onChange={e => setEntrega(p => ({ ...p, fecha: e.target.value }))}/></label>
        <label className={etiqueta}>Cantidad entregada · GTQ<input required min="0.01" step="0.01" type="number" className={campo} value={entrega.monto} onChange={e => setEntrega(p => ({ ...p, monto: e.target.value }))}/></label>
        <label className={etiqueta}>Medio<select className={campo} value={entrega.medio} onChange={e => { setEntrega(p => ({ ...p, medio: e.target.value })); setFotoTransferencia(null) }}><option>Transferencia</option><option>Efectivo</option></select></label>
        {entrega.medio === 'Transferencia' && <label className={etiqueta}>Foto de la transferencia *<input required type="file" accept="image/*" className={campo} onChange={e => setFotoTransferencia(e.target.files?.[0] || null)}/><span className="font-normal text-slate-500">Se comprime para conservar claridad sin subir un archivo demasiado grande.</span></label>}
        {entrega.medio === 'Transferencia' && <label className={etiqueta}>Referencia de transferencia<input className={campo} value={entrega.referencia} onChange={e => setEntrega(p => ({ ...p, referencia: e.target.value }))}/></label>}
        <label className={etiqueta}>Observaciones<input className={campo} value={entrega.observaciones} onChange={e => setEntrega(p => ({ ...p, observaciones: e.target.value }))}/></label>
        <p className="text-xs text-slate-600 sm:col-span-2 lg:col-span-3">{entrega.medio === 'Efectivo' ? 'Después de guardar podrás descargar un recibo de efectivo. El técnico debe confirmar la recepción desde su acceso.' : 'La foto es obligatoria y el técnico deberá confirmar que recibió la transferencia.'}</p>
        <button disabled={ocupado} className="btn-primary sm:col-span-2 lg:col-span-3"><Plus size={14} className="mr-1 inline"/> Guardar entrega</button>
      </form>}
      </>}
      {rol === 'tecnico' && <section className="card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-black">Mis entregas de viáticos</h2><span className="text-xs font-bold text-amber-700">{entregas.filter(item => !item.recibido_en).length} por confirmar</span></div>
        {!entregas.length && <p className="text-sm text-slate-600">Todavía no tienes entregas registradas.</p>}
        <div className="grid gap-3 sm:grid-cols-2">{[...entregas].sort((a, b) => Number(Boolean(a.recibido_en)) - Number(Boolean(b.recibido_en)) || String(b.fecha).localeCompare(String(a.fecha))).map(item => <article key={item.id} className="rounded-xl border-2 border-slate-300 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold text-slate-500">{fechaVisible(item.fecha)} · {item.medio}</p><p className="mt-1 text-xl font-black text-slate-900">{quetzales(item.monto)}</p></div><span className={`rounded-lg px-2 py-1 text-xs font-bold ${item.recibido_en ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{estadoRecepcion(item)}</span></div>
          {item.referencia && <p className="mt-2 text-xs text-slate-600">Referencia: {item.referencia}</p>}
          {item.observaciones && <p className="mt-1 text-xs text-slate-600">{item.observaciones}</p>}
          {item.comprobante_ruta && <button type="button" onClick={() => abrirComprobanteEntrega(item)} className="mt-2 text-xs font-bold text-sky-700 underline">Ver foto de la transferencia</button>}
          {item.recibido_en ? <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle size={14}/> Confirmado el {new Date(item.recibido_en).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}</p> : <button type="button" disabled={ocupado} onClick={() => confirmarEntrega(item)} className="btn-primary mt-3 w-full disabled:opacity-50">Confirmar que recibí {quetzales(item.monto)}</button>}
          {item.medio === 'Efectivo' && <button type="button" onClick={() => obtenerReciboEfectivo(item)} className="btn-ghost mt-2 w-full"><FileDown size={14} className="mr-1 inline"/> Descargar recibo</button>}
        </article>)}</div>
      </section>}
      {rol === 'tecnico' && <p className="text-sm text-slate-600">Completa los datos del gasto y adjunta una foto clara de la factura o un PDF.</p>}
      {(rol === 'tecnico' || vista === 'factura') && <form onSubmit={guardarGasto} className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="sm:col-span-2 lg:col-span-3 text-lg font-black">Registrar factura o gasto</h2>
        {rol === 'admin' && <label className={etiqueta}>Técnico<select required className={campo} value={gasto.empleado_id} onChange={e => setGasto(p => ({ ...p, empleado_id: e.target.value }))}><option value="">Seleccionar</option>{empleadosActivos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>}
        <label className={etiqueta}>Negocio<input required className={campo} value={gasto.negocio} onChange={e => setGasto(p => ({ ...p, negocio: e.target.value }))}/></label>
        <label className={etiqueta}>Cantidad · GTQ<input required min="0.01" step="0.01" type="number" className={campo} value={gasto.monto} onChange={e => setGasto(p => ({ ...p, monto: e.target.value }))}/></label>
        <label className={etiqueta}>Concepto<select required className={campo} value={gasto.concepto} onChange={e => setGasto(p => ({ ...p, concepto: e.target.value }))}>{CONCEPTOS_VIATICOS.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className={etiqueta}>Fecha<input required type="date" className={campo} value={gasto.fecha} onChange={e => setGasto(p => ({ ...p, fecha: e.target.value }))}/></label>
        <label className={etiqueta}>Departamento<input required className={campo} value={gasto.departamento} onChange={e => setGasto(p => ({ ...p, departamento: e.target.value }))}/></label>
        <label className={etiqueta}>Municipio<input required className={campo} value={gasto.municipio} onChange={e => setGasto(p => ({ ...p, municipio: e.target.value }))}/></label>
        <label className={etiqueta}>Foto de factura o PDF<input type="file" accept="image/*,application/pdf" capture="environment" className={campo} onChange={e => setFoto(e.target.files?.[0] || null)}/><span className="font-normal text-slate-500">Las fotos se reducen hasta 2000 px conservando claridad.</span></label>
        <label className={etiqueta}>Observaciones<input className={campo} value={gasto.observaciones} onChange={e => setGasto(p => ({ ...p, observaciones: e.target.value }))}/></label>
        <button disabled={ocupado} className="btn-primary sm:col-span-2 lg:col-span-3"><Plus size={14} className="mr-1 inline"/> Guardar factura o gasto</button>
      </form>}
      {rol === 'admin' && <>
      <section className="card-section overflow-x-auto"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 p-4"><h2 className="font-black">Gastos y facturas ({gastosVisibles.length})</h2>{sinFoto.length > 0 && <span className="text-xs font-bold text-amber-700">{sinFoto.length} sin foto</span>}</div><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-100"><tr>{['Fecha','Técnico','Negocio','Concepto','Ubicación','Monto','Comprobante'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{gastosVisibles.map(item => <tr key={item.id} className="border-t border-slate-300"><td className="p-3">{fechaVisible(item.fecha)}</td><td className="p-3">{nombres[item.empleado_id] || '—'}</td><td className="p-3 font-bold">{item.negocio}</td><td className="p-3">{item.concepto}</td><td className="p-3">{item.municipio}, {item.departamento}</td><td className="p-3 font-bold">{quetzales(item.monto)}</td><td className="p-3">{item.foto_ruta ? <button type="button" onClick={() => abrirFoto(item)} className="text-sky-700 underline">{item.foto_nombre || 'Ver factura'}</button> : <label className="cursor-pointer text-amber-700 underline">Adjuntar foto<input type="file" accept="image/*,application/pdf" className="sr-only" disabled={ocupado} onChange={e => { adjuntarPendiente(item, e.target.files?.[0]); e.target.value = '' }}/></label>}</td></tr>)}</tbody></table>{!gastosVisibles.length && <p className="p-5 text-sm text-slate-500">Aún no hay gastos para este filtro.</p>}</section>
      <section className="card-section overflow-x-auto"><h2 className="border-b border-slate-300 p-4 font-black">Dinero entregado ({entregasVisibles.length})</h2><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-100"><tr>{['Fecha','Técnico','Medio','Referencia','Monto','Comprobante','Recepción','Recibo','Observaciones'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{entregasVisibles.map(item => <tr key={item.id} className="border-t border-slate-300"><td className="p-3">{fechaVisible(item.fecha)}</td><td className="p-3">{nombres[item.empleado_id] || '—'}</td><td className="p-3">{item.medio}</td><td className="p-3">{item.referencia || '—'}</td><td className="p-3 font-bold">{quetzales(item.monto)}</td><td className="p-3">{item.comprobante_ruta ? <button type="button" onClick={() => abrirComprobanteEntrega(item)} className="text-sky-700 underline">{item.comprobante_nombre || 'Ver foto'}</button> : item.medio === 'Transferencia' ? <span className="font-semibold text-amber-700">Sin foto (registro anterior)</span> : '—'}</td><td className="p-3"><span className={item.recibido_en ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>{estadoRecepcion(item)}</span>{item.recibido_en && <span className="block text-xs text-slate-600">{item.recibido_nombre || 'Técnico'} · {new Date(item.recibido_en).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}</span>}</td><td className="p-3">{item.medio === 'Efectivo' ? <button type="button" onClick={() => obtenerReciboEfectivo(item)} className="text-sky-700 underline">Descargar PDF</button> : '—'}</td><td className="p-3">{item.observaciones || '—'}</td></tr>)}</tbody></table>{!entregasVisibles.length && <p className="p-5 text-sm text-slate-500">Aún no hay entregas para este filtro.</p>}</section>
      </>}
      {portal && <p className="text-center text-xs text-slate-500">Portal de viáticos · {sesion.user.email}</p>}
    </>}
  </div>
}

function descargarBlob(blob, nombre) {
  const enlace = document.createElement('a')
  const url = URL.createObjectURL(blob)
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
