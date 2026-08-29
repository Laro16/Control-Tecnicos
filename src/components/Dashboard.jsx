import { useMemo } from 'react'
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock3, FileSpreadsheet,
  Gauge, ShieldAlert, TrendingUp, Users, Wrench
} from 'lucide-react'
import { verificarGarantiaTicket } from '../utils/garantias'

function contarGarantias(tickets, clientesGarantia) {
  let vencidas = 0, vigentes = 0, sinSerie = 0, tipoIncorrecto = 0
  tickets.forEach(t => {
    const garantia = verificarGarantiaTicket(t, clientesGarantia)
    if (!garantia) return
    if (garantia.tipoIncorrecto) tipoIncorrecto++
    else if (garantia.sinDatosSerie) sinSerie++
    else if (garantia.vencida) vencidas++
    else vigentes++
  })
  return { vencidas, vigentes, sinSerie, tipoIncorrecto }
}

export default function Dashboard({ allTickets, nombreArchivo, fechaSubidaExcel, onNavigate, clientesGarantia = [] }) {
  const stats = useMemo(() => {
    if (allTickets.length === 0) return null

    const pendientes = allTickets.filter(t => !t.ESTADO_LIMPIO.includes('FINALIZADA'))
    const finalizados = allTickets.filter(t => t.ESTADO_LIMPIO.includes('FINALIZADA'))
    const enProceso = allTickets.filter(t => t.ESTADO_LIMPIO.includes('PROCESO'))
    const asignados = allTickets.filter(t => t.ESTADO_LIMPIO.includes('TECNICO'))
    const agencia = allTickets.filter(t => t.ESTADO_LIMPIO.includes('AGENCIA'))
    const env = { menos24: 0, mas24: 0, mas72: 0, mas100: 0 }

    pendientes.forEach(t => {
      const horas = parseFloat(t.TIEMPO_TRANSCURRIDO) || 0
      if (horas < 24) env.menos24++
      else if (horas < 48) env.mas24++
      else if (horas < 72) env.mas72++
      else env.mas100++
    })

    const productividadMap = {}
    finalizados.forEach(t => { productividadMap[t.tecnico] = (productividadMap[t.tecnico] || 0) + 1 })
    const productividad = Object.entries(productividadMap).sort((a, b) => b[1] - a[1])

    const cargaMap = {}
    pendientes.forEach(t => {
      const tecnico = t.tecnico === 'SIN TÉCNICO' || !t.tecnico ? 'SIN ASIGNAR' : t.tecnico
      cargaMap[tecnico] = (cargaMap[tecnico] || 0) + 1
    })
    const carga = Object.entries(cargaMap).sort((a, b) => b[1] - a[1])

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
      maxProd: productividad[0]?.[1] || 1,
      carga,
      maxCarga: carga[0]?.[1] || 1,
      garantias: contarGarantias(pendientes, clientesGarantia),
      tecnicos: new Set(allTickets.map(t => t.tecnico).filter(Boolean)).size,
      avance: Math.round((finalizados.length / allTickets.length) * 100),
    }
  }, [allTickets, clientesGarantia])

  if (!stats) {
    return (
      <div className="card flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
          <FileSpreadsheet size={28} />
        </span>
        <h2 className="text-lg font-extrabold text-slate-900">Tu panel está listo para recibir datos</h2>
        <p className="mt-2 max-w-sm text-sm text-slate-500">Carga el archivo de tickets desde Técnicos y aquí verás la operación completa.</p>
        <button onClick={() => onNavigate('tecnicos')} className="btn-primary mt-5 flex items-center gap-2">
          Ir a Técnicos <ArrowRight size={14} />
        </button>
      </div>
    )
  }

  const envejecimiento = [
    { label: 'Menos de 24 h', short: '<24h', count: stats.env.menos24, color: 'bg-emerald-500', text: 'text-emerald-700', soft: 'bg-emerald-50' },
    { label: 'De 24 a 48 h', short: '24–48h', count: stats.env.mas24, color: 'bg-amber-400', text: 'text-amber-700', soft: 'bg-amber-50' },
    { label: 'De 48 a 72 h', short: '48–72h', count: stats.env.mas72, color: 'bg-orange-500', text: 'text-orange-700', soft: 'bg-orange-50' },
    { label: 'Más de 72 h', short: '>72h', count: stats.env.mas100, color: 'bg-rose-600', text: 'text-rose-700', soft: 'bg-rose-50' },
  ]

  return (
    <div className="space-y-5 fade-in">
      <section className="workspace-hero">
        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky-300">
              <Gauge size={13} /> Centro de operaciones
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Vista general de servicio</h1>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-300 sm:text-sm">
              Prioriza la carga activa, detecta atrasos y revisa el rendimiento del equipo desde un solo lugar.
            </p>
            {nombreArchivo && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-400">
                <FileSpreadsheet size={12} className="text-sky-400" />
                <span className="text-slate-200">{nombreArchivo}</span>
                {fechaSubidaExcel && <span>· actualizado {fechaSubidaExcel}</span>}
              </div>
            )}
          </div>
          <button onClick={() => onNavigate('tecnicos')} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-slate-900 shadow-lg transition hover:bg-sky-50 active:scale-[0.98]">
            Abrir operación <ArrowRight size={14} />
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Carga pendiente" value={stats.pendientes} detail={`${stats.total} tickets en total`} icon={Clock3} tone="sky" onClick={() => onNavigate('tecnicos')} />
        <MetricCard label="En proceso" value={stats.enProceso} detail={`${stats.asignados} técnico · ${stats.agencia} agencia`} icon={Wrench} tone="amber" onClick={() => onNavigate('tecnicos')} />
        <MetricCard label="Finalizados" value={stats.finalizados} detail={`${stats.avance}% de avance general`} icon={CheckCircle2} tone="emerald" onClick={() => onNavigate('tablas')} />
        <MetricCard label="Atención crítica" value={stats.criticos} detail={stats.criticos ? 'Tickets con más de 72 horas' : 'Operación sin atrasos críticos'} icon={AlertTriangle} tone={stats.criticos ? 'rose' : 'slate'} onClick={() => onNavigate('tablas')} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <button onClick={() => onNavigate('tablas')} className="card-section text-left transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg">
          <PanelHeader icon={Clock3} title="Envejecimiento de tickets" subtitle="Distribución de la carga pendiente por tiempo" />
          <div className="p-5">
            <div className="mb-5 flex h-3 overflow-hidden rounded-full bg-slate-100">
              {envejecimiento.map(item => stats.pendientes > 0 && (
                <span key={item.short} className={`${item.color} transition-all`} style={{ width: `${(item.count / stats.pendientes) * 100}%` }} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {envejecimiento.map(item => (
                <div key={item.short} className={`rounded-xl ${item.soft} p-3 ring-1 ring-inset ring-black/[0.04]`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className={`h-2 w-2 rounded-full ${item.color}`} />
                    <span className="text-[9px] font-bold text-slate-400">{stats.pendientes ? Math.round(item.count / stats.pendientes * 100) : 0}%</span>
                  </div>
                  <p className={`text-2xl font-black ${item.text}`}>{item.count}</p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </button>

        <div className="card-section">
          <PanelHeader icon={Gauge} title="Pulso operativo" subtitle="Indicadores rápidos del equipo" />
          <div className="grid grid-cols-2 gap-px bg-slate-100">
            <PulseStat value={stats.tecnicos} label="Técnicos activos" icon={Users} />
            <PulseStat value={`${stats.avance}%`} label="Avance general" icon={TrendingUp} />
            <PulseStat value={stats.asignados} label="Asignados a técnico" icon={Wrench} />
            <PulseStat value={stats.agencia} label="Asignados a agencia" icon={FileSpreadsheet} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <RankingPanel title="Cierres por técnico" subtitle="Productividad registrada" icon={TrendingUp} rows={stats.productividad} max={stats.maxProd} color="bg-emerald-500" empty="Sin cierres registrados" onClick={() => onNavigate('tablas')} />
        <RankingPanel title="Carga por técnico" subtitle="Tickets que requieren seguimiento" icon={Users} rows={stats.carga} max={stats.maxCarga} color="bg-sky-500" empty="Sin tickets pendientes" onClick={() => onNavigate('tecnicos')} />
      </section>

      {(stats.garantias.vencidas > 0 || stats.garantias.vigentes > 0 || stats.garantias.sinSerie > 0 || stats.garantias.tipoIncorrecto > 0) && (
        <button onClick={() => onNavigate('tecnicos')} className="card-section w-full text-left transition hover:border-sky-200 hover:shadow-lg">
          <PanelHeader icon={ShieldAlert} title="Control de garantías" subtitle="Validaciones que requieren atención operativa" />
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <GuaranteeCard value={stats.garantias.tipoIncorrecto} label="Tipo incorrecto" detail="Cambiar Normal por Garantia" tone="violet" />
            <GuaranteeCard value={stats.garantias.vencidas} label="Vencidas" detail="No atender bajo garantía" tone="rose" />
            <GuaranteeCard value={stats.garantias.vigentes} label="Vigentes" detail="Atención cubierta" tone="emerald" />
            <GuaranteeCard value={stats.garantias.sinSerie} label="Por verificar" detail="Serie incompleta o inválida" tone="amber" />
          </div>
        </button>
      )}
    </div>
  )
}

function MetricCard({ label, value, detail, icon: Icon, tone, onClick }) {
  const tones = {
    sky: ['bg-sky-50 text-sky-700', 'bg-sky-500'],
    amber: ['bg-amber-50 text-amber-700', 'bg-amber-500'],
    emerald: ['bg-emerald-50 text-emerald-700', 'bg-emerald-500'],
    rose: ['bg-rose-50 text-rose-700', 'bg-rose-500'],
    slate: ['bg-slate-100 text-slate-600', 'bg-slate-400'],
  }
  return (
    <button onClick={onClick} className="card group p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg active:scale-[0.99]">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone][0]}`}><Icon size={18} /></span>
        <span className={`mt-1 h-2 w-2 rounded-full ${tones[tone][1]}`} />
      </div>
      <p className="mt-5 text-3xl font-black tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 line-clamp-2 text-[10px] font-medium text-slate-400">{detail}</p>
    </button>
  )
}

function PanelHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon size={16} /></span>
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-[10px] font-medium text-slate-400">{subtitle}</p>
        </div>
      </div>
      <ArrowRight size={15} className="text-slate-300" />
    </div>
  )
}

function PulseStat({ value, label, icon: Icon }) {
  return (
    <div className="bg-white p-5">
      <Icon size={15} className="mb-3 text-sky-500" />
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  )
}

function RankingPanel({ title, subtitle, icon, rows, max, color, empty, onClick }) {
  return (
    <button onClick={onClick} className="card-section text-left transition hover:border-sky-200 hover:shadow-lg">
      <PanelHeader icon={icon} title={title} subtitle={subtitle} />
      <div className="max-h-[330px] space-y-3 overflow-y-auto p-5">
        {rows.length === 0 ? <p className="py-8 text-center text-xs font-medium text-slate-400">{empty}</p> : rows.slice(0, 12).map(([nombre, cantidad], index) => (
          <div key={nombre} className="grid grid-cols-[22px_minmax(80px,130px)_1fr_24px] items-center gap-2.5">
            <span className="text-[9px] font-black text-slate-300">{String(index + 1).padStart(2, '0')}</span>
            <span className="truncate text-[10px] font-extrabold uppercase text-slate-600">{nombre}</span>
            <span className="h-2 overflow-hidden rounded-full bg-slate-100">
              <span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.max(cantidad / max * 100, 5)}%` }} />
            </span>
            <span className="text-right text-xs font-black text-slate-800">{cantidad}</span>
          </div>
        ))}
      </div>
    </button>
  )
}

function GuaranteeCard({ value, label, detail, tone }) {
  const tones = {
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  }
  return (
    <div className={`rounded-xl p-4 ring-1 ring-inset ${tones[tone]}`}>
      <p className="text-3xl font-black">{value}</p>
      <p className="mt-1 text-[10px] font-extrabold uppercase tracking-wider">{label}</p>
      <p className="mt-2 text-[10px] font-medium opacity-70">{detail}</p>
    </div>
  )
}
