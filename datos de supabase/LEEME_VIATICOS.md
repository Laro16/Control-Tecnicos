# Activar Viáticos

1. En Supabase → Authentication → Users, crea las dos cuentas administradoras (`jogomez@fogel-group.com` y `luis21aro@gmail.com`) con sus contraseñas elegidas allí. Confirma ambos correos si Auth lo solicita. Nunca guardes las contraseñas en este repositorio ni en SQL.
2. Si Viáticos aún no existe en Supabase, ejecuta **completo** `activar_viaticos.sql`. La última consulta agrega las dos cuentas a `viaticos_admins` si ya existen en Authentication.
3. Si Viáticos ya estaba activado, o creaste alguna cuenta después, ejecuta solamente `autorizar_administradores.sql`. Revisa el resultado: para ambos correos, `existe_en_auth`, `correo_confirmado` y `acceso_general` deben ser `true`.
4. En Personal → Editar, agrega el correo de cada técnico. Si introduces contraseña, al guardar se crea su cuenta mediante Supabase Auth. Deja la contraseña vacía cuando la cuenta ya exista.
5. El administrador entra en el menú **Viáticos**. El botón **Copiar enlace para técnicos** genera el acceso directo `#viaticos` para compartir.

El acceso al panel principal ahora requiere iniciar sesión con una cuenta incluida en `viaticos_admins`. Ambas cuentas indicadas arriba tendrán acceso general y de administración de Viáticos. Una cuenta de técnico asociada a Personal queda dirigida al formulario de facturas; no ve el panel principal. Si una cuenta administradora todavía no está creada en Authentication o no está incluida en `viaticos_admins`, hay que completar los pasos 1 a 3 antes de usarla.

Los comprobantes se guardan en un bucket privado. El módulo no funciona hasta ejecutar el SQL; el código no contiene ninguna contraseña. Los gastos sin foto se muestran al administrador por separado y él puede adjuntar el comprobante más adelante. El técnico ve el formulario de ingreso y sus propias entregas para confirmar la recepción, pero no ve saldos, gastos anteriores de otros técnicos ni reportes generales.

Si activaste Viáticos con una versión anterior de `activar_viaticos.sql`, ejecuta también `restringir_viaticos_tecnicos.sql` para retirar la lectura de los movimientos y comprobantes a las cuentas de técnicos. No repitas el script de activación completo.

Para respaldar cada nueva entrega, ejecuta **una vez** `confirmar_entregas_viaticos.sql` después de los scripts anteriores. No repitas `activar_viaticos.sql`. Desde entonces una transferencia nueva requiere foto; el administrador puede consultar el comprobante en el bucket privado existente `facturas-viaticos`. Cada técnico solo puede leer sus propias entregas y confirmarlas con su cuenta. Supabase guarda la hora y el usuario de la confirmación, y el recibo PDF de efectivo indica claramente si está pendiente o confirmado. Las transferencias anteriores al cambio pueden seguir sin foto y quedan identificadas como registros anteriores.

La PWA **Ticket Manager** se instala desde el navegador una vez desplegada en Vercel con HTTPS: en Android/Chrome usa «Instalar aplicación»; en iPhone/Safari usa Compartir → «Agregar a pantalla de inicio». El acceso al formulario sigue necesitando conexión para guardar datos y subir comprobantes; el modo sin conexión solo permite abrir la interfaz previamente cargada. La PWA no almacena movimientos ni facturas en su caché.
