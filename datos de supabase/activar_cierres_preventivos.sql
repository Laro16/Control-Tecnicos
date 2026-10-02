-- Ejecutar COMPLETO después de activar_preventivos_tecnicos.sql.
-- Se puede repetir. Conserva las órdenes, los reportes y los cierres existentes.
begin;

alter table public.preventivos_locales
  add column if not exists activo_calendario boolean,
  add column if not exists activo_manual boolean,
  add column if not exists fecha_cierre date,
  add column if not exists motivo_cierre text not null default '',
  add column if not exists revision_estado integer not null default 0,
  add column if not exists estado_actualizado_en timestamptz,
  add column if not exists estado_actualizado_por uuid;
update public.preventivos_locales set activo_calendario=activo where activo_calendario is null;
alter table public.preventivos_locales alter column activo_calendario set not null;
alter table public.preventivos_locales alter column activo_calendario set default true;

create table if not exists public.preventivos_cierres_historial (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  codigo text not null,
  cerrado boolean not null,
  fecha_cierre date,
  motivo text not null default '' check (length(motivo) <= 1500),
  autor_id uuid not null,
  registrado_en timestamptz not null default now(),
  revision integer not null,
  foreign key (marca,codigo) references public.preventivos_locales(marca,codigo),
  unique (marca,codigo,revision),
  check (not cerrado or fecha_cierre is not null)
);
alter table public.preventivos_cierres_historial enable row level security;
revoke all on public.preventivos_cierres_historial from public, anon, authenticated;
grant select on public.preventivos_cierres_historial to authenticated;
drop policy if exists "Administradores consultan cierres" on public.preventivos_cierres_historial;
create policy "Administradores consultan cierres" on public.preventivos_cierres_historial
  for select to authenticated using (exists (select 1 from public.viaticos_admins a where a.user_id=auth.uid()));

-- El archivo actualiza el calendario, pero nunca sustituye la decisión del administrador.
create or replace function public.sincronizar_catalogo_preventivos(p_locales jsonb)
returns void language plpgsql security definer set search_path = '' as $catalogo$
begin
  if not exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid())
    then raise exception 'Sólo el administrador puede actualizar el calendario.'; end if;
  if p_locales is null or jsonb_typeof(p_locales) <> 'array' or jsonb_array_length(p_locales) = 0
    then raise exception 'El calendario está vacío o no es válido.'; end if;
  insert into public.preventivos_locales as actual (marca,codigo,nombre,meses,activo,activo_calendario)
    select l.marca,l.codigo,l.nombre,l.meses,l.activo,l.activo
    from jsonb_to_recordset(p_locales) as l(marca text,codigo text,nombre text,meses integer[],activo boolean)
    on conflict (marca,codigo) do update set nombre=excluded.nombre,meses=excluded.meses,
      activo_calendario=excluded.activo_calendario,
      activo=coalesce(actual.activo_manual,excluded.activo_calendario)
    where (actual.nombre,actual.meses,actual.activo_calendario,actual.activo) is distinct from
      (excluded.nombre,excluded.meses,excluded.activo_calendario,coalesce(actual.activo_manual,excluded.activo_calendario));
  update public.preventivos_locales actual set activo_calendario=false,activo=coalesce(actual.activo_manual,false)
    where (actual.activo_calendario or actual.activo is distinct from coalesce(actual.activo_manual,false))
      and not exists (select 1 from jsonb_to_recordset(p_locales) as l(marca text,codigo text)
        where l.marca=actual.marca and l.codigo=actual.codigo);
end;
$catalogo$;
revoke all on function public.sincronizar_catalogo_preventivos(jsonb) from public, anon;
grant execute on function public.sincronizar_catalogo_preventivos(jsonb) to authenticated;

create or replace function public.cambiar_estado_local_preventivo(
  p_marca text,p_codigo text,p_cerrado boolean,p_fecha date,p_motivo text,p_revision integer
) returns jsonb language plpgsql security definer set search_path = '' as $estado$
declare
  anterior public.preventivos_locales;
  guardado public.preventivos_locales;
begin
  if not exists (select 1 from public.viaticos_admins a where a.user_id=auth.uid())
    then raise exception 'Sólo el administrador puede cerrar o reactivar puntos de venta.'; end if;
  if p_cerrado is null or p_revision is null or p_revision < 0 then raise exception 'Estado o revisión inválidos.'; end if;
  if p_cerrado and (p_fecha is null or p_fecha > (now() at time zone 'America/Guatemala')::date)
    then raise exception 'Indica una fecha de cierre válida, no futura.'; end if;
  if length(coalesce(p_motivo,'')) > 1500 then raise exception 'El motivo supera 1500 caracteres.'; end if;
  select * into anterior from public.preventivos_locales l where l.marca=p_marca and l.codigo=p_codigo for update;
  if not found then raise exception 'No se encontró el punto de venta. Actualiza el calendario.'; end if;
  if anterior.revision_estado <> p_revision then raise exception 'El punto de venta cambió. Pulsa Actualizar antes de continuar.'; end if;
  if anterior.activo = (not p_cerrado) then raise exception 'El punto de venta ya tiene ese estado. Pulsa Actualizar.'; end if;
  update public.preventivos_locales l set activo=not p_cerrado,activo_manual=not p_cerrado,
    fecha_cierre=case when p_cerrado then p_fecha else null end,
    motivo_cierre=trim(coalesce(p_motivo,'')),revision_estado=anterior.revision_estado+1,
    estado_actualizado_en=now(),estado_actualizado_por=auth.uid()
    where l.marca=p_marca and l.codigo=p_codigo returning * into guardado;
  insert into public.preventivos_cierres_historial(marca,codigo,cerrado,fecha_cierre,motivo,autor_id,revision)
    values (p_marca,p_codigo,p_cerrado,guardado.fecha_cierre,guardado.motivo_cierre,auth.uid(),guardado.revision_estado);
  return to_jsonb(guardado);
end;
$estado$;
revoke all on function public.cambiar_estado_local_preventivo(text,text,boolean,date,text,integer) from public, anon;
grant execute on function public.cambiar_estado_local_preventivo(text,text,boolean,date,text,integer) to authenticated;

-- Valida también un formulario que haya quedado abierto antes del cierre.
-- El bloqueo se comparte con el cambio de estado para evitar carreras entre ambos guardados.
create or replace function public.validar_local_abierto_preventivo()
returns trigger language plpgsql security definer set search_path = '' as $abierto$
declare local_activo boolean;
begin
  select l.activo into local_activo from public.preventivos_locales l
    where l.marca=new.marca and l.codigo=new.codigo for share;
  if local_activo is not true then raise exception 'El punto de venta está cerrado. Actualiza el calendario.'; end if;
  return new;
end;
$abierto$;
revoke all on function public.validar_local_abierto_preventivo() from public, anon, authenticated;
drop trigger if exists validar_local_abierto_preventivo on public.preventivos_realizados;
create trigger validar_local_abierto_preventivo before insert or update on public.preventivos_realizados
  for each row execute function public.validar_local_abierto_preventivo();

notify pgrst, 'reload schema';
commit;
