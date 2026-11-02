import test from 'node:test'
import assert from 'node:assert/strict'
import { resolverRespaldoGarantia } from '../src/utils/adjuntosGarantia.js'

test('garantías: firma el respaldo privado por cinco minutos sin cambiar sus datos', async () => {
  const archivo = { nombre: 'Autorización original.pdf', path: 'uuid/Autorizacion_original.pdf' }
  const antes = JSON.stringify(archivo)
  const llamadas = []
  const cliente = { storage: { from(bucket) {
    llamadas.push(bucket)
    return { async createSignedUrl(path, segundos) {
      llamadas.push([path, segundos])
      return { data: { signedUrl: 'https://ejemplo.test/firmado.pdf?token=temporal' }, error: null }
    } }
  } } }
  const resultado = await resolverRespaldoGarantia(cliente, archivo)
  assert.deepEqual(llamadas, ['respaldos-garantia', [archivo.path, 300]])
  assert.deepEqual(resultado, { ...archivo, url: 'https://ejemplo.test/firmado.pdf?token=temporal' })
  assert.equal(JSON.stringify(archivo), antes)
})

test('garantías: abrir de nuevo obtiene una firma nueva, no reutiliza enlaces vencidos', async () => {
  let contador = 0
  const cliente = { storage: { from() { return { async createSignedUrl() {
    return { data: { signedUrl: `https://ejemplo.test/respaldo.pdf?firma=${++contador}` }, error: null }
  } } } } }
  const archivo = { nombre: 'respaldo.pdf', path: 'uuid/respaldo.pdf', url: 'https://ejemplo.test/respaldo.pdf?firma=vencida' }
  const primera = await resolverRespaldoGarantia(cliente, archivo)
  const segunda = await resolverRespaldoGarantia(cliente, archivo)
  assert.notEqual(primera.url, segunda.url)
  assert.equal(archivo.url, 'https://ejemplo.test/respaldo.pdf?firma=vencida')
})

test('garantías: una firma fallida o incompleta se reporta y no se trata como archivo listo', async () => {
  const archivo = { nombre: 'foto.png', path: 'uuid/foto.png' }
  for (const respuesta of [{ data: null, error: new Error('Permiso denegado') }, { data: null, error: null }, { data: {}, error: null }]) {
    const cliente = { storage: { from() { return { async createSignedUrl() { return respuesta } } } } }
    await assert.rejects(resolverRespaldoGarantia(cliente, archivo))
  }
})

test('garantías: no consulta Storage para respaldos sin una ruta válida', async () => {
  const cliente = { storage: { from() { throw new Error('No debe consultar Storage') } } }
  for (const archivo of [null, undefined, {}, { nombre: 'foto.png' }, { path: '' }, { path: '   ' }]) {
    await assert.rejects(resolverRespaldoGarantia(cliente, archivo), error => !error.message.includes('No debe consultar Storage'))
  }
})
