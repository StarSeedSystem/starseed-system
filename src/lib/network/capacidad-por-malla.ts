"use client";

/*
 * capacidad-por-malla — Relay P2P de capacidades (Ola 1017A).
 * Generaliza `ia-por-malla.ts` a `capacidad.*` con tipos: imagen | voz | oido |
 * palabra | transcodificar | render | buscar | construir.
 * Cliente `pedirCapacidad` nunca lanza: {ok:false, motivo}.
 */

import {
  VIDEO_MALLA_NS,
  VIDEO_MALLA_MAX_HTML_BYTES,
  VIDEO_MALLA_MAX_DURACION_S,
  admiteVideoMalla,
  validarPeticionVideoMalla,
  manejarPeticionVideoMalla,
  type DepsVideoMalla,
  type ReglasAdmisionVideo,
} from "@/lib/network/video-por-malla";

export const CAPACIDAD_MALLA_NS = "capacidad.";
export const CAPACIDAD_MALLA_MAX_BYTES = 16 * 1024;
const MARGEN = 256;

export type TipoCapacidad =
  | "imagen" | "voz" | "oido" | "palabra"
  | "transcodificar" | "render" | "buscar" | "construir";

export interface MsgPedir { t: "capacidad.pedir"; id: string; tipo: TipoCapacidad; cuerpo: Record<string, unknown>; sesionId?: string; }
export interface MsgTrozo { t: "capacidad.trozo"; id: string; texto: string; }
export interface MsgFin { t: "capacidad.fin"; id: string; resultado: unknown; }
export interface MsgError { t: "capacidad.error"; id: string; estado: number; mensaje: string; }
export interface MsgCancelar { t: "capacidad.cancelar"; id: string; }

export type Msg = MsgPedir | MsgTrozo | MsgFin | MsgError | MsgCancelar;

export function esMensajeCapacidadMalla(x: unknown): x is Msg {
  if (!esObjeto(x)) return false;
  if (typeof x.t !== "string" || !x.t.startsWith(CAPACIDAD_MALLA_NS) || typeof x.id !== "string") return false;
  switch (x.t) {
    case "capacidad.pedir": return typeof x.tipo === "string" && esObjeto(x.cuerpo);
    case "capacidad.trozo": return typeof x.texto === "string";
    case "capacidad.fin": return typeof x.resultado !== "undefined";
    case "capacidad.error": return typeof x.estado === "number" && typeof x.mensaje === "string";
    case "capacidad.cancelar": return true;
    default: return false;
  }
}

export function parseCapacidadMallaMensaje(raw: string): Msg | null {
  try { return esMensajeCapacidadMalla(JSON.parse(raw)) ? JSON.parse(raw) : null; } catch { return null; }
}

export function esTipoCapacidadValido(tipo: string): tipo is TipoCapacidad {
  return ["imagen","voz","oido","palabra","transcodificar","render","buscar","construir"].includes(tipo);
}

export function bytesUtf8(s: string): number { return new TextEncoder().encode(s).length; }
export function cabeEnMensajeCapacidad(json: string): boolean { return bytesUtf8(json) <= CAPACIDAD_MALLA_MAX_BYTES; }

export function partirEnTrozos(texto: string, maxBytesTexto = CAPACIDAD_MALLA_MAX_BYTES - MARGEN): string[] {
  if (!texto) return [];
  const partes: string[] = []; let actual = "";
  for (const ch of texto) {
    if (actual && bytesUtf8(actual + ch) > maxBytesTexto) { partes.push(actual); actual = ch; }
    else actual += ch;
  }
  if (actual) partes.push(actual);
  return partes;
}

export function crearIdPeticion(): string {
  try { return crypto.randomUUID(); } catch { return `am-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`; }
}

export interface ResultadoCapacidad { ok: boolean; resultado?: unknown; motivo?: string; }

export function pedirCapacidad(
  enviar: (msg: string) => boolean,
  { tipo, cuerpo, sesionId, timeoutMs = 200_000 }: { tipo: TipoCapacidad; cuerpo: Record<string, unknown>; sesionId?: string; timeoutMs?: number },
): Promise<ResultadoCapacidad> {
  const id = crearIdPeticion();
  try { enviar(JSON.stringify({ t: "capacidad.pedir", id, tipo, cuerpo, sesionId })); }
  catch { return Promise.resolve({ ok: false, motivo: "Error al enviar." }); }

  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ ok: false, motivo: "Capacidad por la malla: timeout total." }), timeoutMs);
    (pedirCapacidad as any).listener = (data: string) => {
      const msg = parseCapacidadMallaMensaje(data);
      if (!msg || msg.id !== id) return;
      clearTimeout(timer);
      if (msg.t === "capacidad.fin") resolve({ ok: true, resultado: msg.resultado });
      else if (msg.t === "capacidad.error") resolve({ ok: false, motivo: msg.mensaje });
    };
  });
}

/** Topes que este relé anuncia para la capacidad de vídeo (los fija `video-por-malla`). */
export const LIMITES_VIDEO_CAPACIDAD = Object.freeze({
  namespace: VIDEO_MALLA_NS,
  maxHtmlBytes: VIDEO_MALLA_MAX_HTML_BYTES,
  maxDuracionS: VIDEO_MALLA_MAX_DURACION_S,
});

export type ResultadoAtenderCapacidad =
  | { aceptado: true; trabajoId: string }
  | { aceptado: false; motivo: string };

/**
 * atenderPeticionCapacidadMalla — punto de entrada del relé para una petición ya
 * recibida. El render de vídeo se valida y se admite con `video-por-malla` y se
 * encola con las dependencias inyectadas (reloj, ids y cola); el resto de
 * capacidades aún no tiene manejador y se rechaza con un motivo legible.
 */
export function atenderPeticionCapacidadMalla(
  peticion: MsgPedir,
  reglas: ReglasAdmisionVideo,
  deps: DepsVideoMalla = {},
): ResultadoAtenderCapacidad {
  if (peticion.tipo !== "render")
    return { aceptado: false, motivo: `Rechazo: esta neurona no sirve la capacidad «${peticion.tipo}».` };
  // Se comprueba en dos pasos explícitos para poder responder al relé con el
  // motivo exacto antes de tocar la cola; el manejador vuelve a validar (es puro).
  const validada = validarPeticionVideoMalla(peticion.cuerpo);
  if (!validada.ok) return { aceptado: false, motivo: validada.motivo };
  const admitida = admiteVideoMalla(validada.peticion, reglas);
  if (!admitida.aceptado) return { aceptado: false, motivo: admitida.motivo };
  return manejarPeticionVideoMalla(validada.peticion, reglas, deps);
}

function esObjeto(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object"; }
