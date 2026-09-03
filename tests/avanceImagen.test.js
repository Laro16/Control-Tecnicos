import test from 'node:test'
import assert from 'node:assert/strict'
import { descargarAvanceImagen, dibujarPaginaAvance, filtrarCierresAvance, prepararPaginasAvance } from '../src/utils/avanceImagen.js'

test('un día se genera compacto con los mismos totales de la matriz', () => {
  const [pagina] = prepararPaginasAvance(['03/09/2026'], ['Ana', 'Luis'], {
    Ana: { '03/09/2026': { count: 5 } }, Luis: { '03/09/2026': { count: 3 } },
  })
  assert.equal(pagina.cantidad, 1)
  assert.equal(pagina.totalGeneral, 8)
  assert.deepEqual(pagina.filas.map(fila => fila.total), [5, 3])
  assert.deepEqual(pagina.totales, [8])
})

test('divide un rango grande sin perder ni repetir celdas o totales', () => {
  const fechas = Array.from({ length: 8 }, (_, i) => `${i + 1}/09/2026`)
  const tecnicos = Array.from({ length: 26 }, (_, i) => `Técnico ${i + 1}`)
  const matriz = Object.fromEntries(tecnicos.map(tecnico => [tecnico, Object.fromEntries(fechas.map(fecha => [fecha, { count: 2 }]))]))
  const paginas = prepararPaginasAvance(fechas, tecnicos, matriz)
  assert.equal(paginas.length, 4)
  assert.ok(paginas.every(pagina => pagina.fechas.length <= 7 && pagina.filas.length <= 25 && pagina.totalGeneral === 416))
  assert.deepEqual(paginas.map(pagina => pagina.numero), [1, 2, 3, 4])
  assert.equal(paginas.reduce((n, pagina) => n + pagina.total, 0), 416)
  assert.equal(paginas.reduce((n, pagina) => n + pagina.filas.length * pagina.fechas.length, 0), 208)
})

test('no produce imágenes vacías', () => {
  assert.deepEqual(prepararPaginasAvance([], ['Ana'], {}), [])
  assert.deepEqual(prepararPaginasAvance(['03/09/2026'], [], {}), [])
})

test('filtra las fechas inclusive y excluye órdenes sin fecha del día elegido', () => {
  const finalizado = (id, fecha) => ({ id, ESTADO_LIMPIO: 'ORDEN FINALIZADA', FECHA_OBJ: fecha })
  const datos = [
    finalizado(1, '2026-09-03T00:00:00'), finalizado(2, '2026-09-03T23:59:59.999'),
    finalizado(3, '2026-09-02T23:59:59'), finalizado(4, '2026-09-04T00:00:00'),
    finalizado(5, null), finalizado(6, 'fecha inválida'),
    { id: 7, ESTADO_LIMPIO: 'EN PROCESO', FECHA_OBJ: '2026-09-03T10:00:00' },
  ]
  assert.deepEqual(filtrarCierresAvance(datos, '2026-09-03', '2026-09-03').map(t => t.id), [1, 2])
  assert.deepEqual(filtrarCierresAvance(datos, '2026-09-03', '').map(t => t.id), [1, 2, 4])
  assert.deepEqual(filtrarCierresAvance(datos, '', '2026-09-02').map(t => t.id), [3])
  assert.equal(filtrarCierresAvance(datos, '', '').length, 6)
  assert.equal(filtrarCierresAvance(datos, '2026-09-04', '2026-09-03').length, 0)
})

test('dibuja sin depender del ancho de pantalla y conserva nombres largos', () => {
  const nombre = 'TÉCNICO CON UN NOMBRE EXTENSO PARA COMPROBAR QUE NO SE RECORTE'
  const textos = []
  const ctx = {
    measureText: texto => ({ width: texto.length * 8 }),
    scale() {}, fillRect() {}, strokeRect() {},
    fillText: texto => textos.push(texto),
  }
  const canvas = { getContext: () => ctx }
  const [pagina] = prepararPaginasAvance(['03/09/2026'], [nombre], { [nombre]: { '03/09/2026': { count: 9 } } })
  dibujarPaginaAvance(canvas, pagina, { periodo: 'Cierres del 03/09/2026', generado: '03/09/2026 08:00' })
  assert.equal(canvas.width, 1040)
  assert.ok(canvas.height > 592)
  assert.ok(textos.includes('Total del período: 9 finalizados'))
  const comienzo = textos.indexOf('TOTAL') + 1
  const lineas = textos.slice(comienzo, comienzo + 2)
  assert.equal(lineas.join('').replace(/\s/g, ''), nombre.replace(/\s/g, ''))
})

test('descarga un PNG o un ZIP con todas sus imágenes y libera los recursos', async t => {
  const anteriores = ['document', 'FileReader'].map(nombre => [nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)])
  t.after(() => anteriores.forEach(([nombre, descriptor]) => {
    if (descriptor) Object.defineProperty(globalThis, nombre, descriptor)
    else delete globalThis[nombre]
  }))
  const descargas = []
  const blobs = []
  const liberar = []
  const urlsRevocadas = []
  let errorCanvas = false
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(result => this.onload({ target: { result } }), error => this.onerror({ target: { error } }))
    }
  }
  globalThis.document = {
    body: { appendChild() {} },
    createElement(tipo) {
      if (tipo === 'a') return { click() { descargas.push({ nombre: this.download, url: this.href }) }, remove() {} }
      return {
        getContext: () => ({ measureText: texto => ({ width: texto.length * 7 }), scale() {}, fillRect() {}, strokeRect() {}, fillText() {} }),
        toBlob: callback => callback(errorCanvas ? null : new Blob(['contenido-png-de-prueba'], { type: 'image/png' })),
      }
    },
  }
  t.mock.method(URL, 'createObjectURL', blob => { blobs.push(blob); return `blob:prueba-${blobs.length}` })
  t.mock.method(URL, 'revokeObjectURL', url => urlsRevocadas.push(url))
  t.mock.method(globalThis, 'setTimeout', callback => { liberar.push(callback); return 1 })
  const opciones = { periodo: 'Prueba', generado: '03/09/2026', nombre: 'prueba' }
  const [pagina] = prepararPaginasAvance(['03/09/2026'], ['Ana'], { Ana: { '03/09/2026': { count: 1 } } })

  assert.equal(await descargarAvanceImagen([pagina], opciones), 1)
  assert.equal(descargas[0].nombre, 'avances-prueba-01.png')
  assert.equal(blobs[0].type, 'image/png')
  assert.equal(await descargarAvanceImagen([{ ...pagina, cantidad: 2 }, { ...pagina, numero: 2, cantidad: 2 }], opciones), 2)
  assert.equal(descargas[1].nombre, 'avances-prueba.zip')
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await blobs[1].arrayBuffer())
  assert.deepEqual(Object.keys(zip.files), ['avances-prueba-01.png', 'avances-prueba-02.png'])
  assert.equal(await zip.file('avances-prueba-02.png').async('string'), 'contenido-png-de-prueba')
  liberar.forEach(callback => callback())
  assert.deepEqual(urlsRevocadas, ['blob:prueba-1', 'blob:prueba-2'])

  errorCanvas = true
  await assert.rejects(() => descargarAvanceImagen([pagina], opciones), /No fue posible generar la imagen/)
  await assert.rejects(() => descargarAvanceImagen([], opciones), /No hay finalizados/)
  assert.equal(descargas.length, 2)
})
