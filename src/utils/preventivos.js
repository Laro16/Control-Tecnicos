export const MESES_PREVENTIVOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export const MARCAS_PREVENTIVOS = { GRANJERO: 'Granjero / Siciliana', CAMPERO: 'Campero' }
export const normalizarPreventivo = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase()
const texto = valor => String(valor ?? '').trim()
const codigoLimpio = valor => texto(valor).replace(/\.0$/, '').replace(/^0+(?=\d)/, '')
export function fechaPreventivo(valor) {
  if (!valor) return null
  if (typeof valor === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000).toISOString().slice(0, 10)
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : `${valor.getFullYear()}-${String(valor.getMonth()+1).padStart(2,'0')}-${String(valor.getDate()).padStart(2,'0')}`
  const t = texto(valor)
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const local = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s.*)?$/)
  if (!iso && !local) return null
  const [y,m,d] = iso ? iso.slice(1).map(Number) : [Number(local[3]), Number(local[2]), Number(local[1])]
  const fecha = new Date(Date.UTC(y,m-1,d))
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m-1 && fecha.getUTCDate() === d ? fecha.toISOString().slice(0,10) : null
}
export function catalogoDesdeMatriz(matriz) {
  const encabezado = matriz.findIndex(f => f.some(c => normalizarPreventivo(c) === 'CODIGO') && f.some(c => normalizarPreventivo(c) === 'CLIENTE'))
  if (encabezado < 0) throw new Error('El calendario no contiene CODIGO y CLIENTE.')
  const claves = matriz[encabezado].map(normalizarPreventivo)
  const col = nombre => claves.indexOf(nombre)
  const fechas = claves.map((v,i) => v === 'FECHAS' ? i : -1).filter(i => i >= 0)
  return matriz.slice(encabezado+1).flatMap((fila,i) => {
    const codigo = codigoLimpio(fila[col('CODIGO')]), marca = normalizarPreventivo(fila[col('CLIENTE')])
    if (!codigo || !MARCAS_PREVENTIVOS[marca]) return []
    const meses = fechas.map(c => MESES_PREVENTIVOS.findIndex(m => normalizarPreventivo(m) === normalizarPreventivo(fila[c])) + 1).filter(Boolean)
    return [{ id: `${marca}:${codigo}`, codigo, marca, nombre: texto(fila[col('UNIDADES POLLO GRANJERO')]), direccion: texto(fila[col('UBICACION')]), telefono: texto(fila[col('TELEFONO')]), semana: texto(fila[col('SEMANA')]), equipos: Number(fila[col('EQUIPOS')]) || null, meses, activo: normalizarPreventivo(fila[col('ESTADO 2')]) !== 'CERRADO', fila: encabezado+i+2 }]
  })
}
export function marcaDesdeCliente(cliente) {
  return ({ 'PREVENTIVO GRANJERO 1': 'GRANJERO', 'CAMPERO PREVENTIVO': 'CAMPERO' })[normalizarPreventivo(cliente)] || null
}
export function codigoDesdeNegocio(negocio, marca, catalogo) {
  const validos = new Set(catalogo.filter(l => l.marca === marca).map(l => l.codigo))
  const encontrados = [...new Set((texto(negocio).match(/\b\d+\b/g) || []).map(codigoLimpio).filter(c => validos.has(c)))]
  return encontrados.length === 1 ? encontrados[0] : null
}
export function extraerOrdenesPreventivas(filas) {
  const ordenes = new Map()
  let sinOrden = 0
  for (const original of filas) {
    const fila = Object.fromEntries(Object.entries(original).map(([k,v]) => [normalizarPreventivo(k),v]))
    const marca = marcaDesdeCliente(fila.CLIENTE)
    if (!marca) continue
    const orden = texto(fila['N° ORDEN'] ?? fila['Nº ORDEN'] ?? fila['NO ORDEN'])
    if (!orden || orden === '-') { sinOrden++; continue }
    const codigo = codigoLimpio(fila['CODIGO CLIENTE'])
    const registro = { numero_orden: orden, marca, codigo: codigo && codigo !== '-' ? codigo : null, negocio: texto(fila.NEGOCIO), tecnico: texto(fila.TECNICO), estado: texto(fila.ESTADO), fecha_realizada: fechaPreventivo(fila['FECHA REALIZADA']), actualizado_en: new Date().toISOString() }
    const anterior = ordenes.get(orden)
    if (anterior && anterior.marca !== marca) throw new Error(`La orden ${orden} aparece en dos marcas. Revisa el Excel.`)
    ordenes.set(orden, { ...registro, fecha_realizada: registro.fecha_realizada || anterior?.fecha_realizada || null })
  }
  return { ordenes: [...ordenes.values()], sinOrden }
}
export function atribuirOrden(orden, catalogo) {
  const codigo = orden.codigo || codigoDesdeNegocio(orden.negocio, orden.marca, catalogo)
  const local = catalogo.find(l => l.marca === orden.marca && l.codigo === codigo)
  if (!local) return { ...orden, codigo, local: null }
  const fecha = fechaPreventivo(orden.fecha_realizada)
  if (orden.anio_programado && orden.mes_programado) return { ...orden, codigo, local, programado: { anio: orden.anio_programado, mes: orden.mes_programado, vuelta: Math.floor((orden.mes_programado-1)/4)+1 }, tarde: Boolean(fecha && fecha.slice(0,7) > `${orden.anio_programado}-${String(orden.mes_programado).padStart(2,'0')}`) }
  if (!fecha) return { ...orden, codigo, local, programado: null, tarde: false }
  const [anio, mes] = fecha.split('-').map(Number)
  const anteriores = local.meses.filter(m => m <= mes)
  const mesPlan = anteriores.length ? Math.max(...anteriores) : Math.max(...local.meses)
  const anioPlan = anteriores.length ? anio : anio-1
  return { ...orden, codigo, local, programado: { anio: anioPlan, mes: mesPlan, vuelta: Math.floor((mesPlan-1)/4)+1 }, tarde: anio !== anioPlan || mes !== mesPlan }
}
export function prepararAvance(catalogo, ordenes, anio, vuelta, corte, declaraciones = []) {
  const atribuidas = [...new Map(ordenes.filter(o => !o.exclusion?.excluida).map(o => [o.numero_orden, atribuirOrden(o,catalogo)])).values()]
  const incluidas = atribuidas.filter(o => o.local?.activo && o.programado?.anio === anio && o.programado?.vuelta === vuelta && (!corte || !o.fecha_realizada || o.fecha_realizada <= corte))
  const declaradas = declaraciones.filter(d => d.realizado && Number(d.anio) === anio
    && Math.floor((Number(d.mes)-1)/4)+1 === vuelta && (!corte || d.fecha_realizado <= corte))
  const resumen = Object.entries(MARCAS_PREVENTIVOS).map(([marca,nombre]) => {
    const locales = catalogo.filter(l => l.activo && l.marca === marca)
    const registros = incluidas.filter(o => o.marca === marca)
    // Un negocio cuenta una sola vez, aunque tenga marca manual y órdenes del Excel.
    const realizados = new Set(registros.map(o => o.local.id))
    for (const local of locales) {
      if (declaradas.some(d => d.marca === marca && d.codigo === local.codigo && local.meses.includes(Number(d.mes)))) realizados.add(local.id)
    }
    const atendidos = realizados.size
    return { marca, nombre, asignados: locales.length, atendidos, equipos: registros.length, pendiente: locales.length-atendidos, porcentaje: locales.length ? atendidos/locales.length*100 : 0 }
  })
  return { resumen, incluidas, atribuidas, sinFecha: atribuidas.filter(o => !o.fecha_realizada), sinLocal: atribuidas.filter(o => !o.local) }
}
export function rangoSemana(valor) {
  const fecha = new Date(`${valor}T12:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() - (fecha.getUTCDay()+6)%7)
  const inicio = fecha.toISOString().slice(0,10)
  fecha.setUTCDate(fecha.getUTCDate()+6)
  return { inicio, fin: fecha.toISOString().slice(0,10) }
}
