-- Ejecutar COMPLETO una vez si activar_expedientes_garantia.sql ya fue ejecutado.
-- Si todavía no se activaron los expedientes, usa únicamente la versión
-- actualizada de activar_expedientes_garantia.sql.
begin;
alter table public.garantias_expedientes
  drop constraint if exists garantias_expedientes_motivo_check;
alter table public.garantias_expedientes
  drop constraint if exists garantias_expedientes_sin_cobertura_check;
alter table public.garantias_expedientes
  add constraint garantias_expedientes_motivo_check
  check (motivo in ('Despacho','Factura de venta','Reparación','Excepción','Sin garantía confirmada'));
alter table public.garantias_expedientes
  add constraint garantias_expedientes_sin_cobertura_check
  check (motivo <> 'Sin garantía confirmada' or estado <> 'Autorizado');
commit;
