const DIAS_POR_IMAGEN = 7
const TECNICOS_POR_IMAGEN = 25

export function filtrarCierresAvance(tickets, desde, hasta) {
  const inicio = desde ? new Date(`${desde}T00:00:00`) : null
  const fin = hasta ? new Date(`${hasta}T23:59:59.999`) : null
  return tickets.filter(ticket => {
    if (!ticket.ESTADO_LIMPIO?.includes('FINALIZADA')) return false
    if (!inicio && !fin) return true
    // Una orden sin fecha no puede atribuirse al día seleccionado.
    if (!ticket.FECHA_OBJ) return false
    const cierre = new Date(ticket.FECHA_OBJ)
    return !Number.isNaN(cierre.getTime()) && (!inicio || cierre >= inicio) && (!fin || cierre <= fin)
  })
}

export function prepararPaginasAvance(fechas, tecnicos, matriz) {
  if (!fechas.length || !tecnicos.length) return []
  const paginas = []
  const contar = (tecnico, fecha) => Number(matriz[tecnico]?.[fecha]?.count) || 0
  const totalGeneral = tecnicos.reduce((total, tecnico) => total + fechas.reduce((n, fecha) => n + contar(tecnico, fecha), 0), 0)
  for (let col = 0; col < fechas.length; col += DIAS_POR_IMAGEN) {
    const dias = fechas.slice(col, col + DIAS_POR_IMAGEN)
    for (let fila = 0; fila < tecnicos.length; fila += TECNICOS_POR_IMAGEN) {
      const filas = tecnicos.slice(fila, fila + TECNICOS_POR_IMAGEN).map(tecnico => {
        const valores = dias.map(fecha => contar(tecnico, fecha))
        return { tecnico, valores, total: valores.reduce((a, b) => a + b, 0) }
      })
      const totales = dias.map((_, i) => filas.reduce((n, registro) => n + registro.valores[i], 0))
      paginas.push({ fechas: dias, filas, totales, total: totales.reduce((a, b) => a + b, 0), totalGeneral })
    }
  }
  return paginas.map((pagina, i) => ({ ...pagina, numero: i + 1, cantidad: paginas.length }))
}

function dividirTexto(ctx, texto, ancho) {
  const lineas = []
  let linea = ''
  // Divide también palabras largas, sin recortar nombres de técnicos.
  for (const caracter of String(texto)) {
    if (linea && ctx.measureText(linea + caracter).width > ancho) {
      lineas.push(linea.trim())
      linea = ''
    }
    linea += caracter
  }
  if (linea) lineas.push(linea.trim())
  return lineas.length ? lineas : ['—']
}

// Dibuja el informe a partir de los datos, no de una captura de pantalla:
// nunca recorta columnas por el ancho del móvil ni hereda el modo oscuro.
export function dibujarPaginaAvance(canvas, pagina, { periodo, generado }) {
  const margen = 20
  const anchoNombre = pagina.fechas.length === 1 ? 284 : 250
  const anchos = [anchoNombre, ...pagina.fechas.map(() => 112), 84]
  const anchoTabla = anchos.reduce((a, b) => a + b, 0)
  const ancho = anchoTabla + margen * 2
  let ctx = canvas.getContext('2d')
  ctx.font = 'bold 12px Arial'
  const filas = pagina.filas.map(fila => {
    const nombre = dividirTexto(ctx, fila.tecnico, anchoNombre - 24)
    return { ...fila, nombre, alto: Math.max(36, nombre.length * 16 + 16) }
  })
  const alto = 118 + 36 + filas.reduce((n, fila) => n + fila.alto, 0) + 40 + 66
  canvas.width = ancho * 2
  canvas.height = alto * 2
  ctx = canvas.getContext('2d')
  ctx.scale(2, 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, ancho, alto)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, ancho, 100)
  ctx.fillStyle = '#38bdf8'
  ctx.fillRect(0, 100, ancho, 4)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 20px Arial'
  ctx.fillText('AVANCE DE TÉCNICOS', margen, 28)
  ctx.font = '12px Arial'
  ctx.fillStyle = '#e2e8f0'
  ctx.fillText(periodo, margen, 52)
  ctx.font = '10px Arial'
  ctx.fillText(`Generado: ${generado}`, margen, 75)
  ctx.textAlign = 'right'
  ctx.fillText(`${pagina.numero} / ${pagina.cantidad}`, ancho - margen, 75)

  function celdas(y, altura, valores, fondo, color, negrita = false) {
    let x = margen
    anchos.forEach((anchura, i) => {
      ctx.fillStyle = fondo
      ctx.fillRect(x, y, anchura, altura)
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 1
      ctx.strokeRect(x, y, anchura, altura)
      ctx.fillStyle = color
      ctx.font = `${negrita ? 'bold ' : ''}12px Arial`
      ctx.textAlign = i === 0 ? 'left' : 'center'
      const lineas = Array.isArray(valores[i]) ? valores[i] : [String(valores[i])]
      lineas.forEach((linea, j) => ctx.fillText(linea, i === 0 ? x + 12 : x + anchura / 2, y + altura / 2 + (j - (lineas.length - 1) / 2) * 16))
      x += anchura
    })
  }

  let y = 118
  celdas(y, 36, ['TÉCNICO', ...pagina.fechas, 'TOTAL'], '#334155', '#ffffff', true)
  y += 36
  filas.forEach((fila, i) => {
    celdas(y, fila.alto, [fila.nombre, ...fila.valores.map(n => n || '—'), fila.total], i % 2 ? '#f1f5f9' : '#ffffff', '#0f172a', true)
    y += fila.alto
  })
  celdas(y, 40, [pagina.cantidad > 1 ? 'TOTAL DE ESTA PÁGINA' : 'TOTAL GENERAL', ...pagina.totales, pagina.total], '#0f172a', '#ffffff', true)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#334155'
  ctx.font = 'bold 11px Arial'
  ctx.fillText(`Total del período: ${pagina.totalGeneral} finalizados`, margen, y + 62)
  ctx.font = '10px Arial'
  ctx.fillText(pagina.cantidad > 1 ? 'Informe dividido en páginas para mantener la lectura.' : 'TicketManager · Control de productividad', margen, y + 82)
  return canvas
}

export async function descargarAvanceImagen(paginas, opciones) {
  const archivos = []
  for (const pagina of paginas) {
    const canvas = dibujarPaginaAvance(document.createElement('canvas'), pagina, opciones)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    canvas.width = 0
    canvas.height = 0
    if (!blob) throw new Error('No fue posible generar la imagen. Prueba con un período más corto.')
    archivos.push({ nombre: `avances-${opciones.nombre}-${String(pagina.numero).padStart(2, '0')}.png`, blob })
  }
  if (!archivos.length) throw new Error('No hay finalizados para descargar en este período.')
  let blob = archivos[0].blob
  let nombre = archivos[0].nombre
  if (archivos.length > 1) {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    archivos.forEach(archivo => zip.file(archivo.nombre, archivo.blob))
    blob = await zip.generateAsync({ type: 'blob' })
    nombre = `avances-${opciones.nombre}.zip`
  }
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  return archivos.length
}
