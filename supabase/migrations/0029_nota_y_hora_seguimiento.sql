-- ============================================================================
-- CRM Rhinoboots — al registrar un seguimiento, el vendedor deja una nota
-- (qué pasó, qué necesita el cliente) y puede programar el próximo contacto
-- con fecha Y hora (ej. "el cliente pidió que le llamen mañana a las 4").
-- ============================================================================
alter table tareas add column if not exists nota text;
alter table tareas add column if not exists hora_vencimiento time;
