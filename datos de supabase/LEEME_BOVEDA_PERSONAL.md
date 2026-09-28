# Activar bóveda de contraseñas en Personal

La bóveda permite que un administrador asigne o cambie la contraseña de Viáticos y la consulte después de confirmar su propia contraseña. La clave del técnico se cifra en Supabase; no se envía al navegador hasta una consulta autorizada. Supabase Auth por sí solo no permite recuperar las contraseñas anteriores.

1. Ejecuta `activar_boveda_personal.sql` en el SQL Editor del proyecto Supabase, después de `activar_viaticos.sql`.
2. Genera una clave aleatoria de 32 bytes en PowerShell:

   ```powershell
   [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
   ```

3. En Supabase → Edge Functions → Secrets, crea `PERSONAL_VAULT_KEY_B64` con ese valor. Consérvalo en un gestor de secretos: si se pierde, las contraseñas almacenadas no se podrán descifrar. Nunca lo pongas en GitHub, Vercel ni en una variable `VITE_`.
4. Despliega la función `supabase/functions/personal-vault` en el mismo proyecto. Mantén habilitada la verificación de JWT. Con Supabase CLI: `supabase functions deploy personal-vault --project-ref TU_PROJECT_REF`.
5. Publica la versión actualizada de la aplicación. Ingresa con una cuenta incluida en `viaticos_admins`.

Para una cuenta ya creada, edita su ficha y asígnale una **nueva** contraseña. La clave anterior de Supabase Auth no se puede leer. La nueva reemplaza la contraseña de acceso del técnico y queda disponible en Personal como asteriscos; «Ver» exige la contraseña del administrador y la muestra durante 30 segundos.

La función rechaza intentos de cambiar desde Personal una cuenta que figure en `viaticos_admins`. La tabla cifrada no tiene políticas de lectura para el navegador. Si falla la actualización de Auth, la entrada queda pendiente y no revela una contraseña posiblemente desactualizada; vuelve a asignarla desde Personal.
