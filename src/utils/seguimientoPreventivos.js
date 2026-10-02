import { atribuirOrden } from './preventivos.js'

export const claveSeguimiento = (local, anio, mes) => `${local.marca}:${local.codigo}:${Number(anio)}:${Number(mes)}`

// Siciliana sigue almacenada bajo GRANJERO para conservar órdenes y declaraciones.
// El prefijo 7 sólo clasifica restaurantes de esa marca, nunca los Campero.
export const TIPOS_RESTAURANTE_PREVENTIVO = { GRANJERO: 'Granjero', SICILIANA: 'Siciliana', CAMPERO: 'Campero' }
export function tipoRestaurantePreventivo(local) {
  if (local.marca === 'CAMPERO') return 'CAMPERO'
  if (local.marca === 'GRANJERO') return String(local.codigo ?? '').trim().startsWith('7') ? 'SICILIANA' : 'GRANJERO'
  return local.marca
}

// La declaración del técnico y las órdenes del Excel nunca se suman entre sí.
// Una orden sólo liquida el mes al que ya fue atribuida por la lógica existente.
export function prepararSeguimiento(catalogo, ordenes, declaraciones, anio, mes) {
  const declarados = new Map(declaraciones.filter(d => d.realizado && Number(d.anio) === Number(anio) && Number(d.mes) === Number(mes))
    .map(d => [claveSeguimiento(d, anio, mes), d]))
  const porLocal = new Map()
  for (const orden of ordenes) {
    const o = atribuirOrden(orden, catalogo)
    if (!o.local || o.programado?.anio !== Number(anio) || o.programado?.mes !== Number(mes)) continue
    const registros = porLocal.get(o.local.id) || new Map()
    registros.set(o.numero_orden, o)
    porLocal.set(o.local.id, registros)
  }
  return catalogo.filter(l => l.activo && l.meses.includes(Number(mes))).map(local => {
    const declaracion = declarados.get(claveSeguimiento(local, anio, mes)) || null
    const registros = [...(porLocal.get(local.id)?.values() || [])]
    const liquidado = registros.length > 0
    return { local, declaracion, ordenes: registros, liquidado, realizado: Boolean(declaracion) || liquidado,
      estado: liquidado ? 'liquidado' : declaracion ? 'por-liquidar' : 'pendiente' }
  }).sort((a, b) => ({ pendiente: 0, 'por-liquidar': 1, liquidado: 2 }[a.estado] - { pendiente: 0, 'por-liquidar': 1, liquidado: 2 }[b.estado])
    || a.local.semana.localeCompare(b.local.semana, 'es', { numeric: true }) || a.local.codigo.localeCompare(b.local.codigo, 'es', { numeric: true }))
}

export function validarRealizado({ fecha, equipos, observaciones }, hoy) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || fecha > hoy) throw new Error('Indica una fecha de realización válida, no futura.')
  const fechaPrueba = new Date(`${fecha}T12:00:00Z`)
  if (Number.isNaN(fechaPrueba.getTime()) || fechaPrueba.toISOString().slice(0, 10) !== fecha) throw new Error('La fecha de realización no es válida.')
  if (equipos !== '' && equipos != null && (!Number.isInteger(Number(equipos)) || Number(equipos) < 1 || Number(equipos) > 500)) throw new Error('Indica entre 1 y 500 equipos o deja el dato vacío.')
  if ((observaciones || '').trim().length > 1500) throw new Error('La observación no debe superar 1500 caracteres.')
  return { fecha, equipos: equipos === '' || equipos == null ? null : Number(equipos), observaciones: (observaciones || '').trim() }
}
