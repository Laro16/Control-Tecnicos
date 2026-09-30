# Activar Preventivos

1. En Supabase, abre SQL Editor y ejecuta completo `activar_preventivos.sql`.
2. Publica la versión actualizada de la aplicación en Vercel.
3. Vuelve a subir tu Excel diario desde Técnicos. Cada N° ORDEN se guarda una sola vez; una carga posterior actualiza la orden sin duplicarla ni borrar las asignaciones manuales.

El calendario está en `src/Mantenimientos.xlsx`. Para actualizar restaurantes o meses, reemplaza ese archivo manteniendo los encabezados y publica nuevamente. Los locales con ESTADO 2 = CERRADO están excluidos. México queda pendiente de su catálogo.

Se cuentan todos los estados. La fecha de atención es FECHA REALIZADA, nunca FECHA INGRESO. Una atención tardía se acredita al último mes programado anterior a su atención; en Por ubicar puedes asignar el mes cuando falta la fecha o el restaurante. Las órdenes sin fecha no aparecen como actividad de una semana específica. El avance es acumulado por vuelta hasta el cierre de la semana seleccionada; las asignaciones sin fecha cuentan en la vuelta elegida, sin afirmar cuándo se atendieron.

Descargas: avance semanal en PNG y programación mensual en PNG separado para cada marca. El catálogo actual tiene 114 Granjero/Siciliana y 39 Campero activos (153 en total), de acuerdo con el archivo suministrado.
