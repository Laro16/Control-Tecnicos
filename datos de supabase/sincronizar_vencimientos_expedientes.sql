-- Ejecutar COMPLETO una vez si ya existen expedientes autorizados con fecha.
-- Copia únicamente series que todavía no tienen ninguna revisión en
-- garantias_vencimientos. No reemplaza correcciones manuales, ni siquiera
-- una revisión nula que haya devuelto voluntariamente la serie al cálculo automático.
begin;

insert into public.garantias_vencimientos (serie, fecha_vencimiento)
select pendiente.serie, pendiente.fecha_vencimiento
from (
  select distinct on (expediente.serie)
    expediente.serie,
    expediente.fecha_vencimiento
  from public.garantias_expedientes expediente
  where expediente.estado = 'Autorizado'
    and expediente.motivo in ('Despacho', 'Factura de venta')
    and expediente.fecha_vencimiento is not null
  order by expediente.serie, expediente.actualizado_en desc, expediente.id desc
) pendiente
where not exists (
  select 1
  from public.garantias_vencimientos existente
  where existente.serie = pendiente.serie
);

commit;
