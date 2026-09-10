import { obtenerControlAlertas } from '../../src/utils/alertas.js'

export function ejemploExportacion() {
  const anioCompleto = new Date().getFullYear()
  const anio = String(anioCompleto).slice(-2)
  const fechaIngreso = new Date(anioCompleto, 0, 1)
  const base = { CLIENTE: 'CLIENTE DE PRUEBA', NEGOCIO: 'Tienda de prueba', tecnico: 'TÉCNICO DE PRUEBA', ESTADO: 'Asignada a Técnico', ESTADO_LIMPIO: 'ASIGNADA A TECNICO', TIPO: 'Garantia', SERIE: `${anio}01011234`, 'DIRECCIÓN': 'Zona 1, calle de prueba, municipio de ejemplo', 'TELÉFONO': '0012345678', 'FECHA INGRESO': `01/01/${anioCompleto}`, FECHA_INGRESO_OBJ: fechaIngreso, 'DESCRIPCIÓN INICIAL': 'Equipo no enfría. Revisar funcionamiento.', DESCRIPCIÓN: 'Sin comentarios', FECHA_TEXTO: '-', FECHA_OBJ: null, TIEMPO_TRANSCURRIDO: '35.5' }
  const tickets = [
    { ...base, 'N° REFERENCIA': '001234', TIPO: 'Normal', SERIE: '1001011234', ESTADO: 'En Proceso', ESTADO_LIMPIO: 'EN PROCESO' },
    { ...base, 'N° REFERENCIA': '002234', TIPO: 'Normal', SERIE: '', 'DESCRIPCIÓN INICIAL': `Teléfono 48771534. Serie ${anio}01011234. Equipo no enfría.` },
    { ...base, 'N° REFERENCIA': '003234', SERIE: '-' },
    { ...base, 'N° REFERENCIA': '004234', NEGOCIO: '=1+1', ESTADO: 'En Proceso', ESTADO_LIMPIO: 'EN PROCESO' },
    { ...base, 'N° REFERENCIA': 'DUP1', CLIENTE: 'Fuera del catálogo', ESTADO: 'Orden Finalizada', ESTADO_LIMPIO: 'ORDEN FINALIZADA', FECHA_TEXTO: '01/08/2026', FECHA_OBJ: '2026-08-01T00:00:00' },
    { ...base, 'N° REFERENCIA': 'DUP1', CLIENTE: 'Fuera del catálogo', ESTADO: 'Asignada a Agencia', ESTADO_LIMPIO: 'ASIGNADA A AGENCIA' },
    { ...base, 'N° REFERENCIA': 'R1', CLIENTE: 'Fuera del catálogo', SERIE: '2001015678' },
    { ...base, 'N° REFERENCIA': '', CLIENTE: 'Fuera del catálogo', ESTADO: 'Orden Finalizada', ESTADO_LIMPIO: 'ORDEN FINALIZADA', FECHA_TEXTO: '02/08/2026', FECHA_OBJ: '2026-08-02T00:00:00' },
  ]
  const control = obtenerControlAlertas(tickets, [{ nombre: 'CLIENTE DE PRUEBA', anios: 2 }], [{ serie: '2001015678', referencia: 'ANTERIOR1', fecha_cierre: '2025-01-01', tecnico: 'TÉCNICO ANTERIOR' }])
  return { tickets, control, nombreArchivo: 'BASE DE PRUEBA - NO SON DATOS REALES.xlsx', fechaSubidaExcel: 'Datos ficticios para comprobación', estadoHistorial: 'listo', generado: new Date() }
}
