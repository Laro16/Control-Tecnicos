# Activar Preventivos

1. En Supabase, abre SQL Editor y ejecuta completo `activar_preventivos.sql`.
2. Publica la versión actualizada de la aplicación en Vercel.
3. Vuelve a subir tu Excel diario desde Técnicos. Cada N° ORDEN se guarda una sola vez; una carga posterior actualiza la orden sin duplicarla ni borrar las asignaciones manuales.

El calendario está en `src/Mantenimientos.xlsx`. Para actualizar restaurantes o meses, reemplaza ese archivo manteniendo los encabezados y publica nuevamente. Los locales con ESTADO 2 = CERRADO están excluidos. México queda pendiente de su catálogo.

Se cuentan todos los estados. La fecha de atención es FECHA REALIZADA, nunca FECHA INGRESO. Una atención tardía se acredita al último mes programado anterior a su atención; en Por ubicar puedes asignar el mes cuando falta la fecha o el restaurante. Las órdenes sin fecha no aparecen como actividad de una semana específica. El avance es acumulado por vuelta hasta el cierre de la semana seleccionada; las asignaciones sin fecha cuentan en la vuelta elegida, sin afirmar cuándo se atendieron.

Descargas: avance semanal en PNG y programación mensual en PNG separado para cada marca. El catálogo actual tiene 114 Granjero/Siciliana y 39 Campero activos (153 en total), de acuerdo con el archivo suministrado.

## Participación de los técnicos

Ejecuta completo `activar_preventivos_tecnicos.sql` después del script base y publica los cambios. Luego entra como administrador a Preventivos una vez: se sincroniza el calendario del Excel para validar las marcas en Supabase. Los técnicos usan las mismas cuentas que ya tienen en Personal / Supabase Auth; su portal tiene Viáticos y Preventivos, sin acceso a otros módulos. Puedes enviarles el enlace de la aplicación terminado en `/#preventivos`.

En programación hay tres estados: **Pendiente**, si no existe marca manual ni orden válida del periodo; **Pendiente de liquidar**, cuando lo marca un administrador/técnico y aún no tiene orden en Excel; y **Finalizado**, cuando se detecta una orden válida para ese restaurante, año y mes programado, con o sin marca manual. El estado de la orden del Excel no limita el conteo. Una orden sin fecha ni mes asignado sigue en Por ubicar; no se adivina su vuelta.

La marca manual permite declarar fecha, cantidad opcional de equipos y observación. Se guardan autor y revisiones; otro técnico no puede editar una declaración ajena. El administrador puede corregirla. El avance cuenta los restaurantes realizados por marca manual o Excel una sola vez, respetando la vuelta y el corte semanal, y muestra cuántos están pendientes de liquidar y cuántos finalizados. El porcentaje realizado incluye ambos. Los equipos del resumen siguen contando órdenes únicas del Excel, sin sumar los equipos declarados. El detalle conserva ambos datos y el técnico/fecha de cada orden. Las marcas de un mes/año no se trasladan al siguiente. El tablero consulta cambios cada minuto mientras está visible, sin recargar la página al volver a una pestaña.

La programación se presenta en fichas, con los pendientes primero y el detalle desplegable desde el nombre o el botón Detalle. Los filtros permiten ver Todos, Pendientes, Pendientes de liquidar o Finalizados; las imágenes mensuales usan los mismos estados. Dentro de GRANJERO, un código que empieza por 7 se muestra como Siciliana; los demás como Granjero. Campero no se reclasifica por su código. El filtro mantiene unidos Granjero/Siciliana. Los estados se calculan con los datos existentes: este cambio no requiere ejecutar SQL adicional ni repetir los scripts anteriores.

Los nuevos permisos sólo permiten consultar datos de Preventivos y registrar declaraciones mediante una función que valida el usuario, el local, el mes y la revisión. No se amplían los permisos de escritura sobre las órdenes importadas ni los de otros módulos. Referencia de los controles utilizados: [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) y [funciones de base de datos](https://supabase.com/docs/guides/database/functions).

## Excluir órdenes eliminadas o no realizadas

Con Preventivos ya instalado, ejecuta completo únicamente `activar_exclusiones_preventivos.sql` y publica los cambios de la app. No repitas después los scripts anteriores: la nueva consulta del portal técnico ya conserva técnico y fecha, y además omite las órdenes excluidas.

Sólo el administrador ve **Excluir orden**, por número de orden, en Por ubicar y en el detalle de las fichas. Se confirma con motivo; queda guardado quién lo hizo y cuándo. **Órdenes excluidas** reúne todos los meses y años, permite buscar, consultar el historial y restaurar individualmente.

Una exclusión se almacena aparte del Excel: volver a importar una orden la actualiza, pero no la reactiva. No se borra ninguna orden. Las excluidas no cuentan en avances, equipos, actividad semanal ni Por ubicar; tampoco se envían al portal técnico. Restaurarlas recupera su mes programado, o las devuelve a Por ubicar si faltaba asignarlo.

Las demás órdenes y marcas manuales no se modifican. El preventivo vuelve a Pendiente sólo si no tiene otra orden válida ni marca manual de Realizado. No se eliminan automáticamente órdenes por estar ausentes en un Excel nuevo.
