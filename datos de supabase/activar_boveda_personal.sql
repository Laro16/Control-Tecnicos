-- Ejecutar una vez después de activar_viaticos.sql.
-- No guarda contraseñas en texto plano. Solo la Edge Function con service_role
-- puede leer o escribir los datos cifrados.
begin;

create table if not exists public.personal_claves_boveda (
  empleado_id uuid primary key references public.vac_empleados(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  cifrado text not null,
  nonce text not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid not null references auth.users(id),
  vigente boolean not null default false
);

alter table public.personal_claves_boveda enable row level security;
revoke all on table public.personal_claves_boveda from anon, authenticated;
-- Sin políticas RLS para clientes: ni técnicos ni administradores pueden
-- consultar la tabla directamente. La función valida el rol y reautentica.

commit;
