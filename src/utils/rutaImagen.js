import { descargarPaginasImagen, dividirTexto } from './avanceImagen.js'

const CLAVES = ['menos24', 'mas24', 'mas72', 'mas100', 'total']
const ANCHOS = [230, 340, 70, 70, 70, 70, 80]
const COLORES = ['#047857', '#b45309', '#dc2626', '#991b1b', '#0f172a']

export function prepararPaginasRuta(tecnicos, matriz, obtenerRuta) {
  const filas = tecnicos.map(tecnico => ({
    tecnico,
    ruta: String(obtenerRuta(tecnico) || 'Sin ruta detectada'),
    valores: CLAVES.map(clave => Number(matriz[tecnico]?.[clave]?.count) || 0),
  }))
  const totalGeneral = filas.reduce((total, fila) => total + fila.valores[4], 0)
  const paginas = []
  for (let i = 0; i < filas.length; i += 20) {
    const grupo = filas.slice(i, i + 20)
    paginas.push({ filas: grupo, totales: CLAVES.map((_, col) => grupo.reduce((n, fila) => n + fila.valores[col], 0)), totalGeneral })
  }
  return paginas.map((pagina, i) => ({ ...pagina, numero: i + 1, cantidad: paginas.length }))
}

export function dibujarPaginaRuta(canvas, pagina, { generado }) {
  const margen = 20
  const ancho = ANCHOS.reduce((a, b) => a + b, margen * 2)
  let ctx = canvas.getContext('2d')
  ctx.font = 'bold 13px Arial'
  const filas = pagina.filas.map(fila => {
    const nombre = dividirTexto(ctx, fila.tecnico, ANCHOS[0] - 24)
    const ruta = dividirTexto(ctx, fila.ruta, ANCHOS[1] - 24)
    return { ...fila, nombre, ruta, alto: Math.max(44, Math.max(nombre.length, ruta.length) * 18 + 20) }
  })
  const alto = 118 + 40 + filas.reduce((total, fila) => total + fila.alto, 0) + 40 + 70
  canvas.width = ancho * 2
  canvas.height = alto * 2
  ctx = canvas.getContext('2d')
  ctx.scale(2, 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, ancho, alto)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, ancho, 100)
  ctx.fillStyle = '#fbbf24'
  ctx.fillRect(0, 100, ancho, 4)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 22px Arial'
  ctx.fillText('RUTAS DE TÉCNICOS', margen, 28)
  ctx.font = '13px Arial'
  ctx.fillStyle = '#e2e8f0'
  ctx.fillText('Carga activa y rutas de trabajo', margen, 52)
  ctx.font = '11px Arial'
  ctx.fillText(`Generado: ${generado}`, margen, 76)
  ctx.textAlign = 'right'
  ctx.fillText(`${pagina.numero} / ${pagina.cantidad}`, ancho - margen, 76)

  function celdas(y, altura, valores, fondos, colores) {
    let x = margen
    ANCHOS.forEach((anchura, i) => {
      ctx.fillStyle = fondos[i]
      ctx.fillRect(x, y, anchura, altura)
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x, y, anchura, altura)
      ctx.fillStyle = colores[i]
      ctx.font = 'bold 13px Arial'
      ctx.textAlign = i < 2 ? 'left' : 'center'
      const lineas = Array.isArray(valores[i]) ? valores[i] : [String(valores[i])]
      lineas.forEach((linea, j) => ctx.fillText(linea, i < 2 ? x + 12 : x + anchura / 2, y + altura / 2 + (j - (lineas.length - 1) / 2) * 18))
      x += anchura
    })
  }

  let y = 118
  celdas(y, 40, ['TÉCNICO', 'RUTA DE TRABAJO', '-24h', '+24h', '+72h', '+100h', 'TOTAL'],
    ['#334155', '#334155', '#059669', '#d97706', '#dc2626', '#991b1b', '#0f172a'], Array(7).fill('#ffffff'))
  y += 40
  filas.forEach((fila, i) => {
    const fondos = Array(7).fill(i % 2 ? '#f1f5f9' : '#ffffff')
    fondos[6] = '#e2e8f0'
    celdas(y, fila.alto, [fila.nombre, fila.ruta, ...fila.valores.map(n => n || '—')], fondos, ['#0f172a', '#075985', ...COLORES])
    y += fila.alto
  })
  celdas(y, 40, [pagina.cantidad > 1 ? 'TOTAL DE ESTA PÁGINA' : 'TOTAL OPERATIVO', '', ...pagina.totales],
    Array(7).fill('#0f172a'), ['#ffffff', '#ffffff', '#34d399', '#fbbf24', '#f87171', '#fca5a5', '#ffffff'])
  ctx.textAlign = 'left'
  ctx.fillStyle = '#334155'
  ctx.font = 'bold 12px Arial'
  ctx.fillText(`Total operativo: ${pagina.totalGeneral} tickets`, margen, y + 62)
  ctx.font = '11px Arial'
  ctx.fillText('TicketManager · Rutas del reporte cargado', margen, y + 84)
  return canvas
}

export function descargarRutaImagen(paginas, opciones) {
  return descargarPaginasImagen(paginas, opciones, dibujarPaginaRuta, 'rutas')
}
