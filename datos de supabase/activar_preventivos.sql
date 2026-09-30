-- Ejecutar completo una vez en SQL Editor. Utiliza los administradores existentes.
begin;
create table if not exists public.preventivos_ordenes (
  numero_orden text primary key check (length(trim(numero_orden)) > 0),
  marca text not null check (marca in ('GRANJERO','CAMPERO')),
  codigo text,
  negocio text not null default '',
  tecnico text not null default '',
  estado text not null default '',
  fecha_realizada date,
  anio_programado integer,
  mes_programado integer check (mes_programado between 1 and 12),
  detectado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists preventivos_marca_codigo_fecha on public.preventivos_ordenes(marca,codigo,fecha_realizada);
alter table public.preventivos_ordenes enable row level security;
grant select,insert,update on public.preventivos_ordenes to authenticated;
drop policy if exists "Administradores consultan preventivos" on public.preventivos_ordenes;
create policy "Administradores consultan preventivos" on public.preventivos_ordenes for select to authenticated using (exists (select 1 from public.viaticos_admins a where a.user_id=auth.uid()));
drop policy if exists "Administradores insertan preventivos" on public.preventivos_ordenes;
create policy "Administradores insertan preventivos" on public.preventivos_ordenes for insert to authenticated with check (exists (select 1 from public.viaticos_admins a where a.user_id=auth.uid()));
drop policy if exists "Administradores actualizan preventivos" on public.preventivos_ordenes;
create policy "Administradores actualizan preventivos" on public.preventivos_ordenes for update to authenticated using (exists (select 1 from public.viaticos_admins a where a.user_id=auth.uid())) with check (exists (select 1 from public.viaticos_admins a where a.user_id=auth.uid()));
create or replace function public.conservar_fecha_preventivo() returns trigger language plpgsql set search_path=public as $preventivos$
begin
  new.detectado_en := old.detectado_en;
  new.fecha_realizada := coalesce(new.fecha_realizada,old.fecha_realizada);
  new.codigo := coalesce(new.codigo,old.codigo);
  new.anio_programado := coalesce(new.anio_programado,old.anio_programado);
  new.mes_programado := coalesce(new.mes_programado,old.mes_programado);
  return new;
end;
$preventivos$;
drop trigger if exists conservar_fecha_preventivo on public.preventivos_ordenes;
create trigger conservar_fecha_preventivo before update on public.preventivos_ordenes for each row execute function public.conservar_fecha_preventivo();
commit;
