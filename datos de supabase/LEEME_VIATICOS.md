# Activar Viáticos

1. En Supabase → Authentication → Users, crea la cuenta administradora con el correo indicado para administración y la contraseña que elegiste. Confirma el correo si Auth lo solicita.
2. En SQL Editor, pega y ejecuta **completo** `activar_viaticos.sql`. La última consulta agrega esa cuenta a `viaticos_admins`.
3. Si creaste la cuenta administradora después de ejecutar el script, ejecuta nuevamente solamente el `insert into public.viaticos_admins ...` que aparece al final.
4. En Vacaciones → Por persona → Editar, agrega el correo de cada técnico. Si introduces contraseña, al guardar se crea su cuenta mediante Supabase Auth. Deja la contraseña vacía cuando la cuenta ya exista.
5. El administrador entra en el menú **Viáticos**. El botón **Copiar enlace para técnicos** genera el acceso directo `#viaticos` para compartir.

El acceso al panel principal ahora requiere iniciar sesión con una cuenta incluida en `viaticos_admins`. Una cuenta de técnico asociada a Personal queda dirigida al formulario de facturas; no ve el panel principal. Si el administrador todavía no está creado en Authentication o no está incluido en `viaticos_admins`, hay que completar los pasos 1 a 3 antes de desplegar este cambio.

Los comprobantes se guardan en un bucket privado. El módulo no funciona hasta ejecutar el SQL; el código no contiene ninguna contraseña. Los gastos sin foto se muestran al administrador por separado y él puede adjuntar el comprobante más adelante. El técnico solo ve el formulario de ingreso, sin saldos, entregas, listas ni reportes.

Si activaste Viáticos con una versión anterior de `activar_viaticos.sql`, ejecuta también `restringir_viaticos_tecnicos.sql` para retirar la lectura de los movimientos y comprobantes a las cuentas de técnicos. No repitas el script de activación completo.

La PWA **Ticket Manager** se instala desde el navegador una vez desplegada en Vercel con HTTPS: en Android/Chrome usa «Instalar aplicación»; en iPhone/Safari usa Compartir → «Agregar a pantalla de inicio». El acceso al formulario sigue necesitando conexión para guardar datos y subir comprobantes; el modo sin conexión solo permite abrir la interfaz previamente cargada. La PWA no almacena movimientos ni facturas en su caché.
