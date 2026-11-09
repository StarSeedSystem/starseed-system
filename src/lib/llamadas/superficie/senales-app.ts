/**
 * Mensajes de aplicación de la superficie de llamada (LLA1108G) — PURO. Viajan por `MotorLlamada.enviarApp`
 * (señal `app`, difusión por el mismo canal de la llamada, sea Supabase, enlace local o transporte universal),
 * así que funcionan igual con o sin internet. Cada uno lleva su clase en `k`. Lo que llega se valida aquí: nada
 * de lo que mande otro aparato se usa sin pasar por estos guardas.
 */
import { esAvisoGrabacion, type AvisoGrabacion } from "./grabacion";
import { esRespuestaAstraura, type RespuestaAstraura } from "./astraura-llamada";
import type { TipoSuperficie } from "./maquina";

export const TIPOS_VALIDOS: readonly TipoSuperficie[] = ["voz", "video", "pantalla", "vivo", "grupo"];
export const EMOJIS_REACCION = ["👍", "👏", "❤️", "😂", "😮", "🙏"] as const;
const MAX_CHAT = 500;
const MAX_PREGUNTA = 600;

export interface CambioTipo {
  k: "tipo";
  /** Id del cambio (idempotencia). */
  id: string;
  a: TipoSuperficie;
}
export interface EsperaMsg {
  k: "espera";
  activa: boolean;
}
export interface AckGrabacion {
  k: "grabacion-ack";
  /** Id de la grabación que se acusa. */
  id: string;
}
export interface PreguntaAstraura {
  k: "astraura-pregunta";
  id: string;
  de: string;
  nombre: string;
  pregunta: string;
  /** Capacidades de quien pregunta, para que todas las neuronas elijan el MISMO generador. */
  capaz: boolean;
  local: boolean;
  en: number;
}
export interface EstadoAstrauraMsg {
  k: "astraura-estado";
  activa: boolean;
  capaz: boolean;
  local: boolean;
}
export interface ChatMsg {
  k: "chat";
  id: string;
  nombre: string;
  texto: string;
  en: number;
}
export interface ReaccionMsg {
  k: "reaccion";
  id: string;
  nombre: string;
  emoji: string;
}
export interface TranscripcionMsg {
  k: "trans";
  nombre: string;
  texto: string;
  en: number;
}
export interface FinTodosMsg {
  k: "fin-todos";
  motivo: string;
}
export interface InvitacionMsg {
  k: "invitacion";
  /** A quién va dirigida (id de presencia o uid) y quién la hizo. */
  ids: string[];
  nombre: string;
}

export type MensajeApp =
  | CambioTipo
  | EsperaMsg
  | AvisoGrabacion
  | AckGrabacion
  | RespuestaAstraura
  | PreguntaAstraura
  | EstadoAstrauraMsg
  | ChatMsg
  | TranscripcionMsg
  | ReaccionMsg
  | FinTodosMsg
  | InvitacionMsg;

const txt = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim().length > 0 ? v.slice(0, max) : null);

/** Valida una carga recibida. null si no es de la superficie o viene mal formada. */
export function leerMensajeApp(c: unknown): MensajeApp | null {
  const o = c as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || typeof o.k !== "string") return null;
  switch (o.k) {
    case "tipo": {
      const id = txt(o.id, 60);
      return id && TIPOS_VALIDOS.includes(o.a as TipoSuperficie) ? { k: "tipo", id, a: o.a as TipoSuperficie } : null;
    }
    case "espera":
      return typeof o.activa === "boolean" ? { k: "espera", activa: o.activa } : null;
    case "grabacion": {
      if (!esAvisoGrabacion(o)) return null;
      const a = o as unknown as AvisoGrabacion;
      return { k: "grabacion", id: a.id.slice(0, 60), de: a.de.slice(0, 120), nombre: String(a.nombre ?? "").slice(0, 60), activa: a.activa, en: typeof a.en === "number" ? a.en : 0 };
    }
    case "grabacion-ack": {
      const id = txt(o.id, 60);
      return id ? { k: "grabacion-ack", id } : null;
    }
    case "astraura-llamada": {
      if (!esRespuestaAstraura(o)) return null;
      const r = o as unknown as RespuestaAstraura;
      if (r.texto.length > 4000) return null;
      return r;
    }
    case "astraura-pregunta": {
      const id = txt(o.id, 60);
      const de = txt(o.de, 120);
      const pregunta = txt(o.pregunta, MAX_PREGUNTA);
      if (!id || !de || !pregunta) return null;
      return { k: "astraura-pregunta", id, de, nombre: String(o.nombre ?? "").slice(0, 60), pregunta, capaz: o.capaz === true, local: o.local === true, en: typeof o.en === "number" ? o.en : 0 };
    }
    case "astraura-estado":
      return typeof o.activa === "boolean" ? { k: "astraura-estado", activa: o.activa, capaz: o.capaz === true, local: o.local === true } : null;
    case "chat": {
      const id = txt(o.id, 60);
      const texto = txt(o.texto, MAX_CHAT);
      return id && texto ? { k: "chat", id, nombre: String(o.nombre ?? "").slice(0, 60), texto, en: typeof o.en === "number" ? o.en : 0 } : null;
    }
    case "trans": {
      const texto = txt(o.texto, MAX_CHAT);
      return texto ? { k: "trans", nombre: String(o.nombre ?? "").slice(0, 60), texto, en: typeof o.en === "number" ? o.en : 0 } : null;
    }
    case "reaccion": {
      const id = txt(o.id, 60);
      const emoji = txt(o.emoji, 8);
      return id && emoji && (EMOJIS_REACCION as readonly string[]).includes(emoji) ? { k: "reaccion", id, nombre: String(o.nombre ?? "").slice(0, 60), emoji } : null;
    }
    case "fin-todos":
      return { k: "fin-todos", motivo: String(o.motivo ?? "").slice(0, 200) };
    case "invitacion":
      return Array.isArray(o.ids) ? { k: "invitacion", ids: o.ids.filter((x): x is string => typeof x === "string").slice(0, 20), nombre: String(o.nombre ?? "").slice(0, 60) } : null;
    default:
      return null;
  }
}

/** Mensaje de chat de la llamada tal como lo pinta la vista. */
export interface MensajeChatVista {
  id: string;
  de: string;
  nombre: string;
  texto: string;
  en: number;
  mio: boolean;
}
export interface ReaccionVista {
  id: string;
  nombre: string;
  emoji: string;
}

const MAX_MENSAJES_CHAT = 100;
const MAX_REACCIONES = 8;

/** Añade un mensaje (idempotente por id) conservando solo los últimos. */
export function sumarChat(lista: MensajeChatVista[], m: MensajeChatVista): MensajeChatVista[] {
  if (lista.some((x) => x.id === m.id)) return lista;
  return [...lista, m].slice(-MAX_MENSAJES_CHAT);
}

export function sumarReaccion(lista: ReaccionVista[], r: ReaccionVista): ReaccionVista[] {
  if (lista.some((x) => x.id === r.id)) return lista;
  return [...lista, r].slice(-MAX_REACCIONES);
}
