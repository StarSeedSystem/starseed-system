"use client";

/**
 * (VER1107B) La última versión publicada (`/api/os/versiones`), compartida por los paneles de neuronas:
 * una consulta cada 10 min por pestaña (el servidor ya la cachea otros 10). Sin red: null, y los
 * paneles no dicen «Nueva versión disponible» de nada. Nunca lanza.
 */

import { useEffect, useState } from "react";
import type { VersionPublicada } from "@/lib/version/versiones-publicadas";

const VIDA_MS = 10 * 60_000;
let cache: { t: number; v: VersionPublicada | null } | null = null;
let enVuelo: Promise<VersionPublicada | null> | null = null;

export async function leerUltimaPublicada(): Promise<VersionPublicada | null> {
  if (cache && Date.now() - cache.t < VIDA_MS) return cache.v;
  enVuelo ??= (async () => {
    try {
      const res = await fetch("/api/os/versiones");
      const datos = res.ok ? ((await res.json()) as { versiones?: VersionPublicada[] }) : null;
      const v = Array.isArray(datos?.versiones) ? (datos.versiones[0] ?? null) : null;
      cache = { t: Date.now(), v };
      return v;
    } catch {
      return null;
    } finally {
      enVuelo = null;
    }
  })();
  return enVuelo;
}

/** Olvida lo leído (pruebas). */
export function olvidarUltimaPublicada(): void {
  cache = null;
  enVuelo = null;
}

export function useUltimaPublicada(): VersionPublicada | null {
  const [v, setV] = useState<VersionPublicada | null>(cache?.v ?? null);
  useEffect(() => {
    let vivo = true;
    void leerUltimaPublicada().then((x) => {
      if (vivo) setV(x);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return v;
}
