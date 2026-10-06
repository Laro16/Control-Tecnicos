-- Ejecutar COMPLETO con Preventivos y Cierres ya instalados. Es repetible.
-- Permite agregar tiendas y editar su programación desde la app.
-- Conserva cierres, declaraciones, órdenes y exclusiones.
begin;

alter table public.preventivos_locales
  add column if not exists origen_manual boolean not null default false,
  add column if not exists revision_catalogo integer not null default 0,
  add column if not exists direccion text,
  add column if not exists telefono text,
  add column if not exists semana text,
  add column if not exists equipos integer,
  add column if not exists catalogo_actualizado_en timestamptz,
  add column if not exists catalogo_actualizado_por uuid;

create table if not exists public.preventivos_catalogo_historial (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  codigo text not null,
  datos jsonb not null,
  autor_id uuid not null,
  registrado_en timestamptz not null default now(),
  revision integer not null,
  foreign key(marca,codigo) references public.preventivos_locales(marca,codigo),
  unique(marca,codigo,revision)
);
alter table public.preventivos_catalogo_historial enable row level security;
revoke all on public.preventivos_catalogo_historial from public,anon,authenticated;
grant select on public.preventivos_catalogo_historial to authenticated;
drop policy if exists "Administrador consulta cambios del catálogo" on public.preventivos_catalogo_historial;
create policy "Administrador consulta cambios del catálogo" on public.preventivos_catalogo_historial
  for select to authenticated using (exists(select 1 from public.viaticos_admins a where a.user_id=auth.uid()));

