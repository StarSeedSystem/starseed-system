"use client";

/*
 * capacidad-por-malla — Relé P2P GENÉRICO de capacidades sobre la malla de neuronas
 * (Ola 1017A). ---------------------------------------------------------------
 * Generaliza el patrón de `ia-por-malla.ts` para servir cualquier capacidad:
 * imagen, voz, oido, palabra, transcodificar, render, buscar, construir.
 * Este módulo es un protocolo HERMANO sobre el MISMO canal que `ia.*`,
 * no un reemplazo: los peers viejos que solo entienden `ia.*` siguen funcionando
 * como antes (ver `ia-por-malla.ts`, sin tocar). `capacidad-por-malla.ts` añade
 * la vía GENÉRICA para cualquier otra capacidad.
 *
 * Protocolo (JSON, namespace `capacidad.`, cada mensaje ≤ 16 KB):
 *   cliente → servidor  capacidad.pedir     {id, cuerpo:{tipo, datos, sesionId?}}
 *   servidor → cliente  capacidad.trozo     {id, datos}          (lote de bytes cada ~100 ms)
 *   servidor → cliente  capacidad.fin       {id, tipo}           (qué sirvió DE VERDAD el enrutador del servidor)
 *   servidor → cliente  capacidad.error     {id, estado, mensaje, reintentarEnS?, ocupado?}
 *   cliente → servidor  capacidad.cancelar  {id}
 *
 * ROL SERVIDOR: solo si la capa mesh está compartiendo (`capaMeshCompartiendo()`:
 * maestro 1.58 + capa mesh encendidos — Alex: "respeta las capas"). Ejecuta la
 * capacidad con el ENRUTADOR PROPIO de esta cuenta (importado DINÁMICAMENTE para
 * no crear un ciclo estático: el enrutador llega a este módulo por el registro
 * de proveedores — `providers/capacidad-malla.ts` — y este módulo, en su rol
 * SERVIDOR, vuelve a llamar al enrutador; ver la cabecera de `applyLiveOpenRouter()`
 * en `free-catalog.ts` para el mismo patrón). Con `tipo` pedido y listo en
 * ESTA neurona, lo fija (`forceTipo`); si no, deja que el enrutador use su
 * cadena libre-primero normal (nunca una capacidad de pago que el dueño no haya
 * configurado — el propio enrutador ya lo garantiza). SIEMPRE marca
 * `desdeMalla:true`: una petición que llegó por la malla NUNCA vuelve a salir por
 * ella — sin esto, A pide a B, B no tiene la capacidad y se la reenvía a la malla
 * (quizás de vuelta a A): un bucle. Como mucho 1 petición en vuelo POR PEER
 * (`estado:429`); corte duro a los 200 s.
 *
 * ROL CLIENTE: `servidoresCapacidadPorMalla({tipo?})` lista los peers conectados
 * de la MISMA cuenta que anuncian esa capacidad en su ficha (o cualquier capacidad
 * si no se pide una concreta), ordenados por latencia y EXCLUYENDO los que están
 * en enfriamiento — el enfriamiento es POR PEER, no global: que un peer esté
 * ocupado no debe apartar a los demás que sirven lo mismo.
 * `pedirCapacidad()` prueba, como mucho, `maxPeers` candidatos (por defecto 2)
 * dentro de un presupuesto de tiempo compartido (200 s total / 120 s hasta el
 * primer trozo) y RESUELVE los datos completos (streaming vía `onDatos`),
 * con errores tipados: ocupado, sin servidor, timeout o peer perdido. Honra
 * `signal`.
 *
 * Reutiliza SIEMPRE el mesh COMPARTIDO (`getSharedMesh()` de `lan-sync.ts`):
 * este módulo nunca abre una segunda malla.
 */

/* ══════════════════════════ 1) Imports ════════════════════════════════════ */

import { getSharedMesh, capaMeshCompartiendo } from "@/lib/network/lan-sync";
import type { MeshHandle, PeerEvents, PeerSnapshot } from "@/lib/network/webrtc-mesh";
import { snapshotMallaNeuronas, type FichaDispositivo } from "@/lib/network/malla-neuronas";
import { bytesUtf8, partirEnTrozos, crearIdPeticion } from "@/lib/network/astraura-por-malla";

