import test from 'node:test'
import assert from 'node:assert/strict'
import { esTecnicoSinAsignar, gruposAlertasDashboard, horasTicketDashboard, obtenerResumenDashboard, ordenarEquipoDashboard, obtenerTicketsPorClienteDashboard } from '../src/utils/dashboard.js'

test('dashboard: tickets por cliente sólo usa los tres estados operativos y no los desglosa', () => {
  const datos = [
    { CLIENTE: 'Cliente A', ESTADO: 'En Proceso' },
    { CLIENTE: ' cliente a ', ESTADO: 'Asignada a Técnico' },
    { CLIENTE: 'Cliente B', ESTADO: 'Asignada a Agencia' },
    { CLIENTE: 'Cliente A', ESTADO: 'Orden Finalizada' },
    { CLIENTE: 'Cliente B', ESTADO: 'Pendiente' },
  ]
  assert.deepEqual(obtenerTicketsPorClienteDashboard(datos).map(({ nombre, cantidad }) => ({ nombre, cantidad })), [
    { nombre: 'Cliente A', cantidad: 2 },
    { nombre: 'Cliente B', cantidad: 1 },
  ])
})
import { obtenerControlAlertas } from '../src/utils/alertas.js'

const ticket = (horas, extra = {}) => ({ tecnico: 'Ana', ESTADO: 'Asignada a Técnico', TIEMPO_TRANSCURRIDO: horas, ...extra })

test('dashboard: los límites 24, 48 y 72 se cuentan una sola vez', () => {
  const datos = [0, 23.99, 24, 47.99, 48, 71.99, 72, 120, null].map(h => ticket(h))
  const stats = obtenerResumenDashboard(datos)
  assert.deepEqual(stats.antiguedad.map(g => g.cantidad), [2, 2, 2, 2, 1])
  assert.equal(stats.criticos, 2)
  assert.equal(stats.antiguedad.reduce((total, g) => total + g.cantidad, 0), stats.pendientes)
})

test('dashboard: tiempos ausentes o inválidos no se presentan como cero horas', () => {
  for (const valor of [null, undefined, '', ' ', '-', 'no disponible', -1, Infinity, '35abc']) assert.equal(horasTicketDashboard(valor), null)
  assert.equal(horasTicketDashboard(0), 0)
  assert.equal(horasTicketDashboard('35,5'), 35.5)
  assert.equal(horasTicketDashboard(' 72.5 '), 72.5)
})

test('dashboard: los finalizados no entran en pendientes, antigüedad ni técnicos con carga', () => {
  const stats = obtenerResumenDashboard([
    ticket(96, { tecnico: 'Anterior', ESTADO: 'Orden Finalizada' }),
    ticket(73, { ESTADO: 'En Proceso' }),
    ticket(30, { ESTADO: 'Asignada a Agencia' }),
  ])
  assert.equal(stats.total, 3)
  assert.equal(stats.finalizados, 1)
  assert.equal(stats.pendientes, 2)
  assert.equal(stats.enProceso, 1)
  assert.equal(stats.agencia, 1)
  assert.equal(stats.criticos, 1)
  assert.equal(stats.tecnicosConCarga, 1)
  assert.equal(stats.avance, 33)
})

test('dashboard: agrupa marcadores sin asignar sin contarlos como técnicos reales', () => {
  const marcadores = ['', '-', 'SIN TÉCNICO', 'sin asignar 1', 'SIN ASIGNAR 2', 'SIN ASIGNACION']
  for (const nombre of marcadores) assert.equal(esTecnicoSinAsignar(nombre), true)
  assert.equal(esTecnicoSinAsignar('Juan Sin Asignar'), false)
  const stats = obtenerResumenDashboard([...marcadores.map(tecnico => ticket(80, { tecnico })), ticket(5), ticket(6, { tecnico: ' ANA ' })])
  assert.equal(stats.sinAsignar, 6)
  assert.equal(stats.tecnicosConCarga, 1)
  assert.equal(stats.equipo.length, 2)
  assert.equal(stats.equipo[0].nombre, 'Sin asignar')
  assert.equal(stats.equipo.reduce((total, p) => total + p.pendientes, 0), stats.pendientes)
})

test('dashboard: conserva toda la plantilla y permite ordenar carga o cierres sin mutar datos', () => {
  const datos = Array.from({ length: 15 }, (_, i) => ticket(i, { tecnico: 'Técnico ' + i }))
  datos.push(ticket(0, { tecnico: 'Sólo cierres', ESTADO: 'Orden Finalizada' }))
  const original = structuredClone(datos)
  const stats = obtenerResumenDashboard(datos)
  const equipoOriginal = structuredClone(stats.equipo)
  assert.equal(stats.equipo.length, 16)
  assert.equal(ordenarEquipoDashboard(stats.equipo, 'finalizados')[0].nombre, 'Sólo cierres')
  assert.deepEqual(stats.equipo, equipoOriginal)
  assert.deepEqual(datos, original)
})

test('dashboard: cinco más antiguos con referencia y cliente, excluyendo cierres y tiempos inválidos', () => {
  const datos = [20, 80, 100, 0, 5, 90, 65, null].map((h, i) => ticket(h, { 'N° REFERENCIA': '00' + i, CLIENTE: 'Cliente ' + i }))
  datos.push(ticket(1000, { ESTADO: 'Orden Finalizada' }))
  const stats = obtenerResumenDashboard(datos)
  assert.deepEqual(stats.masAntiguos.map(t => t.horas), [100, 90, 80, 65, 20])
  assert.equal(stats.masAntiguos[0].ticket.CLIENTE, 'Cliente 2')
  assert.equal(stats.masAntiguos[0].ticket['N° REFERENCIA'], '002')
})

test('dashboard: garantías coinciden con la campana; Normal vencida no se duplica', () => {
  const datos = [
    ticket(80, { CLIENTE: 'Cliente prueba', TIPO: 'Normal', SERIE: '1001011234', 'N° REFERENCIA': 'DUP1' }),
    ticket(5, { CLIENTE: 'Cliente prueba', TIPO: 'Normal', SERIE: '-', 'N° REFERENCIA': 'DUP1' }),
  ]
  const control = obtenerControlAlertas(datos, [{ nombre: 'Cliente prueba', anios: 2 }])
  const grupos = gruposAlertasDashboard(control)
  assert.deepEqual(grupos.map(g => g.cantidad), [1, 1, 0, 1, 0])
  assert.equal(grupos.reduce((total, g) => total + g.cantidad, 0), control.total)
  assert.deepEqual(grupos.map(g => g.id), ['vencidas', 'tipo-incorrecto', 'sin-serie', 'duplicados', 'reincidencias'])
  assert.doesNotMatch(grupos.map(g => g.detalle).join(' '), /Cambiar Normal/)
})

test('dashboard: la base vacía no genera porcentajes inválidos ni registros ficticios', () => {
  const stats = obtenerResumenDashboard()
  assert.equal(stats.total, 0)
  assert.equal(stats.avance, 0)
  assert.equal(stats.tecnicosConCarga, 0)
  assert.equal(stats.maxCarga, 1)
  assert.deepEqual(stats.masAntiguos, [])
  assert.deepEqual(stats.equipo, [])
})
