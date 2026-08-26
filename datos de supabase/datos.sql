-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.pendientes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  fecha date,
  prioridad text DEFAULT 'Media'::text CHECK (prioridad = ANY (ARRAY['Baja'::text, 'Media'::text, 'Alta'::text])),
  estado text DEFAULT 'Pendiente'::text,
  created_at timestamp with time zone DEFAULT now(),
  tipo text DEFAULT 'Tarea'::text,
  orden text,
  correlativo text,
  negocio text,
  nit text,
  direccion text,
  archivos ARRAY DEFAULT '{}'::text[],
  CONSTRAINT pendientes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.excel_sync (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  tickets_json text,
  filename text,
  upload_date text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT excel_sync_pkey PRIMARY KEY (id)
);
CREATE TABLE public.vac_empleados (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  puesto text,
  fecha_ingreso date,
  dias_descanso ARRAY NOT NULL DEFAULT '{0,6}'::smallint[],
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  codigo text,
  CONSTRAINT vac_empleados_pkey PRIMARY KEY (id)
);
CREATE TABLE public.vac_asuetos (
  fecha date NOT NULL,
  descripcion text NOT NULL,
  CONSTRAINT vac_asuetos_pkey PRIMARY KEY (fecha)
);
CREATE TABLE public.vac_goces (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  dias_habiles integer NOT NULL DEFAULT 0,
  observaciones text,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vac_goces_pkey PRIMARY KEY (id),
  CONSTRAINT vac_goces_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.vac_empleados(id)
);