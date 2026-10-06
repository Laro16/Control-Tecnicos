-- SHELL Y TACO BELL. Ejecutar COMPLETO en SQL Editor. Es seguro repetirlo.
-- Requiere los usuarios/roles existentes de Viáticos y Preventivos.
-- No modifica las tablas ni calendarios de Granjero/Campero.
begin;

create table if not exists public.preventivos_trimestrales_programacion (
  id text primary key,
  marca text not null check (marca in ('SHELL','TACO_BELL')),
  anio integer not null check (anio between 2020 and 2100),
  trimestre integer not null check (trimestre between 1 and 4),
  codigo text not null check (codigo ~ '^[A-Z0-9_-]{1,40}$'),
  nombre text not null check (length(trim(nombre)) between 1 and 250),
  fecha_programada date not null,
  direccion text not null default '', zona text not null default '',
  municipio text not null default '', departamento text not null default '',
  region text not null default 'OCCIDENTE' check (region='OCCIDENTE'),
  marca_tienda text not null default '', archivo_origen text not null default '',
  equipos integer check (equipos between 1 and 500),
  cerrado boolean not null default false, motivo_cierre text not null default '',
  realizado boolean not null default false, fecha_realizado date,
  equipos_declarados integer check (equipos_declarados between 1 and 500),
  observaciones text not null default '' check (length(observaciones)<=1500),
  realizado_por uuid, realizado_nombre text,
  actualizado_en timestamptz not null default now(), revision integer not null default 1,
  unique(marca,anio,trimestre,codigo),
  check (id=marca||':'||anio||':'||trimestre||':'||codigo),
  check (extract(year from fecha_programada)=anio and extract(quarter from fecha_programada)=trimestre),
  check (not realizado or (fecha_realizado is not null and realizado_por is not null))
);
create table if not exists public.preventivos_trimestrales_config (
  marca text primary key check (marca in ('SHELL','TACO_BELL')),
  clientes text[] not null default '{}', encabezado_codigo text not null,
  check (length(trim(encabezado_codigo)) between 1 and 100), check(cardinality(clientes)<=20)
);
create table if not exists public.preventivos_trimestrales_ordenes (
  numero_orden text primary key check (length(trim(numero_orden)) between 1 and 100),
  marca text not null check (marca in ('SHELL','TACO_BELL')),
  codigo text not null default '', negocio text not null default '', tecnico text not null default '',
  cliente text not null, fecha_realizada date,
  programacion_id text references public.preventivos_trimestrales_programacion(id),
  excluida boolean not null default false, motivo text not null default '',
  revision integer not null default 1, detectado_en timestamptz not null default now()
);
create table if not exists public.preventivos_trimestrales_historial (
  id bigint generated always as identity primary key, entidad text not null, clave text not null,
  accion text not null, datos jsonb not null, autor_id uuid not null, autor_nombre text not null,
  registrado_en timestamptz not null default now()
);

create or replace function public.es_admin_trimestrales()
returns boolean language sql stable security definer set search_path='' as $f$
  select auth.uid() is not null and exists(select 1 from public.viaticos_admins a where a.user_id=auth.uid());
$f$;
create or replace function public.autor_trimestrales()
returns text language sql stable security definer set search_path='' as $f$
  select coalesce((select e.nombre from public.vac_empleados e where e.activo is not false
    and lower(trim(e.correo_viaticos))=lower(trim(auth.jwt()->>'email')) limit 1),auth.jwt()->>'email','Administrador');
$f$;
revoke all on function public.es_admin_trimestrales(),public.autor_trimestrales() from public,anon;
grant execute on function public.es_admin_trimestrales(),public.autor_trimestrales() to authenticated;

alter table public.preventivos_trimestrales_programacion enable row level security;
alter table public.preventivos_trimestrales_ordenes enable row level security;
alter table public.preventivos_trimestrales_config enable row level security;
alter table public.preventivos_trimestrales_historial enable row level security;
revoke all on public.preventivos_trimestrales_programacion,public.preventivos_trimestrales_ordenes,
  public.preventivos_trimestrales_config,public.preventivos_trimestrales_historial from anon,authenticated;
grant select on public.preventivos_trimestrales_programacion,public.preventivos_trimestrales_ordenes,
  public.preventivos_trimestrales_config,public.preventivos_trimestrales_historial to authenticated;
