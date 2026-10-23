"use client";

/*
 * capacidad-por-malla (Ola 1017A · «Apps en la malla», tarea E · §6 del contrato) — relé P2P de
 * CAPACIDADES: generaliza `ia-por-malla.ts` (mismo canal compartido, mismos topes de tamaño) a
 * CUALQUIER capacidad: imagen, voz, oído, palabra, transcodificar, render, buscar y construir.
 * Protocolo (≤ 16 KB por mensaje): pedir {id,tipo,cuerpo} · trozo {id,texto,i,total} (CON ÍNDICE:
 * llegan en cualquier orden) · fin {id,tipo,meta?} · error {id,estado,mensaje} · cancelar {id}.
 * El cliente pedirCapacidad(enviar, {tipo,cuerpo,sesionId,timeoutMs}) reúne los trozos y NUNCA
 * lanza ({ok:true,…} | {ok:false, motivo}); `enviar` es inyectable y aquí no se sondea ninguna
 * red. El ROL SERVIDOR (admisión, cola y préstamos en quien sirve) es la tarea F de esta ola.
 */

import { bytesUtf8, crearIdPeticion } from "@/lib/network/astraura-por-malla";

export const CAPACIDAD_NS = "capacidad.";
export const CAPACIDAD_MAX_BYTES = 16 * 1024;
export const TIMEOUT_CAPACIDAD_DEFECTO_MS = 120_000;
export const TIPOS_CAPACIDAD = ["imagen", "voz", "oido", "palabra", "transcodificar", "render", "buscar", "construir"] as const;
export type CapacidadTipo = (typeof TIPOS_CAPACIDAD)[number];

/** Función de envío inyectable: manda un mensaje JSON por el canal; `false` ⇒ canal cerrado. */
export type EnviarCapacidad = (json: string) => boolean;

/** Entrada pequeña (o referencia a datos por bandas ya en la malla) y ajustes según el tipo. */
export interface CapacidadCuerpo { entrada?: unknown; opciones?: Record<string, unknown>; }

export interface MsgCapacidadPedir { t: "capacidad.pedir"; id: string; tipo: CapacidadTipo; cuerpo: CapacidadCuerpo; }
export interface MsgCapacidadTrozo { t: "capacidad.trozo"; id: string; texto: string; i: number; total: number; }
export interface MsgCapacidadFin { t: "capacidad.fin"; id: string; tipo: CapacidadTipo; meta?: Record<string, unknown>; }
export interface MsgCapacidadError { t: "capacidad.error"; id: string; estado: number; mensaje: string; ocupado?: boolean; reintentarEnS?: number; }
export interface MsgCapacidadCancelar { t: "capacidad.cancelar"; id: string; }
export type MsgCapacidad = MsgCapacidadPedir | MsgCapacidadTrozo | MsgCapacidadFin | MsgCapacidadError | MsgCapacidadCancelar;

/** Guard puro: ¿es un tipo de capacidad del relé? */
export function esTipoCapacidad(x: unknown): x is CapacidadTipo { return typeof x === "string" && (TIPOS_CAPACIDAD as readonly string[]).includes(x); }

