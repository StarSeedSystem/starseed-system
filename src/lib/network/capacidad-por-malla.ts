"use client";

/*
 * capacidad-por-malla — Relé P2P genérico de capacidades (Ola 1017A, tarea E).
 * Generaliza `ia-por-malla.ts` (tope de 16 KB, trozos, fin, error y cancelar)
 * a cualquier capacidad prestable: imagen, voz, oído, palabra, transcodificar,
 * render, buscar y construir. Reúne los trozos por su índice (aunque lleguen
 * desordenados) y NUNCA lanza: devuelve `{ ok:false, motivo }`. Módulo PURO:
 * los canales de envío y escucha se inyectan (pruebas con canal falso).
 *
 * capacidad.pedir {id,tipo,cuerpo,sesionId?} · capacidad.trozo {id,i,datos}
 * capacidad.fin {id} · capacidad.error {id,estado,mensaje} · cancelar {id}
 */

/* 1) Protocolo (puro) */
export const CAPACIDAD_NS = "capacidad.";
/** Límite duro del protocolo: ningún mensaje viaja por el canal por encima de esto. */
export const CAPACIDAD_MAX_BYTES = 16 * 1024;
export const TIPOS_CAPACIDAD = ["imagen", "voz", "oido", "palabra", "transcodificar", "render", "buscar", "construir"] as const;
export type TipoCapacidad = (typeof TIPOS_CAPACIDAD)[number];

export interface MsgCapacidadPedir { t: "capacidad.pedir"; id: string; tipo: TipoCapacidad; cuerpo: Record<string, unknown>; sesionId?: string; }
export interface MsgCapacidadTrozo { t: "capacidad.trozo"; id: string; i: number; datos: string; }
export interface MsgCapacidadFin { t: "capacidad.fin"; id: string; }
export interface MsgCapacidadError { t: "capacidad.error"; id: string; estado: number; mensaje: string; }
export interface MsgCapacidadCancelar { t: "capacidad.cancelar"; id: string; }
export type MsgCapacidad = MsgCapacidadPedir | MsgCapacidadTrozo | MsgCapacidadFin | MsgCapacidadError | MsgCapacidadCancelar;
export type MsgCapacidadSaliente = MsgCapacidadPedir | MsgCapacidadCancelar;
export type MsgCapacidadEntrante = MsgCapacidadTrozo | MsgCapacidadFin | MsgCapacidadError;

export const esTipoCapacidad = (x: unknown): x is TipoCapacidad =>
  typeof x === "string" && (TIPOS_CAPACIDAD as readonly string[]).includes(x);

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

/** Guard puro: ¿`x` es un mensaje del protocolo `capacidad.*` bien formado? */
export function esMensajeCapacidad(x: unknown): x is MsgCapacidad {
  if (!esObjeto(x) || typeof x.t !== "string" || !x.t.startsWith(CAPACIDAD_NS)) return false;
  if (typeof x.id !== "string" || !x.id) return false;
  switch (x.t) {
    case "capacidad.pedir":
      return esTipoCapacidad(x.tipo) && esObjeto(x.cuerpo) && (x.sesionId === undefined || typeof x.sesionId === "string");
    case "capacidad.trozo":
      return Number.isInteger(x.i) && (x.i as number) >= 0 && typeof x.datos === "string";
    case "capacidad.fin":
      return true;
    case "capacidad.error":
      return typeof x.estado === "number" && typeof x.mensaje === "string";
    case "capacidad.cancelar":
      return true;
    default:
      return false;
  }
}

/** JSON.parse defensivo + guard. Nunca lanza; `null` si no es del protocolo. */
export function parseMensajeCapacidad(raw: string): MsgCapacidad | null {
  try {
    const obj: unknown = JSON.parse(raw);
    return esMensajeCapacidad(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** Serializa un mensaje válido; `null` si no pasa el guard o supera el tope. */
export function codificarMensajeCapacidad(msg: MsgCapacidad): string | null {
  if (!esMensajeCapacidad(msg)) return null;
  const json = JSON.stringify(msg);
  return new TextEncoder().encode(json).length <= CAPACIDAD_MAX_BYTES ? json : null;
}

/* 2) Rol CLIENTE */
/** Envía un mensaje saliente por el canal (malla real o falso de pruebas). */
export type EnviarCapacidad = (mensaje: MsgCapacidadSaliente) => void;
/** Se suscribe a los mensajes entrantes; devuelve la función para desuscribirse. */
export type EscucharCapacidad = (oyente: (mensaje: MsgCapacidadEntrante) => void) => () => void;

export interface OpcionesPedirCapacidad {
  tipo: TipoCapacidad; cuerpo?: Record<string, unknown>; sesionId: string; timeoutMs?: number;
  recibir: EscucharCapacidad; id?: string; signal?: AbortSignal;
}

export type ResultadoCapacidad =
  | { ok: true; datos: string; trozos: number }
  | { ok: false; motivo: string; estado?: number };

/** Presupuesto total por defecto de una capacidad (un turno corto). */
export const CAPACIDAD_TIMEOUT_MS = 30_000;

function nuevoIdCapacidad(): string {
  try { return crypto.randomUUID(); }
  catch { return `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
}

/**
 * pedirCapacidad — pide una capacidad a otra neurona y reúne los trozos por su
 * índice (aunque lleguen desordenados). NUNCA lanza: resuelve `{ ok:false }`.
 * Al agotarse el tiempo o al cancelar, avisa con `capacidad.cancelar`.
 */
export function pedirCapacidad(enviar: EnviarCapacidad, opciones: OpcionesPedirCapacidad): Promise<ResultadoCapacidad> {
  const id = opciones.id ?? nuevoIdCapacidad();
  const timeoutMs = opciones.timeoutMs ?? CAPACIDAD_TIMEOUT_MS;
  const trozos = new Map<number, string>();
  return new Promise<ResultadoCapacidad>((resolve) => {
    let terminado = false;
    let desuscribir: () => void = () => {};
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let alCancelar: () => void = () => {};
    const terminar = (resultado: ResultadoCapacidad) => {
      if (terminado) return;
      terminado = true;
      if (temporizador) clearTimeout(temporizador);
      desuscribir();
      opciones.signal?.removeEventListener("abort", alCancelar);
      resolve(resultado);
    };
    const cancelar = (motivo: string) => {
      try { enviar({ t: "capacidad.cancelar", id }); } catch { /* canal cerrado */ }
      terminar({ ok: false, motivo });
    };
    alCancelar = () => cancelar("cancelado");
    desuscribir = opciones.recibir((msg) => {
      if (terminado || msg.id !== id) return;
      if (msg.t === "capacidad.trozo") { trozos.set(msg.i, msg.datos); return; }
      if (msg.t === "capacidad.error") { terminar({ ok: false, motivo: msg.mensaje, estado: msg.estado }); return; }
      const datos = [...trozos.entries()].sort((a, b) => a[0] - b[0]).map(([, texto]) => texto).join("");
      terminar({ ok: true, datos, trozos: trozos.size });
    });
    temporizador = setTimeout(() => cancelar("tiempo agotado"), Math.max(1, timeoutMs));
    opciones.signal?.addEventListener("abort", alCancelar, { once: true });
    if (opciones.signal?.aborted) return cancelar("cancelado");
    try {
      enviar({ t: "capacidad.pedir", id, tipo: opciones.tipo, cuerpo: opciones.cuerpo ?? {}, sesionId: opciones.sesionId });
    } catch { terminar({ ok: false, motivo: "no se pudo enviar la petición" }); }
  });
}