drop policy if exists "Participantes leen trimestre" on public.preventivos_trimestrales_programacion;
create policy "Participantes leen trimestre" on public.preventivos_trimestrales_programacion for select to authenticated using((select public.tiene_acceso_preventivos()));
drop policy if exists "Participantes leen ordenes trimestrales" on public.preventivos_trimestrales_ordenes;
create policy "Participantes leen ordenes trimestrales" on public.preventivos_trimestrales_ordenes for select to authenticated using((select public.tiene_acceso_preventivos()));
drop policy if exists "Admin lee configuracion trimestral" on public.preventivos_trimestrales_config;
create policy "Admin lee configuracion trimestral" on public.preventivos_trimestrales_config for select to authenticated using((select public.es_admin_trimestrales()));
drop policy if exists "Admin lee historial trimestral" on public.preventivos_trimestrales_historial;
create policy "Admin lee historial trimestral" on public.preventivos_trimestrales_historial for select to authenticated using((select public.es_admin_trimestrales()));

create or replace function public.sincronizar_programacion_trimestral(p_locales jsonb)
returns void language plpgsql security definer set search_path='' as $f$
begin
  if not public.es_admin_trimestrales() then raise exception 'Sólo el administrador puede cargar la programación.'; end if;
  if p_locales is null or jsonb_typeof(p_locales)<>'array' or jsonb_array_length(p_locales)>1000 then raise exception 'Calendario inválido.'; end if;
  insert into public.preventivos_trimestrales_programacion(id,marca,anio,trimestre,codigo,nombre,fecha_programada,
    direccion,zona,municipio,departamento,region,marca_tienda,archivo_origen,equipos)
    select l.id,l.marca,l.anio,l.trimestre,l.codigo,l.nombre,l.fecha_programada,
      coalesce(l.direccion,''),coalesce(l.zona,''),coalesce(l.municipio,''),coalesce(l.departamento,''),l.region,
      coalesce(l.marca_tienda,''),coalesce(l.archivo_origen,''),l.equipos
    from jsonb_to_recordset(p_locales) as l(id text,marca text,anio integer,trimestre integer,codigo text,nombre text,
      fecha_programada date,direccion text,zona text,municipio text,departamento text,region text,marca_tienda text,archivo_origen text,equipos integer)
    on conflict(id) do nothing;
  -- Nunca elimina trimestres anteriores ni sobrescribe marcas, cierres o cambios manuales.
end;
$f$;

create or replace function public.marcar_realizado_trimestral(p_id text,p_revision integer,p_realizado boolean,p_fecha date,p_equipos integer,p_observaciones text)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare anterior public.preventivos_trimestrales_programacion; guardado public.preventivos_trimestrales_programacion;
begin
  if not public.tiene_acceso_preventivos() then raise exception 'No tienes acceso a Preventivos.'; end if;
  select * into anterior from public.preventivos_trimestrales_programacion where id=p_id for update;
  if anterior.id is null or anterior.cerrado then raise exception 'La tienda no existe o está cerrada.'; end if;
  if p_revision is null or p_revision<>anterior.revision then raise exception 'Otro usuario actualizó la ficha. Pulsa Actualizar.'; end if;
  if anterior.realizado and anterior.realizado_por<>auth.uid() and not public.es_admin_trimestrales()
    then raise exception 'Sólo quien lo registró o un administrador puede corregir esta marca.'; end if;
  if p_realizado is null or (p_realizado and (p_fecha is null or p_fecha>(now() at time zone 'America/Guatemala')::date))
    then raise exception 'La fecha realizada es obligatoria y no puede ser futura.'; end if;
  if not p_realizado and (not anterior.realizado or length(trim(coalesce(p_observaciones,'')))=0)
    then raise exception 'Indica un motivo para deshacer una marca existente.'; end if;
  if (p_equipos is not null and p_equipos not between 1 and 500) or length(coalesce(p_observaciones,''))>1500
    then raise exception 'Cantidad de equipos u observación inválida.'; end if;
  update public.preventivos_trimestrales_programacion set realizado=p_realizado,
    fecha_realizado=case when p_realizado then p_fecha else fecha_realizado end,
    equipos_declarados=case when p_realizado then p_equipos else equipos_declarados end,
    observaciones=trim(coalesce(p_observaciones,'')),realizado_por=auth.uid(),realizado_nombre=public.autor_trimestrales(),
    revision=revision+1,actualizado_en=now() where id=p_id returning * into guardado;
  insert into public.preventivos_trimestrales_historial(entidad,clave,accion,datos,autor_id,autor_nombre)
    values('programacion',p_id,case when p_realizado then 'realizado' else 'deshacer' end,to_jsonb(guardado),auth.uid(),public.autor_trimestrales());
  return to_jsonb(guardado);
end;
$f$;

