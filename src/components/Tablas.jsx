import { useState, useRef } from 'react'
import html2canvas from 'html2canvas'
import { Calendar, Image, FileText } from 'lucide-react'

export default function ModuloTablas({ allTickets }) {
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  
  // Guardar de forma reactiva las rutas que escribas por cada técnico
  const [rutasTecnicos, setRutasTecnicos] = useState({})

  const tablaFinalizadasRef = useRef()
  const tablaEnvejecimientoRef = useRef()

  function handleRutaChange(tecnico, valor) {
    setRutasTecnicos(prev => ({ ...prev, [tecnico]: valor }))
  }

  // 1. FILTRADO PARA TABLA 1 (Sólo órdenes finalizadas en el rango de fechas)
  const ticketsFinalizados = allTickets.filter(t => {
    if (!t.ESTADO_LIMPIO.includes('FINALIZADA')) return false
    if (!t.FECHA_OBJ || !fechaInicio || !fechaFin) return true
    const start = new Date(fechaInicio + 'T00:00:00')
    const end = new Date(fechaFin + 'T23:59:59')
    return t.FECHA_OBJ >= start && t.FECHA_OBJ <= end
  })

  // Obtener columnas de fechas únicas ordenadas
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

  // 2. FILTRADO PARA TABLA 2 (Asignadas y En Proceso - Envejecimiento de Horas)
  const ticketsActivos = allTickets.filter(t => t.ESTADO_LIMPIO.includes('TECNICO') || t.ESTADO_LIMPIO.includes('PROCESO'))
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
      <div className="text-center py-20 text-gray-400 font-bold">
        <Calendar size={54} className="mx-auto mb-3 text-gray-300" />
        Sube un archivo de órdenes en la pestaña "Técnicos" para habilitar las tablas analíticas.
      </div>
    )
  }

  return (
    <div className="space-y-10 fade-in">
      
      {/* SECCIÓN INTERACTIVA DE FECHAS */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="text-xs font-black text-gray-700 uppercase flex items-center gap-2">
          <Calendar size={16} className="text-blue-600" /> Control de Rangos de Cierre Diario
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border border-gray-300 rounded-lg p-1.5 text-xs font-bold outline-none" />
          <span className="text-gray-400 font-bold text-xs">a</span>
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="border border-gray-300 rounded-lg p-1.5 text-xs font-bold outline-none" />
        </div>
      </div>

      {/* TABLA 1: ORDENES FINALIZADAS */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
          <div className="text-xs font-black text-gray-400 uppercase tracking-wider">1. Monitoreo de Órdenes Finalizadas</div>
          <button onClick={() => capturarTabla(tablaFinalizadasRef, 'Reporte_Liquidaciones')} className="flex items-center gap-1 bg-gray-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-black transition">
            <Image size={12} /> Capturar Tabla 1
          </button>
        </div>

        <div ref={tablaFinalizadasRef} className="p-4 bg-white">
          <table className="w-full text-left text-xs border-collapse border-2 border-black">
            <thead className="bg-gray-100 text-black font-black uppercase border-b-2 border-black">
              <tr className="divide-x divide-black">
                <th className="p-2 border border-black">Técnico</th>
                {columnasFechas.map(f => (
                  <th key={f} className="p-2 text-center border border-black">{f}</th>
                ))}
                <th className="p-2 text-center border border-black bg-gray-200">Total</th>
              </tr>
            </thead>
            <tbody className="font-bold text-gray-900 divide-y divide-black">
              {listaTecnicosFinalizados.map(tec => (
                <tr key={tec} className="divide-x divide-black hover:bg-gray-50">
                  <td className="p-2 border border-black uppercase">{tec}</td>
                  {columnasFechas.map(f => (
                    <td key={f} className="p-2 text-center border border-black">{matrizFinalizadas[tec][f] || 0}</td>
                  ))}
                  <td className="p-2 text-center border border-black bg-gray-100 font-black text-blue-700">{matrizFinalizadas[tec].totales}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABLA 2: ENVEJECIMIENTO Y RUTAS EDITABLES */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
          <div className="text-xs font-black text-gray-400 uppercase tracking-wider">2. Control de Envejecimiento Operativo y Rutas</div>
          <button onClick={() => capturarTabla(tablaEnvejecimientoRef, 'Reporte_Rutas_Diarias')} className="flex items-center gap-1 bg-gray-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-black transition">
            <Image size={12} /> Capturar Tabla 2
          </button>
        </div>

        <div ref={tablaEnvejecimientoRef} className="p-4 bg-white">
          <table className="w-full text-left text-xs border-collapse border-2 border-black">
            <thead className="bg-gray-100 text-black font-black uppercase border-b-2 border-black">
              <tr className="divide-x divide-black">
                <th className="p-2 border border-black w-1/4">Técnico</th>
                <th className="p-2 border border-black w-1/3">Dirección de la Ruta Real de Trabajo</th>
                <th className="p-2 text-center border border-black text-emerald-700 bg-emerald-50">-24</th>
                <th className="p-2 text-center border border-black text-orange-700 bg-orange-50">+24</th>
                <th className="p-2 text-center border border-black text-red-700 bg-red-50">+72</th>
                <th className="p-2 text-center border border-black text-red-900 bg-red-100">+100</th>
                <th className="p-2 text-center border border-black bg-gray-200">Total</th>
              </tr>
            </thead>
            <tbody className="font-bold text-gray-900 divide-y divide-black">
              {listaTecnicosActivos.map(tec => (
                <tr key={tec} className="divide-x divide-black hover:bg-gray-50">
                  <td className="p-2 border border-black uppercase font-black">{tec}</td>
                  
                  {/* Celda editable para ingresar la ruta antes de exportar la captura */}
                  <td className="p-1 border border-black" data-html2canvas-ignore="false">
                    <input 
                      type="text" 
                      value={rutasTecnicos[tec] || ''} 
                      onChange={e => handleRutaChange(tec, e.target.value)}
                      placeholder="Escribe la ruta asignada aquí..." 
                      className="w-full bg-transparent p-1 font-bold text-gray-800 outline-none placeholder-gray-300 uppercase"
                    />
                  </td>
                  
                  <td className="p-2 text-center border border-black text-emerald-700 bg-emerald-50/40 font-black text-sm">{matrizEnvejecimiento[tec].menos24}</td>
                  <td className="p-2 text-center border border-black text-orange-600 bg-orange-50/40 font-black text-sm">{matrizEnvejecimiento[tec].mas24}</td>
                  <td className="p-2 text-center border border-black text-red-600 bg-red-50/40 font-black text-sm">{matrizEnvejecimiento[tec].mas72}</td>
                  <td className="p-2 text-center border border-black text-red-800 bg-red-100/40 font-black text-sm">{matrizEnvejecimiento[tec].mas100}</td>
                  <td className="p-2 text-center border border-black bg-gray-100 font-black text-gray-900 text-sm">{matrizEnvejecimiento[tec].total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
