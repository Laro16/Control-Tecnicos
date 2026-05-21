import { useState, useRef, useEffect } from 'react'
import html2canvas from 'html2canvas'
import * as XLSX from 'xlsx'
import { Calendar, Image, BarChart2, MapPin } from 'lucide-react'

// Función para quitar tildes y pasar a mayúsculas
function normalizarTexto(texto) {
  if (!texto) return ''
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
}

export default function ModuloTablas({ allTickets }) {
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  
  const [rutasTecnicos, setRutasTecnicos] = useState({})
  const [baseMunicipios, setBaseMunicipios] = useState([])

  const tablaFinalizadasRef = useRef()
  const tablaEnvejecimientoRef = useRef()

  // ============================================================================
  // CARGA AUTOMÁTICA DEL EXCEL DE RUTAS (DESDE CARPETA PUBLIC)
  // ============================================================================
  useEffect(() => {
    async function cargarRutasDelRepo() {
      try {
        const response = await fetch('/Rutas.xlsx')
        if (!response.ok) {
          console.warn('No se encontró el archivo Rutas.xlsx en la carpeta public.')
          return
        }
        const arrayBuffer = await response.arrayBuffer()
        const wb = XLSX.read(arrayBuffer, { type: 'array' })
        
        // Buscar específicamente en Hoja1 (o la primera si le cambiaste el nombre)
        const nombreHoja = wb.SheetNames.includes('Hoja1') ? 'Hoja1' : wb.SheetNames[0]
        const ws = wb.Sheets[nombreHoja]
        const rawMatrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        
        let colIndex = -1
        let munis = new Set()

        // Encontrar la columna que se llama "DATOS"
        for (let i = 0; i < rawMatrix.length; i++) {
          const rowNormalizada = rawMatrix[i].map(c => normalizarTexto(c))
          const idx = rowNormalizada.indexOf('DATOS')
          
          if (idx !== -1) {
            colIndex = idx
            // Leer todos los datos hacia abajo de esa columna
            for (let j = i + 1; j < rawMatrix.length; j++) {
              const cellVal = rawMatrix[j][colIndex]
              if (typeof cellVal === 'string' && cellVal.trim().length > 2) {
                munis.add(cellVal.trim()) // Guardamos el original para mostrarlo bonito
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

  // ============================================================================
  // EXTRACCIÓN DE RUTA LOCAL BASADA EN COINCIDENCIAS (SIN IA)
  // ============================================================================
  function extraerRutaLocal(tecnico, ticketsActivos) {
    if (baseMunicipios.length === 0) {
      alert("La base de rutas no se ha cargado. Verifica que Rutas.xlsx esté en la carpeta public y tenga la columna DATOS.")
      return
    }

    const ticketsTecnico = ticketsActivos.filter(t => t.tecnico === tecnico)
    let encontrados = new Set()

    ticketsTecnico.forEach(t => {
      // Unimos Dirección y Negocio y lo normalizamos (sin tildes, mayúsculas)
      const textoBuscar = normalizarTexto(`${t['DIRECCIÓN']} ${t['NEGOCIO']}`)
      
      baseMunicipios.forEach(muniOriginal => {
        const muniLimpio = normalizarTexto(muniOriginal)
        const escaped = muniLimpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`\\b${escaped}\\b`, 'i')
        
        if (regex.test(textoBuscar)) {
          encontrados.add(muniOriginal.toUpperCase()) // Extrae y lo pone en mayúsculas
        }
      })
    })

    const rutaExtraida = Array.from(encontrados).slice(0, 8).join(' - ')

    if (rutaExtraida) {
      handleRutaChange(tecnico, rutaExtraida)
    } else {
      alert("No se detectaron coincidencias de municipios exactos para las direcciones de este técnico.")
    }
  }

  // ============================================================================
  // 1. LÓGICA TABLA 1: ÓRDENES FINALIZADAS
  // ============================================================================
  const ticketsFinalizados = allTickets.filter(t => {
    if (!t.ESTADO_LIMPIO.includes('FINALIZADA')) return false
    if (!t.FECHA_OBJ || !fechaInicio || !fechaFin) return true
    const start = new Date(fechaInicio + 'T00:00:00')
    const end = new Date(fechaFin + 'T23:59:59')
    return t.FECHA_OBJ >= start && t.FECHA_OBJ <= end
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
    columnasFechas.forEach(f => { matrizFinalizadas[tec][f] = 0 })
  })

  ticketsFinalizados.forEach(t => {
    if (matrizFinalizadas[t.tecnico]) {
      matrizFinalizadas[t.tecnico][t.FECHA_TEXTO]++
      matrizFinalizadas[t.tecnico].totales++
    }
  })

  const totalesFecha = {}
  let granTotalFinalizadas = 0
  columnasFechas.forEach(f => {
    totalesFecha[f] = listaTecnicosFinalizados.reduce((sum, tec) => sum + (matrizFinalizadas[tec][f] || 0), 0)
    granTotalFinalizadas += totalesFecha[f]
  })

  // ============================================================================
  // 2. LÓGICA TABLA 2: RUTAS Y ENVEJECIMIENTO
  // ============================================================================
  const ticketsActivos = allTickets.filter(t => 
    t.ESTADO_LIMPIO.includes('TECNICO') || 
    t.ESTADO_LIMPIO.includes('PROCESO') || 
    t.ESTADO_LIMPIO.includes('AGENCIA')
  ).map(t => {
    let tec = t.tecnico;
    if (tec === 'SIN TÉCNICO' || !tec || tec === '-') {
      tec = 'SIN ASIGNAR'
    }
    return { ...t, tecnico: tec }
  })

  const listaTecnicosActivos = Array.from(new Set(ticketsActivos.map(t => t.tecnico))).sort()

  const matrizEnvejecimiento = {}
  listaTecnicosActivos.forEach(tec => {
    matrizEnvejecimiento[tec] = { menos24: 0, mas24: 0, mas72: 0, mas100: 0, total: 0 }
  })

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

  // ============================================================================
  // EXPORTADOR DE IMAGEN
  // ============================================================================
  async function capturarTabla(ref, nombre) {
    if (!ref.current) return
    const canvas = await html2canvas(ref.current, { backgroundColor: '#ffffff', scale: 2 })
    const link = document.createElement('a')
    link.download = `${nombre}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

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
    <div className="space-y-8 fade-in">
      
      {/* SECCIÓN INTERACTIVA DE FECHAS */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
          <Calendar size={18} className="text-blue-600" /> Control de Rangos de Cierre Diario
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border border-gray-300 rounded-lg p-2 text-sm font-bold outline-none text-slate-700 bg-slate-50 focus:border-blue-500 focus:bg-white transition" />
          <span className="text-slate-400 font-black text-sm">a</span>
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border border-gray-300 rounded-lg p-2 text-sm font-bold outline-none text-slate-700 bg-slate-50 focus:border-blue-500 focus:bg-white transition" />
        </div>
      </div>

      {/* ========================================================= */}
      {/* TABLA 1: ÓRDENES FINALIZADAS                              */}
      {/* ========================================================= */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex justify-between items-center bg-slate-50 px-6 py-4 border-b border-gray-200">
          <div className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            1. Monitoreo de Órdenes Finalizadas
          </div>
          <button onClick={() => capturarTabla(tablaFinalizadasRef, 'Reporte_Liquidaciones')} className="flex items-center gap-1.5 bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-900 transition shadow-sm">
            <Image size={14} /> Capturar Tabla
          </button>
        </div>

        <div className="p-6 bg-white overflow-x-auto">
          <div ref={tablaFinalizadasRef} className="bg-white p-1 rounded-xl">
            <div className="border-2 border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs border-collapse bg-white">
                <thead className="bg-slate-800 text-white font-black uppercase text-sm tracking-wider">
                  <tr className="divide-x divide-slate-700 border-b-2 border-slate-800">
                    <th className="p-2.5 whitespace-nowrap">Técnico</th>
                    {columnasFechas.map(f => (
                      <th key={f} className="p-2.5 text-center whitespace-nowrap">{f}</th>
                    ))}
                    <th className="p-2.5 text-center bg-slate-900 whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700 text-slate-900 font-bold text-[12px]">
                  {listaTecnicosFinalizados.map(tec => (
                    <tr key={tec} className="divide-x divide-slate-700 hover:bg-blue-50 transition-colors">
                      <td className="p-2.5 uppercase font-black text-slate-900 whitespace-nowrap">{tec}</td>
                      {columnasFechas.map(f => (
                        <td key={f} className="p-2.5 text-center font-black text-slate-800 whitespace-nowrap">{matrizFinalizadas[tec][f] === 0 ? <span className="text-gray-300">-</span> : matrizFinalizadas[tec][f]}</td>
                      ))}
                      <td className="p-2.5 text-center bg-slate-100 font-black text-blue-800 text-sm whitespace-nowrap">{matrizFinalizadas[tec].totales}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-200 font-black text-slate-900 border-t-2 border-slate-800">
                  <tr className="divide-x divide-slate-700 text-sm">
                    <td className="p-2.5 uppercase text-right font-black whitespace-nowrap">Total General</td>
                    {columnasFechas.map(f => (
                      <td key={f} className="p-2.5 text-center text-blue-900 font-black whitespace-nowrap">{totalesFecha[f]}</td>
                    ))}
                    <td className="p-2.5 text-center bg-slate-300 text-emerald-800 font-black text-base whitespace-nowrap">{granTotalFinalizadas}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TABLA 2: ENVEJECIMIENTO Y RUTAS EDITABLES                 */}
      {/* ========================================================= */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex justify-between items-center bg-slate-50 px-6 py-4 border-b border-gray-200">
          <div className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            2. Control de Envejecimiento Operativo y Rutas
          </div>
          <button onClick={() => capturarTabla(tablaEnvejecimientoRef, 'Reporte_Rutas_Diarias')} className="flex items-center gap-1.5 bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-900 transition shadow-sm">
            <Image size={14} /> Capturar Tabla
          </button>
        </div>

        <div className="p-6 bg-white overflow-x-auto">
          <div ref={tablaEnvejecimientoRef} className="bg-white p-1 rounded-xl min-w-[800px]">
            <div className="border-2 border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm border-collapse bg-white table-fixed">
                <thead className="text-white font-black uppercase text-sm tracking-wider">
                  <tr className="divide-x divide-slate-700 bg-slate-800 border-b-2 border-slate-800">
                    <th className="p-2.5 whitespace-nowrap w-48">Técnico</th>
                    <th className="p-2.5 min-w-[280px]">Dirección de la Ruta Real de Trabajo</th>
                    <th className="p-2.5 text-center bg-emerald-600 whitespace-nowrap w-20">-24 Hrs</th>
                    <th className="p-2.5 text-center bg-orange-500 whitespace-nowrap w-20">+24 Hrs</th>
                    <th className="p-2.5 text-center bg-red-600 whitespace-nowrap w-20">+72 Hrs</th>
                    <th className="p-2.5 text-center bg-red-800 whitespace-nowrap w-20">+100 Hrs</th>
                    <th className="p-2.5 text-center bg-slate-900 whitespace-nowrap w-20">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700 text-slate-800 font-bold text-[12px]">
                  {listaTecnicosActivos.map(tec => {
                    const valorRuta = rutasTecnicos[tec] !== undefined ? rutasTecnicos[tec] : ''
                    
                    return (
                      <tr key={tec} className="divide-x divide-slate-700 hover:bg-slate-50 transition-colors">
                        <td className="p-2.5 uppercase font-black text-slate-900 whitespace-nowrap">{tec}</td>
                        
                        <td className="p-1 relative group" data-html2canvas-ignore="false">
                          <div className="flex items-center justify-between mb-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 top-1">
                            <button 
                              onClick={() => extraerRutaLocal(tec, ticketsActivos)}
                              className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded shadow-sm hover:bg-emerald-200 transition"
                              title="Extraer ruta de base de datos local"
                            >
                              <MapPin size={10} />
                              EXTRAER
                            </button>
                          </div>
                          
                          <textarea 
                            rows="2"
                            value={valorRuta} 
                            onChange={e => handleRutaChange(tec, e.target.value)}
                            placeholder="Escribe la ruta o presiona EXTRAER ↗" 
                            className="w-full bg-transparent p-1 pt-3 font-bold text-blue-900 outline-none border-b border-dashed border-transparent hover:border-slate-400 focus:border-blue-500 placeholder-slate-300 text-[10px] uppercase leading-tight resize-none overflow-hidden"
                          />
                        </td>
                        
                        <td className="p-2.5 text-center text-emerald-800 bg-emerald-50/50 font-black text-sm whitespace-nowrap">{matrizEnvejecimiento[tec].menos24 === 0 ? '-' : matrizEnvejecimiento[tec].menos24}</td>
                        <td className="p-2.5 text-center text-orange-800 bg-orange-50/50 font-black text-sm whitespace-nowrap">{matrizEnvejecimiento[tec].mas24 === 0 ? '-' : matrizEnvejecimiento[tec].mas24}</td>
                        <td className="p-2.5 text-center text-red-700 bg-red-50/50 font-black text-sm whitespace-nowrap">{matrizEnvejecimiento[tec].mas72 === 0 ? '-' : matrizEnvejecimiento[tec].mas72}</td>
                        <td className="p-2.5 text-center text-red-950 bg-red-100/50 font-black text-sm whitespace-nowrap">{matrizEnvejecimiento[tec].mas100 === 0 ? '-' : matrizEnvejecimiento[tec].mas100}</td>
                        <td className="p-2.5 text-center bg-slate-100 font-black text-slate-900 text-sm whitespace-nowrap">{matrizEnvejecimiento[tec].total}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-slate-200 font-black text-slate-900 border-t-2 border-slate-800">
                  <tr className="divide-x divide-slate-700 text-sm">
                    <td className="p-2.5 uppercase text-right font-black whitespace-nowrap" colSpan="2">
                      <span className="mr-4 text-slate-500 font-bold text-xs">Resumen Global:</span>
                      Total Operativo
                    </td>
                    <td className="p-2.5 text-center text-emerald-800 font-black whitespace-nowrap">{totalesEnv.menos24}</td>
                    <td className="p-2.5 text-center text-orange-800 font-black whitespace-nowrap">{totalesEnv.mas24}</td>
                    <td className="p-2.5 text-center text-red-700 font-black whitespace-nowrap">{totalesEnv.mas72}</td>
                    <td className="p-2.5 text-center text-red-950 font-black whitespace-nowrap">{totalesEnv.mas100}</td>
                    <td className="p-2.5 text-center bg-slate-300 text-blue-900 text-base font-black whitespace-nowrap">{totalesEnv.total}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
