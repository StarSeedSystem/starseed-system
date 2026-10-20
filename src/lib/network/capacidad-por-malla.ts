"use client";

/*
 * capacidad-por-malla — Relé P2P GENÉRICO de capacidades sobre la malla de neuronas
 * (Ola 1017A).
 */

import { getSharedMesh, capaMeshCompartiendo } from "@/lib/network/lan-sync";
import type { MeshHandle, PeerEvents, PeerSnapshot } from "@/lib/network/webrtc-mesh";
import { snapshotMallaNeuronas, type FichaDispositivo } from "@/lib/network/malla-neuronas";
import { bytesUtf8, partirEnTrozos, crearIdPeticion } from "@/lib/network/astraura-por-malla";

/* ══════════════════════════ 1) Protocolo (puro) ══════════════════════════ */

export const CAPACIDAD_NS = "capacidad.";
export const CAPACIDAD_MAX_BYTES = 16 * 1024;
const TROZO_MARGEN_BYTES = 256;

export type CapacidadTipo = 
  | "imagen"
  | "voz"
  | "oido"
  | "palabra"
  | "transcodificar"
  | "render"
  | "buscar"
  | "construir";

export interface CapacidadCuerpo {
  tipo: CapacidadTipo;
  datos?: unknown;
  sesionId?: string;
  timeoutMs?: number;
}

export interface MsgCapacidadPedir {
  t: "capacidad.pedir";
  id: string;
  cuerpo: CapacidadCuerpo;
}
export interface MsgCapacidadTrozo {
  t: "capacidad.trozo";
  id: string;
  chunk: string;
}
export interface MsgCapacidadFin {
  t: "capacidad.fin";
  id: string;
  tipo: CapacidadTipo;
  resultado?: unknown;
}
export interface MsgCapacidadError {
  t: "capacidad.error";
  id: string;
  estado: number;
  mensaje: string;
  reintentarEnS?: number;
  ocupado?: boolean;
}
export interface MsgCapacidadCancelar {
  t: "capacidad.cancelar";
  id: string;
}

export type CapacidadMallaMsg = 
  | MsgCapacidadPedir
  | MsgCapacidadTrozo
  | MsgCapacidadFin
  | MsgCapacidadError
  | MsgCapacidadCancelar;

export function esMensajeCapacidadMalla(x: unknown): x is CapacidadMallaMsg {
  if (!esObjeto(x)) return false;
  const t = x.t;
  if (typeof t !== "string" || !t.startsWith(CAPACIDAD_NS)) return false;
  if (typeof x.id !== "string" || !x.id) return false;
  switch (t) {
    case "capacidad.pedir":
      return esObjeto(x.cuerpo) && typeof (x.cuerpo as Record<string, unknown>).tipo === "string";
    case "capacidad.trozo":
      return typeof (x as Record<string, unknown>).chunk === "string";
    case "capacidad.fin":
      return typeof (x as Record<string, unknown>).tipo === "string";
    case "capacidad.error":
      return typeof (x as Record<string, unknown>).estado === "number" && typeof (x as Record<string, unknown>).mensaje === "string";
    case "capacidad.cancelar":
      return true;
    default:
      return false;
  }
}

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

export function parseCapacidadMallaMensaje(raw: string): CapacidadMallaMsg | null {
  try {
    const obj: unknown = JSON.parse(raw);
    return esMensajeCapacidadMalla(obj) ? obj : null;
  } catch {
    return null;
  }
}

