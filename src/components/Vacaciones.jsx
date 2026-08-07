import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabase';
import {
  CalendarDays, Plus, Trash2, Users, Download, X, Pencil,
  AlertCircle, Loader2, Search, ChevronDown
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Fechas: siempre como texto YYYY-MM-DD, nunca new Date(string).     */
/*  new Date('2026-07-06') se interpreta en UTC y en Guatemala (-6)    */
/*  se corre un día para atrás. Esto lo evita.                         */
/* ------------------------------------------------------------------ */
const aFecha = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const aTexto = (dt) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

const mostrar = (s) => {
  const d = aFecha(s);
  return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—';
};

const hoyTexto = () => aTexto(new Date());

/* Mismo cálculo que hace el trigger en Postgres, solo para la vista previa.
   Para vacaciones siempre se excluyen sábado, domingo y asuetos. */
const calcularHabiles = (inicio, fin, setAsuetos) => {
  if (!inicio || !fin) return 0;
  const a = aFecha(inicio);
  const b = aFecha(fin);
  if (!a || !b || b < a) return 0;
  let n = 0;
  for (const cur = new Date(a); cur <= b; cur.setDate(cur.getDate() + 1)) {
    if ([0, 6].includes(cur.getDay())) continue;
    if (setAsuetos.has(aTexto(cur))) continue;
    n++;
  }
  return n;
};

const JORNADAS = [
  { valor: '0,6', etiqueta: 'Lunes a viernes (descansa sábado y domingo)' },
  { valor: '0',   etiqueta: 'Lunes a sábado (descansa solo domingo)' },
];

const JORNADA_DEFECTO = '0,6';

const jornadaTexto = (arr) => (arr || []).join(',') === '0' ? 'Lun–Sáb' : 'Lun–Vie';

/* ================================================================== */

export default function Vacaciones() {
  const [pestana, setPestana] = useState('registro');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState('');

  const [empleados, setEmpleados] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [goces, setGoces] = useState([]);
  const [asuetos, setAsuetos] = useState([]);

  const [modalGoce, setModalGoce] = useState(false);
  const [modalEmpleado, setModalEmpleado] = useState(false);
  const [editandoEmpleado, setEditandoEmpleado] = useState(null);

  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [filtroAnio, setFiltroAnio] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const setAsuetos_ = useMemo(() => new Set(asuetos.map((a) => a.fecha)), [asuetos]);

  /* ---------------------------- carga ---------------------------- */
  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [emp, res, goc, asu] = await Promise.all([
        supabase.from('vac_empleados').select('*').order('nombre'),
        supabase.from('vac_resumen').select('*').order('nombre'),
        supabase
          .from('vac_goces')
          .select('*, vac_empleados(codigo, nombre, puesto)')
          .order('fecha_inicio', { ascending: false }),
        supabase.from('vac_asuetos').select('*').order('fecha'),
      ]);
      const fallo = [emp, res, goc, asu].find((r) => r.error);
      if (fallo) throw fallo.error;
      setEmpleados(emp.data || []);
      setResumen(res.data || []);
      setGoces(goc.data || []);
      setAsuetos(asu.data || []);
    } catch (e) {
      setError(e.message || 'No se pudieron cargar los datos.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  /* --------------------------- filtros --------------------------- */
  const anios = useMemo(() => {
    const s = new Set(goces.map((g) => g.fecha_inicio.slice(0, 4)));
    return [...s].sort().reverse();
  }, [goces]);

  const gocesFiltrados = useMemo(() => goces.filter((g) => {
    if (filtroEmpleado && g.empleado_id !== filtroEmpleado) return false;
    if (filtroAnio && !g.fecha_inicio.startsWith(filtroAnio)) return false;
    if (busqueda) {
      const t = `${g.vac_empleados?.codigo || ''} ${g.vac_empleados?.nombre || ''} ${g.observaciones || ''}`.toLowerCase();
      if (!t.includes(busqueda.toLowerCase())) return false;
    }
    return true;
  }), [goces, filtroEmpleado, filtroAnio, busqueda]);

  const totalFiltrado = gocesFiltrados.reduce((s, g) => s + (g.dias_habiles || 0), 0);

  /* --------------------------- acciones -------------------------- */
  const borrarGoce = async (id) => {
    if (!window.confirm('¿Eliminar este registro de vacaciones?')) return;
    const { error: e } = await supabase.from('vac_goces').delete().eq('id', id);
    if (e) return setError(e.message);
    cargar();
  };

  const borrarEmpleado = async (id, nombre) => {
    if (!window.confirm(`Eliminar a ${nombre} borra también todos sus registros de vacaciones. ¿Continuar?`)) return;
    const { error: e } = await supabase.from('vac_empleados').delete().eq('id', id);
    if (e) return setError(e.message);
    cargar();
  };

  /* ------------------------- reporte en Excel -------------------------- */
  /* ExcelJS se carga con import() dinámico: son ~270 KB que NO entran al
     bundle principal, solo se bajan la primera vez que se toca el botón. */
  const exportarExcel = async () => {
    setExportando(true);
    try {
      const ExcelJS = (await import('exceljs')).default;

      const TINTA   = 'FF1E293B'; // encabezados
      const CEBRA   = 'FFF1F5F9';
      const LINEA   = 'FFCBD5E1';
      const TOTALES = 'FFE2E8F0';
      const borde = {
        top:    { style: 'thin', color: { argb: LINEA } },
        left:   { style: 'thin', color: { argb: LINEA } },
        bottom: { style: 'thin', color: { argb: LINEA } },
        right:  { style: 'thin', color: { argb: LINEA } },
      };
      const col = (i) => String.fromCharCode(64 + i); // 1 -> A

      const criterios = [];
      if (filtroEmpleado) criterios.push(`Personal: ${empleados.find((e) => e.id === filtroEmpleado)?.nombre || ''}`);
      if (filtroAnio)     criterios.push(`Año: ${filtroAnio}`);
      if (busqueda)       criterios.push(`Búsqueda: "${busqueda}"`);
      const subtitulo = `${criterios.length ? criterios.join('   ·   ') : 'Todos los registros'}   ·   Generado el ${new Date().toLocaleDateString('es-GT')}`;

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Control-Tecnicos';
      wb.created = new Date();

      /* Título, subtítulo, encabezados y configuración de impresión.
         Devuelve el número de la primera fila de datos. */
      const armarCabecera = (ws, titulo, columnas) => {
        const n = columnas.length;
        const ultima = col(n);

        ws.mergeCells(`A1:${ultima}1`);
        const t = ws.getCell('A1');
        t.value = titulo;
        t.font = { bold: true, size: 14, color: { argb: TINTA } };
        t.alignment = { vertical: 'middle' };
        ws.getRow(1).height = 24;

        ws.mergeCells(`A2:${ultima}2`);
        const s = ws.getCell('A2');
        s.value = subtitulo;
        s.font = { size: 9, italic: true, color: { argb: 'FF64748B' } };
        ws.getRow(2).height = 16;

        ws.columns = columnas.map((c) => ({ width: c.ancho }));

        const enc = ws.getRow(4);
        columnas.forEach((c, i) => {
          const celda = enc.getCell(i + 1);
          celda.value = c.titulo;
          celda.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
          celda.alignment = { horizontal: c.alinear || 'left', vertical: 'middle', wrapText: true };
          celda.border = borde;
        });
        enc.height = 22;

        ws.views = [{ state: 'frozen', ySplit: 4 }];
        ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: n } };

        /* Impresión: horizontal, ajustado a una hoja de ancho, con el
           encabezado repetido en cada página y numeración al pie. */
        ws.pageSetup = {
          orientation: 'landscape',
          paperSize: 9,               // A4
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          horizontalCentered: true,
          printTitlesRow: '4:4',
          margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
        };
        ws.headerFooter = {
          oddFooter: '&L&9Control-Tecnicos&C&9&P de &N&R&9&D',
        };

        return 5;
      };

      const pintarFila = (fila, columnas, indice) => {
        columnas.forEach((c, i) => {
          const celda = fila.getCell(i + 1);
          celda.border = borde;
          celda.font = { size: 10 };
          celda.alignment = { horizontal: c.alinear || 'left', vertical: 'middle', wrapText: c.envolver || false };
          if (c.formato) celda.numFmt = c.formato;
          if (indice % 2) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CEBRA } };
        });
      };

      /* Fila de totales con fórmulas SUM reales, no números pegados: si
         alguien borra o filtra filas en Excel, el total se recalcula. */
      const filaTotales = (ws, numFila, columnas, etiqueta, colsSumar, desde, hasta) => {
        const fila = ws.getRow(numFila);
        const ultimaEtiqueta = Math.min(...colsSumar) - 1;
        if (ultimaEtiqueta >= 1) ws.mergeCells(`A${numFila}:${col(ultimaEtiqueta)}${numFila}`);
        fila.getCell(1).value = etiqueta;
        colsSumar.forEach((c) => {
          fila.getCell(c).value = { formula: `SUM(${col(c)}${desde}:${col(c)}${hasta})` };
        });
        columnas.forEach((_, i) => {
          const celda = fila.getCell(i + 1);
          celda.font = { bold: true, size: 10, color: { argb: TINTA } };
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTALES } };
          celda.border = borde;
          celda.alignment = { horizontal: colsSumar.includes(i + 1) ? 'center' : 'left', vertical: 'middle' };
        });
        fila.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
        fila.height = 20;
      };

      /* ---------- Hoja 1 · Registro ---------- */
      const colsRegistro = [
        { titulo: 'Código',        ancho: 11, alinear: 'center' },
        { titulo: 'Compañero',     ancho: 26 },
        { titulo: 'Puesto',        ancho: 18 },
        { titulo: 'Jornada',       ancho: 11, alinear: 'center' },
        { titulo: 'Desde',         ancho: 12, alinear: 'center', formato: 'dd/mm/yyyy' },
        { titulo: 'Hasta',         ancho: 12, alinear: 'center', formato: 'dd/mm/yyyy' },
        { titulo: 'Días hábiles',  ancho: 13, alinear: 'center' },
        { titulo: 'Observaciones', ancho: 34, envolver: true },
      ];

      const h1 = wb.addWorksheet('Registro', { properties: { tabColor: { argb: TINTA } } });
      const inicio1 = armarCabecera(h1, 'CONTROL DE VACACIONES · TÉCNICOS', colsRegistro);
      let r = inicio1;

      const porEmpleado = new Map(empleados.map((e) => [e.id, e]));
      const ordenados = [...gocesFiltrados].sort((a, b) => {
        const na = a.vac_empleados?.nombre || '';
        const nb = b.vac_empleados?.nombre || '';
        return na === nb ? a.fecha_inicio.localeCompare(b.fecha_inicio) : na.localeCompare(nb);
      });

      ordenados.forEach((g, i) => {
        const fila = h1.getRow(r++);
        fila.values = [
          g.vac_empleados?.codigo || '',
          g.vac_empleados?.nombre || '',
          g.vac_empleados?.puesto || '',
          jornadaTexto(porEmpleado.get(g.empleado_id)?.dias_descanso),
          aFecha(g.fecha_inicio),
          aFecha(g.fecha_fin),
          g.dias_habiles,
          g.observaciones || '',
        ];
        pintarFila(fila, colsRegistro, i);
        fila.getCell(1).font = { size: 10, name: 'Consolas' };
        fila.getCell(7).font = { size: 10, bold: true };
      });

      if (ordenados.length) {
        filaTotales(h1, r, colsRegistro, 'TOTAL DE DÍAS HÁBILES', [7], inicio1, r - 1);
      }

      /* ---------- Hoja 2 · Resumen por persona ---------- */
      const colsResumen = [
        { titulo: 'Código',          ancho: 11, alinear: 'center' },
        { titulo: 'Compañero',       ancho: 26 },
        { titulo: 'Puesto',          ancho: 18 },
        { titulo: 'Jornada',         ancho: 11, alinear: 'center' },
        { titulo: 'Períodos',        ancho: 11, alinear: 'center' },
        { titulo: 'Días este año',   ancho: 14, alinear: 'center' },
        { titulo: 'Días histórico',  ancho: 15, alinear: 'center' },
        { titulo: 'Último goce',     ancho: 13, alinear: 'center', formato: 'dd/mm/yyyy' },
      ];

      const h2 = wb.addWorksheet('Resumen por persona');
      const inicio2 = armarCabecera(h2, 'RESUMEN POR PERSONA', colsResumen);
      let r2 = inicio2;

      const personas = [...resumen].sort((a, b) => a.nombre.localeCompare(b.nombre));
      personas.forEach((p, i) => {
        const fila = h2.getRow(r2++);
        fila.values = [
          p.codigo || '',
          p.nombre,
          p.puesto || '',
          jornadaTexto(p.dias_descanso),
          p.periodos,
          p.dias_anio_actual,
          p.dias_total,
          p.ultimo_goce ? aFecha(p.ultimo_goce) : '',
        ];
        pintarFila(fila, colsResumen, i);
        fila.getCell(1).font = { size: 10, name: 'Consolas' };
        fila.getCell(7).font = { size: 10, bold: true };
      });

      if (personas.length) {
        filaTotales(h2, r2, colsResumen, 'TOTALES', [5, 6, 7], inicio2, r2 - 1);
      }

      /* ---------- Hoja 3 · Asuetos considerados ---------- */
      const colsAsuetos = [
        { titulo: 'Fecha',       ancho: 14, alinear: 'center', formato: 'dd/mm/yyyy' },
        { titulo: 'Día',         ancho: 12, alinear: 'center' },
        { titulo: 'Descripción', ancho: 46 },
      ];
      const h3 = wb.addWorksheet('Asuetos');
      let r3 = armarCabecera(h3, 'ASUETOS CONSIDERADOS EN EL CÁLCULO', colsAsuetos);
      const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      asuetos.forEach((a, i) => {
        const fila = h3.getRow(r3++);
        const d = aFecha(a.fecha);
        fila.values = [d, DIAS[d.getDay()], a.descripcion];
        pintarFila(fila, colsAsuetos, i);
      });

      /* ---------- Descarga ---------- */
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Control_Vacaciones_${hoyTexto()}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(`No se pudo generar el Excel: ${e.message}`);
    } finally {
      setExportando(false);
    }
  };

  /* ---------------------------- render --------------------------- */
  if (cargando) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 size={18} className="animate-spin mr-2" />
        <span className="text-xs">Cargando vacaciones…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <CalendarDays size={17} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Control de vacaciones</h2>
            <p className="text-[10px] text-slate-400">Registro y seguimiento de días gozados</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={exportarExcel}
            disabled={!gocesFiltrados.length || exportando}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40"
            title="Descargar reporte en Excel"
          >
            {exportando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {exportando ? 'Generando…' : 'Excel'}
          </button>
          <button
            onClick={() => { setEditandoEmpleado(null); setModalEmpleado(true); }}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50"
          >
            <Users size={13} /> Personal
          </button>
          <button
            onClick={() => setModalGoce(true)}
            disabled={!empleados.length}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-slate-800 text-white shadow-sm hover:bg-slate-700 disabled:opacity-40"
          >
            <Plus size={13} /> Registrar vacaciones
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-red-700 flex-1">{error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600"><X size={13} /></button>
        </div>
      )}

      {!empleados.length && (
        <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center">
          <p className="text-xs text-slate-500 mb-3">Todavía no hay personal registrado.</p>
          <button
            onClick={() => { setEditandoEmpleado(null); setModalEmpleado(true); }}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700"
          >
            Agregar al primer compañero
          </button>
        </div>
      )}

      {/* Pestañas */}
      {!!empleados.length && (
        <>
          <div className="flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {[['registro', 'Registro'], ['personal', 'Por persona']].map(([id, txt]) => (
              <button
                key={id}
                onClick={() => setPestana(id)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
                  pestana === id
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {txt}
              </button>
            ))}
          </div>

          {pestana === 'registro' ? (
            <>
              {/* Filtros */}
              <div className="flex items-center gap-2 flex-wrap rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                <div className="relative flex-1 min-w-[140px]">
                  <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar…"
                    className="w-full pl-7 pr-2 py-2 text-[11px] border border-slate-200 rounded-lg bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
                <select
                  value={filtroEmpleado}
                  onChange={(e) => setFiltroEmpleado(e.target.value)}
                  className="text-[11px] border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                >
                  <option value="">Todo el personal</option>
                  {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
                <select
                  value={filtroAnio}
                  onChange={(e) => setFiltroAnio(e.target.value)}
                  className="text-[11px] border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                >
                  <option value="">Todos los años</option>
                  {anios.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-2 rounded-lg whitespace-nowrap">
                  {gocesFiltrados.length} reg · {totalFiltrado} días
                </span>
              </div>

              {/* Tabla de goces */}
              <div className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-sm">
                {gocesFiltrados.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-8">
                    No hay registros con estos filtros.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-separate border-spacing-0">
                      <thead className="bg-slate-100/80">
                        <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                          <th className="border-b border-r border-slate-300 px-3 py-2.5 font-bold">Código</th>
                          <th className="border-b border-r border-slate-300 px-3 py-2.5 font-bold">Compañero</th>
                          <th className="border-b border-r border-slate-300 px-3 py-2.5 font-bold">Desde</th>
                          <th className="border-b border-r border-slate-300 px-3 py-2.5 font-bold">Hasta</th>
                          <th className="border-b border-r border-slate-300 px-3 py-2.5 font-bold text-center">Días hábiles</th>
                          <th className="border-b border-r border-slate-300 px-3 py-2.5 font-bold">Observaciones</th>
                          <th className="border-b border-slate-300 px-3 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {gocesFiltrados.map((g, i) => (
                          <tr
                            key={g.id}
                            className={`transition-colors hover:bg-slate-100/80 ${i % 2 ? 'bg-slate-50/60' : 'bg-white'}`}
                          >
                            <td className="border-b border-r border-slate-200 px-3 py-2.5 font-mono text-[10px] font-semibold text-slate-500 whitespace-nowrap">
                              {g.vac_empleados?.codigo || '—'}
                            </td>
                            <td className="border-b border-r border-slate-200 px-3 py-2.5">
                              <span className="font-bold text-slate-700">{g.vac_empleados?.nombre || '—'}</span>
                              {g.vac_empleados?.puesto && (
                                <span className="block mt-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-400">{g.vac_empleados.puesto}</span>
                              )}
                            </td>
                            <td className="border-b border-r border-slate-200 px-3 py-2.5 text-slate-600 whitespace-nowrap">{mostrar(g.fecha_inicio)}</td>
                            <td className="border-b border-r border-slate-200 px-3 py-2.5 text-slate-600 whitespace-nowrap">{mostrar(g.fecha_fin)}</td>
                            <td className="border-b border-r border-slate-200 px-3 py-2.5 text-center">
                              <span className="inline-flex min-w-[30px] items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-2 py-1 font-bold text-slate-700">
                                {g.dias_habiles}
                              </span>
                            </td>
                            <td className="border-b border-r border-slate-200 px-3 py-2.5 text-slate-500">{g.observaciones || '—'}</td>
                            <td className="border-b border-slate-200 px-2 py-2.5 text-center">
                              <button
                                onClick={() => borrarGoce(g.id)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                                title="Eliminar registro"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Resumen por persona */
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Users size={15} />
                  </span>
                  <div>
                    <p className="text-[11px] font-bold text-slate-700">Resumen por persona</p>
                    <p className="text-[10px] text-slate-400">Historial de vacaciones y períodos registrados</p>
                  </div>
                </div>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 whitespace-nowrap">
                  {resumen.length} personas
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {resumen.map((r) => (
                  <div
                    key={r.id}
                    className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white p-3">
                      <div className="min-w-0">
                        {r.codigo && (
                          <span className="mb-1 inline-flex rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-slate-400">
                            {r.codigo}
                          </span>
                        )}
                        <p className="truncate text-xs font-bold text-slate-800">{r.nombre}</p>
                        <p className="mt-0.5 truncate text-[9px] font-medium uppercase tracking-wide text-slate-400">
                          {r.puesto || 'Sin puesto'} · {jornadaTexto(r.dias_descanso)}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setEditandoEmpleado(empleados.find((e) => e.id === r.id));
                            setModalEmpleado(true);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-300 transition-colors hover:border-slate-300 hover:text-slate-600"
                          title="Editar"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => borrarEmpleado(r.id, r.nombre)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-300 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                          title="Eliminar"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 text-center">
                      <div className="px-2 py-3">
                        <p className="text-base font-bold leading-none text-slate-800">{r.dias_anio_actual}</p>
                        <p className="mt-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-400">Este año</p>
                      </div>
                      <div className="px-2 py-3">
                        <p className="text-base font-bold leading-none text-slate-800">{r.dias_total}</p>
                        <p className="mt-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-400">Histórico</p>
                      </div>
                      <div className="px-2 py-3">
                        <p className="text-base font-bold leading-none text-slate-800">{r.periodos}</p>
                        <p className="mt-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-400">Períodos</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-50/60 px-3 py-2 text-[10px] text-slate-400">
                      <CalendarDays size={12} className="shrink-0" />
                      <span>Último goce:</span>
                      <span className="font-semibold text-slate-600">{r.ultimo_goce ? mostrar(r.ultimo_goce) : 'Nunca'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {modalGoce && (
        <ModalGoce
          empleados={empleados}
          setAsuetos={setAsuetos_}
          guardando={guardando}
          setGuardando={setGuardando}
          onCerrar={() => setModalGoce(false)}
          onGuardado={() => { setModalGoce(false); cargar(); }}
          onError={setError}
        />
      )}

      {modalEmpleado && (
        <ModalEmpleado
          empleado={editandoEmpleado}
          guardando={guardando}
          setGuardando={setGuardando}
          onCerrar={() => { setModalEmpleado(false); setEditandoEmpleado(null); }}
          onGuardado={() => { setModalEmpleado(false); setEditandoEmpleado(null); cargar(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/*  Modal: registrar vacaciones                                        */
/* ================================================================== */
function ModalGoce({ empleados, setAsuetos, guardando, setGuardando, onCerrar, onGuardado, onError }) {
  const [empleadoId, setEmpleadoId] = useState(empleados[0]?.id || '');
  const [inicio, setInicio] = useState(hoyTexto());
  const [fin, setFin] = useState(hoyTexto());
  const [obs, setObs] = useState('');

  const habiles = calcularHabiles(inicio, fin, setAsuetos);
  const calendario = inicio && fin && aFecha(fin) >= aFecha(inicio)
    ? Math.round((aFecha(fin) - aFecha(inicio)) / 86400000) + 1
    : 0;
  const rangoMalo = !!inicio && !!fin && aFecha(fin) < aFecha(inicio);

  const guardar = async () => {
    if (!empleadoId || rangoMalo) return;
    setGuardando(true);
    const { error } = await supabase.from('vac_goces').insert({
      empleado_id: empleadoId,
      fecha_inicio: inicio,
      fecha_fin: fin,
      observaciones: obs.trim() || null,
    });
    setGuardando(false);
    if (error) {
      onError(
        error.code === '23P01'
          ? 'Ese compañero ya tiene vacaciones registradas que se enciman con estas fechas.'
          : error.message
      );
      return;
    }
    onGuardado();
  };

  return (
    <Marco titulo="Registrar vacaciones" onCerrar={onCerrar}>
      <Campo etiqueta="Compañero">
        <select
          value={empleadoId}
          onChange={(e) => setEmpleadoId(e.target.value)}
          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
        >
          {empleados.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}{e.puesto ? ` · ${e.puesto}` : ''}</option>
          ))}
        </select>
      </Campo>

      <div className="grid grid-cols-2 gap-2">
        <Campo etiqueta="Desde">
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-slate-400" />
        </Campo>
        <Campo etiqueta="Hasta">
          <input type="date" value={fin} onChange={(e) => setFin(e.target.value)}
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-slate-400" />
        </Campo>
      </div>

      {rangoMalo ? (
        <p className="text-[11px] text-red-600">La fecha final es anterior a la inicial.</p>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <p className="text-[11px] text-slate-600">
            Son <span className="font-bold text-slate-800">{habiles} días hábiles</span>
            {calendario !== habiles && (
              <span className="text-slate-400"> ({calendario} días de calendario; no se cuentan sábados, domingos ni asuetos)</span>
            )}
          </p>
        </div>
      )}

      <Campo etiqueta="Observaciones (opcional)">
        <input
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ej. período 2025 pendiente"
          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
      </Campo>

      <div className="flex gap-2 pt-1">
        <button onClick={onCerrar} className="flex-1 text-xs font-semibold py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando || rangoMalo || !empleadoId}
          className="flex-1 text-xs font-semibold py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          {guardando && <Loader2 size={13} className="animate-spin" />}
          Guardar registro
        </button>
      </div>
    </Marco>
  );
}

/* ================================================================== */
/*  Modal: alta / edición de personal                                  */
/* ================================================================== */
function ModalEmpleado({ empleado, guardando, setGuardando, onCerrar, onGuardado, onError }) {
  const [codigo, setCodigo] = useState(empleado?.codigo || '');
  const [nombre, setNombre] = useState(empleado?.nombre || '');
  const [puesto, setPuesto] = useState(empleado?.puesto || '');
  const [ingreso, setIngreso] = useState(empleado?.fecha_ingreso || '');
  const [jornada, setJornada] = useState(
    empleado?.dias_descanso ? empleado.dias_descanso.join(',') : JORNADA_DEFECTO
  );

  const guardar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    const datos = {
      codigo: codigo.trim() || null,
      nombre: nombre.trim(),
      puesto: puesto.trim() || null,
      fecha_ingreso: ingreso || null,
      dias_descanso: jornada.split(',').map(Number),
    };
    const { error } = empleado
      ? await supabase.from('vac_empleados').update(datos).eq('id', empleado.id)
      : await supabase.from('vac_empleados').insert(datos);
    setGuardando(false);
    if (error) {
      onError(
        error.code === '23505'
          ? 'Ya existe un compañero con ese nombre o con ese código.'
          : error.message
      );
      return;
    }
    onGuardado();
  };

  return (
    <Marco titulo={empleado ? 'Editar compañero' : 'Agregar compañero'} onCerrar={onCerrar}>
      <div className="grid grid-cols-3 gap-2">
        <Campo etiqueta="Código">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="T-01"
            title="Opcional, pero no se puede repetir entre compañeros"
            className="w-full text-xs font-mono border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </Campo>
        <div className="col-span-2">
          <Campo etiqueta="Nombre">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo"
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-slate-400" />
          </Campo>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Campo etiqueta="Puesto">
          <input value={puesto} onChange={(e) => setPuesto(e.target.value)} placeholder="Ej. Técnico"
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-slate-400" />
        </Campo>
        <Campo etiqueta="Ingreso">
          <input type="date" value={ingreso} onChange={(e) => setIngreso(e.target.value)}
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-slate-400" />
        </Campo>
      </div>

      <Campo etiqueta="Jornada">
        <div className="relative">
          <select
            value={jornada}
            onChange={(e) => setJornada(e.target.value)}
            className="w-full appearance-none text-xs border border-slate-200 rounded-lg px-2 py-2 pr-7 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            {JORNADAS.map((j) => <option key={j.valor} value={j.valor}>{j.etiqueta}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </Campo>

      <div className="flex gap-2 pt-1">
        <button onClick={onCerrar} className="flex-1 text-xs font-semibold py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando || !nombre.trim()}
          className="flex-1 text-xs font-semibold py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          {guardando && <Loader2 size={13} className="animate-spin" />}
          Guardar
        </button>
      </div>
    </Marco>
  );
}

/* ------------------------- piezas compartidas --------------------- */
function Marco({ titulo, onCerrar, children }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] overflow-y-auto overscroll-contain"
      onClick={onCerrar}
    >
      {/* min-h-full + items-center: centrado cuando cabe, y cuando no cabe el
          overlay entero hace scroll sin que se coma el encabezado. */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="bg-white rounded-xl shadow-xl w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-800">{titulo}</h3>
            <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
          </div>
          <div className="p-4 space-y-2.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Campo({ etiqueta, children }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">{etiqueta}</label>
      {children}
    </div>
  );
}
