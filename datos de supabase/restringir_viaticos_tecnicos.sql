-- Ejecutar solo si activar_viaticos.sql ya se había aplicado.
-- Los técnicos conservan INSERT de sus facturas, pero no pueden consultar
-- entregas, gastos registrados ni archivos mediante la API de Viáticos.
begin;

drop policy if exists "Leer entregas propias o administrar" on public.viaticos_entregas;
drop policy if exists "Solo administrador lee entregas" on public.viaticos_entregas;
create policy "Solo administrador lee entregas" on public.viaticos_entregas
  for select to authenticated using (
    exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid())
  );

drop policy if exists "Leer gastos propios o administrar" on public.viaticos_gastos;
drop policy if exists "Solo administrador lee gastos" on public.viaticos_gastos;
create policy "Solo administrador lee gastos" on public.viaticos_gastos
  for select to authenticated using (
    exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid())
  );

drop policy if exists "Leer facturas de viaticos" on storage.objects;
create policy "Leer facturas de viaticos" on storage.objects
  for select to authenticated using (
    bucket_id = 'facturas-viaticos'
    and exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid())
  );

-- La función es SECURITY DEFINER: restringirla también para que un técnico
-- no pueda modificar indirectamente un gasto anterior.
create or replace function public.adjuntar_comprobante_viaticos(p_gasto uuid, p_ruta text, p_nombre text)
returns void language plpgsql security definer set search_path = public
as $viaticos$
declare
  registro public.viaticos_gastos;
begin
  if not exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid())
  then raise exception 'No tienes acceso a este gasto.'; end if;
  select * into registro from public.viaticos_gastos where id = p_gasto for update;
  if registro.id is null then raise exception 'Gasto no encontrado.'; end if;
  if registro.foto_ruta is not null then raise exception 'Este gasto ya tiene comprobante.'; end if;
  if p_ruta not like registro.empleado_id::text || '/%' or trim(coalesce(p_nombre,'')) = ''
     or not exists (select 1 from storage.objects where bucket_id = 'facturas-viaticos' and name = p_ruta)
  then raise exception 'Comprobante inválido.'; end if;
  update public.viaticos_gastos set foto_ruta = p_ruta, foto_nombre = p_nombre where id = p_gasto;
end;
$viaticos$;

commit;
