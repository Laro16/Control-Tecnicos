-- Ejecutar una vez en SQL Editor. Crear primero la cuenta administradora en
-- Authentication > Users; después registrar su correo en viaticos_admins.
begin;

alter table public.vac_empleados add column if not exists correo_viaticos text;
create unique index if not exists vac_empleados_correo_viaticos_unico
  on public.vac_empleados (lower(trim(correo_viaticos)))
  where correo_viaticos is not null and trim(correo_viaticos) <> '';

create table if not exists public.viaticos_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.viaticos_admins enable row level security;
grant select on public.viaticos_admins to authenticated;
create policy "Ver rol propio de viaticos" on public.viaticos_admins
  for select to authenticated using (user_id = auth.uid());

create table if not exists public.viaticos_entregas (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.vac_empleados(id),
  fecha date not null,
  monto numeric(12,2) not null check (monto > 0),
  medio text not null check (medio in ('Transferencia','Efectivo')),
  referencia text not null default '',
  observaciones text not null default '',
  creado_en timestamptz not null default now(),
  creado_por uuid not null default auth.uid()
);
create index if not exists viaticos_entregas_empleado_fecha on public.viaticos_entregas(empleado_id, fecha desc);
alter table public.viaticos_entregas enable row level security;
grant select, insert, update, delete on public.viaticos_entregas to authenticated;
create policy "Solo administrador lee entregas" on public.viaticos_entregas
  for select to authenticated using (exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid()));
create policy "Administrador registra entregas" on public.viaticos_entregas
  for insert to authenticated with check (exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid()) and creado_por = auth.uid());
create policy "Administrador edita entregas" on public.viaticos_entregas
  for update to authenticated using (exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid()));
create policy "Administrador elimina entregas" on public.viaticos_entregas
  for delete to authenticated using (exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid()));

create table if not exists public.viaticos_gastos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.vac_empleados(id),
  fecha date not null,
  negocio text not null check (length(trim(negocio)) > 0),
  monto numeric(12,2) not null check (monto > 0),
  concepto text not null,
  departamento text not null check (length(trim(departamento)) > 0),
  municipio text not null check (length(trim(municipio)) > 0),
  observaciones text not null default '',
  foto_ruta text,
  foto_nombre text,
  creado_en timestamptz not null default now(),
  creado_por uuid not null default auth.uid()
);
create index if not exists viaticos_gastos_empleado_fecha on public.viaticos_gastos(empleado_id, fecha desc);
alter table public.viaticos_gastos enable row level security;
grant select, insert, update, delete on public.viaticos_gastos to authenticated;
create policy "Solo administrador lee gastos" on public.viaticos_gastos
  for select to authenticated using (exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid()));
create policy "Registrar gastos propios o administrar" on public.viaticos_gastos
  for insert to authenticated with check (
    creado_por = auth.uid() and (
      exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid())
      or exists (select 1 from public.vac_empleados e where e.id = empleado_id and lower(e.correo_viaticos) = lower(auth.jwt()->>'email'))
    )
  );
create policy "Administrador edita gastos" on public.viaticos_gastos
  for update to authenticated using (exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid()));
create policy "Administrador elimina gastos" on public.viaticos_gastos
  for delete to authenticated using (exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid()));

create function public.adjuntar_comprobante_viaticos(p_gasto uuid, p_ruta text, p_nombre text)
returns void language plpgsql security definer set search_path = public
as $viaticos$
declare
  registro public.viaticos_gastos;
begin
  select * into registro from public.viaticos_gastos where id = p_gasto for update;
  if registro.id is null then raise exception 'Gasto no encontrado.'; end if;
  if registro.foto_ruta is not null then raise exception 'Este gasto ya tiene comprobante.'; end if;
  if not exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid())
  then raise exception 'No tienes acceso a este gasto.'; end if;
  if p_ruta not like registro.empleado_id::text || '/%' or trim(coalesce(p_nombre,'')) = ''
     or not exists (select 1 from storage.objects where bucket_id = 'facturas-viaticos' and name = p_ruta)
  then raise exception 'Comprobante inválido.'; end if;
  update public.viaticos_gastos set foto_ruta = p_ruta, foto_nombre = p_nombre where id = p_gasto;
end;
$viaticos$;
revoke all on function public.adjuntar_comprobante_viaticos(uuid,text,text) from public;
grant execute on function public.adjuntar_comprobante_viaticos(uuid,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('facturas-viaticos','facturas-viaticos',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
create policy "Leer facturas de viaticos" on storage.objects for select to authenticated
using (bucket_id = 'facturas-viaticos' and exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid()));
create policy "Subir facturas de viaticos" on storage.objects for insert to authenticated
with check (bucket_id = 'facturas-viaticos' and (
  exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid())
  or exists (select 1 from public.vac_empleados e where e.id::text = split_part(name,'/',1) and lower(e.correo_viaticos) = lower(auth.jwt()->>'email'))
));
create policy "Quitar carga fallida de viaticos" on storage.objects for delete to authenticated
using (bucket_id = 'facturas-viaticos' and (
  exists (select 1 from public.viaticos_admins a where a.user_id = auth.uid())
  or exists (select 1 from public.vac_empleados e where e.id::text = split_part(name,'/',1) and lower(e.correo_viaticos) = lower(auth.jwt()->>'email'))
));

commit;

-- Después de crear al administrador en Authentication > Users:
insert into public.viaticos_admins(user_id)
select id from auth.users where lower(email) = 'jogomez@fogel-group.com'
on conflict (user_id) do nothing;
-- Si este INSERT afectó 0 filas, primero crea y confirma ese usuario en
-- Authentication > Users, y luego ejecuta de nuevo solo el INSERT anterior.
-- Crear cada cuenta de técnico en Authentication > Users con el correo que se
-- registra en Personal. El correo debe estar confirmado para poder iniciar sesión.
