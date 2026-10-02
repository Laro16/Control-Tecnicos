-- Ejecutar COMPLETO después de activar_preventivos.sql. Es seguro repetirlo.
-- No abre el resto de la aplicación ni permite al técnico modificar el Excel.
begin;

create or replace function public.tiene_acceso_preventivos()
returns boolean language sql stable security definer set search_path = '' as $acceso$
  select auth.uid() is not null and (
    exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid())
    or exists (select 1 from public.vac_empleados e
      where e.activo is not false
      and lower(trim(e.correo_viaticos)) = lower(auth.jwt()->>'email'))
  );
$acceso$;
revoke all on function public.tiene_acceso_preventivos() from public, anon;
grant execute on function public.tiene_acceso_preventivos() to authenticated;

create table if not exists public.preventivos_locales (
  marca text not null check (marca in ('GRANJERO', 'CAMPERO')),
  codigo text not null check (length(trim(codigo)) > 0),
  nombre text not null,
  meses integer[] not null,
  activo boolean not null default true,
  primary key (marca, codigo),
  check (cardinality(meses) = 3 and meses <@ array[1,2,3,4,5,6,7,8,9,10,11,12])
);
create table if not exists public.preventivos_realizados (
  marca text not null,
  codigo text not null,
  anio integer not null check (anio between 2020 and 2100),
  mes integer not null check (mes between 1 and 12),
  realizado boolean not null,
  fecha_realizado date,
  equipos_declarados integer check (equipos_declarados between 1 and 500),
  observaciones text not null default '' check (length(observaciones) <= 1500),
  realizado_por uuid not null,
  realizado_nombre text not null,
  actualizado_en timestamptz not null default now(),
  revision integer not null default 1,
  primary key (marca, codigo, anio, mes),
  foreign key (marca, codigo) references public.preventivos_locales(marca, codigo),
  check (not realizado or fecha_realizado is not null)
);
create table if not exists public.preventivos_realizados_historial (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  codigo text not null,
  anio integer not null,
  mes integer not null,
  realizado boolean not null,
  fecha_realizado date,
  equipos_declarados integer,
  observaciones text not null,
  autor_id uuid not null,
  autor_nombre text not null,
  registrado_en timestamptz not null default now(),
  revision integer not null
);
alter table public.preventivos_locales enable row level security;
alter table public.preventivos_realizados enable row level security;
alter table public.preventivos_realizados_historial enable row level security;
revoke all on public.preventivos_locales, public.preventivos_realizados, public.preventivos_realizados_historial from anon, authenticated;
grant select on public.preventivos_locales, public.preventivos_realizados, public.preventivos_realizados_historial to authenticated;

drop policy if exists "Participantes leen calendario" on public.preventivos_locales;
create policy "Participantes leen calendario" on public.preventivos_locales for select to authenticated using ((select public.tiene_acceso_preventivos()));
drop policy if exists "Participantes leen realizados" on public.preventivos_realizados;
create policy "Participantes leen realizados" on public.preventivos_realizados for select to authenticated using ((select public.tiene_acceso_preventivos()));
drop policy if exists "Administrador lee historial preventivos" on public.preventivos_realizados_historial;
create policy "Administrador lee historial preventivos" on public.preventivos_realizados_historial for select to authenticated
  using (exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid()));

-- Sólo las columnas necesarias del historial, sin datos de otros módulos.
create or replace function public.consultar_ordenes_preventivos()
returns table (numero_orden text, marca text, codigo text, negocio text, fecha_realizada date,
  anio_programado integer, mes_programado integer, detectado_en timestamptz)
language plpgsql stable security definer set search_path = '' as $ordenes$
begin
  if not public.tiene_acceso_preventivos() then raise exception 'No tienes acceso a Preventivos.'; end if;
  return query select o.numero_orden, o.marca, o.codigo, o.negocio, o.fecha_realizada,
    o.anio_programado, o.mes_programado, o.detectado_en from public.preventivos_ordenes o;
end;
$ordenes$;
revoke all on function public.consultar_ordenes_preventivos() from public, anon;
grant execute on function public.consultar_ordenes_preventivos() to authenticated;

create or replace function public.sincronizar_catalogo_preventivos(p_locales jsonb)
returns void language plpgsql security definer set search_path = '' as $catalogo$
begin
  if not exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid())
    then raise exception 'Sólo el administrador puede actualizar el calendario.'; end if;
  if p_locales is null or jsonb_typeof(p_locales) <> 'array' or jsonb_array_length(p_locales) = 0
    then raise exception 'El calendario está vacío o no es válido.'; end if;
  insert into public.preventivos_locales as actual (marca, codigo, nombre, meses, activo)
    select l.marca, l.codigo, l.nombre, l.meses, l.activo
    from jsonb_to_recordset(p_locales) as l(marca text, codigo text, nombre text, meses integer[], activo boolean)
    on conflict (marca, codigo) do update set nombre=excluded.nombre, meses=excluded.meses, activo=excluded.activo
      where (actual.nombre, actual.meses, actual.activo) is distinct from (excluded.nombre, excluded.meses, excluded.activo);
  -- Un local retirado del archivo se desactiva, nunca se borra su historial.
  update public.preventivos_locales actual set activo=false
    where actual.activo and not exists (select 1 from jsonb_to_recordset(p_locales) as l(marca text, codigo text)
      where l.marca=actual.marca and l.codigo=actual.codigo);
