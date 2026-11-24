-- ============================================================================
-- CRM Rhinoboots — descartar cliente (cliente ilocalizable / sin datos de
-- contacto): en vez de borrarlo de verdad (lo que también borraría su
-- historial de compras si alguna vez tuvo), se marca como "descartado" con
-- un motivo obligatorio y desaparece del listado normal de Clientes. Queda
-- guardado por si algún día vuelve a aparecer o hace falta revisar por qué
-- se descartó.
-- ============================================================================
alter table clientes add column if not exists descartado boolean not null default false;
alter table clientes add column if not exists motivo_descarte text;
alter table clientes add column if not exists descartado_en timestamptz;
alter table clientes add column if not exists descartado_por uuid references vendedores(id) on delete set null;

create index if not exists clientes_descartado_idx on clientes (descartado);
