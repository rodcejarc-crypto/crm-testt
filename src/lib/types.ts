// Tipos compartidos por toda la aplicación. Reflejan las columnas
// de las tablas creadas en supabase/migrations/0001_init.sql

export type PipelineKey = "ventas" | "licitaciones" | "recuperacion";

export type CategoriaCliente = "Distribuidor" | "Cliente empresa";
export const CATEGORIAS_CLIENTE: CategoriaCliente[] = ["Distribuidor", "Cliente empresa"];

export type TipoCliente = "Nuevo" | "Cartera";
export type NivelCuenta = "Estratégica" | "Crecimiento" | "Estándar";

// "admin_unidad": ve y opera el CRM igual que un administrador (dashboard,
// clientes, ventas, vendedores), pero limitado a su propia unidad de
// negocio (ver src/lib/unidades.ts). No crea/borra vendedores ni cambia
// metas — eso lo sigue haciendo solo un "admin".
export type RolVendedor = "admin" | "vendedor" | "admin_unidad";

export interface Vendedor {
  id: string;
  nombre: string;
  email: string | null;
  activo: boolean;
  auth_user_id: string | null;
  rol: RolVendedor;
  unidad_negocio: string | null;
  /** Vendedores de campo: son los únicos (con la administración) que usan el módulo de Visitas. */
  hace_visitas_campo: boolean;
  /** Llamadas de cartera que debe hacer cada día (null = no está en el programa). */
  meta_llamadas_diarias: number | null;
}

export interface Cliente {
  id: string;
  empresa: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  redes_sociales: string | null;
  direccion: string | null;
  ciudad: string | null;
  estado: string | null;
  rfc: string | null;
  tipo_cliente: TipoCliente;
  cuenta_clave: string | null;
  dueno_comercial_id: string | null;
  nivel_cuenta: NivelCuenta;
  id_externo: string | null;
  grupo_id: string | null;
  comisionista: string | null;
  categoria_cliente: CategoriaCliente | null;
  descartado: boolean;
  motivo_descarte: string | null;
  /** Categoría del descarte (lista fija); null en los descartes viejos sin clasificar. */
  motivo_descarte_tipo: string | null;
  descartado_en: string | null;
  descartado_por: string | null;
  ultima_compra: string | null;
  total_historico: number | null;
  /** Lista de la que viene el prospecto (null = cartera de siempre). */
  origen: string | null;
  /** Todo lo que se sabe del prospecto (datos de la lista y validación contra el CRM). */
  observaciones: string | null;
  prioridad_prospecto: number | null;
  created_at: string;
  updated_at: string;
  dueno?: Pick<Vendedor, "id" | "nombre" | "unidad_negocio"> | null;
  grupo?: Pick<GrupoCliente, "id" | "nombre"> | null;
  descartado_por_vendedor?: Pick<Vendedor, "id" | "nombre"> | null;
}

/** Grupo empresarial: varias razones sociales que pertenecen a una misma empresa. */
export interface GrupoCliente {
  id: string;
  nombre: string;
}

export type MotivoPerdida =
  | "precio"
  | "servicio"
  | "cambio_proveedor"
  | "sin_presupuesto"
  | "sin_respuesta"
  | "otro";

export type EstadoCierre = "abierta" | "ganada" | "perdida" | "cliente_activo";
export type PrioridadRecuperacion = "Alta" | "Media" | "Baja";

export interface Oportunidad {
  id: string;
  cliente_id: string;
  pipeline: PipelineKey;
  etapa: string;
  estado_cierre: EstadoCierre;
  motivo_perdida: MotivoPerdida | null;
  motivo_perdida_detalle: string | null;
  fecha_cierre: string | null;
  dueno_comercial_id: string | null;
  valor_estimado: number | null;
  notas: string | null;
  pares_vendidos: number | null;
  orden_compra: string | null;
  /** 'venta_directa' = el cliente ya hizo su pedido: no pasa por el embudo ni genera seguimientos. */
  origen: "embudo" | "venta_directa";
  /** Si nació al reactivar un cliente de Recuperación, la oportunidad de Recuperación de la que viene. */
  origen_recuperacion_id: string | null;

  // Licitaciones
  entidad_convocante: string | null;
  fecha_limite_entrega: string | null;
  monto_estimado: number | null;
  monto_garantia: number | null;
  bid_alineacion: boolean | null;
  bid_capacidad: boolean | null;
  bid_rentabilidad: boolean | null;
  bid_probabilidad: boolean | null;

  // Recuperación
  motivo_perdida_original: MotivoPerdida | null;
  fecha_ultima_compra: string | null;
  facturacion_historica: number | null;
  diagnostico: string | null;
  prioridad_recuperacion: PrioridadRecuperacion | null;

  // Contexto de meta (ej. "B2B" / "Tienda") para vendedores con más de
  // una meta el mismo mes. Ver metas_mensuales.etiqueta.
  contexto_meta: string | null;

  created_at: string;
  updated_at: string;

