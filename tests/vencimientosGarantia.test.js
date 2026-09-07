import test from 'node:test'
import assert from 'node:assert/strict'
import { claveSerieGarantia, fechaGarantiaManual, guardarVencimientoGarantia, leerVencimientosGarantia } from '../src/utils/vencimientosGarantia.js'
import { verificarGarantiaTicket } from '../src/utils/garantias.js'
import { obtenerControlAlertas } from '../src/utils/alertas.js'
import { prepararInformeTecnicos } from '../src/utils/exportacionesTecnicos.js'

const catalogo = [{nombre:'Cliente QA', anios:2}]
const ticket = {CLIENTE:'Cliente QA',TIPO:'Garantia',SERIE:'1001011234',ESTADO:'En Proceso','N° REFERENCIA':'QA1'}
const manual = fecha => ({'1001011234':{serie:'1001011234',fecha_vencimiento:fecha}})

test('sin fecha manual conserva el cálculo original; una fecha confirmada lo sustituye', () => {
  assert.equal(verificarGarantiaTicket(ticket,catalogo).vencida,true)
  const g = verificarGarantiaTicket(ticket,catalogo,manual('2099-01-01'))
  assert.equal(g.vencida,false)
  assert.equal(g.fechaVerificada,true)
  assert.equal(g.vencDisplay,'01/01/2099')
  assert.equal(ticket.SERIE,'1001011234')
})
test('se aplica a una carga nueva con otra referencia y serie recuperada de la descripción inicial', () => {
  const nueva = {...ticket,SERIE:'','N° REFERENCIA':'QA999','DESCRIPCIÓN INICIAL':'Teléfono 48771234; serie 1001011234.'}
  assert.equal(verificarGarantiaTicket(nueva,catalogo,manual('2099-01-01')).vencida,false)
  assert.equal(verificarGarantiaTicket({...ticket,SERIE:'1001019876'},catalogo,manual('2099-01-01')).vencida,true)
})
test('una fecha confirmada vencida prevalece aunque fabricación sugiera vigencia', () => {
  const serie = `${String(new Date().getFullYear()).slice(-2)}01011234`
  const g = verificarGarantiaTicket({...ticket,SERIE:serie},catalogo,{[serie]:{fecha_vencimiento:'2000-01-01'}})
  assert.equal(g.vencida,true)
  assert.equal(g.vencDisplay,'01/01/2000')
})
test('vence al terminar el día indicado, sin adelantarlo por zona horaria', () => {
  const ahora = new Date()
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
  const g = verificarGarantiaTicket(ticket,catalogo,manual(hoy))
  assert.equal(g.vencida,false)
  assert.equal(g.diasRestantes,0)
})
test('confirma series sin fecha de fabricación interpretable y no amplía el catálogo de clientes', () => {
  assert.equal(verificarGarantiaTicket({...ticket,SERIE:'ABC0123456'},catalogo,{ABC0123456:{fecha_vencimiento:'2099-01-01'}}).sinDatosSerie,false)
  assert.equal(verificarGarantiaTicket({...ticket,CLIENTE:'Otro cliente'},catalogo,manual('2099-01-01')),null)
})
test('rechaza fechas inválidas y conserva ceros iniciales en la identidad', () => {
  for (const fecha of ['',null,'2026-02-30','2026-13-01','1899-01-01','2026-01-01T00:00:00Z']) assert.equal(fechaGarantiaManual(fecha),null)
  assert.ok(fechaGarantiaManual('2028-02-29'))
  assert.equal(claveSerieGarantia(' 00-01011234 '),'0001011234')
  for (const serie of ['-','','SIN SERIE','00000000']) assert.equal(claveSerieGarantia(serie),'')
  assert.equal(verificarGarantiaTicket(ticket,catalogo,manual('fecha inválida')).fechaVerificada,false)
})
test('las alertas dejan de contar la vencida confirmada vigente, pero conservan Normal por separado', () => {
  const control = obtenerControlAlertas([{...ticket,TIPO:'Normal'}],catalogo,[],manual('2099-01-01'))
  assert.equal(control.vencidas.length,0)
  assert.equal(control.tipoIncorrecto.length,1)
  assert.equal(control.tipoIncorrecto[0].garantia.fechaVerificada,true)
  assert.equal(control.total,1)
  assert.equal(obtenerControlAlertas([ticket],catalogo,[],manual('2099-01-01')).total,0)
})
test('el Excel usa la fecha real e identifica su origen sin alterar la base exportada', () => {
  const control = obtenerControlAlertas([ticket],catalogo,[],manual('2099-01-01'))
  const informe = prepararInformeTecnicos({tickets:[ticket],control})
  assert.equal(informe.hojas[0].filas[0][10].toISOString(),'2099-01-01T00:00:00.000Z')
  assert.match(informe.hojas[0].filas[0][13],/confirmado manualmente/)
})
test('consulta todas las páginas y respeta la última revisión, incluso al volver al cálculo automático', async () => {
  const filas = [{id:1001,serie:ticket.SERIE,fecha_vencimiento:null},...Array.from({length:500},(_,i)=>({id:1000-i,serie:String(2000000+i),fecha_vencimiento:'2099-01-01'})),{id:1,serie:ticket.SERIE,fecha_vencimiento:'2099-01-01'}]
  let paginas = 0
  const db = {from(nombre){assert.equal(nombre,'garantias_vencimientos');return {select(){return this},order(c,o){assert.equal(c,'id');assert.equal(o.ascending,false);return this},range(d,h){paginas++;return {data:filas.slice(d,h+1),error:null}}}}}
  const fechas = await leerVencimientosGarantia(db)
  assert.equal(paginas,2)
  assert.equal(Object.keys(fechas).length,501)
  assert.equal(fechas[ticket.SERIE].fecha_vencimiento,null)
  assert.equal(verificarGarantiaTicket(ticket,catalogo,fechas).vencida,true)
})
test('guardar agrega una revisión y exige confirmación de Supabase; no acepta series o fechas inválidas', async () => {
  let insertado
  const db = {from(){return {insert(datos){insertado=datos;return this},select(){return this},single(){return {data:{id:1,...insertado},error:null}}}}}
  const registro = await guardarVencimientoGarantia(db,'100101-1234','2099-01-01')
  assert.equal(registro.serie,ticket.SERIE)
  assert.deepEqual(insertado,{serie:ticket.SERIE,fecha_vencimiento:'2099-01-01'})
  await assert.rejects(()=>guardarVencimientoGarantia(db,'-','2099-01-01'),/serie válida/)
  await assert.rejects(()=>guardarVencimientoGarantia(db,ticket.SERIE,''),/fecha de vencimiento válida/)
  assert.equal((await guardarVencimientoGarantia(db,ticket.SERIE,null)).fecha_vencimiento,null)
})
test('un fallo de lectura o guardado no se oculta como éxito', async () => {
  const db = {from(){return {select(){return this},order(){return this},insert(){return this},range(){throw new Error('Sin conexión')},single(){return {data:null,error:new Error('No guardado')}}}}}
  await assert.rejects(()=>leerVencimientosGarantia(db),/Sin conexión/)
  await assert.rejects(()=>guardarVencimientoGarantia(db,ticket.SERIE,'2099-01-01'),/No guardado/)
})
