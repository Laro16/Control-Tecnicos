import test from 'node:test'
import assert from 'node:assert/strict'
import { prepararControlImprimible, filtrarControlImprimible, combinarResaltadosControl, estadoControlImprimible, datosImagenControlImprimible, htmlControlImprimible, imprimirControlImprimible, dividirControlImprimible, claveControlImprimible } from '../src/utils/controlImprimiblePreventivos.js'
import { dibujarImagenPreventivos } from '../src/utils/preventivosImagen.js'

const local = (codigo, extra = {}) => ({ id: `GRANJERO:${codigo}`, marca: 'GRANJERO', codigo: String(codigo), nombre: `Granjero ${codigo}`, direccion: 'Aguacatán, Huehuetenango', semana: 'SEMANA 2', equipos: 3, meses: [3, 7, 11], activo: true, ...extra })
const registro = (codigo, extra = {}) => ({ local: local(codigo), anio: 2026, mes: 11, estado: 'pendiente', enExcel: false, realizado: false, declaracion: null, ordenes: [], ...extra })

test('control prepara una vuelta sin reordenar filas por sus estados ni incluir cerrados', () => {
  const catalogo = [local(3, { activo: false }), local(2), local(1), local(4, { meses: [2, 6, 10] })]
  const ordenes = [{ numero_orden: 'O-1', marca: 'GRANJERO', codigo: '2', fecha_realizada: '2026-11-02' }]
  const declaraciones = [{ marca: 'GRANJERO', codigo: '1', anio: 2026, mes: 11, realizado: true }]
  const antes = JSON.stringify({ catalogo, ordenes, declaraciones })
  const control = prepararControlImprimible(catalogo, ordenes, declaraciones, '2026', 3)
  assert.deepEqual(control.map(r => [r.local.codigo, r.mes, r.estado]), [['4', 10, 'pendiente'], ['1', 11, 'por-liquidar'], ['2', 11, 'finalizado']])
  assert.equal(control[2].ordenes.length, 1)
  assert.ok(prepararControlImprimible(catalogo, ordenes, declaraciones, 2026, 1).every(r => r.mes <= 4))
  assert.deepEqual(prepararControlImprimible(catalogo, ordenes, declaraciones, '', 3), [])
  assert.deepEqual(prepararControlImprimible(catalogo, ordenes, declaraciones, 2026, 4), [])
  assert.equal(JSON.stringify({ catalogo, ordenes, declaraciones }), antes)
})

test('filtros usan solo las filas pedidas y unifican Granjero y Siciliana', () => {
  const registros = [registro(413), registro(752), registro(2, { local: local(2, { marca: 'CAMPERO', id: 'CAMPERO:2', semana: 'SEMANA 1' }), mes: 10, estado: 'finalizado', enExcel: true })]
  assert.equal(filtrarControlImprimible(registros).length, 3)
  assert.equal(filtrarControlImprimible(registros, { marca: 'GRANJERO' }).length, 2)
  assert.deepEqual(filtrarControlImprimible(registros, { mes: '10', semana: 'semana 1', estado: 'finalizado', busqueda: 'aguacatan' }).map(r => r.local.codigo), ['2'])
  assert.equal(filtrarControlImprimible(registros, { busqueda: '752' })[0], registros[1])
  assert.equal(filtrarControlImprimible(registros, { busqueda: 'No existe' }).length, 0)
  assert.equal(filtrarControlImprimible(registros, { estado: 'por-liquidar' }).length, 0)
})

test('color automático solo confirma Excel; preferencias no cambian el estado ni otros períodos', () => {
  const pendientes = Object.freeze(registro(1, { declaracion: { realizado: true }, estado: 'por-liquidar', realizado: true }))
  const finalizado = Object.freeze(registro(2, { estado: 'finalizado', enExcel: true, realizado: true }))
  const filas = Object.freeze([pendientes, finalizado])
  const automatico = combinarResaltadosControl(filas)
  assert.deepEqual(automatico.map(r => r.resaltado), [false, true])
  const preferencias = [{ marca: 'GRANJERO', codigo: '1', anio: 2026, mes: 11, modo: 'verde', revision: 3 }, { marca: 'GRANJERO', codigo: '2', anio: 2026, mes: 11, modo: 'sin-color', revision: 1 }]
  const manual = combinarResaltadosControl(filas, preferencias)
  assert.deepEqual(manual.map(r => r.resaltado), [true, false])
  assert.deepEqual(manual.map(r => r.estado), ['por-liquidar', 'finalizado'])
  assert.deepEqual(manual.map(r => estadoControlImprimible(r)), ['Pendiente de liquidar', 'Realizado'])
  assert.deepEqual(manual.map(r => r.revisionResaltado), [3, 1])
  assert.equal(combinarResaltadosControl([registro(1, { mes: 7 })], preferencias)[0].modoResaltado, 'automatico')
  assert.equal(combinarResaltadosControl([registro(1, { anio: 2027 })], preferencias)[0].modoResaltado, 'automatico')
  assert.equal(combinarResaltadosControl([registro(1, { local: local(1, { marca: 'CAMPERO' }) })], preferencias)[0].modoResaltado, 'automatico')
  assert.equal(combinarResaltadosControl(filas, [{ ...preferencias[0], modo: 'incorrecto' }])[0].modoResaltado, 'automatico')
  assert.equal(pendientes.resaltado, undefined)
  assert.equal(finalizado.resaltado, undefined)
  assert.equal(claveControlImprimible(pendientes), 'GRANJERO:1:2026:11')
})

