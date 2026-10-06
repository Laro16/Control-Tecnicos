import { fechaPreventivo } from './preventivos.js'

export function combinarCatalogoLocales(calendario, guardados) {
  const porId = new Map(calendario.map(local => [local.id, local]))
  for (const guardado of guardados) {
    const id = `${guardado.marca}:${guardado.codigo}`
    const base={direccion:'',telefono:'',semana:'',equipos:null,...porId.get(id)}
    const manual=Number(guardado.revision_catalogo)>0
    const detalles=Object.fromEntries(['direccion','telefono','semana','equipos'].map(campo=>[campo,manual?(guardado[campo]??(campo==='equipos'?null:'')):(guardado[campo]??base[campo])]))
    porId.set(id, { ...base, ...guardado, ...detalles, id })
  }
  return [...porId.values()]
}

export function validarEstadoLocal({ cerrado, fecha, motivo }, hoy) {
  if (typeof cerrado !== 'boolean') throw new Error('Indica el estado del punto de venta.')
  if (cerrado && (!fecha || fechaPreventivo(fecha) !== fecha || fecha > hoy)) throw new Error('Indica una fecha de cierre válida, no futura.')
  if ((motivo || '').trim().length > 1500) throw new Error('El motivo supera 1500 caracteres.')
  return { cerrado, fecha: cerrado ? fecha : null, motivo: (motivo || '').trim() }
}
