import { normalizarTextoGarantia } from './garantias.js'
import { esTicketFinalizado } from './historialSeries.js'

export function horasTicketDashboard(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor >= 0 ? valor : null
  const limpio = String(valor ?? '').trim()
  if (!/^\d+(?:[.,]\d+)?$/.test(limpio)) return null
  const horas = Number(limpio.replace(',', '.'))
  return Number.isFinite(horas) ? horas : null
}

export function esTecnicoSinAsignar(nombre) {
  const limpio = normalizarTextoGarantia(nombre).replace(/\s+/g, ' ')
  return !limpio || limpio === '-' || /^SIN (?:TECNICO|ASIGNAR|ASIGNACION)(?: \d+)?$/.test(limpio)
}

const ESTADOS_CLIENTES_DASHBOARD = new Set(['EN PROCESO', 'ASIGNADA A TECNICO', 'ASIGNADA A AGENCIA'])

// Un total por cliente, limitado a los tres estados operativos solicitados.
export function obtenerTicketsPorClienteDashboard(tickets = []) {
  const clientes = new Map()
  tickets.forEach(ticket => {
    const estado = normalizarTextoGarantia(ticket?.ESTADO_LIMPIO || ticket?.ESTADO)
    if (!ESTADOS_CLIENTES_DASHBOARD.has(estado)) return
    const nombre = String(ticket?.CLIENTE ?? '').trim().replace(/\s+/g, ' ') || 'Sin cliente registrado'
    const clave = nombre === 'Sin cliente registrado' ? '__sin_cliente__' : normalizarTextoGarantia(nombre)
    const actual = clientes.get(clave)
    if (actual) actual.cantidad++
    else clientes.set(clave, { clave, nombre, cantidad: 1 })
  })
  return [...clientes.values()].sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'))
}

// Sólo resume la base disponible: no modifica tickets ni infiere tiempos
// a partir del reloj. TIEMPO TRANSCURRIDO es el dato recibido del Excel.
export function obtenerResumenDashboard(tickets = []) {
  const antiguedad = [
    { id: 'menos24', label: 'Menos de 24 h', cantidad: 0 },
    { id: 'de24a48', label: '24 a menos de 48 h', cantidad: 0 },
    { id: 'de48a72', label: '48 a menos de 72 h', cantidad: 0 },
    { id: 'desde72', label: '72 h o más', cantidad: 0 },
    { id: 'sinDato', label: 'Sin tiempo válido', cantidad: 0 },
  ]
  const equipo = new Map()
  const pendientesOrdenados = []
  let pendientes = 0, finalizados = 0, enProceso = 0, asignados = 0, agencia = 0, sinAsignar = 0
  tickets.forEach((ticket, indice) => {
    const sinTecnico = esTecnicoSinAsignar(ticket.tecnico)
    const nombre = sinTecnico ? 'Sin asignar' : String(ticket.tecnico).trim().replace(/\s+/g, ' ')
    const clave = sinTecnico ? '__sin_asignar__' : normalizarTextoGarantia(nombre)
    if (!equipo.has(clave)) equipo.set(clave, { clave, nombre, sinTecnico, pendientes: 0, enProceso: 0, criticos: 0, finalizados: 0 })
    const persona = equipo.get(clave)
    if (esTicketFinalizado(ticket)) { finalizados++; persona.finalizados++; return }

    pendientes++; persona.pendientes++
    if (sinTecnico) sinAsignar++
    const estado = normalizarTextoGarantia(ticket.ESTADO_LIMPIO || ticket.ESTADO)
    if (estado.includes('PROCESO')) { enProceso++; persona.enProceso++ }
    else if (estado.includes('AGENCIA')) agencia++
    else if (estado.includes('TECNICO')) asignados++
    const horas = horasTicketDashboard(ticket.TIEMPO_TRANSCURRIDO)
    const grupo = horas === null ? 4 : horas < 24 ? 0 : horas < 48 ? 1 : horas < 72 ? 2 : 3
    antiguedad[grupo].cantidad++
    if (horas !== null) {
      pendientesOrdenados.push({ ticket, horas, indice })
      if (horas >= 72) persona.criticos++
    }
  })
  const personas = [...equipo.values()]
  pendientesOrdenados.sort((a, b) => b.horas - a.horas || a.indice - b.indice)
  return {
    total: tickets.length, pendientes, finalizados, enProceso, asignados, agencia, sinAsignar,
    criticos: antiguedad[3].cantidad, sinTiempo: antiguedad[4].cantidad, antiguedad,
    avance: tickets.length ? Math.round(finalizados / tickets.length * 100) : 0,
    tecnicosConCarga: personas.filter(p => !p.sinTecnico && p.pendientes > 0).length,
    equipo: ordenarEquipoDashboard(personas),
    maxCarga: Math.max(1, ...personas.map(p => p.pendientes)),
    masAntiguos: pendientesOrdenados.slice(0, 5),
    clientesActivos: obtenerTicketsPorClienteDashboard(tickets),
  }
}

export function ordenarEquipoDashboard(personas, orden = 'pendientes') {
  const columna = orden === 'finalizados' ? 'finalizados' : 'pendientes'
  return [...personas].sort((a, b) => b[columna] - a[columna] || b.criticos - a.criticos || a.nombre.localeCompare(b.nombre, 'es'))
}

export function gruposAlertasDashboard(control) {
  return [
    { id: 'vencidas', titulo: 'Garantías vencidas', detalle: 'No atender sin garantía.', tono: 'rose', cantidad: control.vencidas.length },
    { id: 'tipo-incorrecto', titulo: 'TIPO Normal · revisar', detalle: 'Revisar el motivo, aunque la serie esté vigente.', tono: 'violet', cantidad: control.tipoIncorrecto.length },
    { id: 'sin-serie', titulo: 'Series por verificar', detalle: 'No se pudo calcular la vigencia.', tono: 'amber', cantidad: control.sinSerie.length },
    { id: 'duplicados', titulo: 'Referencias duplicadas', detalle: 'Grupos repetidos; incluye finalizados.', tono: 'orange', cantidad: control.duplicados.length },
    { id: 'reincidencias', titulo: 'Posibles reincidencias', detalle: 'Misma serie en otra atención finalizada.', tono: 'sky', cantidad: control.reincidencias.length },
  ]
}
