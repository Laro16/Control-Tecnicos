import { useMemo } from 'react'
import { 
  BarChart3, Clock, AlertTriangle, ShieldAlert, CheckCircle, 
  Users, Wrench, TrendingUp, FileSpreadsheet
} from 'lucide-react'

function normalizarTexto(texto) {
  if (!texto) return ''
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim()
}

// ── Clientes garantía (misma lista que Tecnicos.jsx) ──
const CLIENTES_GARANTIA = [
  { nombre: 'ABCO', anios: 1 },
  { nombre: 'COMERCIALIZADORA DE ALIMENTOS Y BEBIDAS SAN MIGUEL', anios: 2 },
  { nombre: 'DISTRIBUIDORA DE LICORES', anios: 1 },
  { nombre: 'EMBOTELLADORA CENTRAL', anios: 2 },
  { nombre: 'EMBOTELLADORA LA MARIPOSA', anios: 2 },
  { nombre: 'GARANTIA IMPORTADORA Y DISTRIBUIDORA DE APARATOS ELECTRICOS', anios: 1 },
  { nombre: 'M.D.T. INTERNACIONAL', anios: 1 },
  { nombre: 'PRODUCTOS LACTEOS DE CENTROAMERICA', anios: 1 },
  { nombre: 'RICZA', anios: 1 },
  { nombre: 'SAVONA DE GUATEMALA', anios: 1 },
  { nombre: 'SERVICOCINAS', anios: 1 },
  { nombre: 'SUPER VITAMINAS', anios: 1 },
  { nombre: 'UNISUPER', anios: 1 },
  { nombre: 'VIVENDO', anios: 1 },
]

function contarGarantias(tickets) {
  let vencidas = 0, vigentes = 0, sinSerie = 0
  tickets.forEach(t => {
    const clienteNorm = normalizarTexto(t['CLIENTE'])
    const match = CLIENTES_GARANTIA.find(c => clienteNorm.includes(normalizarTexto(c.nombre)))
    if (!match) return
    const serie = String(t['SERIE'] || '').replace(/\D/g, '')
    if (serie.length < 6) { sinSerie++; return }
    const anio = parseInt(serie.substring(0, 2), 10)
    const mes = parseInt(serie.substring(2, 4), 10)
    const dia = parseInt(serie.substring(4, 6), 10)
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) { sinSerie++; return }
    const anioC = anio <= 50 ? 2000 + anio : 1900 + anio
    const fab = new Date(anioC, mes - 1, dia)
    const venc = new Date(fab); venc.setFullYear(venc.getFullYear() + match.anios)
    const hoy = new Date(); hoy.setHours(0,0,0,0)
    if (hoy > venc) vencidas++; else vigentes++
  })
  return { vencidas, vigentes, sinSerie }
}