create or replace function public.guardar_local_preventivo(p_datos jsonb,p_nuevo boolean,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $local$
declare
  anterior public.preventivos_locales;
  guardado public.preventivos_locales;
  marca_local text;
  codigo_local text;
  nombre_local text;
  mes_base integer;
  equipos_local integer;
  meses_local integer[];
begin
  if not exists(select 1 from public.viaticos_admins a where a.user_id=auth.uid())
    then raise exception 'Sólo el administrador puede agregar o editar tiendas.'; end if;
  if p_datos is null or jsonb_typeof(p_datos)<>'object' or p_nuevo is null or p_revision is null or p_revision<0
    then raise exception 'Datos o revisión inválidos.'; end if;
  marca_local:=upper(trim(p_datos->>'marca'));
  codigo_local:=regexp_replace(trim(p_datos->>'codigo'),'^0+(?=[0-9])','');
  nombre_local:=trim(p_datos->>'nombre');
  if marca_local is null or marca_local not in ('GRANJERO','CAMPERO') or codigo_local is null or codigo_local !~ '^[0-9]{1,20}$'
    then raise exception 'Indica una marca y código válidos.'; end if;
  if nombre_local is null or length(nombre_local) not between 1 and 200
    then raise exception 'Indica un nombre de hasta 200 caracteres.'; end if;
  if coalesce(p_datos->>'mes_base','') !~ '^[1-4]$'
    then raise exception 'Selecciona los meses de mantenimiento.'; end if;
  mes_base:=(p_datos->>'mes_base')::integer;
  meses_local:=array[mes_base,mes_base+4,mes_base+8];
  if length(coalesce(p_datos->>'direccion',''))>1000 or length(coalesce(p_datos->>'telefono',''))>80
    or length(coalesce(p_datos->>'semana',''))>100 then raise exception 'Los datos del restaurante son demasiado largos.'; end if;
  if nullif(p_datos->>'equipos','') is not null then
    if (p_datos->>'equipos') !~ '^[0-9]{1,3}$' then raise exception 'Cantidad de equipos inválida.'; end if;
    equipos_local:=(p_datos->>'equipos')::integer;
    if equipos_local not between 1 and 500 then raise exception 'Indica entre 1 y 500 equipos.'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalogo:'||marca_local||':'||codigo_local,0));
  select * into anterior from public.preventivos_locales l where l.marca=marca_local and l.codigo=codigo_local for update;
  if p_nuevo then
    if found then raise exception 'Ese código ya existe para esta marca. Edita o reactiva la ficha existente.'; end if;
    if p_revision<>0 then raise exception 'Revisión inválida para una tienda nueva.'; end if;
    insert into public.preventivos_locales(marca,codigo,nombre,meses,activo,activo_calendario,activo_manual,origen_manual,
      revision_catalogo,direccion,telefono,semana,equipos,catalogo_actualizado_en,catalogo_actualizado_por)
      values(marca_local,codigo_local,nombre_local,meses_local,true,false,true,true,1,
        trim(coalesce(p_datos->>'direccion','')),trim(coalesce(p_datos->>'telefono','')),trim(coalesce(p_datos->>'semana','')),
        equipos_local,now(),auth.uid()) returning * into guardado;
  else
    if not found then raise exception 'La tienda no existe. Actualiza los datos.'; end if;
    if anterior.revision_catalogo<>p_revision then raise exception 'La programación cambió. Pulsa Actualizar antes de continuar.'; end if;
    update public.preventivos_locales l set nombre=nombre_local,meses=meses_local,
      direccion=trim(coalesce(p_datos->>'direccion','')),telefono=trim(coalesce(p_datos->>'telefono','')),
      semana=trim(coalesce(p_datos->>'semana','')),equipos=equipos_local,
      revision_catalogo=anterior.revision_catalogo+1,catalogo_actualizado_en=now(),catalogo_actualizado_por=auth.uid()
      where l.marca=marca_local and l.codigo=codigo_local returning * into guardado;
  end if;
  insert into public.preventivos_catalogo_historial(marca,codigo,datos,autor_id,revision)
    values(marca_local,codigo_local,to_jsonb(guardado),auth.uid(),guardado.revision_catalogo);
  return to_jsonb(guardado);
end;
$local$;
revoke all on function public.guardar_local_preventivo(jsonb,boolean,integer) from public,anon;
grant execute on function public.guardar_local_preventivo(jsonb,boolean,integer) to authenticated;

-- El archivo conserva su función de calendario base. Los cambios guardados en la app prevalecen.
create or replace function public.sincronizar_catalogo_preventivos(p_locales jsonb)
returns void language plpgsql security definer set search_path='' as $catalogo$
begin
  if not exists(select 1 from public.viaticos_admins a where a.user_id=auth.uid())
    then raise exception 'Sólo el administrador puede actualizar el calendario.'; end if;
  if p_locales is null or jsonb_typeof(p_locales)<>'array' or jsonb_array_length(p_locales)=0
    then raise exception 'El calendario está vacío o no es válido.'; end if;
  insert into public.preventivos_locales as actual(marca,codigo,nombre,meses,activo,activo_calendario)
    select l.marca,l.codigo,l.nombre,l.meses,l.activo,l.activo
      from jsonb_to_recordset(p_locales) as l(marca text,codigo text,nombre text,meses integer[],activo boolean)
    on conflict(marca,codigo) do update set
      nombre=case when actual.revision_catalogo>0 then actual.nombre else excluded.nombre end,
      meses=case when actual.revision_catalogo>0 then actual.meses else excluded.meses end,
      activo_calendario=excluded.activo_calendario,
      activo=coalesce(actual.activo_manual,excluded.activo_calendario)
    where (actual.nombre,actual.meses,actual.activo_calendario,actual.activo) is distinct from
      (case when actual.revision_catalogo>0 then actual.nombre else excluded.nombre end,
       case when actual.revision_catalogo>0 then actual.meses else excluded.meses end,
       excluded.activo_calendario,coalesce(actual.activo_manual,excluded.activo_calendario));
  update public.preventivos_locales actual set activo_calendario=false,activo=coalesce(actual.activo_manual,false)
    where not actual.origen_manual
      and (actual.activo_calendario or actual.activo is distinct from coalesce(actual.activo_manual,false))
      and not exists(select 1 from jsonb_to_recordset(p_locales) as l(marca text,codigo text)
        where l.marca=actual.marca and l.codigo=actual.codigo);
end;
$catalogo$;
revoke all on function public.sincronizar_catalogo_preventivos(jsonb) from public,anon;
grant execute on function public.sincronizar_catalogo_preventivos(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
