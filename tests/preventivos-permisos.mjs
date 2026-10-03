// Verifica el SQL en PostgreSQL embebido, con usuarios ficticios y sin red/Supabase.
// Uso: node tests/preventivos-permisos.mjs <ruta a pglite/dist/index.js>
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import XLSX from 'xlsx'
import { catalogoDesdeMatriz } from '../src/utils/preventivos.js'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const admin='00000000-0000-0000-0000-000000000001',t1='00000000-0000-0000-0000-000000000002',t2='00000000-0000-0000-0000-000000000003',ajeno='00000000-0000-0000-0000-000000000004'
await db.exec(`
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth to authenticated,anon;
create table public.viaticos_admins(user_id uuid primary key);
insert into public.viaticos_admins values ('${admin}');
alter table public.viaticos_admins enable row level security;
grant select on public.viaticos_admins to authenticated;
create policy rol_propio on public.viaticos_admins for select to authenticated using(user_id=auth.uid());
create table public.vac_empleados(id uuid primary key,nombre text,correo_viaticos text,activo boolean);
insert into public.vac_empleados values ('${t1}','Técnico Uno','uno@example.test',true),('${t2}','Técnico Dos','dos@example.test',true);
`)
const base = await readFile('datos de supabase/activar_preventivos.sql','utf8')
const cambios = await readFile('datos de supabase/activar_preventivos_tecnicos.sql','utf8')
await db.exec(base)
await db.exec(cambios)
await db.exec(cambios) // idempotencia
const cierres = await readFile('datos de supabase/activar_cierres_preventivos.sql','utf8')
await db.exec(cierres)
await db.exec(cierres)
const detalleLiquidacion=await readFile('datos de supabase/mostrar_tecnico_liquidacion_preventivos.sql','utf8')
await db.exec(detalleLiquidacion)
await db.exec(detalleLiquidacion)
const exclusiones=await readFile('datos de supabase/activar_exclusiones_preventivos.sql','utf8')
await db.exec(exclusiones)
await db.exec(exclusiones)
async function usuario(id,email) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,email})])
  await db.exec('set role authenticated')
}
const libro=XLSX.readFile('src/Mantenimientos.xlsx')
const catalogo=catalogoDesdeMatriz(XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]],{header:1,defval:''}))
await usuario(admin,'admin@example.test')
await db.query('select public.sincronizar_catalogo_preventivos($1)',[JSON.stringify(catalogo.map(({marca,codigo,nombre,meses,activo})=>({marca,codigo,nombre,meses,activo})))])
const local=catalogo.find(l=>l.activo)
const fecha=(await db.query("select (now() at time zone 'America/Guatemala')::date::text fecha")).rows[0].fecha
const anio=Number(fecha.slice(0,4)),mes=local.meses[0]
async function marcar(revision,realizado=true,fechaReal=fecha) {
  return (await db.query('select public.marcar_realizado_preventivo($1,$2,$3,$4,$5,$6,$7,$8,$9) resultado',[local.marca,local.codigo,anio,mes,realizado,fechaReal,3,'Nota de prueba',revision])).rows[0].resultado
}
await usuario(t1,'uno@example.test')
assert.equal((await marcar(0)).realizado_nombre,'Técnico Uno')
assert.equal((await db.query('select * from public.preventivos_realizados')).rows.length,1)
await assert.rejects(()=>db.query("update public.preventivos_realizados set realizado=false"),/permission denied/)
await assert.rejects(()=>db.query("insert into public.preventivos_ordenes(numero_orden,marca) values('TECNICO-INSERT','GRANJERO')"),/row-level security/)
await assert.rejects(()=>marcar(0),/Otro usuario actualizó/)
await assert.rejects(()=>db.query('select public.sincronizar_catalogo_preventivos($1)',[JSON.stringify([])]),/Sólo el administrador/)
await usuario(t2,'dos@example.test')
await assert.rejects(()=>marcar(1),/Sólo quien lo registró/)
await usuario(t1,'uno@example.test')
assert.equal((await marcar(1,false,null)).revision,2)
assert.equal((await marcar(2)).revision,3)
await assert.rejects(()=>marcar(3,true,'2999-01-01'),/no puede ser futura/)
await usuario(admin,'admin@example.test')
assert.equal((await marcar(3)).revision,4)
assert.equal((await db.query('select * from public.preventivos_realizados_historial')).rows.length,4)
await db.exec("insert into public.preventivos_ordenes(numero_orden,marca,codigo,negocio,estado,tecnico,fecha_realizada) values('EXCEL-1','GRANJERO','267','Negocio','Asignada a Técnico','Carlos Reyes','2026-10-01')")
await usuario(t1,'uno@example.test')
const lectura=(await db.query('select * from public.consultar_ordenes_preventivos()')).rows
assert.equal(lectura.length,1)
assert.equal(lectura[0].tecnico,'Carlos Reyes')
assert.equal(lectura[0].fecha_realizada.toISOString().slice(0,10),'2026-10-01')
assert.ok(!('estado' in lectura[0]))
assert.equal((await db.query('select * from public.preventivos_ordenes')).rows.length,0)
assert.equal((await db.query('select * from public.preventivos_realizados_historial')).rows.length,0)
// Sólo el administrador excluye/restaura; la importación del Excel no revierte la decisión.
async function excluir(excluida,revision,motivo='Servicio no realizado',orden='EXCEL-1') {
  return (await db.query('select public.cambiar_exclusion_orden_preventivo($1,$2,$3,$4) resultado',[orden,excluida,motivo,revision])).rows[0].resultado
}
await assert.rejects(()=>excluir(true,0),/Sólo el administrador/)
await usuario(admin,'admin@example.test')
await assert.rejects(()=>excluir(true,0,' '),/motivo/)
await assert.rejects(()=>excluir(true,0,'Motivo','NO-EXISTE'),/no existe/)
assert.equal((await excluir(true,0)).revision,1)
await assert.rejects(()=>excluir(false,0),/exclusión cambió/)
await assert.rejects(()=>excluir(true,1),/ya tiene ese estado/)
await assert.rejects(()=>db.query('update public.preventivos_ordenes_exclusiones set excluida=false'),/permission denied/)
await assert.rejects(()=>db.query('delete from public.preventivos_exclusiones_historial'),/permission denied/)
await db.exec("insert into public.preventivos_ordenes(numero_orden,marca,tecnico,fecha_realizada) values('EXCEL-1','GRANJERO','Técnico actualizado',null) on conflict(numero_orden) do update set tecnico=excluded.tecnico,fecha_realizada=excluded.fecha_realizada")
assert.equal((await db.query('select excluida from public.preventivos_ordenes_exclusiones')).rows[0].excluida,true)
assert.equal((await db.query("select tecnico from public.preventivos_ordenes where numero_orden='EXCEL-1'")).rows[0].tecnico,'Técnico actualizado')
await db.exec('reset role')
await db.exec(exclusiones) // Repetir la migración conserva la exclusión y su auditoría.
await usuario(t1,'uno@example.test')
assert.equal((await db.query('select * from public.consultar_ordenes_preventivos()')).rows.length,0)
assert.equal((await db.query('select * from public.preventivos_ordenes_exclusiones')).rows.length,0)
assert.equal((await db.query('select * from public.preventivos_exclusiones_historial')).rows.length,0)
await assert.rejects(()=>excluir(false,1),/Sólo el administrador/)
await usuario(admin,'admin@example.test')
assert.equal((await excluir(false,1,'Orden verificada')).revision,2)
assert.equal((await db.query('select * from public.preventivos_exclusiones_historial')).rows.length,2)
assert.equal((await db.query('select * from public.preventivos_realizados')).rows.length,1,'No modifica marcas manuales')
await usuario(t1,'uno@example.test')
assert.equal((await db.query('select * from public.consultar_ordenes_preventivos()')).rows.length,1)
// Cerrar no borra el historial; sincronizar el mismo archivo no vuelve a abrir el punto.
async function estado(cerrado,revision,fechaCierre=fecha,punto=local) {
  return (await db.query('select public.cambiar_estado_local_preventivo($1,$2,$3,$4,$5,$6) resultado',[punto.marca,punto.codigo,cerrado,fechaCierre,'Motivo de prueba',revision])).rows[0].resultado
}
await assert.rejects(()=>estado(true,0),/Sólo el administrador/)
await assert.rejects(()=>db.query('update public.preventivos_locales set activo=false'),/permission denied/)
await usuario(admin,'admin@example.test')
await assert.rejects(()=>estado(true,0,'2999-01-01'),/fecha de cierre/)
assert.equal((await estado(true,0)).activo,false)
assert.equal((await db.query('select * from public.preventivos_realizados')).rows.length,1)
assert.equal((await db.query('select * from public.preventivos_realizados_historial')).rows.length,4)
await assert.rejects(()=>estado(false,0),/punto de venta cambió/)
await db.query('select public.sincronizar_catalogo_preventivos($1)',[JSON.stringify(catalogo.map(({marca,codigo,nombre,meses,activo})=>({marca,codigo,nombre,meses,activo})))])
assert.equal((await db.query('select activo from public.preventivos_locales where marca=$1 and codigo=$2',[local.marca,local.codigo])).rows[0].activo,false)
await db.exec('reset role')
await db.exec(cierres) // Volver a ejecutar el SQL tampoco elimina el cierre.
await usuario(t1,'uno@example.test')
await assert.rejects(()=>marcar(4),/no está activo/)
await assert.rejects(()=>estado(false,1),/Sólo el administrador/)
assert.equal((await db.query('select * from public.preventivos_cierres_historial')).rows.length,0)
await usuario(admin,'admin@example.test')
assert.equal((await estado(false,1)).activo,true)
assert.equal((await marcar(4)).revision,5)
assert.equal((await db.query('select * from public.preventivos_cierres_historial')).rows.length,2)
// También se puede reactivar uno cerrado en el Excel, sin que la siguiente carga lo cierre.
const cerradoCalendario=catalogo.find(l=>!l.activo)
assert.equal((await estado(false,0,null,cerradoCalendario)).activo,true)
await db.query('select public.sincronizar_catalogo_preventivos($1)',[JSON.stringify(catalogo.map(({marca,codigo,nombre,meses,activo})=>({marca,codigo,nombre,meses,activo})))])
assert.equal((await db.query('select activo from public.preventivos_locales where marca=$1 and codigo=$2',[cerradoCalendario.marca,cerradoCalendario.codigo])).rows[0].activo,true)
await usuario(ajeno,'ajeno@example.test')
await assert.rejects(()=>excluir(true,2),/Sólo el administrador/)
await assert.rejects(()=>marcar(4),/No tienes acceso/)
await assert.rejects(()=>db.query('select * from public.consultar_ordenes_preventivos()'),/No tienes acceso/)
assert.equal((await db.query('select * from public.preventivos_realizados')).rows.length,0)
await db.exec('reset role; set role anon')
await assert.rejects(()=>excluir(true,2),/permission denied/)
await assert.rejects(()=>db.query('select * from public.consultar_ordenes_preventivos()'),/permission denied/)
await db.close()
console.log('SQL verificado: calendario real, scripts repetibles, permisos, cierres persistentes, historial conservado, reactivación y revisiones. Sin cambios en Supabase.')
