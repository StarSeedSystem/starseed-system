"use client";

/*
 * ia-por-malla — Relé P2P GENÉRICO de inteligencia sobre la malla de neuronas
 * (Ola 368). ---------------------------------------------------------------
 * La Ola 367 (`astraura-por-malla.ts`) dejó que una neurona sin backend local
 * pidiera Astraura 1.58 a OTRA neurona de la MISMA cuenta. Alex pidió que
 * "ese funcionamiento p2p de la ia" sirva para TODOS los usuarios, TODAS sus
 * neuronas y CUALQUIER modelo configurado con su perfil y cuenta — no solo
 * Astraura. Este módulo GENERALIZA el relé: protocolo `ia.*`, cuerpo con
 * `fuente`/`modelo` opcionales (cualquier id del catálogo, no solo 1.58) y un
 * `perfil` (personalidad/agente) para que el turno sea indistinguible de uno
 * local.
 *
 * `astraura.*` (Ola 367) sigue funcionando TAL CUAL — este módulo es un
 * protocolo HERMANO sobre el MISMO canal, no un reemplazo: los peers viejos
 * que solo entienden `astraura.*` siguen sirviendo Astraura 1.58 como antes
 * (ver `astraura-por-malla.ts`, sin tocar). `ia-por-malla.ts` añade la vía
 * GENÉRICA para cualquier otra fuente/modelo, y también para Astraura cuando
 * el llamador quiere pasar por el enrutador completo de la cuenta (personas,
 * skills, primary-system…) en vez de hablar directo con el backend BitNet.
 *
 * Protocolo (JSON, namespace `ia.*`, cada mensaje ≤ 16 KB):
 *   cliente → servidor  ia.pedir     {id, cuerpo:{messages, system?, fuente?, modelo?, perfil?:{personaId?, agenteId?}, preferencias?}}
 *   servidor → cliente  ia.trozo     {id, texto}          (lote de tokens cada ~100 ms)
 *   servidor → cliente  ia.fin       {id, fuente, modelo} (qué sirvió DE VERDAD el enrutador del servidor)
 *   servidor → cliente  ia.error     {id, estado, mensaje, reintentarEnS?, ocupado?}
 *   cliente → servidor  ia.cancelar  {id}
 *
 * ROL SERVIDOR: solo si la capa mesh está compartiendo (`capaMeshCompartiendo()`:
 * maestro 1.58 + capa mesh encendidos — Alex: "respeta las capas"). Ejecuta el
 * turno con el ENRUTADOR PROPIO de esta cuenta (`astrauraChat` de
 * `ai/astraura/router.ts`, importado DINÁMICAMENTE para no crear un ciclo
 * estático: el enrutador llega a este módulo por el registro de proveedores
 * — `providers/ia-malla.ts` — y este módulo, en su rol SERVIDOR, vuelve a
 * llamar al enrutador; ver la cabecera de `applyLiveOpenRouter()` en
 * `free-catalog.ts` para el mismo patrón). Con `fuente`/`modelo` pedidos y
 * listos en ESTA neurona, los fija (`forceSource`); si no, deja que el
 * enrutador use su cadena libre-primero normal (nunca una fuente de pago que
 * el dueño no haya configurado — el propio enrutador ya lo garantiza). SIEMPRE
 * marca `desdeMalla:true`: una petición que llegó por la malla NUNCA vuelve a
 * salir por ella — sin esto, A pide a B, B no tiene el modelo y se lo
 * reenvía a la malla (quizás de vuelta a A): un bucle. Como mucho 1 petición
 * en vuelo POR PEER (`estado:429`); corte duro a los 200 s.
 *
 * ROL CLIENTE: `servidoresIaPorMalla({fuente?})` lista los peers conectados
 * de la MISMA cuenta que anuncian esa fuente en su ficha (o cualquier fuente
 * si no se pide una concreta), ordenados por latencia y EXCLUYENDO los que
 * están en enfriamiento — el enfriamiento es POR PEER, no global: que un
 * peer esté ocupado no debe apartar a los demás que sirven lo mismo.
 * `pedirIaPorMalla()` prueba, como mucho, `maxPeers` candidatos (por defecto
 * 2) dentro de un presupuesto de tiempo compartido (200 s total / 120 s
 * hasta el primer trozo) y RESUELVE el texto completo (streaming vía
 * `onTexto`), con errores tipados: ocupado, sin servidor, timeout o peer
 * perdido. Honra `signal`.
 *
 * Reutiliza SIEMPRE el mesh COMPARTIDO (`getSharedMesh()` de `lan-sync.ts`):
 * este módulo nunca abre una segunda malla.
 */