export function cabeEnMensajeCapacidad(json: string): boolean {
  return bytesUtf8(json) <= CAPACIDAD_MAX_BYTES;
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

export interface ResultadoCapacidad {
  tipo: CapacidadTipo;
  resultado?: unknown;
}

export interface DepsServidorCapacidadMalla {
  /** Sustituye la comprobación de capa (`capaMeshCompartiendo`). */
  puedeServir?: () => boolean;
  /** Sustituye la ejecución real con el proveedor de capacidad (pruebas: sin proveedor real). */
  ejecutar?: (cuerpo: CapacidadCuerpo, opts: { signal: AbortSignal; onChunk: (delta: string) => void }) => Promise<ResultadoCapacidad>;
  /** Registro de peticiones en vuelo por peer (pruebas: un Map propio y aislado). */
  registro?: Map<string, PeticionEnCurso>;
  /** ms entre lotes de `capacidad.trozo` (por defecto 100). */
  flushMs?: number;
  /** Corte duro total (por defecto 200 s). */
  timeoutTotalMs?: number;
}

/** ¿Puede ESTA neurona relayar capacidad por la malla ahora mismo? Capa mesh compartiendo. */
function puedeServirDefecto(): boolean {
  return capaMeshCompartiendo();
}

/**
 * ejecutarConProveedorDefecto — ejecuta la capacidad con el proveedor local
 * apropiado. Import DINÁMICO para evitar ciclos estáticos.
 */
async function ejecutarConProveedorDefecto(
  cuerpo: CapacidadCuerpo,
  opts: { signal: AbortSignal; onChunk: (delta: string) => void },
): Promise<ResultadoCapacidad> {
  // Este es un placeholder. En la implementación real, se llamaría al
  // proveedor específico según el tipo de capacidad.
  // Para pruebas, se inyecta un ejecutor de mentira.
  throw new Error("No se ha implementado el proveedor para el tipo: " + cuerpo.tipo);
}

function enviarError(
  mesh: Pick<MeshHandle, "sendToPeer">,
  peerId: string,
  id: string,
  estado: number,
  mensaje: string,
  extra?: { reintentarEnS?: number; ocupado?: boolean },
): void {
  const msg: MsgCapacidadError = { t: "capacidad.error", id, estado, mensaje: mensaje.slice(0, 300), ...extra };
  try {
    mesh.sendToPeer(peerId, JSON.stringify(msg));
  } catch {
    /* peer ya no escucha: nada que hacer */
  }
}

/**
 * manejarPeticionCapacidadMalla — atiende UN `capacidad.pedir` de `peerId`.
 * Exportada (con `deps` inyectables) para poder probarla con un mesh de mentira
 * y un `ejecutar` de mentira, sin `getSharedMesh()` ni el proveedor real.
 */
export async function manejarPeticionCapacidadMalla(
  mesh: Pick<MeshHandle, "sendToPeer">,
  peerId: string,
  msg: MsgCapacidadPedir,
  deps: DepsServidorCapacidadMalla = {},
): Promise<void> {
  const registro = deps.registro ?? registroProduccion;
  const puedeServir = deps.puedeServir ?? puedeServirDefecto;
  const ejecutar = deps.ejecutar ?? ejecutarConProveedorDefecto;
  const flushMs = deps.flushMs ?? FLUSH_TROZO_MS;
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
  const estado: PeticionEnCurso = { id: msg.id, abort };
  registro.set(peerId, estado);

  let buffer = "";
  let huboStreaming = false;
  const flushTimer = setInterval(() => {
    if (!buffer) return;
    for (const parte of partirEnTrozos(buffer, CAPACIDAD_MAX_BYTES - TROZO_MARGEN_BYTES)) {
      try {
        mesh.sendToPeer(peerId, JSON.stringify({ t: "capacidad.trozo", id: msg.id, chunk: parte } satisfies MsgCapacidadTrozo));
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
    // Si el proveedor NUNCA emitió streaming pero sí devolvió resultado al resolver,
    // ese resultado completo es lo que hay que mandar.
    if (!huboStreaming && resultado.resultado) buffer = JSON.stringify(resultado.resultado);
    if (buffer) {
      for (const parte of partirEnTrozos(buffer, CAPACIDAD_MAX_BYTES - TROZO_MARGEN_BYTES)) {
        try {
          mesh.sendToPeer(peerId, JSON.stringify({ t: "capacidad.trozo", id: msg.id, chunk: parte } satisfies MsgCapacidadTrozo));
        } catch {
          /* noop */
        }
      }
      buffer = "";
    }
    mesh.sendToPeer(
      peerId,
      JSON.stringify({ t: "capacidad.fin", id: msg.id, tipo: resultado.tipo, resultado: resultado.resultado } satisfies MsgCapacidadFin),
    );
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error al ejecutar la capacidad por la malla.";
    enviarError(mesh, peerId, msg.id, 502, mensaje);
  } finally {
    limpiar();
  }
}

/**
 * manejarCancelarCapacidadMalla — corta (aborta) la petición en vuelo de `peerId` SI
 * su id coincide con `msg.id`.
 */
export function manejarCancelarCapacidadMalla(
  peerId: string,
  msg: MsgCapacidadCancelar,
  deps: Pick<DepsServidorCapacidadMalla, "registro"> = {},
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
export function reiniciarServidorCapacidadMallaParaTests(): void {
  registroProduccion.clear();
}

/**
 * adjuntarServidorCapacidadMalla — conecta el rol servidor a un `MeshHandle` (real o
 * de mentira): escucha `capacidad.pedir`/`capacidad.cancelar` y aborta la petición
 * en vuelo de un peer si se desconecta. Devuelve `unsubscribe`.
 */
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
 * iniciarServidorCapacidadPorMalla — arranca (o reintenta hasta que exista) el rol
 * servidor sobre el mesh COMPARTIDO (`getSharedMesh()`; nunca abre uno
 * segundo). Idempotente. Devuelve una función de parada.
 */
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

/* ══════════════════════════ 3) Rol CLIENTE ══════════════════════════ */

export interface ServidorCapacidadMalla {
  syncDeviceId: string;
  nombre?: string;
  latenciaMs?: number;
  capacidadesServibles: CapacidadTipo[];
}

/** ¿La ficha de un peer sirve la `tipo` pedida (o cualquiera, sin pin)? */
function fichaSirveTipo(ficha: FichaDispositivo | undefined, tipo?: CapacidadTipo): boolean {
  if (!ficha) return false;
  const lista = ficha.capacidadesServibles ?? [];
  if (!tipo) return lista.length > 0;
  return lista.includes(tipo);
}

/* Enfriamiento POR PEER (nunca global): que un peer conteste "ocupado" no debe
 * apartar a otros peers que sirvan la misma capacidad. Mapa en memoria de módulo. */
const enfriamientoPeers = new Map<string, number>();

function peerEnEnfriamiento(peerId: string, ahora: number = Date.now()): boolean {
  const hasta = enfriamientoPeers.get(peerId);
  return typeof hasta === "number" && hasta > ahora;
}

function enfriarPeer(peerId: string, segundos: number): void {
  enfriamientoPeers.set(peerId, Date.now() + Math.max(1, Math.round(segundos)) * 1000);
}

/** Solo para pruebas: olvida el enfriamiento por peer. */
export function reiniciarEnfriamientoCapacidadMallaParaTests(): void {
  enfriamientoPeers.clear();
}

/**
 * servidoresCapacidadPorMalla — peers de la MISMA cuenta, conectados ahora mismo,
 * cuya ficha anuncia la `tipo` pedida (o cualquiera, si no se pidió una
 * concreta), EXCLUYENDO los que están en enfriamiento, ordenados por
 * latencia. Lectura SÍNCRONA del estado ya publicado por el motor de la
 * malla (`snapshotMallaNeuronas()`) — no arranca nada ni sondea la red.
 */
export function servidoresCapacidadPorMalla(opts?: { tipo?: CapacidadTipo }): ServidorCapacidadMalla[] {
  const ahora = Date.now();
  const estado = snapshotMallaNeuronas();
  return estado.misDispositivos
    .filter(
      (d) =>
        !d.esEsteDispositivo &&
        d.enlace.estado === "conectado" &&
        !!d.syncDeviceId &&
        fichaSirveTipo(d.ficha, opts?.tipo) &&
        !peerEnEnfriamiento(d.syncDeviceId, ahora),
    )
    .map((d) => ({
      syncDeviceId: d.syncDeviceId as string,
      nombre: d.nombre,
      latenciaMs: d.ficha?.latenciaMs ?? d.enlace.latenciaMs,
      capacidadesServibles: d.ficha?.capacidadesServibles ?? [],
    }))
    .sort((a, b) => (a.latenciaMs ?? Infinity) - (b.latenciaMs ?? Infinity));
}

export interface CapacidadMallaErrorExtra {
  ocupado?: boolean;
  estado?: number;
  sinServidor?: boolean;
  peerPerdido?: boolean;
}
export type CapacidadMallaError = Error & CapacidadMallaErrorExtra;

function errorTipado(mensaje: string, extra: CapacidadMallaErrorExtra): CapacidadMallaError {
  const err = new Error(mensaje) as CapacidadMallaError;
  Object.assign(err, extra);
  return err;
}

const TIMEOUT_PRIMER_TROZO_MS = 120_000;
const TIMEOUT_TOTAL_CLIENTE_MS = 200_000;
const MAX_PEERS_POR_DEFECTO = 2;

export interface PedirCapacidadMallaOpciones {
  cuerpo: CapacidadCuerpo;
  signal?: AbortSignal;
  onChunk?: (delta: string) => void;
  /** Sustituye `getSharedMesh()` (pruebas / llamador que ya tiene el handle). */
  mesh?: MeshHandle;
  /** Sustituye `servidoresCapacidadPorMalla({tipo})` (pruebas, o elegir peers concretos). */
  candidatos?: ServidorCapacidadMalla[];
  /** Cuántos peers probar como máximo antes de rendirse (por defecto 2). */
  maxPeers?: number;
  /** ms sin ningún `capacidad.trozo` desde el envío, por intento (por defecto 120 s). */
  timeoutPrimerTrozoMs?: number;
  /** ms totales del PRESUPUESTO COMPARTIDO entre todos los intentos (por defecto 200 s). */
  timeoutTotalMs?: number;
}

export interface RespuestaCapacidadMalla {
  tipo: CapacidadTipo;
  resultado?: unknown;
  peer: string;
}

/** Un único intento contra UN peer; no reintenta ni elige — eso lo hace `pedirCapacidadPorMalla`. */
function intentarConPeer(
  mesh: MeshHandle,
  peer: ServidorCapacidadMalla,
  cuerpo: CapacidadCuerpo,
  opts: { signal?: AbortSignal; onChunk?: (d: string) => void; timeoutPrimerTrozoMs: number; timeoutTotalMs: number },
): Promise<RespuestaCapacidadMalla> {
  const id = crearIdPeticion();
  let acc = "";
  return new Promise<RespuestaCapacidadMalla>((resolve, reject) => {
    let settled = false;
    let unsub: (() => void) | null = null;

    const enviarCancelar = () => {
      try {
        mesh.sendToPeer(peer.syncDeviceId, JSON.stringify({ t: "capacidad.cancelar", id } satisfies MsgCapacidadCancelar));
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
      finalizar(() => reject(new DOMException("Capacidad por la malla: turno abortado.", "AbortError")));
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    unsub = mesh.onPeer({
      onMessage: (peerId, data) => {
        if (peerId !== peer.syncDeviceId) return;
        const msg = parseCapacidadMallaMensaje(data);
        if (!msg || msg.id !== id) return;
        if (msg.t === "capacidad.trozo") {
          clearTimeout(primerTrozoTimer);
          acc += msg.chunk;
          opts.onChunk?.(msg.chunk);
        } else if (msg.t === "capacidad.fin") {
          let resultado: unknown;
          try {
            resultado = JSON.parse(acc);
          } catch {
            // Si no es JSON válido, dejamos el string acumulado
            resultado = acc;
          }
          finalizar(() => resolve({ tipo: msg.tipo, resultado, peer: peer.syncDeviceId }));
        } else if (msg.t === "capacidad.error") {
          const n = msg.reintentarEnS ? Math.max(1, Math.round(msg.reintentarEnS)) : undefined;
          const err = errorTipado(
            `Capacidad por la malla ocupado${n ? `: retry after ${n}s` : ""} · ${msg.mensaje}`,
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
      finalizar(() => reject(errorTipado("Capacidad por la malla: sin respuesta (timeout).", {})));
    }, opts.timeoutPrimerTrozoMs);

    const totalTimer = setTimeout(() => {
      enviarCancelar();
      finalizar(() => reject(errorTipado(`Capacidad por la malla: timeout total (${Math.round(opts.timeoutTotalMs / 1000)}s).`, {})));
    }, opts.timeoutTotalMs);

    const ok = mesh.sendToPeer(peer.syncDeviceId, JSON.stringify({ t: "capacidad.pedir", id, cuerpo } satisfies MsgCapacidadPedir));
    if (!ok) {
      finalizar(() => reject(errorTipado("No se pudo enviar la petición por la malla (canal cerrado).", {})));
    }
  });
}

/**
 * pedirCapacidadPorMalla — pide una capacidad a la mejor neurona de la malla que la
 * sirva. Elige por: anuncia el tipo → menor latencia → sin enfriamiento
 * (`servidoresCapacidadPorMalla`); si el peor elegido está ocupado, lo enfría
 * (SOLO A ÉL) y prueba el siguiente candidato, dentro de un presupuesto de
 * tiempo COMPARTIDO entre todos los intentos (nunca supera `timeoutTotalMs`
 * en total, aunque pruebe varios peers). Devuelve el resultado; si `onChunk`
 * está presente, también transmite cada trozo según llega. Errores TIPADOS
 * (`CapacidadMallaError`): sin servidor (`sinServidor:true`), ocupado
 * (`ocupado:true`, solo cuando TODOS los candidatos probados estaban
 * ocupados), peer perdido o timeout. Honra `signal`.
 */
export async function pedirCapacidadPorMalla(opciones: PedirCapacidadMallaOpciones): Promise<RespuestaCapacidadMalla> {
  const mesh = opciones.mesh ?? getSharedMesh();
  if (!mesh) throw errorTipado("Sin malla P2P activa en este dispositivo.", { sinServidor: true });
  const candidatos = opciones.candidatos ?? servidoresCapacidadPorMalla({ tipo: opciones.cuerpo.tipo });
  if (!candidatos.length) {
    throw errorTipado(
      opciones.cuerpo.tipo ? `Sin servidor en la malla para "${opciones.cuerpo.tipo}".` : "Sin servidor en la malla.",
      { sinServidor: true },
    );
  }

  const maxPeers = Math.max(1, opciones.maxPeers ?? MAX_PEERS_POR_DEFECTO);
  const timeoutTotalMs = opciones.timeoutTotalMs ?? TIMEOUT_TOTAL_CLIENTE_MS;
  const timeoutPrimerTrozoMs = opciones.timeoutPrimerTrozoMs ?? TIMEOUT_PRIMER_TROZO_MS;
  const deadline = Date.now() + timeoutTotalMs;

  let ultimoError: CapacidadMallaError | undefined;
  for (const peer of candidatos.slice(0, maxPeers)) {
    const restante = deadline - Date.now();
    if (restante <= 1000) break;
    try {
      return await intentarConPeer(mesh, peer, opciones.cuerpo, {
        signal: opciones.signal,
        onChunk: opciones.onChunk,
        timeoutPrimerTrozoMs: Math.min(timeoutPrimerTrozoMs, restante),
        timeoutTotalMs: restante,
      });
    } catch (e) {
      const err = e as CapacidadMallaError;
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