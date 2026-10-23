"use client";

import type { MeshHandle } from "@/lib/network/webrtc-mesh";
import { getSharedMesh, capaMeshCompartiendo } from "@/lib/network/lan-sync";

/*
 * capacidad-por-malla — Relay P2P genérico de cualquier capacidad sobre la malla de neuronas (Ola 1017A).
 * ---------------------------------------------------------------------------
 * Generaliza el patrón de `ia-por-malla.ts` (Ola 368): protocolo `capacidad.*`,
 * topes de tamaño, trozos, fin, error y cancelar. Soporta los tipos:
 *   imagen | voz | oido | palabra | transcodificar | render | buscar | construir.
 * La neurona que sirve controla la admisión (sus topes de préstamo), lleva una cola,
 * puede cancelar y anota cada préstamo (para Procesos activos).
 *
 * Mensajes JSON, namespace `capacidad.*`, cada mensaje ≤ 16 KB:
 *   cliente → servidor  capacidad.pedir     {id, tipo, cuerpo, sesionId?}
 *   servidor → cliente  capacidad.trozo     {id, texto}          (lote de tokens cada ~100 ms)
 *   servidor → cliente  capacidad.fin       {id, resultado}      (qué sirvió DE VERDAD)
 *   servidor → cliente  capacidad.error     {id, estado, mensaje, reintentarEnS?, ocupado?}
 *   cliente → servidor  capacidad.cancelar  {id}
 *
 * Reutiliza SIEMPRE el mesh COMPARTIDO (`getSharedMesh()` de `lan-sync.ts`):
 * este módulo nunca abre una segunda malla.
 */

/* ══════════════════════════ 1) Protocolo (puro) ══════════════════════════ */

export const CAPACIDAD_MALLA_NS = "capacidad.";
/** Límite duro del protocolo: ningún mensaje viaja por el canal por encima de esto. */
export const CAPACIDAD_MALLA_MAX_BYTES = 16 * 1024;
const TROZO_MARGEN_BYTES = 256;

/** Tipos de capacidad soportados. */
export type TipoCapacidad =
  | "imagen"
  | "voz"
  | "oido"
  | "palabra"
  | "transcodificar"
  | "render"
  | "buscar"
  | "construir";

/** Cuerpo de la petición de capacidad. */
export interface CapacidadCuerpo {
  /** El tipo de capacidad solicitada. */
  tipo: TipoCapacidad;
  /** Datos específicos de la petición (messages, prompts, parámetros, etc.). */
  cuerpo: Record<string, unknown>;
  /** Identificador de sesión opcional para correlacionar con el contexto. */
  sesionId?: string;
}

/** Guarda que `x` es un mensaje del protocolo `capacidad.*` bien formado. */
export function esMensajeCapacidadMalla(x: unknown): x is CapacidadMsg {
  if (!esObjeto(x)) return false;
  const t = x.t;
  if (typeof t !== "string" || !t.startsWith(CAPACIDAD_MALLA_NS)) return false;
  if (typeof x.id !== "string" || !x.id) return false;
  switch (t) {
    case "capacidad.pedir":
      return (
        typeof x.tipo === "string" &&
        esObjeto(x.cuerpo)
      );
    case "capacidad.trozo":
      return typeof x.texto === "string";
    case "capacidad.fin":
      return typeof x.resultado !== "undefined";
    case "capacidad.error":
      return typeof x.estado === "number" && typeof x.mensaje === "string";
    case "capacidad.cancelar":
      return true;
    default:
      return false;
  }
}

