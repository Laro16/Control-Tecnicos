-- Ejecutar en SQL Editor DESPUÉS de crear ambos usuarios en
-- Authentication > Users y de activar_viaticos.sql.
-- No guarda contraseñas ni crea usuarios de Authentication.
insert into public.viaticos_admins (user_id)
select id from auth.users
where lower(email) in ('jogomez@fogel-group.com', 'luis21aro@gmail.com')
on conflict (user_id) do nothing;

-- Comprueba las tres condiciones para cada correo. Todas deben ser true.
select correos.email,
       usuarios.id is not null as existe_en_auth,
       usuarios.email_confirmed_at is not null as correo_confirmado,
       administradores.user_id is not null as acceso_general
from (values ('jogomez@fogel-group.com'), ('luis21aro@gmail.com')) as correos(email)
left join auth.users as usuarios on lower(usuarios.email) = correos.email
left join public.viaticos_admins as administradores on administradores.user_id = usuarios.id
order by correos.email;
