import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const archivo = ruta => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)))

test('Ticket Manager tiene manifiesto instalable e iconos PNG del tamaño indicado', () => {
  const manifest = JSON.parse(archivo('../public/manifest.webmanifest'))
  assert.equal(manifest.name, 'Ticket Manager')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  for (const tamaño of [192, 512]) {
    for (const proposito of ['any', 'maskable']) {
      const icono = manifest.icons.find(item => item.sizes === `${tamaño}x${tamaño}` && item.purpose === proposito)
      assert.ok(icono)
      const png = archivo(`../public${icono.src}`)
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
      assert.equal(png.readUInt32BE(16), tamaño)
      assert.equal(png.readUInt32BE(20), tamaño)
    }
  }
})

test('el service worker guarda solo la interfaz y recursos estáticos', () => {
  const codigo = archivo('../public/sw.js').toString()
  assert.match(codigo, /request\.method !== 'GET'/)
  assert.match(codigo, /url\.origin !== self\.location\.origin/)
  assert.match(codigo, /url\.pathname\.startsWith\('\/assets\/'\)/)
  assert.doesNotMatch(codigo, /supabase\.co|viaticos_gastos|viaticos_entregas/)
})