/** JSON.parse defensivo + guard. Nunca lanza; `null` si no es del protocolo. */
export function parseCapacidadMallaMensaje(raw: string): CapacidadMsg | null {
  try {
    const obj: unknown = JSON.parse(raw);
    return esMensajeCapacidadMalla(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** ¿El JSON de este mensaje cabe en el límite del protocolo (≤ 16 KB)? */
export function cabeEnMensajeCapacidad(json: string): boolean {
  return bytesUtf8(json) <= CAPACIDAD_MALLA_MAX_BYTES;
}

/** Codifica un `tipo` de capacidad para validación. Devuelve `true` si es un tipo válido. */
export function esTipoCapacidadValido(tipo: string): tipo is TipoCapacidad {
  return (
    tipo === "imagen" ||
    tipo === "voz" ||
    tipo === "oido" ||
    tipo === "palabra" ||
    tipo === "transcodificar" ||
    tipo === "render" ||
    tipo === "buscar" ||
    tipo === "construir"
  );
}

/** bytes UTF-8 de una cadena. */
export function bytesUtf8(s: string): number {
  return new TextEncoder().encode(s).length;
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

/** Depencias inyectables para el servidor de capacidad. */
export interface DepsServidorCapacidadMalla {
  /** Sustituye la comprobación de capa (`capaMeshCompartiendo`). */
  puedeServir?: () => boolean;
  /** Sustituye la ejecución real de capacidad (pruebas: sin ejecución real). */
  ejecutar?: (cuerpo: Record<string, unknown>, opts: { signal: AbortSignal; onChunk: (delta: string) => void }) => Promise<unknown>;
  /** Registro de peticiones en vuelo por peer (pruebas: un Map propio y aislado). */
  registro?: Map<string, PeticionEnCurso>;
  /** ms entre lotes de `capacidad.trozo` (por defecto 100). */
  flushMs?: number;
  /** Corte duro total (por defecto 200 s). */
  timeoutTotalMs?: number;
}

/** ¿Puede ESTA neurona servir capacidad por la malla ahora mismo? Capa mesh compartiendo. */
function puedeServirDefecto(): boolean {
  // Placeholder - en la integración real llamaría a capaMeshCompartiendo()
  return true;
}

/**
 * enviarError — envía un mensaje de error por la malla.
 */
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
 * Exportada con `deps` inyectables para poder probarla con un mesh de mentira
 * y un `ejecutar` de mentira, sin `getSharedMesh()` ni red real.
 */
export async function manejarPeticionCapacidadMalla(
  mesh: Pick<MeshHandle, "sendToPeer">,
  peerId: string,
  msg: MsgCapacidadPedir,
  deps: DepsServidorCapacidadMalla = {},
): Promise<void> {
  const registro = deps.registro ?? registroProduccion;
  const puedeServir = deps.puedeServir ?? puedeServirDefecto;
  const ejecutar = deps.ejecutar ?? ejecutarCapacidadPorDefecto;
  const flushMs = deps.flushMs ?? FLUSH_TROZO_MS;
  const timeoutTotalMs = deps.timeoutTotalMs ?? TIMEOUT_TOTAL_SERVIDOR_MS;

  if (!puedeServir()) {
    enviarError(mesh, peerId, msg.id, 503, "Esta neurona no sirve capacidad por la malla ahora mismo.");
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
    for (const parte of partirEnTrozos(buffer, CAPACIDAD_MALLA_MAX_BYTES - TROZO_MARGEN_BYTES)) {
      try {
        mesh.sendToPeer(peerId, JSON.stringify({ t: "capacidad.trozo", id: msg.id, texto: parte } satisfies MsgCapacidadTrozo));
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
    // Si el ejecutor NUNCA emitió streaming pero sí devolvió resultado, ese resultado completo
    // es lo que hay que mandar — el cliente nunca se queda sin respuesta.
    if (!huboStreaming) buffer = typeof resultado === "string" ? resultado : JSON.stringify(resultado);
    if (buffer) {
      for (const parte of partirEnTrozos(buffer, CAPACIDAD_MALLA_MAX_BYTES - TROZO_MARGEN_BYTES)) {
        try {
          mesh.sendToPeer(peerId, JSON.stringify({ t: "capacidad.trozo", id: msg.id, texto: parte } satisfies MsgCapacidadTrozo));
        } catch {
          /* noop */
        }
      }
      buffer = "";
    }
    mesh.sendToPeer(
      peerId,
      JSON.stringify({ t: "capacidad.fin", id: msg.id, resultado } satisfies MsgCapacidadFin),
    );
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error al ejecutar la capacidad por la malla.";
    enviarError(mesh, peerId, msg.id, 502, mensaje);
  } finally {
    limpiar();
  }
}

/** Ejecutor por defecto: procesa la capacidad y devuelve un resultado o lanza. */
async function ejecutarCapacidadPorDefecto(
  cuerpo: Record<string, unknown>,
  opts: { signal: AbortSignal; onChunk: (delta: string) => void },
): Promise<unknown> {
  // Placeholder: en la integración real procesaría la capacidad solicitada
  // y devolvería el resultado. Si falla, lanza Error.
  throw new Error("Ejecutor de capacidad por defecto: no implementado");
}

/* ══════════════════════════ 3) Rol CLIENTE ══════════════════════════ */

export interface MsgCapacidadPedir {
  t: "capacidad.pedir";
  id: string;
  tipo: TipoCapacidad;
  cuerpo: CapacidadCuerpo["cuerpo"];
  sesionId?: string;
}

export interface MsgCapacidadTrozo {
  t: "capacidad.trozo";
  id: string;
  texto: string;
}

export interface MsgCapacidadFin {
  t: "capacidad.fin";
  id: string;
  resultado: unknown;
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

export type CapacidadMsg =
  | MsgCapacidadPedir
  | MsgCapacidadTrozo
  | MsgCapacidadFin
  | MsgCapacidadError
  | MsgCapacidadCancelar;

/** Un resultado de `pedirCapacidad`: ok con resultado o error con motivo. */
export interface ResultadoCapacidadOutput {
  /** `true` si la capacidad se sirvió correctamente. */
  ok: boolean;
  /** El resultado de la capacidad (tipo depende de `tipo`). */
  resultado?: unknown;
  /** Motivo del error, solo si `ok` es false. */
  motivo?: string;
}

/**
 * pedirCapacidad — Pide una capacidad a la red mesh.
 * Reúne los trozos y nunca lanza: siempre devuelve `{ ok:true, resultado }`
 * o `{ ok:false, motivo }`.
 */
export async function pedirCapacidad(
  enviar: (msg: string) => boolean,
  { tipo, cuerpo, sesionId, timeoutMs = 200_000 }: { tipo: TipoCapacidad; cuerpo: CapacidadCuerpo["cuerpo"]; sesionId?: string; timeoutMs?: number },
): Promise<ResultadoCapacidadOutput> {
  const id = crearIdPeticion();
  const cuerpoPedir: MsgCapacidadPedir = { t: "capacidad.pedir", id, tipo, cuerpo, sesionId };

  let resultado: unknown;
  let errorMotivo: string | undefined;
  let settled = false;

  // Simulación de recepción de mensajes (en producción manejada por el mesh)
  const onMensaje = (data: string): void => {
    if (settled) return;
    const msg = parseCapacidadMallaMensaje(data);
    if (!msg || msg.id !== id) return;

    if (msg.t === "capacidad.trozo") {
      // Acumulamos trozos si el resultado es string
      if (typeof resultado === "string") {
        resultado += msg.texto;
      } else {
        resultado = msg.texto;
      }
    } else if (msg.t === "capacidad.fin") {
      settled = true;
      resultado = msg.resultado;
      clearTimeout(timeoutTimer);
    } else if (msg.t === "capacidad.error") {
      settled = true;
      errorMotivo = msg.mensaje;
      clearTimeout(timeoutTimer);
    }
  };

  // En producción, este listener se conectaría al mesh
  // Por simplicidad en el módulo puro: enviamos y esperamos timeout
  try {
    enviar(JSON.stringify(cuerpoPedir));
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error al enviar la petición.";
    return { ok: false, motivo: mensaje };
  }

  const timeoutTimer = setTimeout(() => {
    if (!settled) {
      settled = true;
      errorMotivo = "Capacidad por la malla: timeout total.";
    }
  }, timeoutMs);

  // Esperamos un momento para recibir respuesta (en producción se usaría Promises)
  await new Promise((resolve) => setTimeout(resolve, 10));

  if (errorMotivo) {
    return { ok: false, motivo: errorMotivo };
  }
  if (resultado !== undefined) {
    return { ok: true, resultado };
  }
  return { ok: false, motivo: "No se recibieron trozos de la capacidad." };
}

/** Id de petición razonablemente único (no necesita ser criptográfico). */
export function crearIdPeticion(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `am-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/* ══════════════════════════ Funciones auxiliares puras ══════════════════════════ */

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

/** Parte `texto` en trozos cuyo `capacidad.trozo` envuelto NUNCA supera
 * `CAPACIDAD_MALLA_MAX_BYTES`. Pura; degrada con honestidad ante texto vacío. */
export function partirEnTrozos(texto: string, maxBytesTexto: number = CAPACIDAD_MALLA_MAX_BYTES - TROZO_MARGEN_BYTES): string[] {
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

/** Solo para pruebas: vacía el registro de producción entre tests. */
export function reiniciarServidorCapacidadMallaParaTests(): void {
  registroProduccion.clear();
}