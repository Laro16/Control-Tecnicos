-- Ejecutar una sola vez después de activar_viaticos.sql.
-- Los técnicos solo podrán leer sus propias entregas y confirmar la recepción
-- mediante una función que fija usuario, nombre y hora desde Supabase.
begin;

alter table public.viaticos_entregas
  add column if not exists comprobante_ruta text,
  add column if not exists comprobante_nombre text,
  add column if not exists recibido_en timestamptz,
  add column if not exists recibido_por uuid references auth.users(id),
  add column if not exists recibido_nombre text;

-- La validación se aplica solo a entregas nuevas; no invalida transferencias
-- históricas que se registraron antes de que existiera este requisito.
create or replace function public.validar_comprobante_entrega_viaticos()
returns trigger language plpgsql security definer set search_path = public
as $viaticos$
begin
  if new.medio = 'Transferencia' and (
    coalesce(trim(new.comprobante_ruta), '') = ''
    or coalesce(trim(new.comprobante_nombre), '') = ''
    or new.comprobante_ruta not like 'transferencias/' || new.empleado_id::text || '/%'
    or not exists (
      select 1 from storage.objects
      where bucket_id = 'facturas-viaticos' and name = new.comprobante_ruta
    )
  ) then raise exception 'Adjunta una foto de la transferencia antes de guardar la entrega.'; end if;
  return new;
end;
$viaticos$;

drop trigger if exists validar_comprobante_entrega_viaticos on public.viaticos_entregas;
create trigger validar_comprobante_entrega_viaticos
before insert on public.viaticos_entregas
for each row execute function public.validar_comprobante_entrega_viaticos();

drop policy if exists "Técnico consulta sus entregas de viáticos" on public.viaticos_entregas;
create policy "Técnico consulta sus entregas de viáticos" on public.viaticos_entregas
  for select to authenticated using (
    exists (
      select 1 from public.vac_empleados e
      where e.id = empleado_id
        and lower(trim(e.correo_viaticos)) = lower(trim(auth.jwt()->>'email'))
    )
  );

drop policy if exists "Técnico ve sus transferencias de viáticos" on storage.objects;
create policy "Técnico ve sus transferencias de viáticos" on storage.objects
  for select to authenticated using (
    bucket_id = 'facturas-viaticos'
    and exists (
      select 1 from public.vac_empleados e
      where name like 'transferencias/' || e.id::text || '/%'
        and lower(trim(e.correo_viaticos)) = lower(trim(auth.jwt()->>'email'))
    )
  );

create or replace function public.confirmar_recepcion_viaticos(p_entrega uuid)
returns public.viaticos_entregas
language plpgsql security definer set search_path = public
as $viaticos$
declare
  registro public.viaticos_entregas;
  nombre_tecnico text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;

  select * into registro from public.viaticos_entregas
  where id = p_entrega for update;
  if registro.id is null then raise exception 'Entrega no encontrada.'; end if;
  if registro.recibido_en is not null then raise exception 'Esta entrega ya fue confirmada.'; end if;

  select e.nombre into nombre_tecnico from public.vac_empleados e
  where e.id = registro.empleado_id
    and lower(trim(e.correo_viaticos)) = lower(trim(auth.jwt()->>'email'));
  if nombre_tecnico is null then raise exception 'Solo el técnico destinatario puede confirmar esta entrega.'; end if;

  update public.viaticos_entregas
  set recibido_en = now(), recibido_por = auth.uid(), recibido_nombre = nombre_tecnico
  where id = p_entrega
  returning * into registro;
  return registro;
end;
$viaticos$;

revoke all on function public.confirmar_recepcion_viaticos(uuid) from public, anon;
grant execute on function public.confirmar_recepcion_viaticos(uuid) to authenticated;

commit;
