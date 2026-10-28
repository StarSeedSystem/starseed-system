"use client";

/*
 * senales-medio — las ANTENAS de este medio, medidas de verdad (2026-10-09).
 * ═══════════════════════════════════════════════════════════════════════════
 * Lo que viaja en la presencia en vivo de cada neurona para que el panel enseñe sus señales.
 * Regla «basta de ilusiones»: cada campo sale de una API real del navegador o del motor de la
 * malla; lo que este medio NO puede medir se dice como tal («no disponible en este medio»),
 * nunca como «apagado» ni con un número inventado.
 *
 *   · internet  → navigator.onLine + Network Information API (tipo y velocidad estimada);
 *   · malla     → pares WebRTC de la propia cuenta abiertos ahora + faros de otras cuentas
 *                 (motor `malla-neuronas`) + enlaces directos emparejados SIN internet
 *                 (`malla/registro-enlaces-locales`, 2026-10-10);
 *   · lora      → radio Meshtastic (Web Serial / Web Bluetooth): estado, transporte y nodos;
 *   · bluetooth → hay adaptador (getAvailability) — sin escanear (pide un gesto);
 *   · serie     → puertos ya autorizados (getPorts);
 *   · reticulum → todavía no corre en ningún medio del OS: se dice.
 */

import type { MeshLinkStatus, MeshTransportKind } from "@/ai/astraura/mesh/types";

export interface SenalesMedio {
  internet: { enLinea: boolean; tipo?: string; efectivo?: string; mbps?: number };
  malla: { pares: number; otrasCuentas: number; sinInternet?: number };
  lora: { estado: MeshLinkStatus | "sin-radio"; transporte?: MeshTransportKind | null; nodos: number };
  bluetooth: { disponible: boolean | null };
  serie: { disponible: boolean; puertos: number };
  reticulum: { disponible: false; motivo: string };
  /** Sesión «siempre disponible» de esta neurona (Insomnia): ms hasta la que sigue, y con qué. */
  insomne?: { hasta: number; proveedor: string };
}

export const MOTIVO_RETICULUM = "aún no corre en ningún medio del OS";

/** La ruta local (`GET /api/neuronas/insomne`) se consulta como mucho una vez cada 60 s. */
export const INTERVALO_INSOMNE_MS = 60_000;
/** Tope de tiempo de esa petición: si tarda más, se sigue sin el anuncio. */
export const TOPE_INSOMNE_MS = 2_000;

/** ¿Toca volver a preguntar por la sesión insomne? (puro, para poder probarlo sin reloj). */
export function tocaRefrescarInsomne(ultimoRefresco: number, ahora: number): boolean {
  if (!Number.isFinite(ahora)) return false;
  return !(ultimoRefresco >= 0) || ahora - ultimoRefresco >= INTERVALO_INSOMNE_MS;
}

/** Convierte la respuesta de `/api/neuronas/insomne` en el anuncio de presencia (puro). */
export function insomneDesdeRespuesta(json: unknown, ahora: number): SenalesMedio["insomne"] | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const j = json as { activo?: unknown; hasta?: unknown; proveedor?: unknown };
  const fin = typeof j.hasta === "number" ? j.hasta : typeof j.hasta === "string" ? Date.parse(j.hasta) : NaN;
  const proveedor = typeof j.proveedor === "string" ? j.proveedor.trim() : "";
  if (j.activo !== true || !Number.isFinite(fin)) return undefined;
  const vencida = Number.isFinite(ahora) && fin <= ahora;
  if (vencida || proveedor === "") return undefined;
  return { hasta: fin, proveedor };
}

/** Entradas crudas (para poder probar el resumen sin navegador). */
export interface EntradasSenales {
  enLinea: boolean;
  conexion?: { type?: string; effectiveType?: string; downlink?: number } | null;
  malla?: { propios: number; otrasCuentas: number } | null;
  /** Enlaces directos emparejados sin internet abiertos en este medio. */
  locales?: number;
  mesh?: { status: MeshLinkStatus; transport: MeshTransportKind | null; nodes: unknown[] } | null;
  bluetooth: boolean | null;
  serie: { api: boolean; puertos: number };
  /** Sesión insomne ya medida (el que la consulta la resuelve `medirSenales`). */
  insomne?: SenalesMedio["insomne"];
}

