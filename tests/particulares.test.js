import test from 'node:test'
import assert from 'node:assert/strict'
import { claveReferenciaParticular, idParticularReferencia, importarParticularesExcel, prepararParticularesExcel } from '../src/utils/particulares.js'

const fila = (ref = 'P1-001', extra = {}) => ({ CLIENTE: 'PARTICULAR', 'N° REFERENCIA': ref, 'N° ORDEN': 400000, NEGOCIO: 'Negocio de prueba', 'DIRECCIÓN': 'Dirección de prueba', 'TELÉFONO': '01234567', 'TÉCNICO': 'Técnico de prueba', 'FECHA INGRESO': '21/08/2026', ESTADO: 'Orden Finalizada', SERIE: '2112108391', MODELO: 'Modelo de prueba', 'DESCRIPCIÓN INICIAL': 'No enfría.', DESCRIPCIÓN: 'Trabajo realizado.', TIPO: 'Normal', ...extra })

// Sustituto de Supabase, sin red: conserva filas por clave primaria y simula
// ON CONFLICT DO NOTHING, paginación y fallos de lectura/guardado.
function baseSimulada(iniciales = []) {
  const registros = new Map(iniciales.map(p => [p.id, structuredClone(p)]))
  const estado = { registros, lecturas: 0, escrituras: 0, errorLectura: false, fallarEscritura: 0 }
  estado.cliente = { from(tabla) {
    assert.equal(tabla, 'pendientes')
    return {
      select(campos) {
        assert.equal(campos, 'id,correlativo')
        return { eq(campo, valor) {
          assert.equal(campo, 'tipo'); assert.equal(valor, 'Particular')
          return { order() { return { async range(desde, hasta) {
            estado.lecturas++
            if (estado.errorLectura) return { error: { message: 'Error simulado' }, data: null }
            const data = [...registros.values()].filter(p => p.tipo === valor).sort((a, b) => a.id.localeCompare(b.id)).slice(desde, hasta + 1).map(p => ({ id: p.id, correlativo: p.correlativo }))
            return { data, error: null }
          } } } }
        } }
      },
      upsert(lote, opciones) {
        assert.deepEqual(opciones, { onConflict: 'id', ignoreDuplicates: true })
        return { async select(campos) {
          assert.equal(campos, 'id')
          estado.escrituras++
          if (estado.fallarEscritura === estado.escrituras) return { data: null, error: { message: 'Fallo de red' } }
          const data = []
          for (const ficha of lote) {
            if (!registros.has(ficha.id)) { registros.set(ficha.id, structuredClone(ficha)); data.push({ id: ficha.id }) }
          }
          return { data, error: null }
        } }
      },
    }
  } }
  return estado
}

test('particulares: sólo CLIENTE exacto, con encabezados normalizados y todos los estados', () => {
  const resultado = prepararParticularesExcel([fila('P1-1'), fila('P1-2', { CLIENTE: ' particular ', ESTADO: 'Cancelada' }), fila('P1-3', { CLIENTE: 'EMPRESA PARTICULAR' }), fila('P1-4', { CLIENTE: 'OTRO', NEGOCIO: 'PARTICULAR' })])
  assert.equal(resultado.detectadas, 2)
  assert.equal(resultado.fichas.length, 2)
  assert.ok(resultado.fichas.every(f => f.estado === 'Pendiente de pago'))
})

test('particulares: copia orden, referencia y datos técnicos sin inventar NIT, pago o fecha de seguimiento', () => {
  const entrada = fila('P1-001')
  const original = structuredClone(entrada)
  const ficha = prepararParticularesExcel([entrada], 'Prueba.xls').fichas[0]
  assert.equal(ficha.orden, '400000')
  assert.equal(ficha.correlativo, 'P1-001')
  assert.equal(ficha.negocio, 'Negocio de prueba')
  assert.equal(ficha.direccion, 'Dirección de prueba')
  assert.equal(ficha.nit, '')
  assert.equal(ficha.fecha, null)
  assert.equal(ficha.estado, 'Pendiente de pago')
  assert.deepEqual(ficha.archivos, [])
  for (const texto of ['Fecha de ingreso: 21/08/2026', 'Teléfono: 01234567', 'Estado en el Excel: Orden Finalizada', 'Técnico: Técnico de prueba', 'Serie: 2112108391', 'Falla reportada: No enfría.', 'Archivo de origen: Prueba.xls']) assert.ok(ficha.descripcion.includes(texto), texto)
  assert.deepEqual(entrada, original)
})

test('particulares: duplica sólo por referencia y omite referencias vacías sin usar el N° ORDEN', () => {
  const resultado = prepararParticularesExcel([fila(' P1-001 '), fila('p1-001', { 'N° ORDEN': 999 }), fila('P1-002'), fila(''), fila('-'), fila(null)])
  assert.equal(resultado.repetidas, 1)
  assert.equal(resultado.sinReferencia, 3)
  assert.equal(resultado.fichas.length, 2)
  assert.equal(resultado.fichas[0].orden, '400000')
  assert.equal(claveReferenciaParticular('001234'), '001234')
})