create or replace function public.guardar_tienda_trimestral(p_datos jsonb,p_nuevo boolean,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare l public.preventivos_trimestrales_programacion; anterior public.preventivos_trimestrales_programacion; guardado public.preventivos_trimestrales_programacion;
begin
  if not public.es_admin_trimestrales() then raise exception 'Sólo el administrador puede editar la programación.'; end if;
  l:=jsonb_populate_record(null::public.preventivos_trimestrales_programacion,p_datos);
  if p_nuevo is null or l.id is null or p_revision is null then raise exception 'Datos inválidos.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(l.id,0));
  select * into anterior from public.preventivos_trimestrales_programacion where id=l.id for update;
  if p_nuevo then
    if anterior.id is not null then raise exception 'Ya existe esa tienda en ese trimestre.'; end if;
    insert into public.preventivos_trimestrales_programacion(id,marca,anio,trimestre,codigo,nombre,fecha_programada,
      direccion,zona,municipio,departamento,region,marca_tienda,archivo_origen,equipos)
      values(l.id,l.marca,l.anio,l.trimestre,l.codigo,l.nombre,l.fecha_programada,coalesce(l.direccion,''),coalesce(l.zona,''),
        coalesce(l.municipio,''),coalesce(l.departamento,''),'OCCIDENTE',coalesce(l.marca_tienda,''),'Alta manual',l.equipos) returning * into guardado;
  else
    if anterior.id is null or anterior.revision<>p_revision then raise exception 'La ficha cambió o no existe. Pulsa Actualizar.'; end if;
    update public.preventivos_trimestrales_programacion set nombre=l.nombre,fecha_programada=l.fecha_programada,
      direccion=coalesce(l.direccion,''),zona=coalesce(l.zona,''),municipio=coalesce(l.municipio,''),departamento=coalesce(l.departamento,''),
      equipos=l.equipos,revision=revision+1,actualizado_en=now() where id=l.id returning * into guardado;
  end if;
  insert into public.preventivos_trimestrales_historial(entidad,clave,accion,datos,autor_id,autor_nombre)
    values('programacion',l.id,case when p_nuevo then 'alta' else 'editar' end,to_jsonb(guardado),auth.uid(),public.autor_trimestrales());
  return to_jsonb(guardado);
end;
$f$;

create or replace function public.cerrar_tienda_trimestral(p_id text,p_cerrado boolean,p_motivo text,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare guardado public.preventivos_trimestrales_programacion;
begin
  if not public.es_admin_trimestrales() then raise exception 'Sólo el administrador puede cerrar o reabrir tiendas.'; end if;
  if p_cerrado is null or length(trim(coalesce(p_motivo,''))) not between 1 and 1500 then raise exception 'Indica el motivo del cambio.'; end if;
  update public.preventivos_trimestrales_programacion set cerrado=p_cerrado,motivo_cierre=trim(p_motivo),revision=revision+1,actualizado_en=now()
    where id=p_id and revision=p_revision and cerrado<>p_cerrado returning * into guardado;
  if guardado.id is null then raise exception 'La ficha cambió. Pulsa Actualizar.'; end if;
  insert into public.preventivos_trimestrales_historial(entidad,clave,accion,datos,autor_id,autor_nombre)
    values('programacion',p_id,case when p_cerrado then 'cerrar' else 'reabrir' end,to_jsonb(guardado),auth.uid(),public.autor_trimestrales());
  return to_jsonb(guardado);
end;
$f$;

create or replace function public.configurar_excel_trimestral(p_marca text,p_clientes text[],p_encabezado text)
returns void language plpgsql security definer set search_path='' as $f$
begin
  if not public.es_admin_trimestrales() then raise exception 'Sólo el administrador puede configurar el Excel.'; end if;
  if p_marca not in ('SHELL','TACO_BELL') or p_marca is null or p_clientes is null or cardinality(p_clientes)>20
    or p_encabezado is null or length(trim(p_encabezado)) not between 1 and 100 then raise exception 'Configuración inválida.'; end if;
  if exists(select 1 from unnest(p_clientes) c where c is null or length(trim(c)) not between 1 and 250)
    then raise exception 'Indica CLIENTE exacto por línea, sin líneas vacías.'; end if;
  -- Normalización idéntica a la app: ignorar mayúsculas, espacios y acentos.
  perform pg_catalog.pg_advisory_xact_lock(754362001);
  if exists(select 1 from public.preventivos_trimestrales_config f,unnest(f.clientes) a,unnest(p_clientes) b
    where f.marca<>p_marca and upper(translate(regexp_replace(trim(a),'\s+',' ','g'),'áéíóúÁÉÍÓÚ','aeiouAEIOU'))=upper(translate(regexp_replace(trim(b),'\s+',' ','g'),'áéíóúÁÉÍÓÚ','aeiouAEIOU')))
    then raise exception 'Ese CLIENTE ya pertenece a otra marca.'; end if;
  insert into public.preventivos_trimestrales_config(marca,clientes,encabezado_codigo) values(p_marca,p_clientes,trim(p_encabezado))
    on conflict(marca) do update set clientes=excluded.clientes,encabezado_codigo=excluded.encabezado_codigo;
end;
$f$;

create or replace function public.importar_ordenes_trimestrales(p_ordenes jsonb)
returns void language plpgsql security definer set search_path='' as $f$
begin
  if not public.es_admin_trimestrales() then raise exception 'Sólo el administrador puede importar órdenes.'; end if;
  if p_ordenes is null or jsonb_typeof(p_ordenes)<>'array' or jsonb_array_length(p_ordenes)>200 then raise exception 'Lote inválido.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_ordenes) as o(numero_orden text,marca text) join public.preventivos_trimestrales_ordenes a using(numero_orden)
    where a.marca<>o.marca) then raise exception 'Una orden aparece en dos marcas. Revisa el Excel.'; end if;
  insert into public.preventivos_trimestrales_ordenes as actual(numero_orden,marca,codigo,negocio,tecnico,cliente,fecha_realizada)
    select o.numero_orden,o.marca,coalesce(nullif(o.codigo,'-'),''),coalesce(o.negocio,''),coalesce(o.tecnico,''),o.cliente,o.fecha_realizada
    from jsonb_to_recordset(p_ordenes) as o(numero_orden text,marca text,codigo text,negocio text,tecnico text,cliente text,fecha_realizada date)
    on conflict(numero_orden) do update set codigo=excluded.codigo,negocio=excluded.negocio,tecnico=excluded.tecnico,
      cliente=excluded.cliente,fecha_realizada=coalesce(excluded.fecha_realizada,actual.fecha_realizada);
  -- Las reimportaciones no revierten asignaciones o exclusiones hechas por el administrador.
end;
$f$;

create or replace function public.ajustar_orden_trimestral(p_orden text,p_programacion text,p_excluida boolean,p_motivo text,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare anterior public.preventivos_trimestrales_ordenes; ficha public.preventivos_trimestrales_programacion; guardado public.preventivos_trimestrales_ordenes;
begin
  if not public.es_admin_trimestrales() then raise exception 'Sólo el administrador puede ajustar órdenes.'; end if;
  if p_excluida is null or length(trim(coalesce(p_motivo,''))) not between 1 and 1500 then raise exception 'Indica el motivo del ajuste.'; end if;
  select * into anterior from public.preventivos_trimestrales_ordenes where numero_orden=p_orden for update;
  if anterior.numero_orden is null or p_revision is null or anterior.revision<>p_revision then raise exception 'La orden cambió. Pulsa Actualizar.'; end if;
  if p_programacion is not null then
    select * into ficha from public.preventivos_trimestrales_programacion where id=p_programacion;
    if ficha.id is null or ficha.marca<>anterior.marca then raise exception 'La tienda no pertenece a esta marca.'; end if;
    if anterior.codigo<>'' and anterior.codigo<>ficha.codigo then raise exception 'El código de la orden no coincide con la tienda.'; end if;
  end if;
  update public.preventivos_trimestrales_ordenes set programacion_id=p_programacion,excluida=p_excluida,motivo=trim(p_motivo),revision=revision+1
    where numero_orden=p_orden returning * into guardado;
  insert into public.preventivos_trimestrales_historial(entidad,clave,accion,datos,autor_id,autor_nombre)
    values('orden',p_orden,'ajustar',to_jsonb(guardado),auth.uid(),public.autor_trimestrales());
  return to_jsonb(guardado);
end;
$f$;

revoke all on function public.sincronizar_programacion_trimestral(jsonb),public.marcar_realizado_trimestral(text,integer,boolean,date,integer,text),
  public.guardar_tienda_trimestral(jsonb,boolean,integer),public.cerrar_tienda_trimestral(text,boolean,text,integer),
  public.configurar_excel_trimestral(text,text[],text),public.importar_ordenes_trimestrales(jsonb),
  public.ajustar_orden_trimestral(text,text,boolean,text,integer) from public,anon;
grant execute on function public.sincronizar_programacion_trimestral(jsonb),public.marcar_realizado_trimestral(text,integer,boolean,date,integer,text),
  public.guardar_tienda_trimestral(jsonb,boolean,integer),public.cerrar_tienda_trimestral(text,boolean,text,integer),
  public.configurar_excel_trimestral(text,text[],text),public.importar_ordenes_trimestrales(jsonb),
  public.ajustar_orden_trimestral(text,text,boolean,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
