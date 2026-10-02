-- Ejecutar COMPLETO después de activar_preventivos_tecnicos.sql.
-- Añade el técnico del Excel a la consulta de Preventivos del portal técnico.
-- No cambia las órdenes, los cierres ni los permisos de escritura.
begin;

-- PostgreSQL requiere recrear una función al agregar columnas a RETURNS TABLE.
drop function if exists public.consultar_ordenes_preventivos();
create function public.consultar_ordenes_preventivos()
returns table (numero_orden text, marca text, codigo text, negocio text, fecha_realizada date,
  anio_programado integer, mes_programado integer, detectado_en timestamptz, tecnico text)
language plpgsql stable security definer set search_path = '' as $ordenes$
begin
  if not public.tiene_acceso_preventivos() then raise exception 'No tienes acceso a Preventivos.'; end if;
  return query select o.numero_orden, o.marca, o.codigo, o.negocio, o.fecha_realizada,
    o.anio_programado, o.mes_programado, o.detectado_en, o.tecnico from public.preventivos_ordenes o;
end;
$ordenes$;
revoke all on function public.consultar_ordenes_preventivos() from public, anon;
grant execute on function public.consultar_ordenes_preventivos() to authenticated;

notify pgrst, 'reload schema';
commit;
