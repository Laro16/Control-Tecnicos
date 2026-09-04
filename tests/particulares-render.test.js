import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let servidor, EstadoParticulares, Gestion, useImportacionParticulares
const fetchOriginal = globalThis.fetch
before(async () => {
  servidor = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom',
    plugins: [{
      name: 'supabase-sin-red-para-pruebas', enforce: 'pre',
      load(id) {
        if (id.replace(/\\/g, '/').endsWith('/src/supabase.jsx')) {
          return "export const supabase = { from() { throw new Error('Supabase no debe usarse en este render de prueba') } }"
        }
      },
    }],
  })
  EstadoParticulares = (await servidor.ssrLoadModule('/src/components/EstadoParticulares.jsx')).default
  Gestion = (await servidor.ssrLoadModule('/src/components/Gestion.jsx')).default
  useImportacionParticulares = (await servidor.ssrLoadModule('/src/hooks/useImportacionParticulares.js')).default
  await servidor.ssrLoadModule('/src/components/Tecnicos.jsx')
  globalThis.fetch = () => { throw new Error('Las pruebas no deben consultar ni escribir en Supabase') }
})
after(async () => { globalThis.fetch = fetchOriginal; await servidor?.close() })

function mostrar(importacion) {
  return renderToStaticMarkup(React.createElement(EstadoParticulares, { importacion }))
}

test('particulares: resumen de importación con cantidades y advertencia de referencias vacías', () => {
  const html = mostrar({ estado: 'listo', resultado: { archivo: 'Prueba.xls', creadas: 4, existentes: 3, repetidas: 2, sinReferencia: 1 } })
  for (const texto of ['4 fichas nuevas', '3 ya registradas', '2 filas repetidas', '1 particulares sin N° REFERENCIA', 'Pendiente de pago']) assert.ok(html.includes(texto), texto)
  assert.doesNotMatch(html, /undefined|NaN/)
})

test('particulares: un fallo muestra reintento y las fichas confirmadas, no un mensaje de éxito', () => {
  const html = mostrar({ estado: 'error', error: 'Conexión no disponible', resultado: { archivo: 'Prueba.xls', creadas: 2 }, reintentar() {} })
  assert.match(html, /Reintentar particulares/)
  assert.match(html, /Se confirmaron 2 fichas/)
  assert.doesNotMatch(html, /Particulares revisadas/)
})

test('particulares: el render inicial no dispara la importación ni escrituras', () => {
  function Inicio() { return React.createElement(EstadoParticulares, { importacion: useImportacionParticulares() }) }
  assert.equal(renderToStaticMarkup(React.createElement(Inicio)), '')
  assert.match(renderToStaticMarkup(React.createElement(Gestion)), /Pendientes y seguimiento/)
})