import { getSharedMesh, capaMeshCompartiendo } from "@/lib/network/lan-sync";
import type { MeshHandle, PeerEvents, PeerSnapshot } from "@/lib/network/webrtc-mesh";
import { snapshotMallaNeuronas, type FichaDispositivo } from "@/lib/network/malla-neuronas";
import { bytesUtf8, partirEnTrozos, crearIdPeticion } from "@/lib/network/astraura-por-malla";
import type { ChatMessage } from "@/ai/providers/types";

/* ══════════════════════════ 1) Protocolo (puro) ══════════════════════════ */

export const IA_MALLA_NS = "ia.";
/** Límite duro del protocolo: ningún mensaje viaja por el canal por encima de esto. */
export const IA_MALLA_MAX_BYTES = 16 * 1024;
const TROZO_MARGEN_BYTES = 256;

/** Modelo "sin pin": el servidor usa su propio enrutador libre-primero (casos de último recurso). */
export const IA_MALLA_MODEL_AUTO = "auto";
const PIN_PREFIX = "pin::";
const PIN_SEP = "::";

/**
 * Codifica un pin de fuente/modelo en un único id de modelo del catálogo,
 * para que un `RouteCandidate` construido a mano (caso "a" del enrutador,
 * ver `router.ts`) viaje por los mismos campos (`model.id`) que cualquier
 * otro candidato, sin ampliar el contrato de `CatalogModel`. Pura.
 */
export function codificarModeloIaMalla(fuente: string, modelo: string): string {
  return `${PIN_PREFIX}${fuente}${PIN_SEP}${modelo}`;
}

/** Inversa de `codificarModeloIaMalla`. `{}` si `modelId` no es un pin (p. ej. "auto"). Pura. */
export function decodificarModeloIaMalla(modelId: string): { fuente?: string; modelo?: string } {
  if (!modelId.startsWith(PIN_PREFIX)) return {};
  const resto = modelId.slice(PIN_PREFIX.length);
  const idx = resto.indexOf(PIN_SEP);
  if (idx < 0) return {};
  const fuente = resto.slice(0, idx);
  const modelo = resto.slice(idx + PIN_SEP.length);
  if (!fuente || !modelo) return {};
  return { fuente, modelo };
}

export interface IaMallaPerfil {
  personaId?: string;
  agenteId?: string;
}

export interface IaMallaCuerpo {
  messages: { role: string; content: string }[];
  system?: string;
  /** Id de fuente del catálogo que el que pide quiere (p. ej. "ollama-local"). Ausente = sin pin. */
  fuente?: string;
  /** Id de modelo dentro de esa fuente. Ausente = sin pin. */
  modelo?: string;
  perfil?: IaMallaPerfil;
  preferencias?: Record<string, unknown>;
}

export interface MsgIaPedir {
  t: "ia.pedir";
  id: string;
  cuerpo: IaMallaCuerpo;
}
export interface MsgIaTrozo {
  t: "ia.trozo";
  id: string;
  texto: string;
}
export interface MsgIaFin {
  t: "ia.fin";
  id: string;
  /** Fuente que SIRVIÓ de verdad (puede no ser la pedida, si el enrutador del servidor degradó). */
  fuente: string;
  modelo: string;
}
export interface MsgIaError {
  t: "ia.error";
  id: string;
  estado: number;
  mensaje: string;
  reintentarEnS?: number;
  ocupado?: boolean;
}
export interface MsgIaCancelar {
  t: "ia.cancelar";
  id: string;
}

export type IaMallaMsg = MsgIaPedir | MsgIaTrozo | MsgIaFin | MsgIaError | MsgIaCancelar;

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