/* ══════════════════════════ 2) Protocolo (puro) ═══════════════════════════ */

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

export interface CapacidadPerfil {
  // Perfil específico para capacidades (puede extenderse según necesidad)
}

export interface CapacidadCuerpo {
  tipo: CapacidadTipo;
  datos: {
    // Datos específicos según el tipo de capacidad
    [key: string]: unknown;
  };
  sesionId?: string;
}

export interface MsgCapacidadPedir {
  t: "capacidad.pedir";
  id: string;
  cuerpo: CapacidadCuerpo;
}
export interface MsgCapacidadTrozo {
  t: "capacidad.trozo";
  id: string;
  datos: string; // Base64 encoded or similar for binary data
}
export interface MsgCapacidadFin {
  t: "capacidad.fin";
  id: string;
  tipo: CapacidadTipo;
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

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

/** Guard puro: ¿`x` es un mensaje del protocolo `capacidad.*` bien formado? */
export function esMensajeCapacidadMalla(x: unknown): x is CapacidadMallaMsg {
  if (!esObjeto(x)) return false;
  const t = x.t;
  if (typeof t !== "string" || !t.startsWith(CAPACIDAD_NS)) return false;
  if (typeof x.id !== "string" || !x.id) return false;
  switch (t) {
    case "capacidad.pedir":
      return esObjeto(x.cuerpo) && typeof x.cuerpo.tipo === "string";
    case "capacidad.trozo":
      return typeof x.datos === "string";
    case "capacidad.fin":
      return typeof x.tipo === "string";
    case "capacidad.error":
      return typeof x.estado === "number" && typeof x.mensaje === "string";
    case "capacidad.cancelar":
      return true;
    default:
      return false;
  }
}

/** JSON.parse defensivo + guard. Nunca lanza; `null` si no es del protocolo. */
export function parseCapacidadMallaMensaje(raw: string): CapacidadMallaMsg | null {
  try {
    const obj: unknown = JSON.parse(raw);
    return esMensajeCapacidadMalla(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** ¿El JSON de este mensaje cabe en el límite del protocolo (≤ 16 KB)? */
export function cabeEnMensajeCapacidad(json: string): boolean {
  return bytesUtf8(json) <= CAPACIDAD_MAX_BYTES;
}

/* ══════════════════════════ 3) Rol SERVIDOR ══════════════════════════ */

const TIMEOUT_TOTAL_SERVIDOR_MS = 200_000;
const FLUSH_TROZO_MS = 100;

interface PeticionEnCurso {
  id: string;
  abort: AbortController;
}

/** Registro por defecto (producción): 1 entrada por `peerId` con petición en vuelo. */
const registroProduccion = new Map<string, PeticionEnCurso>();

export interface ResultadoEjecucion {
  datos: string; // Base64 encoded or similar for binary data
  tipo: CapacidadTipo;
}

export interface DepsServidorCapacidadMalla {
  /** Sustituye la comprobación de capa (`capaMeshCompartiendo`). */
  puedeServir?: () => boolean;
  /** Sustituye la ejecución real con el enrutador (pruebas: sin `router.ts` real). */
  ejecutar?: (
    cuerpo: CapacidadCuerpo,
    opts: { signal: AbortSignal; onChunk: (delta: string) => void }
  ) => Promise<ResultadoEjecucion>;
  /** Registro de peticiones en vuelo por peer (pruebas: un Map propio y aislado). */
  registro?: Map<string, PeticionEnCurso>;
  /** ms entre lotes de `capacidad.trozo` (por defecto 100). */
  flushMs?: number;
  /** Corte duro total (por defecto 200 s). */
  timeoutTotalMs?: number;
}

function puedeServirDefecto(): boolean {
  return capaMeshCompartiendo();
}

async function ejecutarConRouterDefecto(
  cuerpo: CapacidadCuerpo,
  opts: { signal: AbortSignal; onChunk: (delta: string) => void },
): Promise<ResultadoEjecucion> {
  // TODO: Implementar el enrutador real para capacidades
  // Por ahora, simular una respuesta básica
  await new Promise((resolve) => setTimeout(resolve, 10));
  return {
    datos: "datos_simulados_en_base64",
    tipo: cuerpo.tipo,
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
  const msg: MsgCapacidadError = {
    t: "capacidad.error",
    id,
    estado,
    mensaje: mensaje.slice(0, 300),
    ...extra,
  };
  try {
    mesh.sendToPeer(peerId, JSON.stringify(msg));
  } catch {
    /* peer ya no escucha: nada que hacer */
  }
}

/**
 * manejarPeticionCapacidadMalla — atiende UN `capacidad.pedir` de `peerId`.
 * Exportada (con `deps` inyectables) para poder probarla con un mesh de mentira
 * y un `ejecutar` de mentira, sin `getSharedMesh()` ni el enrutador real.
 */
export async function manejarPeticionCapacidadMalla(
  mesh: Pick<MeshHandle, "sendToPeer">,
  peerId: string,
  msg: MsgCapacidadPedir,
  deps: DepsServidorCapacidadMalla = {},
): Promise<void> {
  const registro = deps.registro ?? registroProduccion;
  const puedeServir = deps.puedeServir ?? puedeServirDefecto;
  const ejecutar = deps.ejecutar ?? ejecutarConRouterDefecto;
  const flushMs = deps.flushMs ?? FLUSH_TROZO_MS;
  const timeoutTotalMs = deps.timeoutTotalMs ?? TIMEOUT_TOTAL_SERVIDOR_MS;

  if (!puedeServir()) {
    enviarError(mesh, peerId, msg.id, 503, "Esta neurona no comparte sus capacidades por la malla ahora mismo.");
    return;
  }
  if (registro.has(peerId)) {
    enviarError(mesh, peerId, msg.id, 429, "Ya hay una petición de capacidad en curso desde este dispositivo.", {
      reintentarEnS: 10,
    });
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
        mesh.sendToPeer(
          peerId,
          JSON.stringify({ t: "capacidad.trozo", id: msg.id, datos: parte } satisfies MsgCapacidadTrozo),
        );
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
    // `onChunk` real) pero sí devolvió datos al resolver, esos datos completos
    // son lo que hay que mandar — el cliente nunca se queda sin respuesta por
    // un candidato no-streaming.
    if (!huboStreaming && resultado.datos) buffer = resultado.datos;
    if (buffer) {
      for (const parte of partirEnTrozos(buffer, CAPACIDAD_MAX_BYTES - TROZO_MARGEN_BYTES)) {
        try {
          mesh.sendToPeer(
            peerId,
            JSON.stringify({ t: "capacidad.trozo", id: msg.id, datos: parte } satisfies MsgCapacidadTrozo),
          );
        } catch {
          /* noop */
        }
      }
      buffer = "";
    }
    mesh.sendToPeer(
      peerId,
      JSON.stringify({ t: "capacidad.fin", id: msg.id, tipo: resultado.tipo } satisfies MsgCapacidadFin),
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
 * su id coincide con `msg.id` (una `capacidad.cancelar` tardía de un turno ya
 * terminado no toca nada).
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
export function adjuntarServidorCapacidadMalla(
  mesh: MeshHandle,
  deps: DepsServidorCapacidadMalla = {},
): () => void {
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
 * segundo). Idempotente. Devuelve una función de parada. Coexiste con
 * `iniciarServidorIaPorMalla()` (Ola 368): namespaces `capacidad.*` y
 * `ia.*` son disjuntos sobre el MISMO canal.
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

/* ══════════════════════════ 4) Rol CLIENTE ══════════════════════════ */

export interface ServidorCapacidadMalla {
  syncDeviceId: string;
  nombre?: string;
  latenciaMs?: number;
  capacidadesServibles: CapacidadTipo[];
}

/** ¿La ficha de un peer sirve la `tipo` pedida (o cualquiera, sin pin)? */
function fichaSirveTipo(ficha: FichaDispositivo | undefined, tipo?: CapacidadTipo): boolean {
  if (!ficha) return false;
  const lista = ficha.fuentesServibles ?? [];
  if (!tipo) return lista.length > 0;
  // Convert CapacidadTipo to string for comparison with fuentesServibles
  const tipoString = `capacidad.${tipo}`;
  return lista.includes(tipoString);
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
      latenciaMs: d.ficha?.astrauraLatenciaMs ?? d.enlace.latenciaMs,
      capacidadesServibles: d.ficha?.capacidadesServibles ?? [] as CapacidadTipo[],
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
  onDatos?: (delta: string) => void;
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
  datos: string; // Base64 encoded or similar for binary data
  peer: string;
  tipo: CapacidadTipo;
}

/** Un único intento contra UN peer; no reintenta ni elige — eso lo hace `pedirCapacidadPorMalla`. */
function intentarConPeer(
  mesh: MeshHandle,
  peer: ServidorCapacidadMalla,
  cuerpo: CapacidadCuerpo,
  opts: {
    signal?: AbortSignal;
    onDatos?: (d: string) => void;
    timeoutPrimerTrozoMs: number;
    timeoutTotalMs: number;
  },
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
          acc += msg.datos;
          opts.onDatos?.(msg.datos);
        } else if (msg.t === "capacidad.fin") {
          finalizar(() => resolve({ datos: acc, peer: peer.syncDeviceId, tipo: msg.tipo }));
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
 * sirva. Elige por: anuncia la tipo pedida → menor latencia → sin
 * enfriamiento (`servidoresCapacidadPorMalla`); si el peor elegido está ocupado,
 * lo enfría (SOLO A ÉL) y prueba el siguiente candidato, dentro de un
 * presupuesto de tiempo COMPARTIDO entre todos los intentos (nunca supera
 * `timeoutTotalMs` en total, aunque pruebe varios peers). Devuelve los datos
 * completos; si `onDatos` está presente, también transmite cada trozo según
 * llega. Errores TIPADOS (`CapacidadMallaError`): sin servidor
 * (`sinServidor:true`), ocupado (`ocupado:true`, solo cuando TODOS los
 * candidatos probados estaban ocupados — así el enrutador solo enfría la
 * capacidad `capacidad-malla` entera cuando de verdad no hay nadie en la malla
 * que ayude ahora), peer perdido o timeout. Honra `signal`.
 */
export async function pedirCapacidadPorMalla(opciones: PedirCapacidadMallaOpciones): Promise<RespuestaCapacidadMalla> {
  const mesh = opciones.mesh ?? getSharedMesh();
  if (!mesh) throw errorTipado("Sin malla P2P activa en este dispositivo.", { sinServidor: true });
  const candidatos =
    opciones.candidatos ?? servidoresCapacidadPorMalla({ tipo: opciones.cuerpo.tipo });
  if (!candidatos.length) {
    throw errorTipado(
      opciones.cuerpo.tipo
        ? `Sin servidor en la malla para "${opciones.cuerpo.tipo}".`
        : "Sin servidor en la malla.",
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
        onDatos: opciones.onDatos,
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

/**
 * Función de conveniencia que cumple con el contrato solicitado:
 * pedirCapacidad(enviar, { tipo, cuerpo, sesionId, timeoutMs })
 * que reúne los trozos y nunca lanza ({ ok:false, motivo }).
 */
export async function pedirCapacidad(
  enviar: (datos: string) => void,
  args: {
    tipo: CapacidadTipo;
    cuerpo: {
      [key: string]: unknown;
    };
    sesionId?: string;
    timeoutMs?: number;
  }
): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const respuesta = await pedirCapacidadPorMalla({
      cuerpo: {
        tipo: args.tipo,
        datos: args.cuerpo,
        sesionId: args.sesionId,
      },
      timeoutTotalMs: args.timeoutMs ?? 5000, // Default timeout más corto para esta función de conveniencia
      onDatos: (delta) => {
        enviar(delta);
      },
    });
    // Enviar todos los datos recibidos
    enviar(respuesta.datos);
    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      motivo: error.message || "Error desconocido",
    };
  }
}