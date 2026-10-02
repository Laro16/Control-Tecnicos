# Activar Preventivos

1. En Supabase, abre SQL Editor y ejecuta completo `activar_preventivos.sql`.
2. Publica la versión actualizada de la aplicación en Vercel.
3. Vuelve a subir tu Excel diario desde Técnicos. Cada N° ORDEN se guarda una sola vez; una carga posterior actualiza la orden sin duplicarla ni borrar las asignaciones manuales.

El calendario está en `src/Mantenimientos.xlsx`. Para actualizar restaurantes o meses, reemplaza ese archivo manteniendo los encabezados y publica nuevamente. Los locales con ESTADO 2 = CERRADO están excluidos. México queda pendiente de su catálogo.

Se cuentan todos los estados. La fecha de atención es FECHA REALIZADA, nunca FECHA INGRESO. Una atención tardía se acredita al último mes programado anterior a su atención; en Por ubicar puedes asignar el mes cuando falta la fecha o el restaurante. Las órdenes sin fecha no aparecen como actividad de una semana específica. El avance es acumulado por vuelta hasta el cierre de la semana seleccionada; las asignaciones sin fecha cuentan en la vuelta elegida, sin afirmar cuándo se atendieron.

Descargas: avance semanal en PNG y programación mensual en PNG separado para cada marca. El catálogo actual tiene 114 Granjero/Siciliana y 39 Campero activos (153 en total), de acuerdo con el archivo suministrado.

## Participación de los técnicos

Ejecuta completo `activar_preventivos_tecnicos.sql` después del script base y publica los cambios. Luego entra como administrador a Preventivos una vez: se sincroniza el calendario del Excel para validar las marcas en Supabase. Los técnicos usan las mismas cuentas que ya tienen en Personal / Supabase Auth; su portal tiene Viáticos y Preventivos, sin acceso a otros módulos. Puedes enviarles el enlace de la aplicación terminado en `/#preventivos`.

En programación se muestran primero los pendientes. **Realizado** permite declarar fecha, cantidad opcional de equipos y observación. Se guardan autor y revisiones; otro técnico no puede editar una declaración ajena. El administrador puede corregirla. **Liquidado** no es editable: indica que se detectaron órdenes únicas para ese restaurante, año y mes programado, independientemente del estado del servicio. Una orden sin fecha ni mes asignado sigue en Por ubicar; no se adivina su vuelta. Liquidado no asegura que estén registrados todos los equipos del negocio; se ve el número de órdenes detectadas y, por separado, el número declarado por el técnico.

La marca manual no cambia el reporte oficial ni inventa órdenes. Si el Excel detecta el trabajo sin declaración previa, se muestran ambos indicadores activos, con origen Excel. Los filtros permiten ver pendientes de realizar, realizados por liquidar, liquidados o todos. Las marcas de un mes/año no se trasladan al siguiente. El tablero consulta cambios cada minuto mientras está visible, sin recargar la página al volver a una pestaña.

La programación se presenta como lista compacta, con los dos cheques siempre visibles y el detalle desplegable desde el nombre o el botón Detalle. Dentro de la marca GRANJERO, un código que empieza por 7 se muestra como Siciliana; los demás como Granjero. Campero no se reclasifica por su código. El filtro distingue las tres categorías, pero el almacenamiento y el reporte combinado Granjero/Siciliana conservan su lógica anterior. Este ajuste de presentación no requiere SQL adicional.

Los nuevos permisos sólo permiten consultar datos de Preventivos y registrar declaraciones mediante una función que valida el usuario, el local, el mes y la revisión. No se amplían los permisos de escritura sobre las órdenes importadas ni los de otros módulos. Referencia de los controles utilizados: [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) y [funciones de base de datos](https://supabase.com/docs/guides/database/functions).