/** Guard puro: ¿`x` es un mensaje del protocolo `ia.*` bien formado? */
export function esMensajeIaMalla(x: unknown): x is IaMallaMsg {
  if (!esObjeto(x)) return false;
  const t = x.t;
  if (typeof t !== "string" || !t.startsWith(IA_MALLA_NS)) return false;
  if (typeof x.id !== "string" || !x.id) return false;
  switch (t) {
    case "ia.pedir":
      return esObjeto(x.cuerpo) && Array.isArray((x.cuerpo as Record<string, unknown>).messages);
    case "ia.trozo":
      return typeof x.texto === "string";
    case "ia.fin":
      return typeof x.fuente === "string" && typeof x.modelo === "string";
    case "ia.error":
      return typeof x.estado === "number" && typeof x.mensaje === "string";
    case "ia.cancelar":
      return true;
    default:
      return false;
  }
}

/** JSON.parse defensivo + guard. Nunca lanza; `null` si no es del protocolo. */
export function parseIaMallaMensaje(raw: string): IaMallaMsg | null {
  try {
    const obj: unknown = JSON.parse(raw);
    return esMensajeIaMalla(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** ¿El JSON de este mensaje cabe en el límite del protocolo (≤ 16 KB)? */
export function cabeEnMensajeIa(json: string): boolean {
  return bytesUtf8(json) <= IA_MALLA_MAX_BYTES;
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

export interface ResultadoEjecucion {
  text: string;
  fuente: string;
  modelo: string;
}

export interface DepsServidorIaMalla {
  /** Sustituye la comprobación de capa (`capaMeshCompartiendo`). */
  puedeServir?: () => boolean;
  /** Sustituye la ejecución real con el enrutador (pruebas: sin `router.ts` real). */
  ejecutar?: (cuerpo: IaMallaCuerpo, opts: { signal: AbortSignal; onChunk: (delta: string) => void }) => Promise<ResultadoEjecucion>;
  /** Registro de peticiones en vuelo por peer (pruebas: un Map propio y aislado). */
  registro?: Map<string, PeticionEnCurso>;
  /** ms entre lotes de `ia.trozo` (por defecto 100). */
  flushMs?: number;
  /** Corte duro total (por defecto 200 s). */
  timeoutTotalMs?: number;
}

/** ¿Puede ESTA neurona relayar IA por la malla ahora mismo? Capa mesh compartiendo. */
function puedeServirDefecto(): boolean {
  return capaMeshCompartiendo();
}

/**
 * ejecutarConRouterDefecto — ejecuta el turno con el ENRUTADOR PROPIO de esta
 * cuenta. Import DINÁMICO de `astrauraChat` a propósito: este módulo llega a
 * `router.ts` también por el registro de proveedores (`providers/ia-malla.ts`
 * → `pedirIaPorMalla` → aquí), así que un import estático crearía un ciclo
 * (router.ts → .../chat.ts → providers/index.ts → providers/ia-malla.ts →
 * este módulo → router.ts). El import dinámico rompe el ciclo ESTÁTICO —
 * mismo patrón que ya usa `free-catalog.ts` en `applyLiveOpenRouter()`.
 */
async function ejecutarConRouterDefecto(
  cuerpo: IaMallaCuerpo,
  opts: { signal: AbortSignal; onChunk: (delta: string) => void },
): Promise<ResultadoEjecucion> {
  const { astrauraChat } = await import("@/ai/astraura/router");
  const messages: ChatMessage[] = cuerpo.system
    ? [{ role: "system", content: cuerpo.system }, ...(cuerpo.messages as ChatMessage[])]
    : (cuerpo.messages as ChatMessage[]);
  const forceSource =
    cuerpo.fuente && cuerpo.modelo ? { sourceId: cuerpo.fuente, modelId: cuerpo.modelo } : undefined;
  const res = await astrauraChat({
    messages,
    signal: opts.signal,
    onChunk: opts.onChunk,
    forceSource,
    agentId: cuerpo.perfil?.agenteId,
    // (Ola 368) NUNCA re-salir por la malla: evita el bucle A→B→A.
    desdeMalla: true,
  });
  return {
    text: res.text,
    fuente: res.route?.sourceId ?? "desconocida",
    modelo: res.route?.model ?? "desconocido",
  };
}

function enviarError(
  mesh: Pick<MeshHandle, "sendToPeer">,
  peerId: string,
  id: string,
  estado: number,
  mensaje: string,
  extra?: { reintentarEnS?: number; ocupado?: boolean },
): void {
  const msg: MsgIaError = { t: "ia.error", id, estado, mensaje: mensaje.slice(0, 300), ...extra };
  try {
    mesh.sendToPeer(peerId, JSON.stringify(msg));
  } catch {
    /* peer ya no escucha: nada que hacer */
  }
}

/**
 * manejarPeticionIaMalla — atiende UN `ia.pedir` de `peerId`. Exportada (con
 * `deps` inyectables) para poder probarla con un mesh de mentira y un
 * `ejecutar` de mentira, sin `getSharedMesh()` ni el enrutador real.
 */
export async function manejarPeticionIaMalla(
  mesh: Pick<MeshHandle, "sendToPeer">,
  peerId: string,
  msg: MsgIaPedir,
  deps: DepsServidorIaMalla = {},
): Promise<void> {
  const registro = deps.registro ?? registroProduccion;
  const puedeServir = deps.puedeServir ?? puedeServirDefecto;
  const ejecutar = deps.ejecutar ?? ejecutarConRouterDefecto;
  const flushMs = deps.flushMs ?? FLUSH_TROZO_MS;
  const timeoutTotalMs = deps.timeoutTotalMs ?? TIMEOUT_TOTAL_SERVIDOR_MS;

  if (!puedeServir()) {
    enviarError(mesh, peerId, msg.id, 503, "Esta neurona no comparte su enrutador de IA por la malla ahora mismo.");
    return;
  }
  if (registro.has(peerId)) {
    enviarError(mesh, peerId, msg.id, 429, "Ya hay una petición de IA en curso desde este dispositivo.", { reintentarEnS: 10 });
    return;
  }

  const abort = new AbortController();
  const estado: PeticionEnCurso = { id: msg.id, abort };
  registro.set(peerId, estado);

  let buffer = "";
  let huboStreaming = false;
  const flushTimer = setInterval(() => {
    if (!buffer) return;
    for (const parte of partirEnTrozos(buffer, IA_MALLA_MAX_BYTES - TROZO_MARGEN_BYTES)) {
      try {
        mesh.sendToPeer(peerId, JSON.stringify({ t: "ia.trozo", id: msg.id, texto: parte } satisfies MsgIaTrozo));
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
    clearInterval(flushTimer);
    clearTimeout(timeoutTotal);
    if (registro.get(peerId) === estado) registro.delete(peerId);
  };

  try {
    const resultado = await ejecutar(msg.cuerpo, {
      signal: abort.signal,
      onChunk: (delta: string) => {
        if (delta) {
          huboStreaming = true;
          buffer += delta;
        }
      },
    });
    // Si el enrutador del servidor NUNCA emitió streaming (proveedor sin
    // `onChunk` real) pero sí devolvió texto al resolver, ese texto completo
    // es lo que hay que mandar — el cliente nunca se queda sin respuesta por
    // un candidato no-streaming.
    if (!huboStreaming && resultado.text) buffer = resultado.text;
    if (buffer) {
      for (const parte of partirEnTrozos(buffer, IA_MALLA_MAX_BYTES - TROZO_MARGEN_BYTES)) {
        try {
          mesh.sendToPeer(peerId, JSON.stringify({ t: "ia.trozo", id: msg.id, texto: parte } satisfies MsgIaTrozo));
        } catch {
          /* noop */
        }
      }
      buffer = "";
    }
    mesh.sendToPeer(
      peerId,
      JSON.stringify({ t: "ia.fin", id: msg.id, fuente: resultado.fuente, modelo: resultado.modelo } satisfies MsgIaFin),
    );
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error al ejecutar el turno de IA por la malla.";
    enviarError(mesh, peerId, msg.id, 502, mensaje);
  } finally {
    limpiar();
  }
}

/**
 * manejarCancelarIaMalla — corta (aborta) la petición en vuelo de `peerId` SI
 * su id coincide con `msg.id` (una `ia.cancelar` tardía de un turno ya
 * terminado no toca nada).
 */
export function manejarCancelarIaMalla(
  peerId: string,
  msg: MsgIaCancelar,
  deps: Pick<DepsServidorIaMalla, "registro"> = {},
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
export function reiniciarServidorIaMallaParaTests(): void {
  registroProduccion.clear();
}

/**
 * adjuntarServidorIaMalla — conecta el rol servidor a un `MeshHandle` (real o
 * de mentira): escucha `ia.pedir`/`ia.cancelar` y aborta la petición en vuelo
 * de un peer si se desconecta. Devuelve `unsubscribe`.
 */
export function adjuntarServidorIaMalla(mesh: MeshHandle, deps: DepsServidorIaMalla = {}): () => void {
  const registro = deps.registro ?? registroProduccion;
  const onMessage: PeerEvents["onMessage"] = (peerId, data) => {
    const msg = parseIaMallaMensaje(data);
    if (!msg) return;
    if (msg.t === "ia.pedir") {
      void manejarPeticionIaMalla(mesh, peerId, msg, deps);
    } else if (msg.t === "ia.cancelar") {
      manejarCancelarIaMalla(peerId, msg, { registro });
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
 * iniciarServidorIaPorMalla — arranca (o reintenta hasta que exista) el rol
 * servidor sobre el mesh COMPARTIDO (`getSharedMesh()`; nunca abre uno
 * segundo). Idempotente. Devuelve una función de parada. Coexiste con
 * `iniciarServidorAstrauraPorMalla()` (Ola 367): namespaces `ia.*` y
 * `astraura.*` son disjuntos sobre el MISMO canal.
 */
export function iniciarServidorIaPorMalla(): () => void {
  let cancelado = false;
  const intentar = () => {
    if (cancelado || servidorUnsub) return;
    const mesh = getSharedMesh();
    if (mesh) servidorUnsub = adjuntarServidorIaMalla(mesh);
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

export interface ServidorIaMalla {
  syncDeviceId: string;
  nombre?: string;
  latenciaMs?: number;
  fuentesServibles: string[];
}

/** ¿La ficha de un peer sirve la `fuente` pedida (o cualquiera, sin pin)? */
function fichaSirveFuente(ficha: FichaDispositivo | undefined, fuente?: string): boolean {
  if (!ficha) return false;
  const lista = ficha.fuentesServibles ?? [];
  if (!fuente) return lista.length > 0 || !!ficha.sirveAstraura;
  if (lista.includes(fuente)) return true;
  // Compat: peers que solo hablan `astraura.*` (Ola 367) anuncian `sirveAstraura`
  // sin la lista genérica — cuentan para pines de la familia Astraura 1.58.
  if (ficha.sirveAstraura && fuente.startsWith("astraura-158")) return true;
  return false;
}

/* Enfriamiento POR PEER (nunca global): que un peer conteste "ocupado" no debe
 * apartar a otros peers que sirvan la misma fuente. Mapa en memoria de módulo. */
const enfriamientoPeers = new Map<string, number>();

function peerEnEnfriamiento(peerId: string, ahora: number = Date.now()): boolean {
  const hasta = enfriamientoPeers.get(peerId);
  return typeof hasta === "number" && hasta > ahora;
}

function enfriarPeer(peerId: string, segundos: number): void {
  enfriamientoPeers.set(peerId, Date.now() + Math.max(1, Math.round(segundos)) * 1000);
}

/** Solo para pruebas: olvida el enfriamiento por peer. */
export function reiniciarEnfriamientoIaMallaParaTests(): void {
  enfriamientoPeers.clear();
}

/**
 * servidoresIaPorMalla — peers de la MISMA cuenta, conectados ahora mismo,
 * cuya ficha anuncia la `fuente` pedida (o cualquiera, si no se pidió una
 * concreta), EXCLUYENDO los que están en enfriamiento, ordenados por
 * latencia. Lectura SÍNCRONA del estado ya publicado por el motor de la
 * malla (`snapshotMallaNeuronas()`) — no arranca nada ni sondea la red.
 */
export function servidoresIaPorMalla(opts?: { fuente?: string }): ServidorIaMalla[] {
  const ahora = Date.now();
  const estado = snapshotMallaNeuronas();
  return estado.misDispositivos
    .filter(
      (d) =>
        !d.esEsteDispositivo &&
        d.enlace.estado === "conectado" &&
        !!d.syncDeviceId &&
        fichaSirveFuente(d.ficha, opts?.fuente) &&
        !peerEnEnfriamiento(d.syncDeviceId, ahora),
    )
    .map((d) => ({
      syncDeviceId: d.syncDeviceId as string,
      nombre: d.nombre,
      latenciaMs: d.ficha?.astrauraLatenciaMs ?? d.enlace.latenciaMs,
      fuentesServibles: d.ficha?.fuentesServibles ?? [],
    }))
    .sort((a, b) => (a.latenciaMs ?? Infinity) - (b.latenciaMs ?? Infinity));
}

export interface IaMallaErrorExtra {
  ocupado?: boolean;
  estado?: number;
  sinServidor?: boolean;
  peerPerdido?: boolean;
}
export type IaMallaError = Error & IaMallaErrorExtra;

function errorTipado(mensaje: string, extra: IaMallaErrorExtra): IaMallaError {
  const err = new Error(mensaje) as IaMallaError;
  Object.assign(err, extra);
  return err;
}

const TIMEOUT_PRIMER_TROZO_MS = 120_000;
const TIMEOUT_TOTAL_CLIENTE_MS = 200_000;
const MAX_PEERS_POR_DEFECTO = 2;

export interface PedirIaMallaOpciones {
  cuerpo: IaMallaCuerpo;
  signal?: AbortSignal;
  onTexto?: (delta: string) => void;
  /** Sustituye `getSharedMesh()` (pruebas / llamador que ya tiene el handle). */
  mesh?: MeshHandle;
  /** Sustituye `servidoresIaPorMalla({fuente})` (pruebas, o elegir peers concretos). */
  candidatos?: ServidorIaMalla[];
  /** Cuántos peers probar como máximo antes de rendirse (por defecto 2). */
  maxPeers?: number;
  /** ms sin ningún `ia.trozo` desde el envío, por intento (por defecto 120 s). */
  timeoutPrimerTrozoMs?: number;
  /** ms totales del PRESUPUESTO COMPARTIDO entre todos los intentos (por defecto 200 s). */
  timeoutTotalMs?: number;
}

export interface RespuestaIaMalla {
  text: string;
  peer: string;
  fuente: string;
  modelo: string;
}

/** Un único intento contra UN peer; no reintenta ni elige — eso lo hace `pedirIaPorMalla`. */
function intentarConPeer(
  mesh: MeshHandle,
  peer: ServidorIaMalla,
  cuerpo: IaMallaCuerpo,
  opts: { signal?: AbortSignal; onTexto?: (d: string) => void; timeoutPrimerTrozoMs: number; timeoutTotalMs: number },
): Promise<RespuestaIaMalla> {
  const id = crearIdPeticion();
  let acc = "";
  return new Promise<RespuestaIaMalla>((resolve, reject) => {
    let settled = false;
    let unsub: (() => void) | null = null;

    const enviarCancelar = () => {
      try {
        mesh.sendToPeer(peer.syncDeviceId, JSON.stringify({ t: "ia.cancelar", id } satisfies MsgIaCancelar));
      } catch {
        /* noop */
      }
    };
    const limpiar = () => {
      unsub?.();
      clearTimeout(primerTrozoTimer);
      clearTimeout(totalTimer);
      opts.signal?.removeEventListener("abort", onAbort);
    };
    const finalizar = (fn: () => void) => {
      if (settled) return;
      settled = true;
      limpiar();
      fn();
    };
    const onAbort = () => {
      enviarCancelar();
      finalizar(() => reject(new DOMException("IA por la malla: turno abortado.", "AbortError")));
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    unsub = mesh.onPeer({
      onMessage: (peerId, data) => {
        if (peerId !== peer.syncDeviceId) return;
        const msg = parseIaMallaMensaje(data);
        if (!msg || msg.id !== id) return;
        if (msg.t === "ia.trozo") {
          clearTimeout(primerTrozoTimer);
          acc += msg.texto;
          opts.onTexto?.(msg.texto);
        } else if (msg.t === "ia.fin") {
          finalizar(() => resolve({ text: acc, peer: peer.syncDeviceId, fuente: msg.fuente, modelo: msg.modelo }));
        } else if (msg.t === "ia.error") {
          const n = msg.reintentarEnS ? Math.max(1, Math.round(msg.reintentarEnS)) : undefined;
          const err = errorTipado(
            `IA por la malla ocupado${n ? `: retry after ${n}s` : ""} · ${msg.mensaje}`,
            { ocupado: !!msg.ocupado, estado: msg.estado },
          );
          finalizar(() => reject(err));
        }
      },
      onState: (snap) => {
        if (snap.deviceId === peer.syncDeviceId && snap.state !== "connected") {
          finalizar(() => reject(errorTipado("El servidor de la malla se desconectó.", { peerPerdido: true })));
        }
      },
    });

    const primerTrozoTimer = setTimeout(() => {
      enviarCancelar();
      finalizar(() => reject(errorTipado("IA por la malla: sin respuesta (timeout).", {})));
    }, opts.timeoutPrimerTrozoMs);

    const totalTimer = setTimeout(() => {
      enviarCancelar();
      finalizar(() => reject(errorTipado(`IA por la malla: timeout total (${Math.round(opts.timeoutTotalMs / 1000)}s).`, {})));
    }, opts.timeoutTotalMs);

    const ok = mesh.sendToPeer(peer.syncDeviceId, JSON.stringify({ t: "ia.pedir", id, cuerpo } satisfies MsgIaPedir));
    if (!ok) {
      finalizar(() => reject(errorTipado("No se pudo enviar la petición por la malla (canal cerrado).", {})));
    }
  });
}

/**
 * pedirIaPorMalla — pide un turno de IA a la mejor neurona de la malla que lo
 * sirva. Elige por: anuncia la fuente pedida → menor latencia → sin
 * enfriamiento (`servidoresIaPorMalla`); si el peor elegido está ocupado, lo
 * enfría (SOLO A ÉL) y prueba el siguiente candidato, dentro de un
 * presupuesto de tiempo COMPARTIDO entre todos los intentos (nunca supera
 * `timeoutTotalMs` en total, aunque pruebe varios peers). Devuelve el texto
 * completo; si `onTexto` está presente, también transmite cada trozo según
 * llega. Errores TIPADOS (`IaMallaError`): sin servidor (`sinServidor:true`),
 * ocupado (`ocupado:true`, solo cuando TODOS los candidatos probados estaban
 * ocupados — así el enrutador solo enfría la fuente `ia-malla` entera cuando
 * de verdad no hay nadie en la malla que ayude ahora), peer perdido o
 * timeout. Honra `signal`.
 */
export async function pedirIaPorMalla(opciones: PedirIaMallaOpciones): Promise<RespuestaIaMalla> {
  const mesh = opciones.mesh ?? getSharedMesh();
  if (!mesh) throw errorTipado("Sin malla P2P activa en este dispositivo.", { sinServidor: true });
  const candidatos = opciones.candidatos ?? servidoresIaPorMalla({ fuente: opciones.cuerpo.fuente });
  if (!candidatos.length) {
    throw errorTipado(
      opciones.cuerpo.fuente ? `Sin servidor en la malla para "${opciones.cuerpo.fuente}".` : "Sin servidor en la malla.",
      { sinServidor: true },
    );
  }

  const maxPeers = Math.max(1, opciones.maxPeers ?? MAX_PEERS_POR_DEFECTO);
  const timeoutTotalMs = opciones.timeoutTotalMs ?? TIMEOUT_TOTAL_CLIENTE_MS;
  const timeoutPrimerTrozoMs = opciones.timeoutPrimerTrozoMs ?? TIMEOUT_PRIMER_TROZO_MS;
  const deadline = Date.now() + timeoutTotalMs;

  let ultimoError: IaMallaError | undefined;
  for (const peer of candidatos.slice(0, maxPeers)) {
    const restante = deadline - Date.now();
    if (restante <= 1000) break;
    try {
      return await intentarConPeer(mesh, peer, opciones.cuerpo, {
        signal: opciones.signal,
        onTexto: opciones.onTexto,
        timeoutPrimerTrozoMs: Math.min(timeoutPrimerTrozoMs, restante),
        timeoutTotalMs: restante,
      });
    } catch (e) {
      const err = e as IaMallaError;
      if (err?.name === "AbortError") throw err; // el que llamó canceló: no seguir probando peers
      ultimoError = err;
      if (err?.ocupado) {
        const n = /retry after (\d+)s/.exec(err.message)?.[1];
        enfriarPeer(peer.syncDeviceId, n ? Number(n) : 10);
      }
      // peerPerdido / timeout / cualquier otro fallo de ESTE peer: se prueba
      // el siguiente candidato (si queda tiempo y candidatos).
    }
  }
  if (ultimoError) throw ultimoError;
  throw errorTipado("Sin servidor en la malla (tiempo agotado eligiendo peer).", { sinServidor: true });
}
