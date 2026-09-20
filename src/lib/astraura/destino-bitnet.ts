/**
 * destino-bitnet.ts — Decisión PURA del destino del motor BitNet (Ola HW-2 · Adenda 158 · 2026-09-20).
 * ─────────────────────────────────────────────────────────────────────────────
 * Integra HW-1 (`perfil-hardware.ts`, `dondeRazona`) y HW-2 (`elegir-nodo.ts`):
 * 1. `entornoDelNavegador()`: recopila signos del navegador (hardware, memoria, UA, batería, conexión, modo PWA,
 *    detec-ción de Tauri). Nunca lanza; devuelve `EntornoMedicion` (solapas puras: el entorno se inyecta).
 * 2. `preferenciaBitnet()`: usa `medirPerfil(entornoDelNavegador()).bitnet` y cachea el resultado 5 min.
 * 3. `resolverEndpointBitnet(target)`: si hay ventana y `nodoParaBitnet(preferenciaBitnet())` da un candidato,
 *    devuelve su `url`; si no, `astraura158Endpoint(target)` de siempre. Sin red, sin host, nunca lanza.
 *
 * Navegador puro: no toca `process.env`, no hace fetch (excepto la sonda opcional de batería).
 * Servidor (SSR) (`typeof window === 'undefined'`): devuelve 'local' (neutro en las puertas del motor).
 */

import { medirPerfil, dondeRazona, type EntornoMedicion } from "./perfil-hardware";
import { elegir, type Candidato, type TipoNodo, type PreferenciaNodo, bitnetTrasCaida } from "./elegir-nodo";
import { astraura158Endpoint, type Astraura158Target } from "./astraura-158-client";

/** Utilidad para forzar un entorno específico en tests (opcional). */
let __fuerzaEntorno: EntornoMedicion | null = null;
export function forzarEntornoDelNavegador(e: EntornoMedicion): void {
  __fuerzaEntorno = e;
}

/** Línea para los tests que necesitan simular un perfil distinto. */
export function limpiarFuerzaEntorno(): void {
  __fuerzaEntorno = null;
}

let cachePreferencia: { ts: number; val: PreferenciaNodo } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export interface BrowserEnvironment extends EntornoMedicion {
  esTauri: boolean;
  esPWA: boolean;
  connection?: { effectiveType?: string; saveData?: boolean };
  getBattery?: () => Promise<{ level?: number; charging?: boolean } | null>;
  battery?: { level?: number; charging?: boolean };
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

/**
 * Recopila señales del navegador disponibles para medir un perfil de hardware.
 * Nótese que algunos campos son opcionales según el entorno del navegador; devuelve
 * un `EntornoMedicion` estable (los campos faltantes son opcionales).
 */
export function entornoDelNavegador(): BrowserEnvironment {
  if (__fuerzaEntorno) {
    return __fuerzaEntorno as BrowserEnvironment;
  }

  if (typeof window !== "undefined" && window) {
    const win = window as any;
    const nav = win.navigator;
    
    const ua = nav?.userAgent ?? "";

    const connection = nav?.connection || nav?.webkitConnection || nav?.mozConnection || null;

    const info: BrowserEnvironment = {
      userAgent: ua,
      hardwareConcurrency: nav?.hardwareConcurrency,
      deviceMemory: nav?.deviceMemory,
      esTauri: !!(win as any).__TAURI__,
      esPWA: (() => {
        try {
          return (window as any).matchMedia ? (window as any).matchMedia("(display-mode: standalone)").matches : false;
        } catch {
          return false;
        }
      })(),
      effectiveType: connection?.effectiveType,
      saveData: connection?.saveData,
    };

    if (nav?.getBattery) {
      try {
        nav.getBattery()
          .then((bat?: { level?: number; charging?: boolean } | null) => {
            if (bat && bat.level !== undefined && bat.charging !== undefined) {
              info.bateriaBaja = bat.level <= 0.2;
              info.battery = { level: bat.level, charging: bat.charging };
            }
          })
          .catch(() => {});
      } catch {
      }
    }

    return info;
  }

  return {
    userAgent: "",
    esTauri: false,
    esPWA: false,
  };
}

/** Devuelve la preferencia de BitNet: 'local' | 'vecino' | 'nube' | 'ninguno'.
 * Cachea 5 min (estadía local). En servidor (`typeof window === 'undefined'`) devuelve 'local'.
 */
export function preferenciaBitnet(forzarRecalculacion = false): PreferenciaNodo {
  const ahora = Date.now();
  if (!forzarRecalculacion && cachePreferencia && ahora - cachePreferencia.ts < CACHE_MS) {
    return cachePreferencia.val;
  }
  const val = typeof window === "undefined" ? "local" : dondeRazona(medirPerfil(entornoDelNavegador())).bitnet;
  cachePreferencia = { ts: ahora, val };
  return val;
}

/**
 * Resuelve el endpoint del motor BitNet para un target dado.
 * Lógica:
 *   • Si no hay ventana o la preferencia es 'ninguno', devuelve `astraura158Endpoint(target)`.
 *   • Si hay ventana y `nodoParaBitnet` da un candidato, devuelve su `url`.
 *   • Cualquier error (fetch, JSON, etc.) → fallback a `astraura158Endpoint(target)`.
 *
 * Nunca lanza: devuelve un string (siempre un endpoint válido).
 */
export async function resolverEndpointBitnet(target: Astraura158Target): Promise<string> {
  if (typeof window === "undefined" || preferenciaBitnet() === "ninguno") {
    return astraura158Endpoint(target);
  }

  try {
    const pref = preferenciaBitnet();
    if (pref === "ninguno") return astraura158Endpoint(target);

    const candidatos = await obtenerCandidatosParaPreferencia(pref as TipoNodo);
    const elegido = candidatos[0] || null;
    if (!elegido) return astraura158Endpoint(target);

    return elegido.url;
  } catch {
    return astraura158Endpoint(target);
  }
}

async function obtenerCandidatosParaPreferencia(pref: TipoNodo): Promise<Candidato[]> {
  try {
    const res = await fetch("/api/bitnet/candidatos");
    if (!res.ok) return [];
    const data = (await res.json()) as { candidatos?: Candidato[] };
    return (data?.candidatos ?? []).filter((c) => c.tipo === pref);
  } catch {
    return [];
  }
}
