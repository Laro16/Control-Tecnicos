import { useState, useRef, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { Calendar, BarChart2, Copy, X, CheckCircle2 } from 'lucide-react'

function normalizarTexto(texto) {
  if (!texto) return ''
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
}

export default function ModuloTablas({ allTickets }) {
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  
  const [rutasTecnicos, setRutasTecnicos] = useState({})
  const [baseMunicipios, setBaseMunicipios] = useState([])

  const [toast, setToast] = useState(null)
  const [modalDetalles, setModalDetalles] = useState(null)

  const tablaFinalizadasRef = useRef()
  const tablaEnvejecimientoRef = useRef()

  // 1. Cargar Base de Rutas
  useEffect(() => {
    async function cargarRutasDelRepo() {
      try {
        const response = await fetch('/Rutas.xlsx')
        if (!response.ok) return
        const arrayBuffer = await response.arrayBuffer()
        const wb = XLSX.read(arrayBuffer, { type: 'array' })
        const nombreHoja = wb.SheetNames.includes('Hoja1') ? 'Hoja1' : wb.SheetNames[0]
        const ws = wb.Sheets[nombreHoja]
        const rawMatrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        
        let colIndex = -1
        let munis = new Set()

        for (let i = 0; i < rawMatrix.length; i++) {
          const rowNormalizada = rawMatrix[i].map(c => normalizarTexto(c))
          const idx = rowNormalizada.indexOf('DATOS')
          if (idx !== -1) {
            colIndex = idx
            for (let j = i + 1; j < rawMatrix.length; j++) {
              const cellVal = rawMatrix[j][colIndex]
              if (typeof cellVal === 'string' && cellVal.trim().length > 2) {
                munis.add(cellVal.trim())
              }
            }
            break
          }
        }
        setBaseMunicipios(Array.from(munis))
      } catch (error) {
        console.error('Error al cargar Rutas.xlsx:', error)
      }
    }
    cargarRutasDelRepo()
  }, [])

  function handleRutaChange(tecnico, valor) {
    setRutasTecnicos(prev => ({ ...prev, [tecnico]: valor }))
  }

  // 2. Extraer Rutas Automáticamente por Defecto
  const rutasAutomaticas = useMemo(() => {
    const autoRutas = {}
    if (baseMunicipios.length === 0 || allTickets.length === 0) return autoRutas

    const ticketsActivos = allTickets.filter(t => 
      t.ESTADO_LIMPIO.includes('TECNICO') || t.ESTADO_LIMPIO.includes('PROCESO') || t.ESTADO_LIMPIO.includes('AGENCIA')
    )

    const ticketsPorTecnico = {}
    ticketsActivos.forEach(t => {
      let tec = t.tecnico === 'SIN TÉCNICO' || !t.tecnico || t.tecnico === '-' ? 'SIN ASIGNAR' : t.tecnico
      if(!ticketsPorTecnico[tec]) ticketsPorTecnico[tec] = []
      ticketsPorTecnico[tec].push(t)
    })

    Object.keys(ticketsPorTecnico).forEach(tec => {
      let encontrados = new Set()
      ticketsPorTecnico[tec].forEach(t => {
        const textoBuscar = normalizarTexto(`${t['DIRECCIÓN']} ${t['NEGOCIO']}`)
        baseMunicipios.forEach(muniOriginal => {
          const muniLimpio = normalizarTexto(muniOriginal)
          const escaped = muniLimpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const regex = new RegExp(`\\b${escaped}\\b`, 'i')
          if (regex.test(textoBuscar)) encontrados.add(muniOriginal.toUpperCase())
        })
      })
      autoRutas[tec] = Array.from(encontrados).slice(0, 8).join(' - ')
    })
    return autoRutas
  }, [baseMunicipios, allTickets])

  // 3. Copiar Tabla con Aviso Corto (Toast)
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
      
      setToast(`✅ ${nombreTabla} copiada al portapapeles.`)
      setTimeout(() => setToast(null), 3000)
    } catch (err) {
      setToast('❌ Hubo un error al copiar la tabla.')
      setTimeout(() => setToast(null), 3000)
    }
  }

  // ============================================================================
  // PREPARACIÓN DE DATOS - TABLA 1: FINALIZADAS
  // ============================================================================
  const ticketsFinalizados = allTickets.filter(t => {
    if (!t.ESTADO_LIMPIO.includes('FINALIZADA')) return false
    if (!t.FECHA_OBJ || !fechaInicio || !fechaFin) return true
    
    const start = new Date(fechaInicio + 'T00:00:00')
    const end = new Date(fechaFin + 'T23:59:59')
    const fechaTicket = new Date(t.FECHA_OBJ)
    
    return fechaTicket >= start && fechaTicket <= end
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

  // ============================================================================
  // PREPARACIÓN DE DATOS - TABLA 2: ENVEJECIMIENTO
  // ============================================================================
  const ticketsActivos = allTickets.filter(t => 
    t.ESTADO_LIMPIO.includes('TECNICO') || t.ESTADO_LIMPIO.includes('PROCESO') || t.ESTADO_LIMPIO.includes('AGENCIA')
  ).map(t => {
    let tec = t.tecnico;
    if (tec === 'SIN TÉCNICO' || !tec || tec === '-') tec = 'SIN ASIGNAR'
    return { ...t, tecnico: tec }
  })

  const listaTecnicosActivos = Array.from(new Set(ticketsActivos.map(t => t.tecnico))).sort()
  const matrizEnvejecimiento = {}
  listaTecnicosActivos.forEach(tec => { matrizEnvejecimiento[tec] = { menos24: 0, mas24: 0, mas72: 0, mas100: 0, total: 0 } })

  ticketsActivos.forEach(t => {
    const horas = parseFloat(t['TIEMPO_TRANSCURRIDO']) || 0
    const tec = t.tecnico
    if (matrizEnvejecimiento[tec]) {
      matrizEnvejecimiento[tec].total++
      if (horas >= 0 && horas < 24) matrizEnvejecimiento[tec].menos24++
      else if (horas >= 24 && horas < 48) matrizEnvejecimiento[tec].mas24++
      else if (horas >= 48 && horas < 72) matrizEnvejecimiento[tec].mas72++
      else if (horas >= 72) matrizEnvejecimiento[tec].mas100++
    }
  })

  const totalesEnv = { menos24: 0, mas24: 0, mas72: 0, mas100: 0, total: 0 }
  listaTecnicosActivos.forEach(tec => {
    totalesEnv.menos24 += matrizEnvejecimiento[tec].menos24
    totalesEnv.mas24 += matrizEnvejecimiento[tec].mas24
    totalesEnv.mas72 += matrizEnvejecimiento[tec].mas72
    totalesEnv.mas100 += matrizEnvejecimiento[tec].mas100
    totalesEnv.total += matrizEnvejecimiento[tec].total
  })

  if (allTickets.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400 font-bold bg-white rounded-2xl border border-gray-200 shadow-sm">
        <BarChart2 size={64} className="mx-auto mb-4 text-gray-300" />
        <p className="text-lg text-gray-500">Sube un archivo en la pestaña "Técnicos"</p>
        <p className="text-sm font-medium mt-1">Las tablas analíticas se generarán automáticamente.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 fade-in relative">
      
      {/* TOAST NOTIFICACIÓN SILENCIOSA */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-2xl z-[100] flex items-center gap-2 font-bold text-xs animate-fade-in-up">
          <CheckCircle2 size={16} className="text-emerald-400" />
          {toast}
        </div>
      )}

      {/* CUADRO DE DETALLES OPTIMIZADO (ARRIBA Y MÁS ANCHO) */}
      {modalDetalles && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto" onClick={() => setModalDetalles(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Encabezado ultra compacto */}
            <div className="bg-slate-800 px-4 py-2 flex justify-between items-center border-b border-slate-900">
              <h3 className="text-white font-black text-xs uppercase tracking-wider">
                {modalDetalles.tec} <span className="text-slate-400 font-normal">| {modalDetalles.fecha}</span>
              </h3>
              <button onClick={() => setModalDetalles(null)} className="text-slate-400 hover:text-white transition-colors bg-slate-700 p-1 rounded-md"><X size={14}/></button>
            </div>
            
            {/* Espacio interno maximizado */}
            <div className="p-2.5 max-h-[75vh] overflow-y-auto space-y-1.5 bg-gray-100">
              {modalDetalles.detalles.map((det, idx) => {
                // Ahora corta a 50 letras en lugar de 25
                const dirCorta = det.direccion.length > 50 ? det.direccion.substring(0, 50) + '...' : det.direccion;
                
                return (
                  <div key={idx} className="bg-white border border-gray-200 px-3 py-1.5 rounded-lg flex flex-col gap-0.5 shadow-sm">
                    <span className="font-black text-slate-800 text-[11px] uppercase leading-tight">{det.negocio}</span>
                    <span className="font-bold text-slate-500 text-[10px] leading-tight">📍 {dirCorta}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* CONTROLES DE FECHAS */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
          <Calendar size={18} className="text-blue-600" /> Control de Rangos de Cierre Diario
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border border-gray-300 rounded-lg p-1.5 text-xs font-bold outline-none text-slate-700 bg-slate-50 focus:border-blue-500 transition" />
          <span className="text-slate-400 font-black text-xs">a</span>
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border border-gray-300 rounded-lg p-1.5 text-xs font-bold outline-none text-slate-700 bg-slate-50 focus:border-blue-500 transition" />
        </div>
      </div>

      {/* TABLA 1: ÓRDENES FINALIZADAS */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex justify-between items-center bg-slate-50 px-5 py-2.5 border-b border-gray-200">
          <div className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            1. Monitoreo de Órdenes Finalizadas
          </div>
          <button onClick={() => copiarTablaAlPortapapeles(tablaFinalizadasRef, 'Tabla de Órdenes')} className="flex items-center gap-1.5 bg-slate-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-slate-900 transition shadow-sm">
            <Copy size={12} /> Copiar Tabla
          </button>
        </div>

        <div className="p-3 bg-white overflow-x-auto w-full">
          <div ref={tablaFinalizadasRef} className="bg-white border border-slate-800 rounded overflow-hidden">
            <table className="w-full text-left text-xs border-collapse min-w-max">
              <thead className="bg-slate-800 text-white font-black uppercase text-[10px] tracking-wider">
                <tr className="divide-x divide-slate-700 border-b border-slate-800">
                  <th className="px-2 py-1.5 whitespace-nowrap">Técnico</th>
                  {columnasFechas.map(f => (
                    <th key={f} className="px-2 py-1.5 text-center whitespace-nowrap">{f}</th>
                  ))}
                  <th className="px-2 py-1.5 text-center bg-slate-900 whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 text-slate-900 font-bold text-[11px]">
                {listaTecnicosFinalizados.map(tec => (
                  <tr key={tec} className="divide-x divide-slate-300 hover:bg-blue-50 transition-colors">
                    <td className="px-2 py-1 uppercase font-black text-slate-900 whitespace-nowrap">{tec}</td>
                    {columnasFechas.map(f => {
                      const dataDia = matrizFinalizadas[tec][f]
                      
                      return (
                        <td 
                          key={f} 
                          onClick={() => {
                            if (dataDia.count > 0) {
                              setModalDetalles({ tec, fecha: f, detalles: dataDia.detalles })
                            }
                          }}
                          className={`px-2 py-1 text-center font-black whitespace-nowrap ${dataDia.count > 0 ? 'text-blue-700 hover:bg-blue-100 cursor-pointer' : 'text-slate-300'}`}
                        >
                          {dataDia.count === 0 ? '-' : dataDia.count}
                        </td>
                      )
                    })}
                    <td className="px-2 py-1 text-center bg-slate-100 font-black text-blue-800 whitespace-nowrap">{matrizFinalizadas[tec].totales}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-200 font-black text-slate-900 border-t border-slate-800">
                <tr className="divide-x divide-slate-300 text-[11px]">
                  <td className="px-2 py-1.5 uppercase text-right font-black whitespace-nowrap">Total General</td>
                  {columnasFechas.map(f => (
                    <td key={f} className="px-2 py-1.5 text-center text-blue-900 font-black whitespace-nowrap">{totalesFecha[f]}</td>
                  ))}
                  <td className="px-2 py-1.5 text-center bg-slate-300 text-emerald-800 font-black whitespace-nowrap">{granTotalFinalizadas}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* TABLA 2: ENVEJECIMIENTO Y RUTAS EDITABLES */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex justify-between items-center bg-slate-50 px-5 py-2.5 border-b border-gray-200">
          <div className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            2. Envejecimiento Operativo y Rutas Diarias
          </div>
          <button onClick={() => copiarTablaAlPortapapeles(tablaEnvejecimientoRef, 'Tabla de Rutas y Envejecimiento')} className="flex items-center gap-1.5 bg-slate-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-slate-900 transition shadow-sm">
            <Copy size={12} /> Copiar Tabla
          </button>
        </div>

        <div className="p-3 bg-white overflow-x-auto w-full">
          <div ref={tablaEnvejecimientoRef} className="bg-white border border-slate-800 rounded overflow-hidden">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-slate-800 text-white font-black uppercase text-[10px] tracking-wider">
                <tr className="divide-x divide-slate-700 border-b border-slate-800">
                  <th className="px-2 py-1.5 whitespace-nowrap w-40">Técnico</th>
                  <th className="px-2 py-1.5 min-w-[300px]">Dirección de la Ruta Real de Trabajo</th>
                  <th className="px-2 py-1.5 text-center bg-emerald-600 whitespace-nowrap w-16">-24 Hrs</th>
                  <th className="px-2 py-1.5 text-center bg-orange-500 whitespace-nowrap w-16">+24 Hrs</th>
                  <th className="px-2 py-1.5 text-center bg-red-600 whitespace-nowrap w-16">+72 Hrs</th>
                  <th className="px-2 py-1.5 text-center bg-red-800 whitespace-nowrap w-16">+100 Hrs</th>
                  <th className="px-2 py-1.5 text-center bg-slate-900 whitespace-nowrap w-16">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 text-slate-800 font-bold text-[11px]">
                {listaTecnicosActivos.map(tec => {
                  const valorRuta = rutasTecnicos[tec] !== undefined ? rutasTecnicos[tec] : (rutasAutomaticas[tec] || '')
                  
                  return (
                    <tr key={tec} className="divide-x divide-slate-300 hover:bg-slate-50 transition-colors">
                      <td className="px-2 py-1 uppercase font-black text-slate-900 whitespace-nowrap">{tec}</td>
                      
                      <td className="p-0 align-top">
                        <textarea 
                          rows="2"
                          value={valorRuta} 
                          onChange={e => handleRutaChange(tec, e.target.value)}
                          placeholder="Sin ruta detectada" 
                          className="w-full bg-transparent px-2 py-1.5 font-bold text-blue-900 outline-none hover:bg-slate-100 focus:bg-white text-[10px] uppercase leading-tight resize-none overflow-hidden"
                        />
                      </td>
                      
                      <td className="px-2 py-1 text-center text-emerald-800 bg-emerald-50/50 font-black whitespace-nowrap">{matrizEnvejecimiento[tec].menos24 === 0 ? '-' : matrizEnvejecimiento[tec].menos24}</td>
                      <td className="px-2 py-1 text-center text-orange-800 bg-orange-50/50 font-black whitespace-nowrap">{matrizEnvejecimiento[tec].mas24 === 0 ? '-' : matrizEnvejecimiento[tec].mas24}</td>
                      <td className="px-2 py-1 text-center text-red-700 bg-red-50/50 font-black whitespace-nowrap">{matrizEnvejecimiento[tec].mas72 === 0 ? '-' : matrizEnvejecimiento[tec].mas72}</td>
                      <td className="px-2 py-1 text-center text-red-950 bg-red-100/50 font-black whitespace-nowrap">{matrizEnvejecimiento[tec].mas100 === 0 ? '-' : matrizEnvejecimiento[tec].mas100}</td>
                      <td className="px-2 py-1 text-center bg-slate-100 font-black text-slate-900 whitespace-nowrap">{matrizEnvejecimiento[tec].total}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-200 font-black text-slate-900 border-t border-slate-800">
                <tr className="divide-x divide-slate-300 text-[11px]">
                  <td className="px-2 py-1.5 uppercase text-right font-black whitespace-nowrap" colSpan="2">
                    <span className="mr-3 text-slate-500 font-bold text-[10px]">Resumen Global:</span>
                    Total Operativo
                  </td>
                  <td className="px-2 py-1.5 text-center text-emerald-800 font-black whitespace-nowrap">{totalesEnv.menos24}</td>
                  <td className="px-2 py-1.5 text-center text-orange-800 font-black whitespace-nowrap">{totalesEnv.mas24}</td>
                  <td className="px-2 py-1.5 text-center text-red-700 font-black whitespace-nowrap">{totalesEnv.mas72}</td>
                  <td className="px-2 py-1.5 text-center text-red-950 font-black whitespace-nowrap">{totalesEnv.mas100}</td>
                  <td className="px-2 py-1.5 text-center bg-slate-300 text-blue-900 text-xs font-black whitespace-nowrap">{totalesEnv.total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

    </div>
  )
}
