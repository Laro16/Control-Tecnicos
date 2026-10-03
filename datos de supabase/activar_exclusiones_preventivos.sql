-- Ejecutar COMPLETO una sola vez en SQL Editor (también es repetible).
-- Requiere los scripts de Preventivos ya instalados. No repetir los anteriores después.
-- No borra órdenes ni modifica las marcas manuales de Realizado.
begin;

-- Separada de las órdenes: las cargas del Excel no pueden sobrescribir la exclusión.
create table if not exists public.preventivos_ordenes_exclusiones (
  numero_orden text primary key references public.preventivos_ordenes(numero_orden),
  excluida boolean not null,
  motivo text not null check (length(trim(motivo)) between 1 and 1500),
  actualizado_por uuid not null,
  autor_nombre text not null,
  actualizado_en timestamptz not null default now(),
  revision integer not null check (revision > 0)
);
create table if not exists public.preventivos_exclusiones_historial (
  id uuid primary key default gen_random_uuid(),
  numero_orden text not null references public.preventivos_ordenes(numero_orden),
  excluida boolean not null,
  motivo text not null,
  autor_id uuid not null,
  autor_nombre text not null,
  registrado_en timestamptz not null default now(),
  revision integer not null,
  unique (numero_orden, revision)
);
alter table public.preventivos_ordenes_exclusiones enable row level security;
alter table public.preventivos_exclusiones_historial enable row level security;
revoke all on public.preventivos_ordenes_exclusiones, public.preventivos_exclusiones_historial from anon, authenticated;
grant select on public.preventivos_ordenes_exclusiones, public.preventivos_exclusiones_historial to authenticated;
drop policy if exists "Administrador consulta exclusiones preventivos" on public.preventivos_ordenes_exclusiones;
create policy "Administrador consulta exclusiones preventivos" on public.preventivos_ordenes_exclusiones
  for select to authenticated using (exists (select 1 from public.viaticos_admins a where a.user_id=auth.uid()));
drop policy if exists "Administrador consulta historial exclusiones" on public.preventivos_exclusiones_historial;
create policy "Administrador consulta historial exclusiones" on public.preventivos_exclusiones_historial
  for select to authenticated using (exists (select 1 from public.viaticos_admins a where a.user_id=auth.uid()));

create or replace function public.cambiar_exclusion_orden_preventivo(
  p_numero_orden text, p_excluida boolean, p_motivo text, p_revision integer
) returns jsonb language plpgsql security definer set search_path = '' as $exclusion$
declare
  anterior public.preventivos_ordenes_exclusiones;
  guardado public.preventivos_ordenes_exclusiones;
  nombre_autor text;
begin
  if not exists (select 1 from public.viaticos_admins a where a.user_id=auth.uid())
    then raise exception 'Sólo el administrador puede excluir o restaurar órdenes.'; end if;
  if p_excluida is null or p_revision is null or p_revision < 0
    then raise exception 'Acción o revisión inválida.'; end if;
  if p_motivo is null or length(trim(p_motivo)) not between 1 and 1500
    then raise exception 'Indica un motivo de entre 1 y 1500 caracteres.'; end if;
  -- Bloqueo por orden: protege la primera exclusión y las modificaciones simultáneas.
  perform 1 from public.preventivos_ordenes where numero_orden=p_numero_orden for update;
  if not found then raise exception 'La orden no existe. Actualiza los datos.'; end if;
  select * into anterior from public.preventivos_ordenes_exclusiones where numero_orden=p_numero_orden for update;
  if coalesce(anterior.revision,0) <> p_revision
    then raise exception 'La exclusión cambió. Pulsa Actualizar antes de intentar de nuevo.'; end if;
  if coalesce(anterior.excluida,false)=p_excluida
    then raise exception 'La orden ya tiene ese estado. Actualiza los datos.'; end if;
  select e.nombre into nombre_autor from public.vac_empleados e
    where lower(trim(e.correo_viaticos))=lower(auth.jwt()->>'email') limit 1;
  nombre_autor := coalesce(nullif(trim(nombre_autor),''),auth.jwt()->>'email','Administrador');
  insert into public.preventivos_ordenes_exclusiones(numero_orden,excluida,motivo,actualizado_por,autor_nombre,revision)
    values(p_numero_orden,p_excluida,trim(p_motivo),auth.uid(),nombre_autor,p_revision+1)
    on conflict(numero_orden) do update set excluida=excluded.excluida,motivo=excluded.motivo,
      actualizado_por=excluded.actualizado_por,autor_nombre=excluded.autor_nombre,
      actualizado_en=now(),revision=excluded.revision
    returning * into guardado;
  insert into public.preventivos_exclusiones_historial(numero_orden,excluida,motivo,autor_id,autor_nombre,revision)
    values(guardado.numero_orden,guardado.excluida,guardado.motivo,auth.uid(),nombre_autor,guardado.revision);
  return to_jsonb(guardado);
end;
$exclusion$;
revoke all on function public.cambiar_exclusion_orden_preventivo(text,boolean,text,integer) from public,anon;
grant execute on function public.cambiar_exclusion_orden_preventivo(text,boolean,text,integer) to authenticated;

-- El portal técnico sólo recibe órdenes válidas. Mantiene técnico y fecha por orden.
drop function if exists public.consultar_ordenes_preventivos();
create function public.consultar_ordenes_preventivos()
returns table(numero_orden text,marca text,codigo text,negocio text,fecha_realizada date,
  anio_programado integer,mes_programado integer,detectado_en timestamptz,tecnico text)
language plpgsql stable security definer set search_path = '' as $ordenes$
begin
  if not public.tiene_acceso_preventivos() then raise exception 'No tienes acceso a Preventivos.'; end if;
  return query select o.numero_orden,o.marca,o.codigo,o.negocio,o.fecha_realizada,
    o.anio_programado,o.mes_programado,o.detectado_en,o.tecnico from public.preventivos_ordenes o
    where not exists(select 1 from public.preventivos_ordenes_exclusiones e where e.numero_orden=o.numero_orden and e.excluida);
end;
$ordenes$;
revoke all on function public.consultar_ordenes_preventivos() from public,anon;
grant execute on function public.consultar_ordenes_preventivos() to authenticated;
notify pgrst, 'reload schema';
commit;
