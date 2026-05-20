import { useState, useRef } from 'react'
import html2canvas from 'html2canvas'
import { Calendar, Image, BarChart2, Sparkles, RotateCcw } from 'lucide-react'

export default function ModuloTablas({ allTickets }) {
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [rutasTecnicos, setRutasTecnicos] = useState({})
  const [aiLoadingTecnico, setAiLoadingTecnico] = useState(null)

  const tablaFinalizadasRef = useRef()
  const tablaEnvejecimientoRef = useRef()

  function handleRutaChange(tecnico, valor) {
    setRutasTecnicos(prev => ({ ...prev, [tecnico]: valor }))
  }

  async function generarRutaConIA(tecnico, ticketsActivos) {
    setAiLoadingTecnico(tecnico)
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key no configurada.");
      
      const ticketsTecnico = ticketsActivos.filter(t => t.tecnico === tecnico)
      const direcciones = ticketsTecnico.map(t => t['DIRECCIÓN']).filter(d => d && d !== '-').join(' | ')

      const prompt = `Analiza estas direcciones: ${direcciones}. Extrae máximo 6 municipios o zonas clave. Ignora calles, números, links. Devuelve SOLO una línea con los lugares separados por guiones. Ejemplo: ZONA 1 - XELA - RETALHULEU.`

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const data = await response.json();
      const ruta = data.candidates[0].content.parts[0].text.trim();
      handleRutaChange(tecnico, ruta);
    } catch (err) { alert("Error IA: " + err.message); } 
    finally { setAiLoadingTecnico(null) }
  }

  // --- Lógica de Datos ---
  const ticketsFinalizados = allTickets.filter(t => t.ESTADO_LIMPIO.includes('FINALIZADA'))
  const columnasFechas = Array.from(new Set(ticketsFinalizados.map(t => t.FECHA_TEXTO))).sort()
  const listaTecnicosFinalizados = Array.from(new Set(ticketsFinalizados.map(t => t.tecnico))).sort()
  
  const matrizFinalizadas = {}
  listaTecnicosFinalizados.forEach(tec => {
    matrizFinalizadas[tec] = { totales: 0 }
    columnasFechas.forEach(f => { matrizFinalizadas[tec][f] = 0 })
  })
  ticketsFinalizados.forEach(t => { if(matrizFinalizadas[t.tecnico]) { matrizFinalizadas[t.tecnico][t.FECHA_TEXTO]++; matrizFinalizadas[t.tecnico].totales++ }})

  const ticketsActivos = allTickets.filter(t => !t.ESTADO_LIMPIO.includes('FINALIZADA')).map(t => ({ 
    ...t, tecnico: (t.tecnico === 'SIN TÉCNICO' || !t.tecnico || t.tecnico === '-') ? 'SIN ASIGNAR' : t.tecnico 
  }))
  const listaTecnicosActivos = Array.from(new Set(ticketsActivos.map(t => t.tecnico))).sort()

  const matrizEnvejecimiento = {}
  listaTecnicosActivos.forEach(tec => { matrizEnvejecimiento[tec] = { m24:0, p24:0, p72:0, p100:0, total:0 } })
  ticketsActivos.forEach(t => {
    const h = parseFloat(t['TIEMPO_TRANSCURRIDO']) || 0
    if(matrizEnvejecimiento[t.tecnico]) {
      matrizEnvejecimiento[t.tecnico].total++
      if (h < 24) matrizEnvejecimiento[t.tecnico].m24++
      else if (h < 48) matrizEnvejecimiento[t.tecnico].p24++
      else if (h < 72) matrizEnvejecimiento[t.tecnico].p72++
      else matrizEnvejecimiento[t.tecnico].p100++
    }
  })

  return (
    <div className="space-y-8">
      {/* Tabla 1 Finalizadas */}
      <div className="bg-white border-2 border-black rounded-xl shadow-lg overflow-hidden" ref={tablaFinalizadasRef}>
        <div className="bg-slate-900 text-white p-3 font-black text-sm uppercase text-center border-b-2 border-black">Órdenes Finalizadas por Técnico</div>
        <table className="w-full text-center border-collapse border-2 border-black text-[11px]">
          <thead className="font-black bg-slate-200">
            <tr>
              <th className="border-2 border-black p-2">TÉCNICO</th>
              {columnasFechas.map(f => <th key={f} className="border-2 border-black p-2">{f}</th>)}
              <th className="border-2 border-black p-2">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {listaTecnicosFinalizados.map(tec => (
              <tr key={tec} className="font-bold">
                <td className="border-2 border-black p-2 text-left uppercase">{tec}</td>
                {columnasFechas.map(f => <td key={f} className="border-2 border-black p-2">{matrizFinalizadas[tec][f] || 0}</td>)}
                <td className="border-2 border-black p-2 bg-slate-100">{matrizFinalizadas[tec].totales}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabla 2 Envejecimiento */}
      <div className="bg-white border-2 border-black rounded-xl shadow-lg overflow-hidden" ref={tablaEnvejecimientoRef}>
        <div className="bg-slate-900 text-white p-3 font-black text-sm uppercase text-center border-b-2 border-black">Control de Envejecimiento Operativo</div>
        <table className="w-full text-center border-collapse border-2 border-black text-[11px]">
          <thead className="font-black bg-slate-200">
            <tr>
              <th className="border-2 border-black p-2">TÉCNICO</th>
              <th className="border-2 border-black p-2 w-48">RUTA (AUTO-IA)</th>
              <th className="border-2 border-black p-2 text-green-700">-24</th>
              <th className="border-2 border-black p-2 text-orange-600">+24</th>
              <th className="border-2 border-black p-2 text-red-600">+72</th>
              <th className="border-2 border-black p-2 text-red-900">+100</th>
              <th className="border-2 border-black p-2">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {listaTecnicosActivos.map(tec => (
              <tr key={tec} className="font-bold">
                <td className="border-2 border-black p-2 text-left uppercase">{tec}</td>
                <td className="border-2 border-black p-1 relative">
                  <textarea rows="2" value={rutasTecnicos[tec] || ''} onChange={e => handleRutaChange(tec, e.target.value)} className="w-full text-[10px] uppercase p-1 outline-none resize-none" />
                  <button onClick={() => generarRutaConIA(tec, ticketsActivos)} className="absolute top-1 right-1 p-0.5 bg-purple-100 rounded text-purple-700"><Sparkles size={10}/></button>
                </td>
                <td className="border-2 border-black p-2">{matrizEnvejecimiento[tec].m24 || '-'}</td>
                <td className="border-2 border-black p-2">{matrizEnvejecimiento[tec].p24 || '-'}</td>
                <td className="border-2 border-black p-2">{matrizEnvejecimiento[tec].p72 || '-'}</td>
                <td className="border-2 border-black p-2">{matrizEnvejecimiento[tec].p100 || '-'}</td>
                <td className="border-2 border-black p-2 bg-slate-100">{matrizEnvejecimiento[tec].total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