end;
$catalogo$;
revoke all on function public.sincronizar_catalogo_preventivos(jsonb) from public, anon;
grant execute on function public.sincronizar_catalogo_preventivos(jsonb) to authenticated;

create or replace function public.marcar_realizado_preventivo(
  p_marca text, p_codigo text, p_anio integer, p_mes integer,
  p_realizado boolean, p_fecha date, p_equipos integer, p_observaciones text, p_revision integer
) returns jsonb language plpgsql security definer set search_path = '' as $realizado$
declare
  anterior public.preventivos_realizados;
  guardado public.preventivos_realizados;
  es_admin boolean;
  nombre_autor text;
begin
  if not public.tiene_acceso_preventivos() then raise exception 'No tienes acceso a Preventivos.'; end if;
  select exists (select 1 from public.viaticos_admins a where a.user_id=auth.uid()) into es_admin;
  select e.nombre into nombre_autor from public.vac_empleados e
    where e.activo is not false and lower(trim(e.correo_viaticos))=lower(auth.jwt()->>'email') limit 1;
  nombre_autor := coalesce(nombre_autor, auth.jwt()->>'email', 'Administrador');
  if p_anio is null or p_anio not between 2020 and 2100 or p_mes is null or p_mes not between 1 and 12
    or p_realizado is null or p_revision is null or p_revision < 0 then raise exception 'Periodo o revisión inválidos.'; end if;
  if not exists (select 1 from public.preventivos_locales l where l.marca=p_marca and l.codigo=p_codigo
    and l.activo and p_mes = any(l.meses)) then raise exception 'Ese restaurante no está activo o no está programado en ese mes. Pide al administrador que actualice el calendario.'; end if;
  if p_realizado and (p_fecha is null or p_fecha > (now() at time zone 'America/Guatemala')::date)
    then raise exception 'La fecha realizada es obligatoria y no puede ser futura.'; end if;
  if p_equipos is not null and p_equipos not between 1 and 500 then raise exception 'Cantidad de equipos inválida.'; end if;
  if length(coalesce(p_observaciones,'')) > 1500 then raise exception 'La observación supera 1500 caracteres.'; end if;
  -- Serializa la primera creación y los cambios simultáneos del mismo local/mes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_marca || ':' || p_codigo || ':' || p_anio || ':' || p_mes, 0));
  select * into anterior from public.preventivos_realizados r
    where r.marca=p_marca and r.codigo=p_codigo and r.anio=p_anio and r.mes=p_mes for update;
  if coalesce(anterior.revision,0) <> p_revision then raise exception 'Otro usuario actualizó este preventivo. Pulsa Actualizar antes de continuar.'; end if;
  if anterior.realizado and anterior.realizado_por <> auth.uid() and not es_admin
    then raise exception 'Sólo quien lo registró o un administrador puede corregir esta marca.'; end if;
  if not p_realizado and anterior.marca is null then raise exception 'No existe una marca que deshacer.'; end if;
  insert into public.preventivos_realizados (marca,codigo,anio,mes,realizado,fecha_realizado,equipos_declarados,
      observaciones,realizado_por,realizado_nombre,revision)
    values (p_marca,p_codigo,p_anio,p_mes,p_realizado,case when p_realizado then p_fecha else anterior.fecha_realizado end,
      case when p_realizado then p_equipos else anterior.equipos_declarados end,
      trim(coalesce(p_observaciones,'')),auth.uid(),nombre_autor,p_revision+1)
    on conflict (marca,codigo,anio,mes) do update set realizado=excluded.realizado,
      fecha_realizado=excluded.fecha_realizado,equipos_declarados=excluded.equipos_declarados,
      observaciones=excluded.observaciones,realizado_por=excluded.realizado_por,
      realizado_nombre=excluded.realizado_nombre,revision=excluded.revision,actualizado_en=now()
    returning * into guardado;
  insert into public.preventivos_realizados_historial (marca,codigo,anio,mes,realizado,fecha_realizado,equipos_declarados,
      observaciones,autor_id,autor_nombre,revision)
    values (guardado.marca,guardado.codigo,guardado.anio,guardado.mes,guardado.realizado,guardado.fecha_realizado,
      guardado.equipos_declarados,guardado.observaciones,auth.uid(),nombre_autor,guardado.revision);
  return to_jsonb(guardado);
end;
$realizado$;
revoke all on function public.marcar_realizado_preventivo(text,text,integer,integer,boolean,date,integer,text,integer) from public, anon;
grant execute on function public.marcar_realizado_preventivo(text,text,integer,integer,boolean,date,integer,text,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
