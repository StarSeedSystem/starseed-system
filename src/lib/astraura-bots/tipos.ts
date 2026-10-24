/**
 * Bots/dots de Astraura · TIPOS del núcleo (BOT1011 · 2026-10-11).
 * Contrato: architecture/astraura-bots.md (§2 identidad, §4 personalidad, §5 sentidos, §6 acciones).
 *
 * Un bot es Astraura con cuerpo: la ORBE flotante es su cuerpo y puede haber varias a la vez
 * (la del perfil y las de cada grupo/página), cada una con su personalidad, sus sentidos y sus
 * permisos. Este módulo es PURO: sin React, sin red, sin `node:*`, sin reloj (el tiempo entra
 * siempre como argumento `ahora`). Lo importan componentes de cliente.
 */
import type { AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";
import type { VozBot } from "./voz-bot";

/* ── Dueño y gobierno ────────────────────────────────────────────────────── */

/** De quién es el bot. Un bot de grupo/comunidad/página es procomún de esa entidad. */
export const TIPOS_DUENO = ["perfil", "grupo", "comunidad", "pagina"] as const;
export type TipoDueno = (typeof TIPOS_DUENO)[number];

export interface Dueno {
  tipo: TipoDueno;
  /** id del perfil o de la entidad (nunca un correo). */
  id: string;
  /** Cuenta raíz responsable (Dualidad Cuenta/Perfil, CLAUDE.md §6). */
  cuentaId: string;
}

/** Cómo decide la entidad sobre SU bot. `jerarquico` = administra quien gestiona la entidad. */
export type Gobierno = "jerarquico" | "democratico";

/** Papel de quien habla con el bot o lo configura, dentro del ámbito del dueño. */
export const ROLES_BOT = ["dueno", "admin", "miembro", "observador", "invitado"] as const;
export type RolBot = (typeof ROLES_BOT)[number];

/* ── Origen del bot ──────────────────────────────────────────────────────── */

/**
 * `astraura`: el predeterminado, modelos locales de código abierto (Needle 3, Bonsai, BitNet, Jev,
 * Laya) con respaldo económico. `ag-ui`: cualquier agente que hable AG-UI (p. ej. un bot de OpenBot),
 * se trata como externo. `externo`: un servicio de otro (Grok, etc.), siempre INVITADO.
 */
export const ORIGENES_BOT = ["astraura", "ag-ui", "externo"] as const;
export type OrigenBot = (typeof ORIGENES_BOT)[number];

/* ── Sentidos ────────────────────────────────────────────────────────────── */

export const SENTIDOS = [
  "pantalla",          // lo que el OS pinta (escáner del DOM, screen-scanner.ts)
  "captura-pantalla",  // píxeles de toda la pantalla, también otras apps (getDisplayMedia / nativo)
  "archivos",          // carpetas del cerebro y de la Biblioteca que el dueño señale
  "red",               // páginas, publicaciones, grupos, mensajes, notificaciones y enlaces del OS e internet
  "correo",            // correos por conectores (Gmail, IMAP…)
  "terminal",          // terminal del APARATO (solo app nativa); el de la computadora del bot es otra cosa
  "camara",
  "microfono",
  "sensores",          // movimiento, wearables, salud
  "ubicacion",
  "portapapeles",
  "aparatos",          // BLE, serie, MIDI, HID, Meshtastic
] as const;
export type Sentido = (typeof SENTIDOS)[number];

/** Sentidos íntimos: consentimiento explícito, indicador visible y nunca a un invitado. */
export const SENTIDOS_INTIMOS: readonly Sentido[] = [
  "captura-pantalla", "correo", "terminal", "camara", "microfono", "sensores", "ubicacion",
];

/** Consentimiento de UNA persona para UN sentido de UN bot. `vence: null` = hasta que lo revoque. */
export interface ConsentimientoSentido {
  botId: string;
  sentido: Sentido;
  /** Cuenta que consiente: en un grupo, cada miembro consiente por sí mismo. */
  cuentaId: string;
  vence: number | null;
  /** Consentimiento expreso para sesiones públicas (además del normal). */
  expreso?: boolean;
}

/* ── Personalidad y emoción ──────────────────────────────────────────────── */

/** Rasgos en [0, 1]. Deterministas: la misma entrada da la misma personalidad. */
export const RASGOS = ["calidez", "energia", "formalidad", "curiosidad", "humor", "concision"] as const;
export type Rasgo = (typeof RASGOS)[number];
export type Personalidad = Record<Rasgo, number>;

export const EMOCIONES = ["calma", "alegria", "curiosidad", "concentracion", "preocupacion", "ternura", "asombro"] as const;
export type Emocion = (typeof EMOCIONES)[number];

/** Estado emocional EXPRESADO (no sentido): sirve para la animación y el tono, nunca para presionar. */
export interface EstadoEmocional {
  emocion: Emocion;
  /** -1 (apagado) … 1 (luminoso). */
  valencia: number;
  /** 0 (reposo) … 1 (muy activo). */
  activacion: number;
}

/* ── Cuerpo: orbe y avatar ───────────────────────────────────────────────── */

export const FORMAS_CUERPO = ["orbe", "avatar-2d", "avatar-3d", "vrm", "ser-genesis", "robot"] as const;
export type FormaCuerpo = (typeof FORMAS_CUERPO)[number];

export interface Cuerpo {
  forma: FormaCuerpo;
  /** Referencia a la Biblioteca (privada o pública) o al ADN de Génesis; nunca una URL externa suelta. */
  avatarRef?: string;
  /** Tono base (0-360) y escala de la orbe; la emoción los modula. */
  tono: number;
  escala: number;
}

/* ── El bot ──────────────────────────────────────────────────────────────── */

export interface Bot {
  id: string;
  nombre: string;
  dueno: Dueno;
  origen: OrigenBot;
  gobierno: Gobierno;
  personalidad: Personalidad;
  cuerpo: Cuerpo;
  /** Sentidos que el DUEÑO habilitó. Habilitar no es consentir: cada persona consiente aparte. */
  sentidosHabilitados: readonly Sentido[];
  /** Interruptor general: un bot pausado no observa ni actúa. */
  activo: boolean;
  /** Perfil de voz del bot (VZR1011E · astraura-voces-y-robots.md §3): viaja CON el bot y con
   *  su sincronía, así suena igual en todas las neuronas. Ausente → `vozBotDefecto(bot.id)`. */
  voz?: VozBot;
}

/* ── Sesión, tareas y memoria ────────────────────────────────────────────── */

export type TipoSesion = "privada" | "grupo" | "publica";
export type Medio = "web" | "pwa" | "nativo" | "servidor" | "xr";

export type EstadoTarea = "propuesta" | "en-curso" | "verificando" | "hecha" | "rechazada";
export interface Tarea {
  id: string;
  titulo: string;
  /** Bot director; los demás agentes trabajan bajo él (Genesis o PoliGenesis). */
  director: string;
  agentes: readonly string[];
  /** Criterios comprobables: sin criterios no hay «hecha». */
  criterios: readonly string[];
  verificador: "persona" | "bot" | "pruebas";
  origen: "genesis" | "poligenesis";
  estado: EstadoTarea;
}

export type { AlcanceMemoria };

/* ── Guardas ─────────────────────────────────────────────────────────────── */

const en = <T extends string>(lista: readonly T[]) => (x: unknown): x is T =>
  typeof x === "string" && (lista as readonly string[]).includes(x);

export const esSentido = en(SENTIDOS);
export const esRol = en(ROLES_BOT);
export const esOrigen = en(ORIGENES_BOT);
export const esTipoDueno = en(TIPOS_DUENO);
export const esEmocion = en(EMOCIONES);

/** Acota a [min, max]; un valor no finito vale `min`. */
export function acotar(x: number, min = 0, max = 1): number {
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : min;
}

/** El bot de un perfil es personal; el de una entidad sirve a un grupo. */
export function esBotDeEntidad(b: Pick<Bot, "dueno">): boolean {
  return b.dueno.tipo !== "perfil";
}

/** Un bot que no es Astraura es un invitado: permisos reducidos siempre. */
export function esInvitado(b: Pick<Bot, "origen">): boolean {
  return b.origen !== "astraura";
}
