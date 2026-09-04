import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { obtenerControlAlertas } from '../src/utils/alertas.js'

let servidor, Dashboard
before(async () => {
  servidor = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' })
  Dashboard = (await servidor.ssrLoadModule('/src/components/Dashboard.jsx')).default
})
after(async () => { await servidor?.close() })

function renderizar(extra = {}) {
  const allTickets = [{ tecnico: 'Técnico de prueba', ESTADO: 'En Proceso', TIEMPO_TRANSCURRIDO: 73, CLIENTE: 'Cliente de prueba', 'N° REFERENCIA': '001234', SERIE: '1001011234', TIPO: 'Normal' }]
  return renderToStaticMarkup(React.createElement(Dashboard, {
    allTickets, nombreArchivo: 'Base de prueba.xlsx', fechaSubidaExcel: 'Fecha de prueba',
    controlAlertas: obtenerControlAlertas(allTickets, [{ nombre: 'Cliente de prueba', anios: 2 }]),
    estadoCatalogoGarantias: 'listo', estadoHistorial: 'listo', onNavigate() {}, onVerAlertas() {}, ...extra,
  }))
}

test('dashboard renderiza resumen, alertas, carga y referencias con los datos reales recibidos', () => {
  const html = renderizar()
  for (const texto of ['Control de la operación', 'Revisar primero', '72 h o más', 'Carga y cierres por técnico', '#001234', 'Cliente de prueba', 'Normal']) assert.ok(html.includes(texto), texto)
  assert.doesNotMatch(html, /NaN|Infinity|Cambiar Normal|Atención cubierta/)
})

test('dashboard muestra las limitaciones del catálogo e historial, sin afirmar que no hay problemas', () => {
  const html = renderizar({ estadoCatalogoGarantias: 'error', estadoHistorial: 'sin-configurar' })
  assert.match(html, /Catálogo de garantías no disponible/)
  assert.match(html, /Historial de series no sincronizado/)
  assert.doesNotMatch(html, /Todo en orden|0 garantías vigentes/)
})

test('dashboard vacío muestra carga de base, sin depender del control de alertas', () => {
  const html = renderizar({ allTickets: [], controlAlertas: undefined })
  assert.match(html, /Cargar base en Técnicos/)
  assert.doesNotMatch(html, /dashboard-metric-label|NaN/)
})

test('dashboard ofrece mostrar toda la plantilla cuando hay más de seis personas', () => {
  const allTickets = Array.from({ length: 15 }, (_, i) => ({ tecnico: 'Persona ' + i, ESTADO: 'En Proceso', TIEMPO_TRANSCURRIDO: i }))
  const html = renderizar({ allTickets, controlAlertas: obtenerControlAlertas(allTickets) })
  assert.match(html, /Ver toda la lista \(15\)/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /aria-pressed="true"/)
})
