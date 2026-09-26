"use client";

/*
 * astraura-por-malla — Relay P2P de Astraura 1.58 sobre la malla de neuronas (Ola 367).
 * ---------------------------------------------------------------------------
 * Hasta ahora la malla de neuronas (`malla-neuronas.ts`) era solo un CONTADOR de
 * vecinos: el enrutador de Astraura (`router.ts`) nunca la usaba como fuente de
 * inteligencia. Este módulo la convierte en una fuente REAL: una tablet sin
 * backend local (p. ej. cargando `https://starseed-os.vercel.app`) puede pedirle
 * Astraura 1.58 a OTRA neurona de la MISMA cuenta (la Mac, con su BitNet local)
 * a través del canal WebRTC YA abierto por la malla — sin pasar por el túnel de
 * Cloudflare ni por ningún servidor de terceros.
 *
 * Protocolo (JSON, namespace `astraura.*`, cada mensaje ≤ 16 KB):
 *   cliente → servidor  astraura.pedir     {id, cuerpo:{messages, system_prompt?, preferences?, persona_id?}}
 *   servidor → cliente  astraura.trozo     {id, texto}          (lote de tokens cada ~100 ms)
 *   servidor → cliente  astraura.fin       {id}
 *   servidor → cliente  astraura.error     {id, estado, reintentarEnS?, mensaje, ocupado?}
 *   cliente → servidor  astraura.cancelar  {id}
 *   cualquiera → otro   astraura.ping      {id}  →  astraura.pong {id, cola?}
 *
 * ROL SERVIDOR: solo si esta neurona puede alcanzar SU PROPIA Astraura —
 * `paginaEsLocal()` (la página misma es un despliegue local: se habla por el
 * proxy same-origin `?destino=local`) o `declaracionAstrauraLocal()` (la
 * neurona declaró un endpoint propio: se habla DIRECTO con él) — Y comparte la
 * capa mesh (`capaMeshCompartiendo()`: maestro 1.58 + capa mesh encendidos).
 * Como mucho 1 petición en vuelo POR PEER; el resto se rechaza con
 * `estado:429`. Corte duro a los 200 s.
 *
 * ROL CLIENTE: `servidoresAstrauraMalla()` lista los peers conectados que
 * anuncian `sirveAstraura` en su ficha (`malla-neuronas.ts`), ordenados por
 * latencia; `pedirAstrauraPorMalla()` hace la petición y RESUELVE el texto
 * completo (streaming vía `onTexto`), con errores tipados: ocupado (mensaje
 * "retry after Ns" + `ocupado:true`, misma convención que
 * `ai/providers/astraura-158.ts` para que el enrutador enfríe la fuente),
 * "sin servidor en la malla", timeout (primer trozo 120 s, total 200 s) y peer
 * perdido.
 *
 * Reutiliza SIEMPRE el mesh COMPARTIDO (`getSharedMesh()` de `lan-sync.ts`):
 * este módulo nunca abre una segunda malla.
 */

import { getSharedMesh, capaMeshCompartiendo } from "@/lib/network/lan-sync";
import type { MeshHandle, PeerEvents, PeerSnapshot } from "@/lib/network/webrtc-mesh";
import { snapshotMallaNeuronas, declaracionAstrauraLocal } from "@/lib/network/malla-neuronas";
import { paginaEsLocal } from "@/lib/astraura/destino-local";
import { astraura158EndpointOf, thisDeviceId } from "@/lib/neurons/neurons";
import { urlPuenteLocal, parseAstrauraSseLine } from "@/ai/providers/astraura-158";

/* ══════════════════════════ 1) Protocolo (puro) ══════════════════════════ */

export const ASTRAURA_MALLA_NS = "astraura.";
/** Límite duro del protocolo: ningún mensaje viaja por el canal por encima de esto. */
export const ASTRAURA_MALLA_MAX_BYTES = 16 * 1024;
/** Margen reservado al sobre JSON (`{t,id,texto}`) al partir un trozo de texto. */
const TROZO_MARGEN_BYTES = 256;

export interface AstrauraMallaBody {
  messages: { role: string; content: string }[];
  system_prompt?: string;
  preferences?: Record<string, unknown>;
  persona_id?: string;
}

