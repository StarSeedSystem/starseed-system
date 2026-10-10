/*
 * tipos — el vocabulario común de MetaGeminis (2026-10-10).
 * MetaGeminis es el agente social de MetaGenesis: investiga, redacta y prepara campañas para
 * donantes, voluntarios, fondos y redes de agentes. Contrato: architecture/metageminis.md.
 *
 * Estos tipos reflejan EXACTAMENTE las tablas de supabase/migrations/20261011090000_metageminis.sql
 * (mismos nombres de columna y mismos valores permitidos). Si cambias uno, cambia el otro; una
 * prueba (src/lib/metageminis/__tests__/vocabulario.test.ts) compara los valores con la migración.
 */

// ───────────────────────── ramas ─────────────────────────

export type RamaId = "investigadora" | "redactora" | "campanas" | "estudio" | "alianzas_ia" | "fondos" | "seguimiento";

export interface RamaInfo {
  id: RamaId;
  nombre: string;
  descripcion: string;
}

/** Las siete ramas, en el orden en que se muestran (contrato §3). */
export const RAMAS: readonly RamaInfo[] = [
  { id: "investigadora", nombre: "Investigadora", descripcion: "Busca y verifica sitios, fondos, convocatorias y comunidades; mantiene el directorio al día." },
  { id: "redactora", nombre: "Redactora de propuestas", descripcion: "Prepara propuestas y mensajes a la medida de cada sitio." },
  { id: "campanas", nombre: "Campañas", descripcion: "Planifica campañas y calendarios por medio; escribe textos y guiones." },
  { id: "estudio", nombre: "Estudio creativo audiovisual", descripcion: "Convierte un brief en piezas por formato: imagen, vídeo, animación 3D, anuncio, cartel, carrusel." },
  { id: "alianzas_ia", nombre: "Alianzas con agentes de IA", descripcion: "Presenta StarSeed en redes y directorios de agentes, siempre identificándose." },
  { id: "fondos", nombre: "Fondos e inversión", descripcion: "Sigue convocatorias, subvenciones y finanzas éticas; prepara la ficha para quien firma." },
  { id: "seguimiento", nombre: "Seguimiento", descripcion: "Cierra el ciclo: respuestas, aportaciones y donaciones confirmadas." },
];

export const IDS_RAMA: readonly RamaId[] = RAMAS.map((r) => r.id);

export function nombreRama(id: string | null | undefined): string {
  return RAMAS.find((r) => r.id === id)?.nombre ?? (id || "—");
}

// ───────────────────────── agentes ─────────────────────────

/** Dónde corre un agente (contrato §5): enjambre gratuito, nube, servidor Oracle A1 o la Mac de Alex. */
export type MedioAgente = "enjambre" | "nube" | "oracle_a1" | "mac";
export const MEDIOS_AGENTE: readonly MedioAgente[] = ["enjambre", "nube", "oracle_a1", "mac"];

export const ETIQUETA_MEDIO_AGENTE: Record<MedioAgente, string> = {
  enjambre: "Enjambre gratuito",
  nube: "Nube",
  oracle_a1: "Oracle A1",
  mac: "Mac de Alex",
};

export type EstadoAgente = "activo" | "parado" | "error";

export interface AgenteMeta {
  id: string;
  rama_id: RamaId;
  nombre: string;
  medio: MedioAgente;
  estado: EstadoAgente;
  modelo: string | null;
  ultimo_latido: string | null;
  creado_en: string;
}

// ───────────────────────── borradores (cola «Para aprobar») ─────────────────────────

/** El ciclo de vida de un mensaje o propuesta: NADA sale sin pasar por «aprobado». */
export type EstadoBorrador = "para_aprobar" | "aprobado" | "enviado" | "respondido" | "descartado";
export const ESTADOS_BORRADOR: readonly EstadoBorrador[] = ["para_aprobar", "aprobado", "enviado", "respondido", "descartado"];

/** Por dónde saldría: solo canales que el sitio ofrece, o a mano por una persona. */
export type CanalBorrador = "api_oficial" | "formulario" | "correo_propuesta" | "manual_alex";
export const CANALES: readonly CanalBorrador[] = ["api_oficial", "formulario", "correo_propuesta", "manual_alex"];

export const ETIQUETA_CANAL: Record<CanalBorrador, string> = {
  api_oficial: "API oficial",
  formulario: "Formulario del sitio",
  correo_propuesta: "Correo de propuestas",
  manual_alex: "Lo envía una persona",
};

/** Puntuación de Jev (scripts/puente/decidir.py): orienta; la decisión es de quien aprueba. */
export type NivelPuntuacion = "bajo" | "medio" | "alto";

