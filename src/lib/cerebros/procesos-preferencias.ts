"use client";

import { useState, useEffect, useCallback } from "react";
import { SYNCED_KEYS } from "@/lib/settings-sync";
import { pushPreferences } from "@/lib/settings-sync";
import type { TipoProceso } from "./procesos";

export interface UmbralesProcesos {
  cpu: number;
  ram: number;
  disco: number;
  bateria: number;
}

export interface PreferenciasProcesos {
  tipos: TipoProceso[];
  intervaloSeg: number;
  umbrales: UmbralesProcesos;
  ocultos: string[];
}

const CLAVE = "starseed.cerebros.procesos.v1" as const;
// starseed.cerebros. no está en SYNCED_PREFIXES de src/lib/settings-sync.ts;
// usamos esta clave para preferencias de procesos del cerebro

/** normaliza intervalos (5-120) y umbrales (1-100) y aplica defaults */
export function normalizarPreferencias(raw: unknown): PreferenciasProcesos {
  const def: PreferenciasProcesos = {
    tipos: [],
    intervaloSeg: 15,
    umbrales: { cpu: 85, ram: 90, disco: 90, bateria: 20 },
    ocultos: [],
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return def;

  const o = raw as Partial<PreferenciasProcesos>;

  const tipos = Array.isArray(o.tipos)
    ? o.tipos.filter((v): v is TipoProceso => typeof v === "string" && v.trim() !== "")
    : def.tipos;

  const intervaloSeg = typeof o.intervaloSeg === "number" && Number.isFinite(o.intervaloSeg)
    ? Math.max(5, Math.min(120, Math.round(o.intervaloSeg)))
    : def.intervaloSeg;

  const umbralesRaw = o.umbrales && typeof o.umbrales === "object" && !Array.isArray(o.umbrales)
    ? (o.umbrales as Partial<UmbralesProcesos>)
    : {};
  const umbrales: UmbralesProcesos = {
    cpu: typeof umbralesRaw.cpu === "number" && Number.isFinite(umbralesRaw.cpu) ? Math.max(1, Math.min(100, Math.round(umbralesRaw.cpu))) : def.umbrales.cpu,
    ram: typeof umbralesRaw.ram === "number" && Number.isFinite(umbralesRaw.ram) ? Math.max(1, Math.min(100, Math.round(umbralesRaw.ram))) : def.umbrales.ram,
    disco: typeof umbralesRaw.disco === "number" && Number.isFinite(umbralesRaw.disco) ? Math.max(1, Math.min(100, Math.round(umbralesRaw.disco))) : def.umbrales.disco,
    bateria: typeof umbralesRaw.bateria === "number" && Number.isFinite(umbralesRaw.bateria) ? Math.max(1, Math.min(100, Math.round(umbralesRaw.bateria))) : def.umbrales.bateria,
  };

  const ocultos = Array.isArray(o.ocultos)
    ? o.ocultos.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : def.ocultos;

  return { tipos, intervaloSeg, umbrales, ocultos };
}

/** lee de localStorage */
export function leerPreferencias(): PreferenciasProcesos {
  if (typeof window === "undefined") return normalizarPreferencias(undefined);
  const raw = window.localStorage.getItem(CLAVE);
  if (!raw) return normalizarPreferencias(undefined);
  try {
    return normalizarPreferencias(JSON.parse(raw));
  } catch {
    return normalizarPreferencias(undefined);
  }
}

/** guarda en localStorage + pushPreferences() */
export function guardarPreferencias(p: PreferenciasProcesos): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CLAVE, JSON.stringify(p));
  }
  return pushPreferences();
}

/** hook para preferencies de procesos */
export function usarPreferenciasProcesos() {
  const [prefs, setPrefs] = useState<PreferenciasProcesos>(() => leerPreferencias());
  const [guardando, setGuardando] = useState(false);

  const actualizar = useCallback(
    (nuevo: Partial<PreferenciasProcesos>) => {
      const actualizado = normalizarPreferencias({ ...prefs, ...nuevo });
      setPrefs(actualizado);
      setGuardando(true);
      guardarPreferencias(actualizado)
        .finally(() => setGuardando(false));
    },
    [prefs],
  );

  return {
    prefs,
    guardando,
    actualizarTipos: (tipos: TipoProceso[]) => actualizar({ tipos }),
    actualizarIntervalo: (intervaloSeg: number) => actualizar({ intervaloSeg }),
    actualizarUmbrales: (umbrales: Partial<UmbralesProcesos>) => actualizar({ umbrales: { ...prefs.umbrales, ...umbrales } }),
    actualizarOcultos: (ocultos: string[]) => actualizar({ ocultos }),
  };
}

/** los límites por cerebro (CPU y RAM máx) que guarda el orquestador, hoy sin aplicar */
export function limitesDeCerebro(brainId: string): { cpuMaxPct: number | null; ramMaxMb: number | null } | null {
  if (typeof window === "undefined") return null;
  const key = `starseed.brain.${brainId}.limites` as const;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const val = JSON.parse(raw);
    if (!val || typeof val !== "object" || Array.isArray(val)) return null;
    return {
      cpuMaxPct: typeof val.cpuMaxPct === "number" && Number.isFinite(val.cpuMaxPct) ? val.cpuMaxPct : null,
      ramMaxMb: typeof val.ramMaxMb === "number" && Number.isFinite(val.ramMaxMb) ? val.ramMaxMb : null,
    };
  } catch {
    return null;
  }
}

export function guardarLimites(brainId: string, val: { cpuMaxPct: number | null; ramMaxMb: number | null }): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`starseed.brain.${brainId}.limites`, JSON.stringify(val));
}

export { CLAVE };