"use client";

/*
 * capacidad-por-malla — Relay P2P de capacidades (Ola 1017A).
 * Generaliza `ia-por-malla.ts` a `capacidad.*` con tipos: imagen | voz | oido |
 * palabra | transcodificar | render | buscar | construir.
 * Cliente `pedirCapacidad` nunca lanza: {ok:false, motivo}.
 */

import { getSharedMesh } from "@/lib/network/lan-sync";
import type { MeshHandle, PeerEvents, PeerSnapshot } from "@/lib/network/webrtc-mesh";
import { validarPeticionRender, type PeticionRenderVideo, type RespuestaValidacion } from "@/lib/network/video-por-malla";

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

/* ══════════════════════════  Rol SERVIDOR  ══════════════════════════ */

const TIMEOUT_TOTAL_SERVIDOR_MS = 200_000;

interface PeticionCapacidadEnCurso {
  id: string;
  abort: AbortController;
}

const registroProduccion = new Map<string, PeticionCapacidadEnCurso>();

export interface DepsServidorCapacidadMalla {
  puedeServir?: () => boolean;
  ejecutar?: (tipo: TipoCapacidad, cuerpo: Record<string, unknown>, opts: { signal: AbortSignal }) => Promise<{ ok: boolean; resultado?: unknown; motivo?: string }>;
  registro?: Map<string, PeticionCapacidadEnCurso>;
  timeoutTotalMs?: number;
}

function puedeServirDefecto(): boolean {
  return true;
}

async function ejecutarCapacidadDefecto(
  tipo: TipoCapacidad,
  cuerpo: Record<string, unknown>,
  _opts: { signal: AbortSignal },
): Promise<{ ok: boolean; resultado?: unknown; motivo?: string }> {
  if (tipo === "render") {
    const peticion = cuerpo as unknown as PeticionRenderVideo;
    const validacion = validarPeticionRender(peticion);
    if (!validacion.aceptado) {
      return { ok: false, motivo: validacion.motivo || "Validación fallida." };
    }
    return { ok: true, resultado: { trabajoId: validacion.trabajoId } };
  }
  return { ok: false, motivo: `Capacidad "${tipo}" no implementada en esta neurona.` };
}

function enviarError(
  mesh: Pick<MeshHandle, "sendToPeer">,
  peerId: string,
  id: string,
  estado: number,
  mensaje: string,
  extra?: { reintentarEnS?: number; ocupado?: boolean },
): void {
  const msg: MsgError = { t: "capacidad.error", id, estado, mensaje: mensaje.slice(0, 300), ...extra };
  try {
    mesh.sendToPeer(peerId, JSON.stringify(msg));
  } catch {
    /* peer ya no escucha: nada que hacer */
  }
}

export async function manejarPeticionCapacidadMalla(
  mesh: Pick<MeshHandle, "sendToPeer">,
  peerId: string,
  msg: MsgPedir,
  deps: DepsServidorCapacidadMalla = {},
): Promise<void> {
  const registro = deps.registro ?? registroProduccion;
  const puedeServir = deps.puedeServir ?? puedeServirDefecto;
  const ejecutar = deps.ejecutar ?? ejecutarCapacidadDefecto;
  const timeoutTotalMs = deps.timeoutTotalMs ?? TIMEOUT_TOTAL_SERVIDOR_MS;

  if (!puedeServir()) {
    enviarError(mesh, peerId, msg.id, 503, "Esta neurona no comparte sus capacidades por la malla ahora mismo.");
    return;
  }
  if (registro.has(peerId)) {
    enviarError(mesh, peerId, msg.id, 429, "Ya hay una petición de capacidad en curso desde este dispositivo.", { reintentarEnS: 10 });
    return;
  }

  const abort = new AbortController();
  const estado: PeticionCapacidadEnCurso = { id: msg.id, abort };
  registro.set(peerId, estado);

  const timeoutTotal = setTimeout(() => {
    try { abort.abort(); } catch { /* noop */ }
  }, timeoutTotalMs);

  const limpiar = () => {
    clearTimeout(timeoutTotal);
    if (registro.get(peerId) === estado) registro.delete(peerId);
  };

  try {
    const resultado = await ejecutar(msg.tipo, msg.cuerpo, { signal: abort.signal });
    if (resultado.ok) {
      mesh.sendToPeer(
        peerId,
        JSON.stringify({ t: "capacidad.fin", id: msg.id, resultado: resultado.resultado } satisfies MsgFin),
      );
    } else {
      enviarError(mesh, peerId, msg.id, 502, resultado.motivo || "Error al ejecutar la capacidad.");
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error al ejecutar la capacidad por la malla.";
    enviarError(mesh, peerId, msg.id, 502, mensaje);
  } finally {
    limpiar();
  }
}

export function manejarCancelarCapacidadMalla(
  peerId: string,
  msg: MsgCancelar,
  deps: Pick<DepsServidorCapacidadMalla, "registro"> = {},
): void {
  const registro = deps.registro ?? registroProduccion;
  const en = registro.get(peerId);
  if (en && en.id === msg.id) {
    try { en.abort.abort(); } catch { /* noop */ }
  }
}

export function reiniciarServidorCapacidadMallaParaTests(): void {
  registroProduccion.clear();
}

export function adjuntarServidorCapacidadMalla(mesh: MeshHandle, deps: DepsServidorCapacidadMalla = {}): () => void {
  const registro = deps.registro ?? registroProduccion;
  const onMessage: PeerEvents["onMessage"] = (peerId, data) => {
    const msg = parseCapacidadMallaMensaje(data);
    if (!msg) return;
    if (msg.t === "capacidad.pedir") {
      void manejarPeticionCapacidadMalla(mesh, peerId, msg, deps);
    } else if (msg.t === "capacidad.cancelar") {
      manejarCancelarCapacidadMalla(peerId, msg, { registro });
    }
  };
  const onState: PeerEvents["onState"] = (snap: PeerSnapshot) => {
    if (snap.state === "connected") return;
    const en = registro.get(snap.deviceId);
    if (en) {
      try { en.abort.abort(); } catch { /* noop */ }
    }
  };
  return mesh.onPeer({ onMessage, onState });
}

let servidorTimer: ReturnType<typeof setInterval> | null = null;
let servidorUnsub: (() => void) | null = null;

export function iniciarServidorCapacidadPorMalla(): () => void {
  let cancelado = false;
  const intentar = () => {
    if (cancelado || servidorUnsub) return;
    const mesh = getSharedMesh();
    if (mesh) servidorUnsub = adjuntarServidorCapacidadMalla(mesh);
  };
  intentar();
  if (!servidorUnsub) servidorTimer = setInterval(intentar, 2000);
  return () => {
    cancelado = true;
    if (servidorTimer) {
      clearInterval(servidorTimer);
      servidorTimer = null;
    }
    servidorUnsub?.();
    servidorUnsub = null;
  };
}

function esObjeto(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object"; }
