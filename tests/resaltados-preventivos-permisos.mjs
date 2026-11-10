// PostgreSQL local en memoria. No accede a Supabase ni usa datos reales.
// node tests/resaltados-preventivos-permisos.mjs <ruta a @electric-sql/pglite/dist/index.js>
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const admin='00000000-0000-0000-0000-000000000001',tecnico='00000000-0000-0000-0000-000000000002'
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    create table public.viaticos_admins(user_id uuid primary key);
    insert into public.viaticos_admins values('${admin}');
    alter table public.viaticos_admins enable row level security;
    grant select on public.viaticos_admins to authenticated;
    create policy propio on public.viaticos_admins for select to authenticated using(user_id=auth.uid());
    create table public.preventivos_locales(marca text,codigo text,primary key(marca,codigo));
    insert into public.preventivos_locales values('GRANJERO','413'),('CAMPERO','413');
    create table public.preventivos_ordenes(numero_orden text primary key,estado text);
    insert into public.preventivos_ordenes values('ORD-FICTICIA','Orden Finalizada');
    create table public.preventivos_realizados(marca text,codigo text,realizado boolean);
    insert into public.preventivos_realizados values('GRANJERO','413',true);
  `)
  const sql=await readFile('datos de supabase/activar_resaltados_preventivos.sql','utf8')
  await db.exec(sql);await db.exec(sql)
  async function usuario(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
  const guardar=(modo,revision,anio=2026,mes=11,marca='GRANJERO',codigo='413')=>db.query(
    'select to_jsonb(public.guardar_resaltado_preventivo($1,$2,$3,$4,$5,$6)) resultado',[marca,codigo,anio,mes,modo,revision]
  )
  await usuario(admin)
  let fila=(await guardar('verde',0)).rows[0].resultado
  assert.equal(fila.modo,'verde');assert.equal(fila.revision,1);assert.equal(fila.actualizado_por,admin)
  await assert.rejects(()=>guardar('sin-color',0),/otra sesión/)
  fila=(await guardar('sin-color',1)).rows[0].resultado
  assert.equal(fila.modo,'sin-color');assert.equal(fila.revision,2)
  fila=(await guardar('automatico',2)).rows[0].resultado
  assert.equal(fila.modo,'automatico');assert.equal(fila.revision,3)
  assert.equal((await db.query('select * from public.preventivos_resaltados')).rows.length,1,'Automático conserva la fila y su revisión')
  await guardar('verde',0,2027,11)
  await guardar('sin-color',0,2026,7)
  await guardar('verde',0,2026,11,'CAMPERO')
  assert.equal((await db.query('select * from public.preventivos_resaltados')).rows.length,4,'Año, mes y marca permanecen independientes')
  for(const args of [['rojo',0],['verde',0,2019],['verde',0,2101],['verde',0,2026,0],['verde',0,2026,13],['verde',-1],['verde',null],['verde',0,2026,11,'SHELL'],['verde',0,2026,11,'GRANJERO','999']]){
    await assert.rejects(()=>guardar(...args))
  }
  await assert.rejects(()=>db.query("update public.preventivos_resaltados set modo='verde'"),/permission denied/)
  await assert.rejects(()=>db.query('delete from public.preventivos_resaltados'),/permission denied/)
  await usuario(tecnico)
  assert.equal((await db.query('select * from public.preventivos_resaltados')).rows.length,0)
  await assert.rejects(()=>guardar('verde',3),/Sólo el administrador/)
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role anon')
  await assert.rejects(()=>db.query('select * from public.preventivos_resaltados'),/permission denied/)
  await assert.rejects(()=>guardar('verde',3),/permission denied/)
  await db.exec('reset role');await db.exec(sql)
  assert.equal((await db.query('select * from public.preventivos_resaltados')).rows.length,4,'Repetir el SQL no borra preferencias')
  assert.deepEqual((await db.query('select * from public.preventivos_ordenes')).rows,[{numero_orden:'ORD-FICTICIA',estado:'Orden Finalizada'}])
  assert.deepEqual((await db.query('select * from public.preventivos_realizados')).rows,[{marca:'GRANJERO',codigo:'413',realizado:true}])
  console.log('SQL resaltados: idempotencia, administrador/anon/técnico, revisiones, modos y períodos independientes; órdenes y marcas intactas.')
} finally { await db.close() }