export interface MsgPedir {
  t: "astraura.pedir";
  id: string;
  cuerpo: AstrauraMallaBody;
}
export interface MsgTrozo {
  t: "astraura.trozo";
  id: string;
  texto: string;
}
export interface MsgFin {
  t: "astraura.fin";
  id: string;
}
export interface MsgError {
  t: "astraura.error";
  id: string;
  estado: number;
  mensaje: string;
  reintentarEnS?: number;
  ocupado?: boolean;
}
export interface MsgCancelar {
  t: "astraura.cancelar";
  id: string;
}
export interface MsgPing {
  t: "astraura.ping";
  id: string;
}
export interface MsgPong {
  t: "astraura.pong";
  id: string;
  cola?: number;
}

export type AstrauraMallaMsg = MsgPedir | MsgTrozo | MsgFin | MsgError | MsgCancelar | MsgPing | MsgPong;

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

/** Guard puro: ¿`x` es un mensaje del protocolo `astraura.*` bien formado? */
export function esMensajeAstrauraMalla(x: unknown): x is AstrauraMallaMsg {
  if (!esObjeto(x)) return false;
  const t = x.t;
  if (typeof t !== "string" || !t.startsWith(ASTRAURA_MALLA_NS)) return false;
  if (typeof x.id !== "string" || !x.id) return false;
  switch (t) {
    case "astraura.pedir":
      return esObjeto(x.cuerpo) && Array.isArray((x.cuerpo as Record<string, unknown>).messages);
    case "astraura.trozo":
      return typeof x.texto === "string";
    case "astraura.error":
      return typeof x.estado === "number" && typeof x.mensaje === "string";
    case "astraura.pong":
      return x.cola === undefined || typeof x.cola === "number";
    case "astraura.fin":
    case "astraura.cancelar":
    case "astraura.ping":
      return true;
    default:
      return false;
  }
}