export function resumirSenales(e: EntradasSenales): SenalesMedio {
  const c = e.conexion ?? null;
  const conectada = e.mesh && e.mesh.status !== "disconnected";
  return {
    internet: {
      enLinea: e.enLinea,
      // «unknown»/«other» no dicen nada (la WebView de Android lo da así): no se enseñan.
      ...(c?.type && !["unknown", "other", "none"].includes(c.type) ? { tipo: c.type } : {}),
      ...(c?.effectiveType ? { efectivo: c.effectiveType } : {}),
      ...(typeof c?.downlink === "number" && c.downlink > 0 ? { mbps: Math.round(c.downlink * 10) / 10 } : {}),
    },
    malla: {
      pares: Math.max(0, e.malla?.propios ?? 0),
      otrasCuentas: Math.max(0, e.malla?.otrasCuentas ?? 0),
      ...(e.locales && e.locales > 0 ? { sinInternet: e.locales } : {}),
    },
    lora: conectada
      ? { estado: e.mesh!.status, transporte: e.mesh!.transport, nodos: Array.isArray(e.mesh!.nodes) ? e.mesh!.nodes.length : 0 }
      : { estado: "sin-radio", nodos: 0 },
    bluetooth: { disponible: e.bluetooth },
    serie: { disponible: e.serie.api, puertos: e.serie.api ? e.serie.puertos : 0 },
    reticulum: { disponible: false, motivo: MOTIVO_RETICULUM },
    ...(e.insomne ? { insomne: e.insomne } : {}),
  };
}

/** Firma corta para no reenviar la presencia si nada cambió. */
export function firmaSenales(s: SenalesMedio): string {
  return [
    s.internet.enLinea ? 1 : 0,
    s.internet.tipo ?? "",
    s.internet.efectivo ?? "",
    s.malla.pares,
    s.malla.otrasCuentas,
    s.malla.sinInternet ?? 0,
    s.lora.estado,
    s.lora.nodos,
    s.bluetooth.disponible === null ? "?" : s.bluetooth.disponible ? 1 : 0,
    s.serie.puertos,
    s.insomne?.hasta ?? "",
    s.insomne?.proveedor ?? "",
  ].join("|");
}

/** Mide las señales de ESTE medio ahora. Nunca lanza. */
export async function medirSenales(): Promise<SenalesMedio> {
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & {
    connection?: { type?: string; effectiveType?: string; downlink?: number };
    bluetooth?: { getAvailability?: () => Promise<boolean> };
    serial?: { getPorts?: () => Promise<unknown[]> };
  };
  let malla: EntradasSenales["malla"] = null;
  let mesh: EntradasSenales["mesh"] = null;
  try {
    const m = await import("@/lib/network/malla-neuronas");
    malla = m.resumenMallaActual();
  } catch {
    malla = null;
  }
  try {
    const st = await import("@/ai/astraura/mesh/store");
    const s = st.getMeshState();
    mesh = { status: s.status, transport: s.transport, nodes: s.nodes };
  } catch {
    mesh = null;
  }
  let locales = 0;
  try {
    locales = (await import("@/lib/malla/registro-enlaces-locales")).enlacesLocalesVivos().length;
  } catch {
    locales = 0;
  }
  let bluetooth: boolean | null = null;
  try {
    if (typeof nav.bluetooth?.getAvailability === "function") bluetooth = await nav.bluetooth.getAvailability();
  } catch {
    bluetooth = null;
  }
  let puertos = 0;
  const apiSerie = typeof nav.serial?.getPorts === "function";
  try {
    if (apiSerie) puertos = (await nav.serial!.getPorts!()).length;
  } catch {
    puertos = 0;
  }
  const insomne = await medirInsomne();
  return resumirSenales({
    enLinea: typeof nav.onLine === "boolean" ? nav.onLine : true,
    conexion: nav.connection ?? null,
    malla,
    locales,
    mesh,
    bluetooth,
    serie: { api: apiSerie, puertos },
    insomne,
  });
}

/** Cache del anuncio insomne de ESTA neurona (módulo, para el ritmo de como mucho 60 s). */
let ultimoRefrescoInsomne = -1;
let insomneCacheado: SenalesMedio["insomne"];

async function medirInsomne(): Promise<SenalesMedio["insomne"]> {
  const ahora = Date.now();
  if (!tocaRefrescarInsomne(ultimoRefrescoInsomne, ahora)) return insomneCacheado;
  ultimoRefrescoInsomne = ahora;
  try {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), TOPE_INSOMNE_MS);
    const res = await fetch("/api/neuronas/insomne", { signal: control.signal, cache: "no-store" });
    clearTimeout(reloj);
    insomneCacheado = res.ok ? insomneDesdeRespuesta(await res.json(), Date.now()) : undefined;
  } catch {
    insomneCacheado = undefined;
  }
  return insomneCacheado;
}