  cliente?: Pick<
    Cliente,
    | "id"
    | "empresa"
    | "ciudad"
    | "contacto"
    | "telefono"
    | "email"
    | "direccion"
    | "dueno_comercial_id"
    | "rfc"
  > | null;
  dueno?: Pick<Vendedor, "id" | "nombre"> | null;
}

/**
 * Resultado de la búsqueda global de clientes (solo lectura): puede ser un
 * cliente de cualquier vendedor, no solo del que está buscando. Trae los
 * datos mínimos para saber "¿ya existe? ¿de quién es?", nunca la ficha
 * completa.
 */
export interface ClienteBusquedaGlobal {
  id: string;
  empresa: string;
  ciudad: string | null;
  estado: string | null;
  rfc: string | null;
  tipo_cliente: TipoCliente;
  nivel_cuenta: NivelCuenta;
  dueno_comercial_id: string | null;
  dueno_nombre: string | null;
  descartado?: boolean;
}

export type TipoMeta = "vendedor" | "unidad";

export interface MetaMensual {
  id: string;
  tipo: TipoMeta;
  vendedor_id: string | null;
  unidad_negocio: string | null;
  etiqueta: string | null;
  anio_mes: string;
  meta_total_pares: number;
  piso_piel_pares: number;
  visitas_requeridas: number | null;
  visitas_para_id: string | null;
}

export type TipoVenta = "Nuevo" | "Expansión" | "Recompra" | "Licitación";
export type EstadoCobro = "Pendiente" | "Cobrada";
export type LineaProducto = "Calzado de Piel" | "PVC" | "Calzado Económico";

export const LINEAS_PRODUCTO: LineaProducto[] = [
  "Calzado de Piel",
  "PVC",
  "Calzado Económico",
];

// Además de calzado, se venden plantillas. Es una línea más del pedido
// (renglones y desglose de la venta), pero NO es calzado: no suma a los
// "pares vendidos" que alimentan metas y dashboard, ni entra a tarifas.
export const LINEA_PLANTILLAS = "Plantillas" as const;
// "Flete" es el cargo por envío a clientes pequeños: suma al total facturado,
// no a los pares. No se elige en el desplegable de línea (tiene su propio campo).
export const LINEA_FLETE = "Flete" as const;
export type LineaPedido = LineaProducto | typeof LINEA_PLANTILLAS | typeof LINEA_FLETE;
export const LINEAS_PEDIDO: LineaPedido[] = [...LINEAS_PRODUCTO, LINEA_PLANTILLAS];
export const LINEAS_DESGLOSE: LineaPedido[] = [...LINEAS_PEDIDO, LINEA_FLETE];

export interface VentaCerrada {
  id: string;
  oportunidad_id: string;
  fecha_cierre: string;
  cliente_id: string | null;
  empresa: string;
  dueno_comercial_id: string | null;
  vendedor_nombre: string | null;
  unidad_negocio: string | null;
  pipeline: PipelineKey;
  tipo_venta: TipoVenta;
  factura: string | null;
  orden_compra: string | null;
  pares_vendidos: number | null;
  total_facturado: number | null;
  precio_promedio: number | null;
  estado_cobro: EstadoCobro;
  fecha_cobro: string | null;
  contexto_meta: string | null;
}

export interface VentaLinea {
  id: string;
  venta_id: string;
  linea: LineaPedido;
  pares: number;
  monto: number;
}

export interface VentaCancelacion {
  id: string;
  venta_id: string;
  fecha: string;
  pares: number;
  monto: number;
  motivo: string | null;
  registrado_por: string | null;
}

export interface TarifaMensual {
  id: string;
  anio_mes: string;
  linea: LineaProducto;
  /** Tarifa cuando el vendedor SÍ llegó a "la llave" (85% de su piso de Piel). */
  tarifa_por_par: number;
  /** Tarifa cuando NO llegó a la llave. Piel ignora esto (siempre usa tarifa_por_par). */
  tarifa_sin_llave: number;
}

export interface ReglaAcelerador {
  id: string;
  anio_mes: string;
  /** % de cumplimiento del piso de Piel a partir del cual aplica este bono. */
  umbral_pct: number;
  multiplicador: number;
  /** $ extra por par dentro de este tramo (ej. 110% → +$1/par). */
  bono_por_par: number;
  orden: number;
}

export type EstadoVisita = "agendada" | "realizada";

export interface Visita {
  id: string;
  fecha: string;
  vendedor_id: string;
  realizada_para_id: string;
  estado: EstadoVisita;
  notas: string | null;
  cliente_id: string | null;
  oportunidad_id: string | null;
  created_at: string;
  vendedor?: Pick<Vendedor, "id" | "nombre"> | null;
  realizada_para?: Pick<Vendedor, "id" | "nombre"> | null;
  cliente?: { id: string; empresa: string } | null;
  oportunidad?: { id: string; pipeline: PipelineKey; etapa: string } | null;
}

export interface HistorialEtapa {
  id: string;
  oportunidad_id: string;
  etapa_anterior: string | null;
  etapa_nueva: string;
  nota: string | null;
  fecha: string;
}

