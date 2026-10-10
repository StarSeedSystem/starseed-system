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
 *                 (motor `malla-neuronas`);
 *   · lora      → radio Meshtastic (Web Serial / Web Bluetooth): estado, transporte y nodos;
 *   · bluetooth → hay adaptador (getAvailability) — sin escanear (pide un gesto);
 *   · serie     → puertos ya autorizados (getPorts);
 *   · reticulum → todavía no corre en ningún medio del OS: se dice.
 */

import type { MeshLinkStatus, MeshTransportKind } from "@/ai/astraura/mesh/types";

export interface SenalesMedio {
  internet: { enLinea: boolean; tipo?: string; efectivo?: string; mbps?: number };
  malla: { pares: number; otrasCuentas: number };
  lora: { estado: MeshLinkStatus | "sin-radio"; transporte?: MeshTransportKind | null; nodos: number };
  bluetooth: { disponible: boolean | null };
  serie: { disponible: boolean; puertos: number };
  reticulum: { disponible: false; motivo: string };
}

export const MOTIVO_RETICULUM = "aún no corre en ningún medio del OS";

/** Entradas crudas (para poder probar el resumen sin navegador). */
export interface EntradasSenales {
  enLinea: boolean;
  conexion?: { type?: string; effectiveType?: string; downlink?: number } | null;
  malla?: { propios: number; otrasCuentas: number } | null;
  mesh?: { status: MeshLinkStatus; transport: MeshTransportKind | null; nodes: unknown[] } | null;
  bluetooth: boolean | null;
  serie: { api: boolean; puertos: number };
}

export function resumirSenales(e: EntradasSenales): SenalesMedio {
  const c = e.conexion ?? null;
  const conectada = e.mesh && e.mesh.status !== "disconnected";
  return {
    internet: {
      enLinea: e.enLinea,
      ...(c?.type ? { tipo: c.type } : {}),
      ...(c?.effectiveType ? { efectivo: c.effectiveType } : {}),
      ...(typeof c?.downlink === "number" && c.downlink > 0 ? { mbps: Math.round(c.downlink * 10) / 10 } : {}),
    },
    malla: { pares: Math.max(0, e.malla?.propios ?? 0), otrasCuentas: Math.max(0, e.malla?.otrasCuentas ?? 0) },
    lora: conectada
      ? { estado: e.mesh!.status, transporte: e.mesh!.transport, nodos: Array.isArray(e.mesh!.nodes) ? e.mesh!.nodes.length : 0 }
      : { estado: "sin-radio", nodos: 0 },
    bluetooth: { disponible: e.bluetooth },
    serie: { disponible: e.serie.api, puertos: e.serie.api ? e.serie.puertos : 0 },
    reticulum: { disponible: false, motivo: MOTIVO_RETICULUM },
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
    s.lora.estado,
    s.lora.nodos,
    s.bluetooth.disponible === null ? "?" : s.bluetooth.disponible ? 1 : 0,
    s.serie.puertos,
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
  return resumirSenales({
    enLinea: typeof nav.onLine === "boolean" ? nav.onLine : true,
    conexion: nav.connection ?? null,
    malla,
    mesh,
    bluetooth,
    serie: { api: apiSerie, puertos },
  });
}
