-- Ejecutar COMPLETO una vez, después de activar_vencimientos_garantia.sql.
-- No reemplaza vencimientos anteriores ni modifica particulares.
-- Mantiene el modelo SIN LOGIN de la app: cualquiera con acceso a la app/API
-- puede consultar expedientes y respaldos. El bucket no tiene URL pública,
-- pero estas políticas NO sustituyen autenticación. No subir datos sensibles
-- sin incorporar primero acceso autenticado.
begin;
create table public.garantias_expedientes (
 id bigint generated always as identity primary key,
 referencia text not null unique check (length(trim(referencia)) > 0),
 serie text not null check (serie ~ '^[A-Z0-9]{7,40}$' and serie ~ '[0-9]'),
 cliente text not null default '',
 motivo text not null check (motivo in ('Despacho','Factura de venta','Reparación','Excepción')),
 estado text not null check (estado in ('Pendiente de respaldo','En revisión','Autorizado','Rechazado','Cerrado')),
 fecha_vencimiento date check (fecha_vencimiento between date '1900-01-01' and date '9999-12-31'),
 explicacion text not null,
 autorizado_por text not null default '',
 archivos jsonb not null default '[]',
 revision integer not null default 1,
 actualizado_en timestamptz not null default now()
);
create index on public.garantias_expedientes (serie);
create table public.garantias_expedientes_revisiones (
 id bigint generated always as identity primary key,
 expediente_id bigint not null references public.garantias_expedientes(id),
 datos jsonb not null,
 registrado_en timestamptz not null default now()
);
alter table public.garantias_expedientes enable row level security;
alter table public.garantias_expedientes_revisiones enable row level security;
revoke all on public.garantias_expedientes, public.garantias_expedientes_revisiones from anon, authenticated;
grant select on public.garantias_expedientes, public.garantias_expedientes_revisiones to anon, authenticated;
create policy "Leer expedientes" on public.garantias_expedientes for select to anon, authenticated using (true);
create policy "Leer revisiones" on public.garantias_expedientes_revisiones for select to anon, authenticated using (true);

-- Una sola transacción para la ficha, su revisión y el vencimiento compartido.
create function public.guardar_expediente_garantia(p_datos jsonb, p_revision integer)
returns public.garantias_expedientes
language plpgsql security definer set search_path = public
as $expediente$
declare
 anterior public.garantias_expedientes;
 actual public.garantias_expedientes;
 ref text := upper(trim(p_datos->>'referencia'));
begin
 perform pg_advisory_xact_lock(hashtextextended(ref, 0));
 select * into anterior from public.garantias_expedientes where referencia = ref for update;
 if coalesce(anterior.revision, 0) is distinct from p_revision then
   raise exception 'El expediente cambió o ya existe. Recarga antes de guardar.';
 end if;
 if length(trim(coalesce(p_datos->>'explicacion',''))) = 0 then raise exception 'Falta la explicación.'; end if;
 if jsonb_typeof(p_datos->'archivos') is distinct from 'array' then raise exception 'Archivos inválidos.'; end if;
 if p_datos->>'estado' = 'Autorizado' then
   if jsonb_array_length(p_datos->'archivos') = 0 or length(trim(coalesce(p_datos->>'autorizado_por',''))) = 0 then raise exception 'Falta respaldo o responsable.'; end if;
   if p_datos->>'motivo' in ('Despacho','Factura de venta') and nullif(p_datos->>'fecha_vencimiento','') is null then raise exception 'Falta vencimiento.'; end if;
 end if;
 if anterior.id is not null and anterior.serie <> p_datos->>'serie' then raise exception 'No se puede cambiar la serie de un expediente existente.'; end if;
 insert into public.garantias_expedientes (referencia,serie,cliente,motivo,estado,fecha_vencimiento,explicacion,autorizado_por,archivos)
 values (ref,p_datos->>'serie',coalesce(p_datos->>'cliente',''),p_datos->>'motivo',p_datos->>'estado',case when p_datos->>'motivo' in ('Despacho','Factura de venta') then nullif(p_datos->>'fecha_vencimiento','')::date end,p_datos->>'explicacion',coalesce(p_datos->>'autorizado_por',''),p_datos->'archivos')
 on conflict (referencia) do update set motivo=excluded.motivo,estado=excluded.estado,fecha_vencimiento=excluded.fecha_vencimiento,explicacion=excluded.explicacion,autorizado_por=excluded.autorizado_por,archivos=excluded.archivos,revision=garantias_expedientes.revision+1,actualizado_en=now()
 returning * into actual;
 insert into public.garantias_expedientes_revisiones (expediente_id,datos) values (actual.id,to_jsonb(actual));
 if actual.estado = 'Autorizado' and actual.motivo in ('Despacho','Factura de venta') and
 (anterior.id is null or anterior.estado <> 'Autorizado' or anterior.fecha_vencimiento is distinct from actual.fecha_vencimiento or anterior.motivo <> actual.motivo) then
   insert into public.garantias_vencimientos (serie,fecha_vencimiento) values(actual.serie,actual.fecha_vencimiento);
 end if;
 return actual;
end;
$expediente$;
revoke all on function public.guardar_expediente_garantia(jsonb,integer) from public;
grant execute on function public.guardar_expediente_garantia(jsonb,integer) to anon,authenticated;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('respaldos-garantia','respaldos-garantia',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy "Leer respaldos garantia" on storage.objects for select to anon,authenticated using(bucket_id='respaldos-garantia');
create policy "Agregar respaldos garantia" on storage.objects for insert to anon,authenticated with check(bucket_id='respaldos-garantia');
commit;