export interface Borrador {
  id: string;
  rama_id: RamaId;
  agente_id: string | null;
  hallazgo_id: string | null;
  campana_id: string | null;
  sitio_id: string | null;
  canal: CanalBorrador;
  asunto: string | null;
  cuerpo: string;
  idioma: string;
  puntuacion_nivel: NivelPuntuacion | null;
  puntuacion_p: number | null;
  puntuacion_medio: string | null;
  estado: EstadoBorrador;
  motivo_descarte: string | null;
  aprobado_por: string | null;
  aprobado_en: string | null;
  enviado_en: string | null;
  respondido_en: string | null;
  huella: string | null;
  creado_en: string;
}

// ───────────────────────── piezas de campaña (Estudio) ─────────────────────────

export type EstadoPieza = "para_aprobar" | "aprobado" | "publicado" | "descartado";
export const ESTADOS_PIEZA: readonly EstadoPieza[] = ["para_aprobar", "aprobado", "publicado", "descartado"];

export type TipoPieza = "imagen" | "video" | "animacion3d" | "anuncio" | "cartel" | "carrusel";
export const TIPOS_PIEZA: readonly TipoPieza[] = ["imagen", "video", "animacion3d", "anuncio", "cartel", "carrusel"];

export const ETIQUETA_TIPO_PIEZA: Record<TipoPieza, string> = {
  imagen: "Imagen",
  video: "Vídeo",
  animacion3d: "Animación 3D",
  anuncio: "Anuncio",
  cartel: "Cartel",
  carrusel: "Carrusel",
};

/** «AxB» o «AxB@duración»: 1080x1920@15s, 1920x1080, 1080x1350. */
export const FORMATO_RE = /^[0-9]{2,5}x[0-9]{2,5}(@[0-9]+(\.[0-9]+)?s)?$/;

export function formatoValido(f: string): boolean {
  return FORMATO_RE.test(f);
}

export interface Pieza {
  id: string;
  campana_id: string | null;
  rama_id: RamaId;
  agente_id: string | null;
  tipo: TipoPieza;
  /** Medio de destino: instagram, youtube, tiktok, bluesky, mastodon, telegram, web, cartel_impreso… */
  medio: string;
  formato: string;
  ruta: string | null;
  url: string | null;
  sha256: string | null;
  estado: EstadoPieza;
  motivo_descarte: string | null;
  aprobado_por: string | null;
  aprobado_en: string | null;
  publicado_en: string | null;
  /** Métricas reales del medio (visualizaciones, clics, respuestas…); las rellena el seguimiento. */
  metricas: Record<string, number | string>;
  creado_en: string;
}

// ───────────────────────── campañas y hallazgos ─────────────────────────

export type EstadoCampana = "borrador" | "activa" | "pausada" | "terminada";

export interface Campana {
  id: string;
  nombre: string;
  objetivo: string | null;
  brief: Record<string, unknown>;
  estado: EstadoCampana;
  rama_id: RamaId;
  creado_en: string;
  actualizado_en: string;
}

export type TipoHallazgo = "sitio" | "convocatoria" | "organizacion" | "fondo" | "persona_publica" | "aviso";
export type EstadoHallazgo = "nuevo" | "revisado" | "descartado";

export interface Hallazgo {
  id: string;
  rama_id: RamaId;
  agente_id: string | null;
  sitio_id: string | null;
  tipo: TipoHallazgo;
  url: string | null;
  titulo: string;
  resumen: string | null;
  plazo: string | null;
  prioridad: 1 | 2 | 3;
  estado: EstadoHallazgo;
  huella: string | null;
  creado_en: string;
}

// ───────────────────────── resultados, enlaces de pago y donaciones ─────────────────────────

/** Qué cuenta como resultado real (los únicos que puntúan a una rama). */
export type TipoResultado = "respuesta" | "aportacion" | "voluntariado" | "donacion" | "alianza" | "financiacion";

export interface Resultado {
  id: string;
  rama_id: RamaId;
  agente_id: string | null;
  borrador_id: string | null;
  tipo: TipoResultado;
  /** Importe en unidades menores (céntimos), solo para donacion y financiacion. */
  valor_minor: number | null;
  moneda: string | null;
  nota: string | null;
  creado_en: string;
}

export interface EnlacePago {
  id: string;
  nombre: string;
  url: string;
  moneda: string;
  minimo_minor: number | null;
  confirmado_por: string | null;
  confirmado_en: string | null;
  activo: boolean;
  creado_en: string;
}

export type EstadoDonacion = "confirmada" | "reembolsada";

/** Una donación confirmada por Stripe. NO guarda datos de la persona que dona. */
export interface Donacion {
  id: string;
  stripe_id: string;
  enlace_id: string | null;
  importe_minor: number;
  moneda: string;
  estado: EstadoDonacion;
  rama_id: RamaId | null;
  campana_id: string | null;
  confirmada_en: string;
  creado_en: string;
}
