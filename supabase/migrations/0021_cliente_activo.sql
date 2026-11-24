-- ============================================================================
-- CRM Rhinoboots — "Pasar a cliente activo": un cliente en Recuperación que ya
-- volvió a comprar sale del tablero de Recuperación (queda cerrado con estado
-- 'cliente_activo'; no cuenta como venta ni se registra en Ventas). Sus
-- seguimientos pendientes se cancelan solos con el trigger existente, que
-- reacciona a cualquier estado distinto de 'abierta'.
-- ============================================================================
alter table oportunidades drop constraint if exists oportunidades_estado_cierre_check;
alter table oportunidades
  add constraint oportunidades_estado_cierre_check
  check (estado_cierre in ('abierta', 'ganada', 'perdida', 'cliente_activo'));