test('PNG conserva estado a la derecha, datos filtrados y colores independientes', () => {
  const filas = combinarResaltadosControl([
    registro(1, { enExcel: true, estado: 'finalizado', realizado: true, ordenes: [{ numero_orden: 'R1' }, { numero_orden: 'R1' }] }),
    registro(2),
  ], [{ marca: 'GRANJERO', codigo: '1', anio: 2026, mes: 11, modo: 'sin-color' }, { marca: 'GRANJERO', codigo: '2', anio: 2026, mes: 11, modo: 'verde' }])
  const imagen = datosImagenControlImprimible(filas, { anio: 2026, vuelta: 3 })
  const tabla = imagen.secciones[0]
  assert.equal(imagen.tema, 'anaranjado'); assert.equal(tabla.multilinea, true)
  assert.equal(tabla.anchos.reduce((a, b) => a + b), 1240)
  assert.equal(tabla.encabezados.at(-1), 'Estado')
  assert.deepEqual(tabla.filas.map(f => f.at(-1)), ['Realizado', 'Pendiente'])
  assert.match(tabla.filas[0][4], /^1 en Excel\n3 previstos$/)
  assert.deepEqual(tabla.coloresFila, ['#ffffff', '#dcfce7'])
  assert.deepEqual(tabla.estados, ['finalizado', 'pendiente'])
  assert.deepEqual(datosImagenControlImprimible(filas, { anio: 2026, vuelta: 3, colores: false }).secciones[0].coloresFila, ['#ffffff', '#ffffff'])
  const limitada = datosImagenControlImprimible(filas.slice(0, 1), { anio: 2026, vuelta: 3 })
  assert.equal(limitada.secciones[0].filas.length, 1)
  assert.ok(!JSON.stringify(limitada).includes('Granjero 2'))
  assert.throws(() => datosImagenControlImprimible([], { anio: 2026, vuelta: 3 }), /No hay/)
})

test('generador compartido acepta fondo por fila sin perder el texto del estado', () => {
  const rectangulos = [], textos = []
  const ctx = { measureText: t => ({ width: String(t).length * 8 }), fillRect(x, y, ancho, alto) { rectangulos.push({ x, y, ancho, alto, color: this.fillStyle }) }, strokeRect() {}, fillText(t) { textos.push(t) } }
  const canvas = { getContext: () => ctx }
  const datos = datosImagenControlImprimible([registro(1, { enExcel: true, estado: 'finalizado', resaltado: false }), registro(2, { resaltado: true })], { anio: 2026, vuelta: 3 })
  dibujarImagenPreventivos(canvas, datos)
  assert.equal(canvas.width, 1320)
  assert.deepEqual(rectangulos.filter(r => r.x === 40 && r.ancho === 90 && r.y >= 228).map(r => r.color), ['#ffffff', '#dcfce7'])
  assert.ok(textos.includes('Realizado')); assert.ok(textos.includes('Pendiente'))
})

test('HTML imprimible escapa datos, repite encabezados y no incluye controles ni filas ocultas', () => {
  const fila = registro(1, { local: local(1, { nombre: '<script>alert("x")</script>', direccion: 'Calle & "Zona"' }), enExcel: true, resaltado: false })
  const html = htmlControlImprimible([fila], { anio: 2026, vuelta: 3 })
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/)
  assert.match(html, /Calle &amp; &quot;Zona&quot;/)
  assert.doesNotMatch(html, /<script|<button|<select|<input|<iframe|https?:\/\//)
  assert.match(html, /table-header-group/); assert.match(html, /A4 landscape/)
  assert.match(html, /print-color-adjust:exact/)
  assert.match(html, /<td class="estado">Realizado<\/td>/)
  assert.match(html, /background-color:#ffffff/)
  assert.equal((html.match(/<tbody><tr/g) || []).length, 1)
  assert.equal(estadoControlImprimible(registro(2)), 'Pendiente')
  const sinColor = htmlControlImprimible([registro(1, { resaltado: true })], { anio: 2026, vuelta: 3, colores: false })
  assert.ok(!sinColor.includes('#dcfce7'))
  assert.throws(() => htmlControlImprimible([], {}), /No hay/)
})

test('impresión abre solo un documento filtrado y explica bloqueo de ventanas', () => {
  const filas = [registro(1)]
  let contenido = '', impresiones = 0, enfocado = 0
  const ventana = { opener: {}, document: { open() {}, write(html) { contenido = html }, close() {} }, focus() { enfocado++ }, print() { impresiones++ }, close() {} }
  assert.equal(imprimirControlImprimible(filas, { anio: 2026, vuelta: 3 }, { abrir: () => ventana }), ventana)
  assert.equal(ventana.opener, null); assert.equal(impresiones, 1); assert.equal(enfocado, 1)
  assert.match(contenido, /Granjero 1/)
  assert.throws(() => imprimirControlImprimible(filas, {}, { abrir: () => null }), /bloqueó/)
})

test('listas grandes se dividen en PNG manejables sin perder ni duplicar filas', () => {
  const filas = Array.from({ length: 51 }, (_, i) => registro(i + 1))
  const lotes = dividirControlImprimible(filas)
  assert.deepEqual(lotes.map(l => l.length), [24, 24, 3])
  assert.deepEqual(lotes.flat(), filas)
  assert.deepEqual(dividirControlImprimible([]), [])
  assert.equal(dividirControlImprimible(filas.slice(0, 3)).length, 1)
  assert.throws(() => dividirControlImprimible(filas, 0), /válida/)
})
