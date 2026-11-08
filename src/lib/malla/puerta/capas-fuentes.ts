/**
 * puerta/capas-fuentes — de dónde salen las capas que esta neurona puede ofrecer (PTA1108C · 2026-11-08).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3. Cada fuente se lee con try/catch: ninguna rompe la puerta.
 *
 *  · Servidores propios: la URL del Supabase del OS si es autoalojado en red privada (`NEXT_PUBLIC_SUPABASE_URL`) y los que
 *    el dueño declara en Ajustes (`starseed.malla.puerta.capas.v1`).
 *  · LAN: IPs de las neuronas ligadas por la red local nativa y las subredes de las interfaces (las da Node).
 *  · Routers: los que el dueño declara (la configuración de `routers-malla` solo genera UCI; no guarda direcciones).
 */

import type { FuentesCapas } from "@/lib/malla/puerta/capas";

export const CLAVE_CAPAS_DECLARADAS = "starseed.malla.puerta.capas.v1";

export interface CapasDeclaradas {
  servidores: Array<{ url: string; etiqueta?: string }>;
  routers: Array<{ host: string; etiqueta?: string; puertos?: number[] }>;
}

type Almacen = Pick<Storage, "getItem" | "setItem">;

export function interpretarCapasDeclaradas(texto: string | null | undefined): CapasDeclaradas {
  const vacio: CapasDeclaradas = { servidores: [], routers: [] };
  try {
    const o = texto ? (JSON.parse(texto) as Record<string, unknown>) : null;
    if (!o || typeof o !== "object") return vacio;
    const cad = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);
    const servidores = (Array.isArray(o.servidores) ? o.servidores : []).slice(0, 16).flatMap((x) => {
      const u = cad((x as Record<string, unknown>)?.url, 300);
      return u ? [{ url: u, etiqueta: cad((x as Record<string, unknown>)?.etiqueta, 60) }] : [];
    });
    const routers = (Array.isArray(o.routers) ? o.routers : []).slice(0, 16).flatMap((x) => {
      const r = x as Record<string, unknown>;
      const h = cad(r?.host, 253);
      const pt = Array.isArray(r?.puertos) ? (r.puertos as unknown[]).filter((n): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) < 65536).slice(0, 4) : undefined;
      return h ? [{ host: h, etiqueta: cad(r?.etiqueta, 60), ...(pt?.length ? { puertos: pt } : {}) }] : [];
    });
    return { servidores, routers };
  } catch {
    return vacio;
  }
}

export function leerCapasDeclaradas(almacen?: Almacen | null): CapasDeclaradas {
  try {
    const s = almacen ?? (typeof localStorage !== "undefined" ? localStorage : null);
    return interpretarCapasDeclaradas(s?.getItem(CLAVE_CAPAS_DECLARADAS));
  } catch {
    return { servidores: [], routers: [] };
  }
}

export function guardarCapasDeclaradas(c: CapasDeclaradas, almacen?: Almacen | null): boolean {
  try {
    const s = almacen ?? (typeof localStorage !== "undefined" ? localStorage : null);
    if (!s) return false;
    s.setItem(CLAVE_CAPAS_DECLARADAS, JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
}

export interface DepsFuentes {
  /** Variables públicas (por defecto `process.env`). */
  env?: Record<string, string | undefined>;
  declaradas?: () => CapasDeclaradas;
  /** IPs de neuronas ligadas por la red local (descubrimiento nativo). */
  vecinosLan?: () => string[];
  /** Subredes de las interfaces (Node). */
  subredes?: () => Promise<string[]> | string[];
}

/** Reúne todas las fuentes en el formato de `detectarCapas`. Nunca lanza. */
export async function fuentesCapasReales(d: DepsFuentes = {}): Promise<FuentesCapas> {
  const env = d.env ?? (typeof process !== "undefined" ? process.env : {});
  const dec = (() => {
    try {
      return (d.declaradas ?? leerCapasDeclaradas)();
    } catch {
      return { servidores: [], routers: [] } as CapasDeclaradas;
    }
  })();
  const servidores: FuentesCapas["servidoresPropios"] = [...dec.servidores];
  const sb = env.NEXT_PUBLIC_SUPABASE_URL;
  if (sb) servidores.push({ url: sb, etiqueta: "Supabase del OS" });
  let vecinosLan: string[] = [];
  let subredes: string[] = [];
  try {
    vecinosLan = d.vecinosLan?.() ?? [];
  } catch {
    vecinosLan = [];
  }
  try {
    subredes = (await d.subredes?.()) ?? [];
  } catch {
    subredes = [];
  }
  return { servidoresPropios: servidores, vecinosLan, subredes, routers: dec.routers };
}

/** IPs de las neuronas ligadas por la red local nativa (carga perezosa; vacío si el motor no corre). */
export async function vecinosLanReales(): Promise<string[]> {
  try {
    const m = await import("@/lib/malla/red-local-nativa-motor");
    const ips = m.redLocalNativaActiva()?.instantanea().ligaduras.map((l) => l.ip) ?? [];
    return [...new Set(ips.filter((x): x is string => typeof x === "string"))].slice(0, 64);
  } catch {
    return [];
  }
}