function esObjeto(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object"; }

/** Guard puro: ¿`x` es un mensaje del protocolo `capacidad.*` bien formado? */
export function esMensajeCapacidad(x: unknown): x is MsgCapacidad {
  if (!esObjeto(x)) return false;
  const t = x.t;
  if (typeof t !== "string" || !t.startsWith(CAPACIDAD_NS) || typeof x.id !== "string" || !x.id) return false;
  switch (t) {
    case "capacidad.pedir": return esTipoCapacidad(x.tipo) && esObjeto(x.cuerpo);
    case "capacidad.trozo": return typeof x.texto === "string" && typeof x.i === "number" && x.i >= 0 && typeof x.total === "number" && x.total >= 1;
    case "capacidad.fin": return esTipoCapacidad(x.tipo) && (x.meta === undefined || esObjeto(x.meta));
    case "capacidad.error": return typeof x.estado === "number" && typeof x.mensaje === "string";
    case "capacidad.cancelar": return true;
    default: return false;
  }
}

/** JSON.parse defensivo + guard: nunca lanza; `null` si no es del protocolo. */
export function parseCapacidadMensaje(raw: string): MsgCapacidad | null { try { const obj: unknown = JSON.parse(raw); return esMensajeCapacidad(obj) ? obj : null; } catch { return null; } }


/** ¿El JSON de este mensaje cabe en el límite del protocolo (≤ 16 KB, en bytes UTF-8)? */
export function cabeEnMensajeCapacidad(json: string): boolean { return bytesUtf8(json) <= CAPACIDAD_MAX_BYTES; }

/* ══ Cliente ══ */
/** Éxito con el texto reunido por índice, o fallo tipado SIEMPRE con `motivo` legible. */
export type ResultadoCapacidad =
  | { ok: true; id: string; tipo: CapacidadTipo; texto: string; meta?: Record<string, unknown> }
  | { ok: false; motivo: string; estado?: number; ocupado?: boolean; reintentarEnS?: number };

export interface PedirCapacidadOpciones { tipo: CapacidadTipo; cuerpo: CapacidadCuerpo; sesionId?: string; timeoutMs?: number; }

/** Lo que devuelve `pedirCapacidad`: `promesa` (nunca rechaza), `recibir` (canal entrante) y `cancelar` (idempotente). */
export interface SolicitudCapacidad { id: string; promesa: Promise<ResultadoCapacidad>; recibir: (raw: string) => void; cancelar: () => void; }

/**
 * pedirCapacidad — arma y manda `capacidad.pedir`, y reúne la respuesta: trozos POR ÍNDICE
 * (desordenados OK; si llega `fin` faltando alguno, ok:false — nunca un resultado corrupto),
 * `fin` cierra con éxito, `error` es fallo tipado (estado/ocupado). Valida `tipo`, `cuerpo` y
 * tope de tamaño ANTES de mandar; si el que llamó cancela o se agota `timeoutMs`, avisa al
 * servidor con `capacidad.cancelar` para que libere la cola. Nada de esto lanza.
 */
export function pedirCapacidad(enviar: EnviarCapacidad, opciones: PedirCapacidadOpciones): SolicitudCapacidad {
  const id = opciones.sesionId || crearIdPeticion();
  let cerrada = false;
  let limpiar: (() => void) | null = null;
  let resolver!: (r: ResultadoCapacidad) => void;
  const promesa = new Promise<ResultadoCapacidad>((res) => { resolver = res; });
  const cerrar = (r: ResultadoCapacidad): void => { if (cerrada) return; cerrada = true; limpiar?.(); resolver(r); };
  const mandar = (msg: MsgCapacidad): boolean => { try { return enviar(JSON.stringify(msg)) !== false; } catch { return false; } };
  const trozos = new Map<number, string>();
  let totalTrozos = 0;
  /** Recibe un mensaje crudo del canal: parsea, valida y solo atiende SU propia sesión. */
  const recibir = (raw: string): void => {
    if (cerrada) return;
    const msg = parseCapacidadMensaje(raw);
    if (!msg || msg.id !== id) return;
    if (msg.t === "capacidad.trozo") { trozos.set(msg.i, msg.texto); totalTrozos = msg.total; }
    else if (msg.t === "capacidad.fin") {
      let texto = ""; let faltan = 0;
      for (let i = 0; i < totalTrozos; i++) { const p = trozos.get(i); if (p === undefined) faltan++; else texto += p; }
      if (faltan > 0) cerrar({ ok: false, motivo: "Se perdieron trozos del resultado." });
      else cerrar({ ok: true, id, tipo: msg.tipo, texto, meta: msg.meta });
    }
    else if (msg.t === "capacidad.error") cerrar({ ok: false, motivo: msg.mensaje, estado: msg.estado, ocupado: msg.ocupado, reintentarEnS: msg.reintentarEnS });
  };
  const cancelar = (): void => { if (cerrada) return; mandar({ t: "capacidad.cancelar", id }); cerrar({ ok: false, motivo: "Cancelado." }); };
  const sol: SolicitudCapacidad = { id, promesa, recibir, cancelar };
  if (!esTipoCapacidad(opciones.tipo)) { cerrar({ ok: false, motivo: "Tipo de capacidad no válido." }); return sol; }
  if (!esObjeto(opciones.cuerpo)) { cerrar({ ok: false, motivo: "Cuerpo de la petición no válido." }); return sol; }
  const pedir: MsgCapacidadPedir = { t: "capacidad.pedir", id, tipo: opciones.tipo, cuerpo: opciones.cuerpo };
  if (!cabeEnMensajeCapacidad(JSON.stringify(pedir))) {
    cerrar({ ok: false, motivo: "La petición supera el tope de tamaño por mensaje." });
    return sol;
  }
  const timer = setTimeout(() => {
    mandar({ t: "capacidad.cancelar", id }); cerrar({ ok: false, motivo: "Tiempo agotado." });
  }, Math.max(1, Math.round(opciones.timeoutMs ?? TIMEOUT_CAPACIDAD_DEFECTO_MS)));  limpiar = () => clearTimeout(timer);
  if (!mandar(pedir)) cerrar({ ok: false, motivo: "No se pudo enviar la petición por el canal." });
  return sol;
}