/** JSON.parse defensivo + guard. Nunca lanza; `null` si no es del protocolo. */
export function parseAstrauraMallaMensaje(raw: string): AstrauraMallaMsg | null {
  try {
    const obj: unknown = JSON.parse(raw);
    return esMensajeAstrauraMalla(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** Tamaño en bytes UTF-8 de una cadena (el límite del protocolo es en bytes, no en caracteres). */
export function bytesUtf8(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** ¿El JSON de este mensaje cabe en el límite del protocolo (≤ 16 KB)? */
export function cabeEnMensaje(json: string): boolean {
  return bytesUtf8(json) <= ASTRAURA_MALLA_MAX_BYTES;
}

/**
 * Parte `texto` en trozos cuyo `astraura.trozo` envuelto NUNCA supera
 * `ASTRAURA_MALLA_MAX_BYTES`. Pura; degrada con honestidad ante texto vacío
 * (lista vacía) — nunca produce un trozo vacío.
 */
export function partirEnTrozos(texto: string, maxBytesTexto: number = ASTRAURA_MALLA_MAX_BYTES - TROZO_MARGEN_BYTES): string[] {
  if (!texto) return [];
  const partes: string[] = [];
  let actual = "";
  for (const ch of texto) {
    const candidato = actual + ch;
    if (actual && bytesUtf8(candidato) > maxBytesTexto) {
      partes.push(actual);
      actual = ch;
    } else {
      actual = candidato;
    }
  }
  if (actual) partes.push(actual);
  return partes;
}

/** Id de petición razonablemente único (no necesita ser criptográfico). */
export function crearIdPeticion(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `am-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/* ══════════════════════════ 2) Rol SERVIDOR ══════════════════════════ */

const TIMEOUT_TOTAL_SERVIDOR_MS = 200_000;
const FLUSH_TROZO_MS = 100;

interface PeticionEnCurso {
  id: string;
  abort: AbortController;
}

/** Registro por defecto (producción): 1 entrada por `peerId` con petición en vuelo. */
const registroProduccion = new Map<string, PeticionEnCurso>();

export interface DepsServidorAstrauraMalla {
  /** Sustituye `fetch` global (pruebas). */
  fetchImpl?: typeof fetch;
  /** Sustituye la comprobación de capa (`capaMeshCompartiendo`). */
  puedeServir?: () => boolean;
  /** Sustituye la resolución de destino local (pruebas). */
  resolverDestino?: () => { modo: "proxy" | "directo"; base: string } | null;
  /** Registro de peticiones en vuelo por peer (pruebas: un Map propio y aislado). */
  registro?: Map<string, PeticionEnCurso>;
  /** ms entre lotes de `astraura.trozo` (por defecto 100). */
  flushMs?: number;
  /** Corte duro total (por defecto 200 s). */
  timeoutTotalMs?: number;
}

/** ¿Puede ESTA neurona relayar Astraura 1.58 por la malla ahora mismo? Capa mesh compartiendo. */
function puedeServirDefecto(): boolean {
  return capaMeshCompartiendo();
}

/**
 * Destino LOCAL de este servidor: same-origin (`paginaEsLocal()`, se habla por
 * el proxy del OS con `?destino=local`) o el endpoint declarado por la neurona
 * (`declaracionAstrauraLocal()`, se habla DIRECTO — la página no es local, así
 * que el proxy no es esta máquina). `null` si ninguna de las dos aplica.
 */
function resolverDestinoDefecto(): { modo: "proxy" | "directo"; base: string } | null {
  if (paginaEsLocal()) return { modo: "proxy", base: "" };
  if (declaracionAstrauraLocal()) {
    try {
      return { modo: "directo", base: astraura158EndpointOf(thisDeviceId()) };
    } catch {
      return null;
    }
  }
  return null;
}

function enviarError(
  mesh: Pick<MeshHandle, "sendToPeer">,
  peerId: string,
  id: string,
  estado: number,
  mensaje: string,
  extra?: { reintentarEnS?: number; ocupado?: boolean },
): void {
  const msg: MsgError = { t: "astraura.error", id, estado, mensaje: mensaje.slice(0, 300), ...extra };
  try {
    mesh.sendToPeer(peerId, JSON.stringify(msg));
  } catch {
    /* peer ya no escucha: nada que hacer */
  }
}

/**
 * manejarPeticionAstrauraMalla — atiende UN `astraura.pedir` de `peerId`.
 * Exportada (con `deps` inyectables) para poder probarla con un mesh/fetch de
 * mentira, sin `getSharedMesh()` ni red real.
 */
export async function manejarPeticionAstrauraMalla(
  mesh: Pick<MeshHandle, "sendToPeer">,
  peerId: string,
  msg: MsgPedir,
  deps: DepsServidorAstrauraMalla = {},
): Promise<void> {
  const registro = deps.registro ?? registroProduccion;
  const puedeServir = deps.puedeServir ?? puedeServirDefecto;
  const resolverDestino = deps.resolverDestino ?? resolverDestinoDefecto;
  const fetchImpl = deps.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const flushMs = deps.flushMs ?? FLUSH_TROZO_MS;
  const timeoutTotalMs = deps.timeoutTotalMs ?? TIMEOUT_TOTAL_SERVIDOR_MS;

  if (!puedeServir()) {
    enviarError(mesh, peerId, msg.id, 503, "Esta neurona no comparte Astraura por la malla ahora mismo.");
    return;
  }
  if (registro.has(peerId)) {
    enviarError(mesh, peerId, msg.id, 429, "Ya hay una petición de Astraura en curso desde este dispositivo.", { reintentarEnS: 10 });
    return;
  }
  const destino = resolverDestino();
  if (!destino || !fetchImpl) {
    enviarError(mesh, peerId, msg.id, 503, "Esta neurona no tiene Astraura local disponible ahora mismo.");
    return;
  }
  const url = destino.modo === "proxy" ? urlPuenteLocal("/api/starseed/chat") : `${destino.base}/api/starseed/chat`;

  const abort = new AbortController();
  const estado: PeticionEnCurso = { id: msg.id, abort };
  registro.set(peerId, estado);

  let buffer = "";
  let terminado = false;
  const flushTimer = setInterval(() => {
    if (!buffer) return;
    for (const parte of partirEnTrozos(buffer)) {
      try {
        mesh.sendToPeer(peerId, JSON.stringify({ t: "astraura.trozo", id: msg.id, texto: parte } satisfies MsgTrozo));
      } catch {
        /* noop */
      }
    }
    buffer = "";
  }, flushMs);
  const timeoutTotal = setTimeout(() => {
    try {
      abort.abort();
    } catch {
      /* noop */
    }
  }, timeoutTotalMs);

  const limpiar = () => {
    terminado = true;
    clearInterval(flushTimer);
    clearTimeout(timeoutTotal);
    if (registro.get(peerId) === estado) registro.delete(peerId);
  };

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json" },
      body: JSON.stringify({ ...msg.cuerpo, stream: true }),
      signal: abort.signal,
    });
    if (!res.ok) {
      if (res.status === 503 || res.status === 429) {
        const cabecera = res.headers.get("retry-after");
        let cuerpo: Record<string, unknown> | null = null;
        try {
          cuerpo = (await res.clone().json()) as Record<string, unknown>;
        } catch {
          /* no era JSON */
        }
        const segCuerpo = typeof cuerpo?.reintentar_en_s === "number" ? cuerpo.reintentar_en_s : undefined;
        const segundos = Math.max(1, Math.round(Number(cabecera) || segCuerpo || 30));
        enviarError(mesh, peerId, msg.id, res.status, "Astraura 1.58 está ocupada en esta neurona.", {
          reintentarEnS: segundos,
          ocupado: true,
        });
      } else {
        const texto = await res.text().catch(() => "");
        enviarError(mesh, peerId, msg.id, res.status, texto || res.statusText || "Error del backend local.");
      }
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) {
      enviarError(mesh, peerId, msg.id, 502, "Respuesta sin cuerpo del backend local.");
      return;
    }
    const decoder = new TextDecoder();
    let restante = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      restante += decoder.decode(value, { stream: true });
      const lineas = restante.split("\n");
      restante = lineas.pop() ?? "";
      for (const linea of lineas) {
        const ev = parseAstrauraSseLine(linea);
        if (!ev) continue;
        if (ev.type === "token" && typeof ev.token === "string" && ev.token) {
          buffer += ev.token;
        } else if (ev.type === "done") {
          if (!buffer.trim() && typeof ev.full_text === "string" && ev.full_text.trim()) buffer += ev.full_text;
        } else if (ev.type === "error" && typeof ev.message === "string") {
          throw new Error(ev.message);
        }
      }
    }
    if (buffer) {
      for (const parte of partirEnTrozos(buffer)) {
        try {
          mesh.sendToPeer(peerId, JSON.stringify({ t: "astraura.trozo", id: msg.id, texto: parte } satisfies MsgTrozo));
        } catch {
          /* noop */
        }
      }
      buffer = "";
    }
    mesh.sendToPeer(peerId, JSON.stringify({ t: "astraura.fin", id: msg.id } satisfies MsgFin));
  } catch (e) {
    if (!terminado) {
      const mensaje = e instanceof Error ? e.message : "Error al relayar Astraura por la malla.";
      enviarError(mesh, peerId, msg.id, 502, mensaje);
    }
  } finally {
    limpiar();
  }
}

/**
 * manejarCancelarAstrauraMalla — corta (aborta el `fetch`) la petición en
 * vuelo de `peerId` SI su id coincide con `msg.id` (una `astraura.cancelar`
 * tardía de un turno ya terminado no toca nada).
 */
export function manejarCancelarAstrauraMalla(
  peerId: string,
  msg: MsgCancelar,
  deps: Pick<DepsServidorAstrauraMalla, "registro"> = {},
): void {
  const registro = deps.registro ?? registroProduccion;
  const en = registro.get(peerId);
  if (en && en.id === msg.id) {
    try {
      en.abort.abort();
    } catch {
      /* noop */
    }
  }
}

/** Solo para pruebas: vacía el registro de producción entre tests. */
export function reiniciarServidorAstrauraMallaParaTests(): void {
  registroProduccion.clear();
}

/**
 * adjuntarServidorAstrauraMalla — conecta el rol servidor a un `MeshHandle`
 * (real o de mentira): escucha `astraura.pedir`/`astraura.cancelar`/
 * `astraura.ping` y aborta la petición en vuelo de un peer si se desconecta.
 * Devuelve `unsubscribe`. Puede llamarse varias veces con handles distintos en
 * pruebas; en producción solo `iniciarServidorAstrauraPorMalla()` la usa, UNA
 * vez, sobre el mesh COMPARTIDO.
 */
export function adjuntarServidorAstrauraMalla(mesh: MeshHandle, deps: DepsServidorAstrauraMalla = {}): () => void {
  const registro = deps.registro ?? registroProduccion;
  const onMessage: PeerEvents["onMessage"] = (peerId, data) => {
    const msg = parseAstrauraMallaMensaje(data);
    if (!msg) return;
    if (msg.t === "astraura.pedir") {
      void manejarPeticionAstrauraMalla(mesh, peerId, msg, deps);
    } else if (msg.t === "astraura.cancelar") {
      manejarCancelarAstrauraMalla(peerId, msg, { registro });
    } else if (msg.t === "astraura.ping") {
      try {
        mesh.sendToPeer(
          peerId,
          JSON.stringify({ t: "astraura.pong", id: msg.id, cola: registro.has(peerId) ? 1 : 0 } satisfies MsgPong),
        );
      } catch {
        /* noop */
      }
    }
  };
  const onState: PeerEvents["onState"] = (snap: PeerSnapshot) => {
    if (snap.state === "connected") return;
    const en = registro.get(snap.deviceId);
    if (en) {
      try {
        en.abort.abort();
      } catch {
        /* noop */
      }
    }
  };
  return mesh.onPeer({ onMessage, onState });
}

let servidorTimer: ReturnType<typeof setInterval> | null = null;
let servidorUnsub: (() => void) | null = null;

/**
 * iniciarServidorAstrauraPorMalla — arranca (o reintenta hasta que exista) el
 * rol servidor sobre el mesh COMPARTIDO (`getSharedMesh()`; nunca abre uno
 * segundo). Idempotente: una segunda llamada mientras la primera sigue viva no
 * duplica el listener. Devuelve una función de parada.
 */
export function iniciarServidorAstrauraPorMalla(): () => void {
  let cancelado = false;
  const intentar = () => {
    if (cancelado || servidorUnsub) return;
    const mesh = getSharedMesh();
    if (mesh) servidorUnsub = adjuntarServidorAstrauraMalla(mesh);
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

/* ══════════════════════════ 3) Rol CLIENTE ══════════════════════════ */

export interface ServidorAstrauraMalla {
  syncDeviceId: string;
  latenciaMs?: number;
}

/**
 * servidoresAstrauraMalla — peers de la MISMA cuenta, conectados ahora mismo,
 * cuya ficha anuncia `sirveAstraura`, ordenados por latencia (la que el propio
 * peer midió a SU backend en la ficha; si no la mandó, la latencia de ida y
 * vuelta del canal). Lectura SÍNCRONA del estado ya publicado por el motor de
 * la malla (`snapshotMallaNeuronas()`) — no arranca nada ni sondea la red.
 */
export function servidoresAstrauraMalla(): ServidorAstrauraMalla[] {
  const estado = snapshotMallaNeuronas();
  return estado.misDispositivos
    .filter((d) => !d.esEsteDispositivo && d.enlace.estado === "conectado" && !!d.syncDeviceId && !!d.ficha?.sirveAstraura)
    .map((d) => ({
      syncDeviceId: d.syncDeviceId as string,
      latenciaMs: d.ficha?.astrauraLatenciaMs ?? d.enlace.latenciaMs,
    }))
    .sort((a, b) => (a.latenciaMs ?? Infinity) - (b.latenciaMs ?? Infinity));
}

export interface AstrauraMallaErrorExtra {
  ocupado?: boolean;
  estado?: number;
  sinServidor?: boolean;
  peerPerdido?: boolean;
}
export type AstrauraMallaError = Error & AstrauraMallaErrorExtra;

function errorTipado(mensaje: string, extra: AstrauraMallaErrorExtra): AstrauraMallaError {
  const err = new Error(mensaje) as AstrauraMallaError;
  Object.assign(err, extra);
  return err;
}

const TIMEOUT_PRIMER_TROZO_MS = 120_000;
const TIMEOUT_TOTAL_CLIENTE_MS = 200_000;

export interface PedirAstrauraMallaOpciones {
  cuerpo: AstrauraMallaBody;
  signal?: AbortSignal;
  onTexto?: (delta: string) => void;
  /** Sustituye `getSharedMesh()` (pruebas / llamador que ya tiene el handle). */
  mesh?: MeshHandle;
  /** Sustituye `servidoresAstrauraMalla()[0]` (pruebas, o elegir uno concreto). */
  servidor?: ServidorAstrauraMalla;
  /** ms sin ningún `astraura.trozo` desde el envío (por defecto 120 s). */
  timeoutPrimerTrozoMs?: number;
  /** ms totales sin `astraura.fin` (por defecto 200 s). */
  timeoutTotalMs?: number;
}

/**
 * pedirAstrauraPorMalla — pide un turno de Astraura 1.58 a la mejor neurona de
 * la malla que lo sirva. Devuelve el texto completo; si `onTexto` está
 * presente, también transmite cada trozo según llega. Errores TIPADOS
 * (`AstrauraMallaError`): ocupado (`ocupado:true`, mensaje con
 * "retry after Ns" — misma convención que `astraura-158.ts`), sin servidor
 * (`sinServidor:true`), peer perdido (`peerPerdido:true`) o timeout. Honra
 * `signal`: al abortar, manda `astraura.cancelar` y rechaza con `AbortError`.
 */
export async function pedirAstrauraPorMalla(opciones: PedirAstrauraMallaOpciones): Promise<string> {
  const mesh = opciones.mesh ?? getSharedMesh();
  if (!mesh) throw errorTipado("Sin malla P2P activa en este dispositivo.", { sinServidor: true });
  const objetivo = opciones.servidor ?? servidoresAstrauraMalla()[0];
  if (!objetivo) throw errorTipado("Sin servidor en la malla.", { sinServidor: true });

  const id = crearIdPeticion();
  let acc = "";

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let unsub: (() => void) | null = null;

    const enviarCancelar = () => {
      try {
        mesh.sendToPeer(objetivo.syncDeviceId, JSON.stringify({ t: "astraura.cancelar", id } satisfies MsgCancelar));
      } catch {
        /* noop */
      }
    };
    const limpiar = () => {
      unsub?.();
      clearTimeout(primerTrozoTimer);
      clearTimeout(totalTimer);
      opciones.signal?.removeEventListener("abort", onAbort);
    };
    const finalizar = (fn: () => void) => {
      if (settled) return;
      settled = true;
      limpiar();
      fn();
    };
    const onAbort = () => {
      enviarCancelar();
      finalizar(() => reject(new DOMException("Astraura por la malla: turno abortado.", "AbortError")));
    };
    opciones.signal?.addEventListener("abort", onAbort, { once: true });

    unsub = mesh.onPeer({
      onMessage: (peerId, data) => {
        if (peerId !== objetivo.syncDeviceId) return;
        const msg = parseAstrauraMallaMensaje(data);
        if (!msg || msg.id !== id) return;
        if (msg.t === "astraura.trozo") {
          clearTimeout(primerTrozoTimer);
          acc += msg.texto;
          opciones.onTexto?.(msg.texto);
        } else if (msg.t === "astraura.fin") {
          finalizar(() => resolve(acc));
        } else if (msg.t === "astraura.error") {
          const n = msg.reintentarEnS ? Math.max(1, Math.round(msg.reintentarEnS)) : undefined;
          const err = errorTipado(
            `Astraura por la malla ocupado${n ? `: retry after ${n}s` : ""} · ${msg.mensaje}`,
            { ocupado: !!msg.ocupado, estado: msg.estado },
          );
          finalizar(() => reject(err));
        }
      },
      onState: (snap) => {
        if (snap.deviceId === objetivo.syncDeviceId && snap.state !== "connected") {
          finalizar(() => reject(errorTipado("El servidor de la malla se desconectó.", { peerPerdido: true })));
        }
      },
    });

    const primerTrozoTimer = setTimeout(() => {
      enviarCancelar();
      finalizar(() => reject(errorTipado("Astraura por la malla: sin respuesta (timeout).", {})));
    }, opciones.timeoutPrimerTrozoMs ?? TIMEOUT_PRIMER_TROZO_MS);

    const totalTimer = setTimeout(() => {
      enviarCancelar();
      const s = Math.round((opciones.timeoutTotalMs ?? TIMEOUT_TOTAL_CLIENTE_MS) / 1000);
      finalizar(() => reject(errorTipado(`Astraura por la malla: timeout total (${s}s).`, {})));
    }, opciones.timeoutTotalMs ?? TIMEOUT_TOTAL_CLIENTE_MS);

    const ok = mesh.sendToPeer(objetivo.syncDeviceId, JSON.stringify({ t: "astraura.pedir", id, cuerpo: opciones.cuerpo } satisfies MsgPedir));
    if (!ok) {
      finalizar(() => reject(errorTipado("No se pudo enviar la petición por la malla (canal cerrado).", {})));
    }
  });
}