export type TipoTarea =
  | "seguimiento_venta"
  | "seguimiento_recuperacion"
  | "seguimiento_licitacion"
  | "licitacion_entrega"
  | "checkin_cuenta_clave"
  | "llamada_cartera";

export type ResultadoLlamada =
  | "contesto_interesado"
  | "contesto_no_interesa"
  | "no_contesto"
  | "numero_equivocado"
  | "llamar_despues"
  | "misma_razon_social"
  | "gestion_activa"
  | "no_apto"
  | "otro";

export type EstadoTarea = "pendiente" | "completada" | "cancelada";

export interface Tarea {
  id: string;
  tipo: TipoTarea;
  titulo: string;
  fecha_vencimiento: string;
  hora_vencimiento: string | null;
  estado: EstadoTarea;
  oportunidad_id: string | null;
  cliente_id: string | null;
  dueno_comercial_id: string | null;
  nota: string | null;
  detalle: string | null;
  muestra_id: string | null;
  muestra_rol: "recepcion" | "revision" | "final" | "extra" | null;
  resultado_prueba: ResultadoPrueba | null;
  completada_at: string | null;
  created_at: string;
  oportunidad?: {
    id: string;
    pipeline: PipelineKey;
    cliente_id: string;
    cliente?: { id: string; empresa: string } | null;
  } | null;
  muestra?: { id: string; fecha_fin_prueba: string | null; estado: EstadoMuestra } | null;
  cliente?: { id: string; empresa: string; ciudad?: string | null; telefono?: string | null; email?: string | null; contacto?: string | null; observaciones?: string | null; origen?: string | null } | null;
  dueno?: Pick<Vendedor, "id" | "nombre"> | null;
}

export interface OportunidadPartida {
  id: string;
  oportunidad_id: string;
  estilo: string;
  linea: LineaPedido | null;
  pares: number;
  pares_embarcados: number | null;
  precio_unitario: number;
  monto: number;
  monto_embarcado: number;
  orden: number;
}

/** Comentario de gerencia (o respuesta del vendedor) sobre una oportunidad o un seguimiento. */
export interface Comentario {
  id: string;
  oportunidad_id: string;
  seguimiento_id: string | null;
  autor_id: string | null;
  texto: string;
  creado_en: string;
  leido_por_dueno: boolean;
  autor?: Pick<Vendedor, "id" | "nombre" | "rol"> | null;
}

// ------------------------------------------------------------------ Muestras
export type EstadoMuestra =
  | "solicitada"
  | "aprobada"
  | "rechazada"
  | "entregada"
  | "en_prueba"
  | "evaluada"
  | "cerrada";
export type ResultadoPrueba = "va_bien" | "observaciones" | "rechazada" | "sin_respuesta";
export type ResultadoMuestra = "aprobada_cliente" | "rechazada" | "sin_respuesta";
export type UnidadPrueba = "dias" | "semanas" | "meses";

export interface MuestraRenglon {
  id: string;
  muestra_id: string;
  estilo: string;
  linea: LineaProducto | "Plantillas";
  talla: string | null;
  pares: number;
  pares_solicitados: number;
  orden: number;
}

export interface Muestra {
  id: string;
  oportunidad_id: string;
  cliente_id: string | null;
  vendedor_id: string | null;
  creado_en: string;
  estado: EstadoMuestra;
  ficha_cliente: Record<string, string>;
  justificacion_necesidad: string | null;
  justificacion_modelos: string | null;
  prueba_valor: number | null;
  prueba_unidad: UnidadPrueba | null;
  aprobado_por: string | null;
  fecha_aprobacion: string | null;
  motivo_rechazo: string | null;
  fecha_entrega: string | null;
  forma_entrega: "en_persona" | "paqueteria" | "cliente_recoge" | null;
  recibio: string | null;
  evaluador_nombre: string | null;
  evaluador_contacto: string | null;
  fecha_fin_prueba: string | null;
  ultimo_resultado_prueba: ResultadoPrueba | null;
  devolucion: "se_devuelve" | "se_queda_sin_costo" | "se_cobra" | null;
  resultado: ResultadoMuestra | null;
  motivo_resultado: string | null;
  comentarios_usuario: string | null;
  comentario_cierre: string | null;
  evaluada_en: string | null;
  cerrada_en: string | null;
  renglones?: MuestraRenglon[];
  vendedor?: Pick<Vendedor, "id" | "nombre"> | null;
  aprobador?: Pick<Vendedor, "id" | "nombre"> | null;
  cliente?: { id: string; empresa: string } | null;
  oportunidad?: {
    id: string;
    pipeline: PipelineKey;
    etapa: string;
    estado_cierre: EstadoCierre;
    valor_estimado: number | null;
  } | null;
}

export interface MuestraHistorial {
  id: string;
  muestra_id: string;
  tipo: string;
  descripcion: string | null;
  motivo: string | null;
  por: string | null;
  creado_en: string;
  autor?: Pick<Vendedor, "id" | "nombre"> | null;
}
