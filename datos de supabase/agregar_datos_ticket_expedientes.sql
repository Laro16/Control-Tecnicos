-- Ejecutar COMPLETO una vez si activar_expedientes_garantia.sql ya se ejecutó.
-- Agrega una instantánea de los datos del Excel a cada expediente existente o nuevo.
begin;

alter table public.garantias_expedientes
  add column if not exists datos_ticket jsonb not null default '{}'::jsonb;

create or replace function public.guardar_expediente_garantia(p_datos jsonb, p_revision integer)
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
 if p_datos ? 'datos_ticket' and jsonb_typeof(p_datos->'datos_ticket') is distinct from 'object' then raise exception 'Datos del ticket inválidos.'; end if;
 if p_datos->>'estado' = 'Autorizado' then
   if jsonb_array_length(p_datos->'archivos') = 0 or length(trim(coalesce(p_datos->>'autorizado_por',''))) = 0 then raise exception 'Falta respaldo o responsable.'; end if;
   if p_datos->>'motivo' in ('Despacho','Factura de venta') and nullif(p_datos->>'fecha_vencimiento','') is null then raise exception 'Falta vencimiento.'; end if;
 end if;
 if anterior.id is not null and anterior.serie <> p_datos->>'serie' then raise exception 'No se puede cambiar la serie de un expediente existente.'; end if;
 insert into public.garantias_expedientes (referencia,serie,cliente,motivo,estado,fecha_vencimiento,explicacion,autorizado_por,datos_ticket,archivos)
 values (ref,p_datos->>'serie',coalesce(p_datos->>'cliente',''),p_datos->>'motivo',p_datos->>'estado',case when p_datos->>'motivo' in ('Despacho','Factura de venta') then nullif(p_datos->>'fecha_vencimiento','')::date end,p_datos->>'explicacion',coalesce(p_datos->>'autorizado_por',''),coalesce(p_datos->'datos_ticket','{}'::jsonb),p_datos->'archivos')
 on conflict (referencia) do update set motivo=excluded.motivo,estado=excluded.estado,fecha_vencimiento=excluded.fecha_vencimiento,explicacion=excluded.explicacion,autorizado_por=excluded.autorizado_por,datos_ticket=excluded.datos_ticket,archivos=excluded.archivos,revision=garantias_expedientes.revision+1,actualizado_en=now()
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

commit;
