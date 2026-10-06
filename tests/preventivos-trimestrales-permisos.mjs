// PostgreSQL local con usuarios ficticios. No accede a Supabase ni a la red.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const {PGlite}=await import(pathToFileURL(process.argv[2]).href)
const db=new PGlite(),admin='00000000-0000-0000-0000-000000000001',t1='00000000-0000-0000-0000-000000000002',t2='00000000-0000-0000-0000-000000000003',ajeno='00000000-0000-0000-0000-000000000004'
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth to authenticated,anon;
create table public.viaticos_admins(user_id uuid primary key);
insert into public.viaticos_admins values('${admin}');
create table public.vac_empleados(id uuid primary key,nombre text,correo_viaticos text,activo boolean);
insert into public.vac_empleados values('${t1}','Ana','ana@example.test',true),('${t2}','Carlos','carlos@example.test',true);
create function public.tiene_acceso_preventivos() returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and (exists(select 1 from public.viaticos_admins where user_id=auth.uid()) or exists(select 1 from public.vac_empleados where activo and correo_viaticos=auth.jwt()->>'email'))$$;
create table public.preventivos_locales(marca text,codigo text);insert into public.preventivos_locales values('GRANJERO','267');
`)
const sql=await readFile('datos de supabase/activar_preventivos_trimestrales.sql','utf8')
await db.exec(sql);await db.exec(sql)
async function usuario(id,email){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,email})]);await db.exec('set role authenticated')}
const fuente=JSON.parse(await readFile('src/data/preventivosTrimestrales.json','utf8'))
const local=fuente[0],taco=fuente.find(l=>l.marca==='TACO_BELL')
await usuario(admin,'admin@example.test')
await db.query('select public.sincronizar_programacion_trimestral($1)',[JSON.stringify(fuente)])
await db.query('select public.sincronizar_programacion_trimestral($1)',[JSON.stringify(fuente)])
assert.equal((await db.query('select * from public.preventivos_trimestrales_programacion')).rows.length,32)
const fecha=(await db.query("select (now() at time zone 'America/Guatemala')::date::text fecha")).rows[0].fecha
const marcar=(revision,realizado=true,obs='Preventivo reportado',f=fecha)=>db.query('select public.marcar_realizado_trimestral($1,$2,$3,$4,$5,$6) resultado',[local.id,revision,realizado,f,3,obs])
await usuario(t1,'ana@example.test')
assert.equal((await marcar(1)).rows[0].resultado.realizado_nombre,'Ana')
await assert.rejects(()=>marcar(1),/Otro usuario/)
await assert.rejects(()=>db.query("update public.preventivos_trimestrales_programacion set realizado=false"),/permission denied/)
await assert.rejects(()=>db.query('select public.sincronizar_programacion_trimestral($1)',[JSON.stringify(fuente)]),/Sólo el administrador/)
await assert.rejects(()=>db.query('select public.configurar_excel_trimestral($1,$2,$3)',['SHELL',['PRUEBA'],'CODIGO']),/Sólo el administrador/)
await assert.rejects(()=>marcar(2,true,'Nota','2999-01-01'),/futura/)
await usuario(t2,'carlos@example.test')
await assert.rejects(()=>marcar(2),/Sólo quien lo registró/)
assert.equal((await db.query('select * from public.preventivos_trimestrales_programacion')).rows.length,32)
assert.equal((await db.query('select * from public.preventivos_trimestrales_historial')).rows.length,0)
await usuario(t1,'ana@example.test')
await assert.rejects(()=>marcar(2,false,''),/motivo/)
assert.equal((await marcar(2,false,'Se reportó por error')).rows[0].resultado.realizado,false)
await usuario(t2,'carlos@example.test')
assert.equal((await marcar(3)).rows[0].resultado.realizado_nombre,'Carlos')
await usuario(admin,'admin@example.test')
assert.equal((await db.query('select * from public.preventivos_trimestrales_historial')).rows.length,3)
await db.query('select public.configurar_excel_trimestral($1,$2,$3)',['SHELL',['PREVENTIVO SHELL'],'ID SOLICITANTE'])
await assert.rejects(()=>db.query('select public.configurar_excel_trimestral($1,$2,$3)',['TACO_BELL',[' preventivo shell '],'CODIGO']),/otra marca/)
const importar=ordenes=>db.query('select public.importar_ordenes_trimestrales($1)',[JSON.stringify(ordenes)])
const orden={numero_orden:'ORD-1',marca:'SHELL',codigo:local.codigo,negocio:local.nombre,tecnico:'Ana',cliente:'PREVENTIVO SHELL',fecha_realizada:'2026-10-05'}
await importar([orden]);await importar([orden]);assert.equal((await db.query('select * from public.preventivos_trimestrales_ordenes')).rows.length,1)
const ajustar=(revision,excluida=true,asignado=local.id)=>db.query('select public.ajustar_orden_trimestral($1,$2,$3,$4,$5) resultado',['ORD-1',asignado,excluida,'Orden no realizada',revision])
await assert.rejects(()=>ajustar(1,false,taco.id),/esta marca/)
await assert.rejects(()=>ajustar(1,false,fuente[1].id),/no coincide/)
await ajustar(1)
await importar([{...orden,tecnico:'Carlos',fecha_realizada:null}])
let guardada=(await db.query('select * from public.preventivos_trimestrales_ordenes')).rows[0]
assert.equal(guardada.excluida,true);assert.equal(guardada.programacion_id,local.id);assert.equal(guardada.fecha_realizada.toISOString().slice(0,10),'2026-10-05')
await assert.rejects(()=>ajustar(1),/La orden cambió/)
await ajustar(2,false)
await assert.rejects(()=>importar([{...orden,marca:'TACO_BELL'}]),/dos marcas/)
await db.query('select public.cerrar_tienda_trimestral($1,$2,$3,$4)',[local.id,true,'Cierre del negocio',4])
await db.query('select public.sincronizar_programacion_trimestral($1)',[JSON.stringify(fuente)])
guardada=(await db.query('select * from public.preventivos_trimestrales_programacion where id=$1',[local.id])).rows[0]
assert.equal(guardada.cerrado,true);assert.equal(guardada.realizado,true);assert.equal(guardada.revision,5)
const nueva={...local,id:`SHELL:2027:1:${local.codigo}`,anio:2027,trimestre:1,fecha_programada:'2027-01-12'}
await db.query('select public.sincronizar_programacion_trimestral($1)',[JSON.stringify([nueva])])
guardada=(await db.query('select * from public.preventivos_trimestrales_programacion where id=$1',[nueva.id])).rows[0]
assert.equal(guardada.realizado,false);assert.equal(guardada.cerrado,false);assert.equal(guardada.realizado_por,null)
assert.equal((await db.query('select * from public.preventivos_trimestrales_programacion')).rows.length,33)
const nuevoLocal={...local,id:'SHELL:2026:4:NUEVO',codigo:'NUEVO',nombre:'Tienda nueva'}
await db.query('select public.guardar_tienda_trimestral($1,$2,$3)',[JSON.stringify(nuevoLocal),true,0])
await assert.rejects(()=>db.query('select public.guardar_tienda_trimestral($1,$2,$3)',[JSON.stringify(nuevoLocal),true,0]),/Ya existe/)
await db.query('select public.guardar_tienda_trimestral($1,$2,$3)',[JSON.stringify({...nuevoLocal,nombre:'Nombre editado',fecha_programada:'2026-11-01'}),false,1])
await usuario(t1,'ana@example.test')
await assert.rejects(()=>marcar(5),/cerrada/)
await assert.rejects(()=>importar([orden]),/Sólo el administrador/)
assert.equal((await db.query('select * from public.preventivos_trimestrales_config')).rows.length,0)
await usuario(ajeno,'ajeno@example.test')
assert.equal((await db.query('select * from public.preventivos_trimestrales_programacion')).rows.length,0)
assert.equal((await db.query('select * from public.preventivos_trimestrales_ordenes')).rows.length,0)
await assert.rejects(()=>marcar(5),/No tienes acceso/)
await db.exec('reset role');await db.exec(sql)
assert.equal((await db.query("select * from public.preventivos_locales")).rows[0].codigo,'267','No altera Granjero/Campero')
assert.equal((await db.query('select * from public.preventivos_trimestrales_programacion')).rows.length,34)
assert.ok((await db.query('select * from public.preventivos_trimestrales_historial')).rows.length>=7)
await db.exec('set role anon')
await assert.rejects(()=>db.query('select * from public.preventivos_trimestrales_programacion'),/permission denied/)
await assert.rejects(()=>marcar(5),/permission denied/)
await db.close()
console.log('SQL trimestral: idempotencia, roles, revisiones, historial, deduplicación, cierres y vueltas independientes verificados.')
