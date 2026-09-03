-- Ejecutar UNA VEZ en el SQL Editor del mismo proyecto de Supabase.
-- No modifica excel_sync, vacaciones ni servicios particulares.
-- Conserva el modelo de acceso de la app actual (sin inicio de sesión).
-- IMPORTANTE: anon/authenticated pueden consultar y agregar estas atenciones,
-- igual que la base actual. Este script no sustituye un sistema de acceso.
-- No se conceden permisos para actualizar ni borrar el historial.

begin;

-- Si ya existe una tabla con ese nombre, se detiene sin cambiarla.
create table public.historial_series (
  serie text not null check (serie ~ '^[A-Z0-9]{7,40}$' and serie ~ '[0-9]'),
  referencia text not null check (length(trim(referencia)) > 0 and referencia <> '-'),
  cliente text not null default '',
  negocio text not null default '',
  tecnico text not null default '',
  fecha_cierre date,
  registrado_en timestamptz not null default now(),
  primary key (serie, referencia)
);

alter table public.historial_series enable row level security;
-- Se eliminan sólo los permisos predeterminados de ESTA tabla nueva.
revoke all on public.historial_series from anon, authenticated;
grant select, insert on public.historial_series to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'historial_series' and policyname = 'Consultar historial de series') then
    create policy "Consultar historial de series" on public.historial_series
      for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'historial_series' and policyname = 'Agregar atenciones finalizadas') then
    create policy "Agregar atenciones finalizadas" on public.historial_series
      for insert to anon, authenticated with check (true);
  end if;
end $$;

commit;

-- Después, en Técnicos > Historial de series, pulsa Reintentar.
-- Se guardarán las órdenes finalizadas con serie y referencia válidas de
-- la base cargada. Los Excel siguientes suman atenciones, no las reemplazan.
-- Archivos nunca cargados en el sistema no se pueden recuperar automáticamente.
