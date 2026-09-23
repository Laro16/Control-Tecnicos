import test from 'node:test'
import assert from 'node:assert/strict'
import { prepararPaginasRuta, dibujarPaginaRuta } from '../src/utils/rutaImagen.js'
import { prepararPaginasAvance, dibujarPaginaAvance } from '../src/utils/avanceImagen.js'

function canvasPrueba() {
  const textos = []
  const ctx = {
    measureText: texto => ({ width: texto.length * 8 }),
    scale() {}, fillRect() {}, strokeRect() {},
    fillText(texto) { textos.push({ texto, color: this.fillStyle }) },
  }
  return { textos, getContext: () => ctx }
}

test('la productividad exportada conserva los colores según el número de cierres', () => {
  const canvas = canvasPrueba()
  const tecnicos = ['Ana', 'Luis', 'José']
  const matriz = Object.fromEntries(tecnicos.map((tecnico, i) => [tecnico, { hoy: { count: i + 3 } }]))
  const [pagina] = prepararPaginasAvance(['hoy'], tecnicos, matriz)
  dibujarPaginaAvance(canvas, pagina, { periodo: 'Hoy', generado: 'Prueba' })
  for (const [texto, color] of [['3', '#e11d48'], ['4', '#d97706'], ['5', '#059669'], ['12', '#34d399']]) {
    assert.ok(canvas.textos.some(t => t.texto === texto && t.color === color))
  }
})

test('rutas pagina sin perder técnicos, respeta rutas editadas y conserva totales', () => {
  const tecnicos = Array.from({ length: 23 }, (_, i) => `Técnico ${i}`)
  const matriz = Object.fromEntries(tecnicos.map(tec => [tec, { menos24: { count: 1 }, mas24: { count: 2 }, mas72: { count: 3 }, mas100: { count: 4 }, total: { count: 10 } }]))
  const paginas = prepararPaginasRuta(tecnicos, matriz, tec => `Ruta editada de ${tec}`)
  assert.equal(paginas.length, 2)
  assert.deepEqual(paginas.flatMap(p => p.filas.map(f => f.tecnico)), tecnicos)
  assert.deepEqual(paginas[0].totales, [20, 40, 60, 80, 200])
  assert.deepEqual(paginas[1].totales, [3, 6, 9, 12, 30])
  assert.ok(paginas.every(p => p.totalGeneral === 230))
  assert.equal(paginas[1].filas[0].ruta, 'Ruta editada de Técnico 20')
  assert.deepEqual(prepararPaginasRuta([], {}, () => ''), [])
})

test('rutas dibuja texto largo completo y números a color', () => {
  const canvas = canvasPrueba()
  const ruta = 'RUTA EXTENSA CON MUCHOS MUNICIPIOS PARA VERIFICAR QUE TODA LA INFORMACIÓN SE CONSERVA\nSEGUNDA LÍNEA'
  const [pagina] = prepararPaginasRuta(['Ana'], { Ana: { menos24: { count: 2 }, total: { count: 2 } } }, () => ruta)
  dibujarPaginaRuta(canvas, pagina, { generado: 'Prueba' })
  assert.equal(canvas.width, 1940)
  assert.equal(canvas.textos.filter(t => t.color === '#075985').map(t => t.texto).join('').replace(/\s/g, ''), ruta.replace(/\s/g, ''))
  assert.ok(canvas.textos.some(t => t.texto === '2' && t.color === '#047857'))
})
