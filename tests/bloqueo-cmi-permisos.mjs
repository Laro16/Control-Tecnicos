import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
const {PGlite}=await import(pathToFileURL(process.argv[2]).href)
const db=new PGlite();const admin='00000000-0000-0000-0000-000000000001'
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table public.viaticos_admins(user_id uuid);insert into public.viaticos_admins values('${admin}');grant select on public.viaticos_admins to authenticated;create function public.tiene_acceso_preventivos() returns boolean language sql as $$select auth.uid() is not null$$;`)
 await db.exec(await readFile('datos de supabase/activar_preventivos.sql','utf8'))
 await db.exec("insert into public.preventivos_ordenes(numero_orden,marca,fecha_realizada) values('ANTIGUA','GRANJERO','2026-07-01')")
 await db.exec("create table public.preventivos_locales(marca text,codigo text,meses integer[]);insert into public.preventivos_locales values('GRANJERO','413',array[3,7,11])")
 const sql=await readFile('datos de supabase/activar_vuelta_cmi.sql','utf8');await db.exec(sql);await db.exec(sql)
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);await db.exec('set role authenticated')
 await assert.rejects(()=>db.exec("insert into public.preventivos_ordenes(numero_orden,marca,codigo) values('1','GRANJERO','413')"),/vuelta activa/)
 await db.exec('insert into public.preventivos_vuelta_activa values(1,2026,3)')
 await db.exec("insert into public.preventivos_ordenes(numero_orden,marca,codigo) values('1','GRANJERO','413')")
 assert.equal((await db.query("select vuelta_carga from public.preventivos_ordenes where numero_orden='1'")).rows[0].vuelta_carga,3)
 assert.equal((await db.query("select mes_programado from public.preventivos_ordenes where numero_orden='1'")).rows[0].mes_programado,11)
 await db.exec('update public.preventivos_vuelta_activa set anio=2027,vuelta=1')
 await db.exec("insert into public.preventivos_ordenes(numero_orden,marca,anio_carga,vuelta_carga) values('1','GRANJERO',2027,1),('ANTIGUA','GRANJERO',2027,1) on conflict(numero_orden) do update set anio_carga=excluded.anio_carga,vuelta_carga=excluded.vuelta_carga")
 assert.deepEqual((await db.query("select anio_carga,vuelta_carga from public.preventivos_ordenes where numero_orden='1'")).rows[0],{anio_carga:2026,vuelta_carga:3})
 assert.equal((await db.query("select anio_carga from public.preventivos_ordenes where numero_orden='ANTIGUA'")).rows[0].anio_carga,null)
 await assert.rejects(()=>db.exec("insert into public.preventivos_ordenes(numero_orden,marca,anio_carga,vuelta_carga) values('2','GRANJERO',2026,3)"),/cambió/)
 await db.exec("insert into public.preventivos_ordenes(numero_orden,marca) values('2','GRANJERO')")
 assert.equal((await db.query("select anio_carga from public.consultar_ordenes_preventivos() where numero_orden='2'")).rows[0].anio_carga,2027)
 await db.exec("reset role; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);set role authenticated")
 assert.equal((await db.query('select * from public.preventivos_vuelta_activa')).rows.length,0)
 await assert.rejects(()=>db.exec('insert into public.preventivos_vuelta_activa values(1,2028,1)'),/row-level security/)

 await db.exec('reset role');
 await db.exec('create table public.preventivos_realizados(anio integer,mes integer);create table public.preventivos_resaltados(anio integer,mes integer);create table public.preventivos_ordenes_exclusiones(numero_orden text);grant insert,update,delete,select on public.preventivos_realizados,public.preventivos_resaltados,public.preventivos_ordenes_exclusiones to authenticated;');
 const bloqueoSQL=await readFile('datos de supabase/activar_bloqueo_vueltas_cmi.sql','utf8');await db.exec(bloqueoSQL);await db.exec(bloqueoSQL);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);await db.exec('set role authenticated');
 const bloquear=(anio,vuelta,cerrada,revision)=>db.query("select public.cambiar_bloqueo_vuelta_cmi($1,$2,$3,'Revisión terminada',$4)",[anio,vuelta,cerrada,revision]);
 await bloquear(2026,3,true,0);
 await db.exec("insert into public.preventivos_ordenes(numero_orden,marca,estado) values('1','GRANJERO','CAMBIO') on conflict(numero_orden) do update set estado=excluded.estado");
 assert.equal((await db.query("select estado from public.preventivos_ordenes where numero_orden='1'")).rows[0].estado,'');
 await assert.rejects(()=>db.exec('insert into public.preventivos_realizados values(2026,11)'),/bloqueada/);
 await assert.rejects(()=>db.exec('insert into public.preventivos_resaltados values(2026,11)'),/bloqueada/);
 await assert.rejects(()=>db.exec("insert into public.preventivos_ordenes_exclusiones values('1')"),/bloqueada/);
 await assert.rejects(()=>db.exec('update public.preventivos_vuelta_activa set anio=2026,vuelta=3'),/bloqueada/);
 await assert.rejects(()=>db.exec("delete from public.preventivos_ordenes where numero_orden='1'"));
 await bloquear(2027,1,true,0);
 await assert.rejects(()=>db.exec("insert into public.preventivos_ordenes(numero_orden,marca) values('NUEVA','GRANJERO')"),/bloqueada/);
 await assert.rejects(()=>bloquear(2026,3,false,0),/cambió/);
 await bloquear(2026,3,false,1);
 await db.exec('insert into public.preventivos_realizados values(2026,11)');
 assert.equal((await db.query('select * from public.preventivos_vueltas_historial')).rows.length,3);
 await db.exec("reset role;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);set role authenticated");
 await assert.rejects(()=>bloquear(2027,1,false,1),/administración/);
 console.log('OK bloqueo: recargas intactas, carga nueva impedida, realizado/resaltado/exclusiones bloqueados, reapertura y permisos');
}finally{await db.close()}
