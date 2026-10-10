"use client";

/*
 * maquina — huella del nombre de máquina de ESTE aparato, cuando el medio puede saberla
 * (2026-10-09). Solo dos medios pueden, y con eso basta para que no se dupliquen en la Mac:
 *   · la app nativa (Tauri): comando `device_info` → hostname;
 *   · el servidor local (localhost:9002): `/api/dispositivo/maquina`, que solo responde a la
 *     propia máquina.
 * Un navegador normal no puede (y está bien: no debe poder identificar la máquina). Ambos
 * caminos dan `sha256("starseed-maquina:" + nombre normalizado)` en 16 hex. Nunca lanza.
 */

import { normalizarNombreMaquina } from "./maquina-tipos";

interface TauriInvoke {
  core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
}

async function sha16(texto: string): Promise<string | undefined> {
  try {
    const datos = new TextEncoder().encode(texto);
    const dig = await crypto.subtle.digest("SHA-256", datos);
    return Array.from(new Uint8Array(dig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  } catch {
    return undefined;
  }
}

let cache: Promise<string | undefined> | null = null;

export function huellaMaquina(): Promise<string | undefined> {
  if (typeof window === "undefined") return Promise.resolve(undefined);
  if (!cache) cache = calcular();
  return cache;
}

async function calcular(): Promise<string | undefined> {
  try {
    const tauri = (window as unknown as { __TAURI__?: TauriInvoke }).__TAURI__;
    const invoke = tauri?.core?.invoke;
    if (invoke) {
      const info = (await invoke("device_info").catch(() => null)) as { hostname?: string | null } | null;
      const nombre = normalizarNombreMaquina(info?.hostname ?? "");
      if (nombre) return sha16(`starseed-maquina:${nombre}`);
    }
  } catch {
    /* sigue */
  }
  try {
    const host = window.location?.hostname ?? "";
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch("/api/dispositivo/maquina", { signal: ctrl.signal, cache: "no-store" }).catch(() => null);
      clearTimeout(t);
      if (r?.ok) {
        const j = (await r.json().catch(() => null)) as { huella?: string | null } | null;
        if (typeof j?.huella === "string" && /^[0-9a-f]{16}$/.test(j.huella)) return j.huella;
      }
    }
  } catch {
    /* sin huella */
  }
  return undefined;
}
