-- Ejecutar completo UNA VEZ en el SQL Editor del proyecto de Supabase.
-- Tabla independiente: no modifica el Excel, las particulares ni otras tablas.
-- Conserva el acceso actual de la aplicación SIN inicio de sesión:
-- anon/authenticated podrán consultar y agregar confirmaciones de vencimiento.
-- No es un control de acceso privado; no concede UPDATE ni DELETE.
-- Las correcciones agregan revisiones. La última por serie es la aplicable.
-- Si la tabla ya existe, el script se detiene sin reemplazarla.
begin;

create table public.garantias_vencimientos (
  id bigint generated always as identity primary key,
  serie text not null check (serie ~ '^[A-Z0-9]{7,40}$' and serie ~ '[0-9]'),
  fecha_vencimiento date check (fecha_vencimiento between date '1900-01-01' and date '9999-12-31'),
  registrado_en timestamptz not null default now()
);
-- Una fecha nula registra el regreso voluntario al cálculo automático.
create index garantias_vencimientos_serie_idx on public.garantias_vencimientos (serie, id desc);
alter table public.garantias_vencimientos enable row level security;
revoke all on public.garantias_vencimientos from anon, authenticated;
grant select, insert on public.garantias_vencimientos to anon, authenticated;
grant usage on sequence public.garantias_vencimientos_id_seq to anon, authenticated;
create policy "Consultar vencimientos confirmados" on public.garantias_vencimientos
  for select to anon, authenticated using (true);
create policy "Registrar revision de vencimiento" on public.garantias_vencimientos
  for insert to anon, authenticated with check (true);

commit;
-- Después: Técnicos > Vencimientos confirmados > Reintentar consulta.