test('particulares: recupera serie de DESCRIPCIÓN INICIAL sin confundir el teléfono', () => {
  const ficha = prepararParticularesExcel([fila('P1-1', { SERIE: '', 'DESCRIPCIÓN INICIAL': 'Tel 56996857; serie 2112108391; no enfría.' })]).fichas[0]
  assert.match(ficha.descripcion, /Serie: 2112108391\nOrigen de la serie: DESCRIPCIÓN INICIAL/)
  assert.doesNotMatch(ficha.descripcion, /Serie: 56996857/)
})

test('particulares: identidad estable, preservando prefijos y ceros de la referencia', async () => {
  const id = await idParticularReferencia(' p1-001 ')
  assert.equal(id, await idParticularReferencia('P1-001'))
  assert.notEqual(id, await idParticularReferencia('P1-1'))
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  await assert.rejects(idParticularReferencia(''), /necesita N° REFERENCIA/)
})

test('particulares: una segunda carga deja intactos pagos, notas, fecha y adjuntos', async () => {
  const base = baseSimulada()
  assert.equal((await importarParticularesExcel(base.cliente, [fila()])).creadas, 1)
  const existente = [...base.registros.values()][0]
  Object.assign(existente, { estado: 'Pagado', descripcion: 'Notas manuales', nit: '1234567-8', fecha: '2026-09-15', archivos: ['{"nombre":"Cotizacion.pdf","url":"https://example.test/archivo.pdf"}'] })
  const esperado = structuredClone(existente)
  const resultado = await importarParticularesExcel(base.cliente, [fila('P1-001', { DESCRIPCIÓN: 'Cambio posterior' })])
  assert.equal(resultado.creadas, 0)
  assert.equal(resultado.existentes, 1)
  assert.deepEqual([...base.registros.values()], [esperado])
  assert.equal(base.escrituras, 1)
})

test('particulares: reconoce fichas manuales antiguas incluso después de 1000 registros', async () => {
  const existentes = Array.from({ length: 1101 }, (_, i) => ({ id: String(i).padStart(5, '0'), tipo: 'Particular', correlativo: 'P1-' + i, archivos: ['Documento existente'] }))
  const base = baseSimulada(existentes)
  const resultado = await importarParticularesExcel(base.cliente, [fila('p1-1100')])
  assert.equal(resultado.existentes, 1)
  assert.equal(base.lecturas, 3)
  assert.equal(base.escrituras, 0)
  assert.equal(base.registros.size, 1101)
})

test('particulares: dos importaciones simultáneas no crean dos fichas', async () => {
  const base = baseSimulada()
  const resultados = await Promise.all([importarParticularesExcel(base.cliente, [fila()]), importarParticularesExcel(base.cliente, [fila()])])
  assert.equal(base.registros.size, 1)
  assert.equal(resultados.reduce((total, r) => total + r.creadas, 0), 1)
})

test('particulares: no escribe cuando falla la comprobación de fichas existentes', async () => {
  const base = baseSimulada(); base.errorLectura = true
  await assert.rejects(importarParticularesExcel(base.cliente, [fila()]), /No se pudieron consultar/)
  assert.equal(base.escrituras, 0)
})

test('particulares: reintento después de guardar parcialmente no duplica ni reemplaza', async () => {
  const base = baseSimulada(); base.fallarEscritura = 2
  const filas = Array.from({ length: 101 }, (_, i) => fila('P1-' + i))
  await assert.rejects(importarParticularesExcel(base.cliente, filas), fallo => fallo.resultado.creadas === 100)
  assert.equal(base.registros.size, 100)
  base.fallarEscritura = 0
  const resultado = await importarParticularesExcel(base.cliente, filas)
  assert.equal(resultado.creadas, 1)
  assert.equal(resultado.existentes, 100)
  assert.equal(base.registros.size, 101)
})

test('particulares: conserva la identidad importada aunque el correlativo se edite después', async () => {
  const id = await idParticularReferencia('P1-001')
  const base = baseSimulada([{ id, tipo: 'Particular', correlativo: 'Corregido manualmente', estado: 'Completada' }])
  const resultado = await importarParticularesExcel(base.cliente, [fila()])
  assert.equal(resultado.existentes, 1)
  assert.equal(base.escrituras, 0)
})

test('particulares: sin candidatos válidos no necesita conexión a la base', async () => {
  const base = baseSimulada()
  const resultado = await importarParticularesExcel(base.cliente, [fila(''), fila('OTRO', { CLIENTE: 'Empresa' })])
  assert.equal(resultado.sinReferencia, 1)
  assert.equal(resultado.creadas, 0)
  assert.equal(base.lecturas, 0)
})