export default function Dashboard({ allTickets, nombreArchivo, fechaSubidaExcel }) {
  const stats = useMemo(() => {
    if (allTickets.length === 0) return null

    const pendientes = allTickets.filter(t => !t.ESTADO_LIMPIO.includes('FINALIZADA'))
    const finalizados = allTickets.filter(t => t.ESTADO_LIMPIO.includes('FINALIZADA'))
    const enProceso = allTickets.filter(t => t.ESTADO_LIMPIO.includes('PROCESO'))
    const asignados = allTickets.filter(t => t.ESTADO_LIMPIO.includes('TECNICO'))
    const agencia = allTickets.filter(t => t.ESTADO_LIMPIO.includes('AGENCIA'))

    // Envejecimiento
    const env = { menos24: 0, mas24: 0, mas72: 0, mas100: 0 }
    pendientes.forEach(t => {
      const h = parseFloat(t['TIEMPO_TRANSCURRIDO']) || 0
      if (h < 24) env.menos24++
      else if (h < 48) env.mas24++
      else if (h < 72) env.mas72++
      else env.mas100++
    })

    // Productividad por técnico (finalizados)
    const prodMap = {}
    finalizados.forEach(t => {
      prodMap[t.tecnico] = (prodMap[t.tecnico] || 0) + 1
    })
    const productividad = Object.entries(prodMap).sort((a, b) => b[1] - a[1])
    const maxProd = productividad.length > 0 ? productividad[0][1] : 1

    // Carga por técnico (pendientes)
    const cargaMap = {}
    pendientes.forEach(t => {
      const tec = t.tecnico === 'SIN TÉCNICO' ? 'SIN ASIGNAR' : t.tecnico
      cargaMap[tec] = (cargaMap[tec] || 0) + 1
    })
    const carga = Object.entries(cargaMap).sort((a, b) => b[1] - a[1])
    const maxCarga = carga.length > 0 ? carga[0][1] : 1

    // Garantías
    const garantias = contarGarantias(pendientes)

    return {
      total: allTickets.length,
      pendientes: pendientes.length,
      finalizados: finalizados.length,
      enProceso: enProceso.length,
      asignados: asignados.length,
      agencia: agencia.length,
      env,
      criticos: env.mas72 + env.mas100,
      productividad,
      maxProd,
      carga,
      maxCarga,
      garantias,
      tecnicos: new Set(allTickets.map(t => t.tecnico)).size
    }
  }, [allTickets])

  if (!stats) {
    return (
      <div className="text-center py-20 card">
        <FileSpreadsheet size={48} className="mx-auto mb-4 text-slate-300" />
        <p className="text-sm font-semibold text-slate-500">Sube un archivo en la pestaña "Técnicos"</p>
        <p className="text-xs font-medium text-slate-400 mt-1">El dashboard se generará automáticamente</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 fade-in">
      {/* ── Info del archivo ── */}
      {nombreArchivo && (
        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
          <FileSpreadsheet size={12} />
          <span>{nombreArchivo}</span>
          {fechaSubidaExcel && <span className="text-slate-300">· {fechaSubidaExcel}</span>}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard 
          label="Pendientes" 
          value={stats.pendientes} 
          sub={`de ${stats.total} totales`}
          icon={Clock}
          color="sky"
        />
        <KpiCard 
          label="En Proceso" 
          value={stats.enProceso} 
          sub={`${stats.asignados} asignados · ${stats.agencia} agencia`}
          icon={Wrench}
          color="amber"
        />
        <KpiCard 
          label="Finalizados" 
          value={stats.finalizados} 
          sub={`${stats.tecnicos} técnicos activos`}
          icon={CheckCircle}
          color="emerald"
        />
        <KpiCard 
          label="Críticos (+72h)" 
          value={stats.criticos} 
          sub={stats.criticos === 0 ? 'Sin tickets críticos' : 'Requieren atención'}
          icon={AlertTriangle}
          color={stats.criticos > 0 ? 'rose' : 'slate'}
          alert={stats.criticos > 0}
        />
      </div>

      {/* ── Envejecimiento visual ── */}
      <div className="card-section">
        <div className="px-4 py-2.5 bg-slate-800">
          <p className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock size={12} /> Distribución de Envejecimiento
          </p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-4 gap-3">
            <EnvBucket label="-24h" count={stats.env.menos24} total={stats.pendientes} color="emerald" />
            <EnvBucket label="+24h" count={stats.env.mas24} total={stats.pendientes} color="amber" />
            <EnvBucket label="+72h" count={stats.env.mas72} total={stats.pendientes} color="red" />
            <EnvBucket label="+100h" count={stats.env.mas100} total={stats.pendientes} color="rose" />
          </div>
        </div>
      </div>

      {/* ── Dos columnas: Productividad + Carga ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Productividad */}
        <div className="card-section">
          <div className="px-4 py-2.5 bg-slate-800">
            <p className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={12} /> Productividad — Cierres por Técnico
            </p>
          </div>
          <div className="p-4 space-y-2">
            {stats.productividad.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Sin datos de cierres</p>
            ) : (
              stats.productividad.slice(0, 12).map(([tec, count]) => (
                <div key={tec} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-600 uppercase w-32 truncate shrink-0">{tec}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden relative">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-md transition-all duration-500"
                      style={{ width: `${Math.max((count / stats.maxProd) * 100, 8)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-black text-slate-700">{count}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Carga pendiente */}
        <div className="card-section">
          <div className="px-4 py-2.5 bg-slate-800">
            <p className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Users size={12} /> Carga Pendiente por Técnico
            </p>
          </div>
          <div className="p-4 space-y-2">
            {stats.carga.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Sin tickets pendientes</p>
            ) : (
              stats.carga.slice(0, 12).map(([tec, count]) => (
                <div key={tec} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-600 uppercase w-32 truncate shrink-0">{tec}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden relative">
                    <div 
                      className="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded-md transition-all duration-500"
                      style={{ width: `${Math.max((count / stats.maxCarga) * 100, 8)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-black text-slate-700">{count}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Garantías resumen ── */}
      {(stats.garantias.vencidas > 0 || stats.garantias.vigentes > 0 || stats.garantias.sinSerie > 0) && (
        <div className="card-section">
          <div className="px-4 py-2.5 bg-slate-800">
            <p className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert size={12} /> Resumen de Garantías
            </p>
          </div>
          <div className="p-4 flex flex-wrap gap-4">
            {stats.garantias.vencidas > 0 && (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">
                <span className="text-2xl font-black text-rose-600">{stats.garantias.vencidas}</span>
                <div>
                  <p className="text-[10px] font-bold text-rose-700 uppercase">Vencidas</p>
                  <p className="text-[9px] text-rose-500 font-medium">No atender bajo garantía</p>
                </div>
              </div>
            )}
            {stats.garantias.vigentes > 0 && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
                <span className="text-2xl font-black text-emerald-600">{stats.garantias.vigentes}</span>
                <div>
                  <p className="text-[10px] font-bold text-emerald-700 uppercase">Vigentes</p>
                  <p className="text-[9px] text-emerald-500 font-medium">Se atienden sin costo</p>
                </div>
              </div>
            )}
            {stats.garantias.sinSerie > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                <span className="text-2xl font-black text-amber-600">{stats.garantias.sinSerie}</span>
                <div>
                  <p className="text-[10px] font-bold text-amber-700 uppercase">Sin Serie</p>
                  <p className="text-[9px] text-amber-500 font-medium">Verificar manualmente</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componentes internos ──

function KpiCard({ label, value, sub, icon: Icon, color, alert }) {
  const colors = {
    sky: 'from-sky-500 to-sky-600',
    amber: 'from-amber-500 to-amber-600',
    emerald: 'from-emerald-500 to-emerald-600',
    rose: 'from-rose-500 to-rose-600',
    slate: 'from-slate-400 to-slate-500',
  }
  return (
    <div className={`card overflow-hidden ${alert ? 'ring-2 ring-rose-300' : ''}`}>
      <div className={`h-1 bg-gradient-to-r ${colors[color]}`} />
      <div className="p-3.5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="text-3xl font-black text-slate-800 leading-none mt-1">{value}</p>
          </div>
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colors[color]} flex items-center justify-center text-white shadow-lg`}>
            <Icon size={15} />
          </div>
        </div>
        <p className="text-[10px] font-medium text-slate-400 mt-1.5">{sub}</p>
      </div>
    </div>
  )
}

function EnvBucket({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const barColors = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    rose: 'bg-rose-700',
  }
  return (
    <div className="text-center">
      <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">{label}</p>
      <div className="h-24 bg-slate-100 rounded-lg relative overflow-hidden flex items-end justify-center">
        <div 
          className={`w-full ${barColors[color]} rounded-t-md transition-all duration-700`}
          style={{ height: `${Math.max(pct, count > 0 ? 10 : 0)}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-xl font-black text-slate-700">{count}</span>
      </div>
      <p className="text-[9px] font-semibold text-slate-400 mt-1">{pct}%</p>
    </div>
  )
}
