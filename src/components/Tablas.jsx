import { useState, useRef, useMemo } from 'react'
import { Calendar, BarChart2, Copy, X } from 'lucide-react'

function normalizarTexto(texto) {
  if (!texto) return ''
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
}

export default function ModuloTablas({ allTickets, rutasTecnicos, setRutasTecnicos, rutasAutomaticas, valorRutaTecnico }) {
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [toast, setToast] = useState(null)
  const [modalDetalles, setModalDetalles] = useState(null)

  const tablaFinalizadasRef = useRef()
  const tablaEnvejecimientoRef = useRef()

  function handleRutaChange(tecnico, valor) {
    setRutasTecnicos(prev => ({ ...prev, [tecnico]: valor }))
  }

  function copiarTablaAlPortapapeles(ref, nombreTabla) {
    if (!ref.current) return
    try {
      const range = document.createRange()
      range.selectNode(ref.current)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      document.execCommand('copy')
      selection.removeAllRanges()
      setToast(`✅ ${nombreTabla} copiada`)
      setTimeout(() => setToast(null), 2500)
    } catch (err) {
      setToast('❌ Error al copiar')
      setTimeout(() => setToast(null), 2500)
    }
  }

  // ── TABLA 1: FINALIZADAS ──
  const ticketsFinalizados = allTickets.filter(t => {
    if (!t.ESTADO_LIMPIO.includes('FINALIZADA')) return false
    if (!t.FECHA_OBJ || !fechaInicio || !fechaFin) return true
    const start = new Date(fechaInicio + 'T00:00:00')
    const end = new Date(fechaFin + 'T23:59:59')
    return new Date(t.FECHA_OBJ) >= start && new Date(t.FECHA_OBJ) <= end
  })

  const columnasFechas = Array.from(new Set(ticketsFinalizados.map(t => t.FECHA_TEXTO)))
    .sort((a, b) => {
      const pA = a.split('/'); const pB = b.split('/')
      return new Date(pA[2], pA[1]-1, pA[0]) - new Date(pB[2], pB[1]-1, pB[0])
    })

  const listaTecnicosFinalizados = Array.from(new Set(ticketsFinalizados.map(t => t.tecnico))).sort()

  const matrizFinalizadas = {}
  listaTecnicosFinalizados.forEach(tec => {
    matrizFinalizadas[tec] = { totales: 0 }
    columnasFechas.forEach(f => { matrizFinalizadas[tec][f] = { count: 0, detalles: [] } })
  })

  ticketsFinalizados.forEach(t => {
    if (matrizFinalizadas[t.tecnico]) {
      matrizFinalizadas[t.tecnico][t.FECHA_TEXTO].count++
      matrizFinalizadas[t.tecnico][t.FECHA_TEXTO].detalles.push({
        referencia: t['N° REFERENCIA'] || '-',
        negocio: t['NEGOCIO'] || '-',
        direccion: t['DIRECCIÓN'] || '-'
      })
      matrizFinalizadas[t.tecnico].totales++
    }
  })

  const totalesFecha = {}
  let granTotalFinalizadas = 0
  columnasFechas.forEach(f => {
    totalesFecha[f] = listaTecnicosFinalizados.reduce((sum, tec) => sum + (matrizFinalizadas[tec][f].count || 0), 0)
    granTotalFinalizadas += totalesFecha[f]
  })

  // ── TABLA 2: ENVEJECIMIENTO ──
  const ticketsActivos = allTickets.filter(t => 
    t.ESTADO_LIMPIO.includes('TECNICO') || t.ESTADO_LIMPIO.includes('PROCESO') || t.ESTADO_LIMPIO.includes('AGENCIA')
  ).map(t => {
    let tec = t.tecnico
    if (tec === 'SIN TÉCNICO' || !tec || tec === '-') tec = 'SIN ASIGNAR'
    return { ...t, tecnico: tec }
  })

  const listaTecnicosActivos = Array.from(new Set(ticketsActivos.map(t => t.tecnico))).sort()
  const matrizEnvejecimiento = {}
  listaTecnicosActivos.forEach(tec => {
    matrizEnvejecimiento[tec] = {
      menos24: { count: 0, detalles: [] },
      mas24: { count: 0, detalles: [] },
      mas72: { count: 0, detalles: [] },
      mas100: { count: 0, detalles: [] },
      total: { count: 0, detalles: [] }
    }
  })

  ticketsActivos.forEach(t => {
    const horas = parseFloat(t['TIEMPO_TRANSCURRIDO']) || 0
    const tec = t.tecnico
    if (matrizEnvejecimiento[tec]) {
      const detalle = {
        referencia: t['N° REFERENCIA'] || '-',
        negocio: t['NEGOCIO'] || '-',
        direccion: t['DIRECCIÓN'] || '-',
        cliente: t['CLIENTE'] || '-',
        estado: t['ESTADO'] || '-',
        horas: Math.round(horas)
      }
      matrizEnvejecimiento[tec].total.count++
      matrizEnvejecimiento[tec].total.detalles.push(detalle)
      if (horas < 24) { matrizEnvejecimiento[tec].menos24.count++; matrizEnvejecimiento[tec].menos24.detalles.push(detalle) }
      else if (horas < 48) { matrizEnvejecimiento[tec].mas24.count++; matrizEnvejecimiento[tec].mas24.detalles.push(detalle) }
      else if (horas < 72) { matrizEnvejecimiento[tec].mas72.count++; matrizEnvejecimiento[tec].mas72.detalles.push(detalle) }
      else { matrizEnvejecimiento[tec].mas100.count++; matrizEnvejecimiento[tec].mas100.detalles.push(detalle) }
    }
  })

  const totalesEnv = { menos24: 0, mas24: 0, mas72: 0, mas100: 0, total: 0 }
  listaTecnicosActivos.forEach(tec => {
    totalesEnv.menos24 += matrizEnvejecimiento[tec].menos24.count
    totalesEnv.mas24 += matrizEnvejecimiento[tec].mas24.count
    totalesEnv.mas72 += matrizEnvejecimiento[tec].mas72.count
    totalesEnv.mas100 += matrizEnvejecimiento[tec].mas100.count
    totalesEnv.total += matrizEnvejecimiento[tec].total.count
  })

  if (allTickets.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 card">
        <BarChart2 size={48} className="mx-auto mb-3 text-slate-300" />
        <p className="text-sm font-semibold text-slate-500">Sube un archivo en la pestaña "Técnicos"</p>
        <p className="text-xs font-medium mt-1 text-slate-400">Las tablas se generarán automáticamente.</p>
      </div>
    )
  }

  // Helper: celda clickeable del envejecimiento
  const EnvCell = ({ data, tec, label, colorText, colorBg, colorHover }) => (
    <td
      onClick={() => { if (data.count > 0) setModalDetalles({ tec, fecha: label, detalles: data.detalles }) }}
      className={`px-3 py-2 text-center text-xs font-black whitespace-nowrap border-r-2 border-r-black ${colorText} ${colorBg} ${data.count > 0 ? `${colorHover} cursor-pointer` : ''}`}
    >
      {data.count === 0 ? '-' : data.count}
    </td>
  )

  return (
    <div className="space-y-4 fade-in relative">
      
      {/* Toast */}
      {toast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-xl toast-enter">
          {toast}
        </div>
      )}

      {/* Modal de detalles */}
      {modalDetalles && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto" onClick={() => setModalDetalles(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden slide-up" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-800 px-4 py-2.5 flex justify-between items-center">
              <h3 className="text-white font-bold text-xs uppercase tracking-wider">
                {modalDetalles.tec} <span className="text-slate-400 font-normal">· {modalDetalles.fecha}</span>
                <span className="text-sky-400 font-normal ml-2">({modalDetalles.detalles.length})</span>
              </h3>
              <button onClick={() => setModalDetalles(null)} className="text-slate-400 hover:text-white transition p-1 rounded-md hover:bg-slate-700"><X size={14}/></button>
            </div>
            <div className="p-2.5 max-h-[75vh] overflow-y-auto space-y-1.5 bg-slate-50">
              {modalDetalles.detalles.map((det, idx) => {
                const dirCorta = det.direccion.length > 75 ? det.direccion.substring(0, 75) + '...' : det.direccion
                return (
                  <div key={idx} className="bg-white border border-slate-100 px-3 py-2 rounded-lg space-y-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center gap-2">
                      {det.referencia && det.referencia !== '-' && (
                        <span className="font-mono text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100">#{det.referencia}</span>
                      )}
                      <span className="font-bold text-slate-700 text-[11px] uppercase leading-tight">{det.negocio}</span>
                    </div>
                    <p className="font-medium text-slate-400 text-[10px]">📍 {dirCorta}</p>
                    {det.cliente && det.cliente !== '-' && <p className="font-medium text-slate-400 text-[10px]">👤 {det.cliente}</p>}
                    {det.horas !== undefined && (
                      <p className="font-semibold text-[10px]" style={{ color: det.horas >= 72 ? '#be123c' : det.horas >= 48 ? '#c2410c' : det.horas >= 24 ? '#b45309' : '#15803d' }}>
                        ⏱ {det.horas} hrs — {det.estado}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Controles de fecha ── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800">
          <div className="text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Calendar size={12} /> Rango de Cierre — Finalizadas
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { const h = new Date().toISOString().split('T')[0]; setFechaInicio(h); setFechaFin(h) }} className="text-[9px] font-semibold text-slate-300 hover:text-white px-2 py-0.5 rounded hover:bg-slate-700 transition">Hoy</button>
            <button onClick={() => {
              const h = new Date(); const l = new Date(h); l.setDate(h.getDate() - h.getDay())
              setFechaInicio(l.toISOString().split('T')[0]); setFechaFin(h.toISOString().split('T')[0])
            }} className="text-[9px] font-semibold text-slate-300 hover:text-white px-2 py-0.5 rounded hover:bg-slate-700 transition">Semana</button>
            <button onClick={() => {
              const h = new Date(); const p = new Date(h.getFullYear(), h.getMonth(), 1)
              setFechaInicio(p.toISOString().split('T')[0]); setFechaFin(h.toISOString().split('T')[0])
            }} className="text-[9px] font-semibold text-slate-300 hover:text-white px-2 py-0.5 rounded hover:bg-slate-700 transition">Mes</button>
            <button onClick={() => { setFechaInicio(''); setFechaFin('') }} className="text-[9px] font-semibold text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-700 transition">Todo</button>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-white">
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100 transition" />
          <span className="text-slate-300 font-bold text-xs">→</span>
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100 transition" />
          {(fechaInicio || fechaFin) && (
            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              {granTotalFinalizadas} resultado{granTotalFinalizadas !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── TABLA 1: CONTROL DE PRODUCTIVIDAD ── */}
      <div>
        <div ref={tablaFinalizadasRef} className="card-section">
          <div className="px-4 py-2.5 bg-slate-800">
            <div className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
              Control de Productividad de Técnicos
              <span className="text-slate-400 font-normal ml-1">({granTotalFinalizadas})</span>
            </div>
          </div>
          <div className="overflow-x-auto bg-white">
            <table className="w-full border-collapse" style={{ tableLayout: columnasFechas.length <= 3 ? 'fixed' : 'auto' }}>
              {columnasFechas.length <= 3 && (
                <colgroup>
                  <col style={{ width: '200px' }} />
                  {columnasFechas.map(f => <col key={f} style={{ width: '100px' }} />)}
                  <col style={{ width: '80px' }} />
                </colgroup>
              )}
              <thead>
                <tr className="bg-slate-700 text-white text-[10px] font-bold uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left border-r border-slate-600">Técnico</th>
                  {columnasFechas.map(f => <th key={f} className="px-3 py-2.5 text-center border-r border-slate-600 whitespace-nowrap">{f}</th>)}
                  <th className="px-3 py-2.5 text-center bg-slate-800 whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody>
                {listaTecnicosFinalizados.map((tec, idx) => (
                  <tr key={tec} className={`border-b-[3px] border-black ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'} hover:bg-sky-50 transition-colors`}>
                    <td className="px-3 py-2 text-[11px] uppercase font-black text-slate-800 border-r-2 border-r-black whitespace-nowrap">{tec}</td>
                    {columnasFechas.map(f => {
                      const d = matrizFinalizadas[tec][f]
                      return (
                        <td key={f}
                          onClick={() => { if (d.count > 0) setModalDetalles({ tec, fecha: f, detalles: d.detalles }) }}
                          className={`px-3 py-2 text-center text-xs font-black border-r-2 border-r-black whitespace-nowrap ${d.count > 0 ? 'text-sky-700 hover:bg-sky-100 cursor-pointer' : 'text-slate-300'}`}
                        >{d.count === 0 ? '-' : d.count}</td>
                      )
                    })}
                    <td className="px-3 py-2 text-center text-xs font-black text-slate-900 bg-slate-100/60 whitespace-nowrap">{matrizFinalizadas[tec].totales}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 text-white text-[11px] font-black">
                  <td className="px-3 py-2.5 uppercase text-right border-r border-slate-700">Total General</td>
                  {columnasFechas.map(f => <td key={f} className="px-3 py-2.5 text-center border-r border-slate-700 whitespace-nowrap">{totalesFecha[f]}</td>)}
                  <td className="px-3 py-2.5 text-center text-emerald-400 font-black text-sm whitespace-nowrap">{granTotalFinalizadas}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div className="flex justify-end mt-1.5">
          <button onClick={() => copiarTablaAlPortapapeles(tablaFinalizadasRef, 'Productividad')} className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 text-slate-400 hover:text-slate-700 hover:bg-white font-semibold rounded-md transition">
            <Copy size={11} /> Copiar tabla
          </button>
        </div>
      </div>

      {/* ── TABLA 2: RUTAS DE TÉCNICOS ── */}
      <div>
        <div ref={tablaEnvejecimientoRef} className="card-section">
          <div className="px-4 py-2.5 bg-slate-800">
            <div className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
              Rutas de Técnicos
              <span className="text-slate-400 font-normal ml-1">({totalesEnv.total})</span>
            </div>
          </div>
          <div className="overflow-x-auto bg-white">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr className="text-white text-[10px] font-bold uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left bg-slate-700 border-r border-slate-600 w-40">Técnico</th>
                  <th className="px-3 py-2.5 text-left bg-slate-700 border-r border-slate-600">Ruta de Trabajo</th>
                  <th className="px-3 py-2.5 text-center bg-emerald-600 border-r border-emerald-500 w-[60px]">-24h</th>
                  <th className="px-3 py-2.5 text-center bg-amber-500 border-r border-amber-400 w-[60px]">+24h</th>
                  <th className="px-3 py-2.5 text-center bg-red-600 border-r border-red-500 w-[60px]">+72h</th>
                  <th className="px-3 py-2.5 text-center bg-red-800 border-r border-red-700 w-[60px]">+100h</th>
                  <th className="px-3 py-2.5 text-center bg-slate-800 w-[60px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {listaTecnicosActivos.map((tec, idx) => {
                  const vr = valorRutaTecnico(tec)
                  return (
                    <tr key={tec} className={`border-b-[3px] border-black ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'} hover:bg-slate-100/60 transition-colors`}>
                      <td className="px-3 py-2 text-[11px] uppercase font-black text-slate-800 border-r-2 border-r-black whitespace-nowrap">{tec}</td>
                      <td className="p-0 align-top border-r-2 border-r-black">
                        <textarea
                          rows="2"
                          value={vr}
                          onChange={e => handleRutaChange(tec, e.target.value)}
                          placeholder="Sin ruta detectada"
                          className="w-full bg-transparent px-3 py-1.5 font-semibold text-sky-800 outline-none hover:bg-slate-50 focus:bg-white text-[10px] uppercase leading-tight resize-none"
                        />
                      </td>
                      <EnvCell data={matrizEnvejecimiento[tec].menos24} tec={tec} label="-24h" colorText="text-emerald-700" colorBg="" colorHover="hover:bg-emerald-50" />
                      <EnvCell data={matrizEnvejecimiento[tec].mas24} tec={tec} label="+24h" colorText="text-amber-700" colorBg="" colorHover="hover:bg-amber-50" />
                      <EnvCell data={matrizEnvejecimiento[tec].mas72} tec={tec} label="+72h" colorText="text-red-600" colorBg="" colorHover="hover:bg-red-50" />
                      <EnvCell data={matrizEnvejecimiento[tec].mas100} tec={tec} label="+100h" colorText="text-red-800" colorBg="" colorHover="hover:bg-red-50" />
                      <EnvCell data={matrizEnvejecimiento[tec].total} tec={tec} label="Todos" colorText="text-slate-800" colorBg="bg-slate-100/50" colorHover="hover:bg-slate-200/60" />
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 text-white text-[11px] font-black">
                  <td className="px-3 py-2.5 uppercase text-right border-r border-slate-700" colSpan="2">Total Operativo</td>
                  <td className="px-3 py-2.5 text-center text-emerald-400 font-black border-r border-slate-700">{totalesEnv.menos24}</td>
                  <td className="px-3 py-2.5 text-center text-amber-400 font-black border-r border-slate-700">{totalesEnv.mas24}</td>
                  <td className="px-3 py-2.5 text-center text-red-400 font-black border-r border-slate-700">{totalesEnv.mas72}</td>
                  <td className="px-3 py-2.5 text-center text-red-300 font-black border-r border-slate-700">{totalesEnv.mas100}</td>
                  <td className="px-3 py-2.5 text-center text-white font-black text-sm">{totalesEnv.total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div className="flex justify-end mt-1.5">
          <button onClick={() => copiarTablaAlPortapapeles(tablaEnvejecimientoRef, 'Rutas')} className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 text-slate-400 hover:text-slate-700 hover:bg-white font-semibold rounded-md transition">
            <Copy size={11} /> Copiar tabla
          </button>
        </div>
      </div>
    </div>
  )
}
