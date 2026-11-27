"use client";

import { safeGet, safeSet, safeRemove } from "@/lib/safe-storage";
import { mergeUserPrefs, recordarPrefsServidor } from "@/lib/sync/user-prefs";
import type { PreferenciasNfc } from "./preferencias";

export const NFC_PREFS_KEY = "starseed.nfc.prefs.v1" as const;

const CLAVE = "starseed.nfc.prefs.v1";

export function cargarPreferencias(): PreferenciasNfc | null {
  const raw = safeGet(NFC_PREFS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.version === 1) {
      return parsed as PreferenciasNfc;
    }
    return null;
  } catch {
    return null;
  }
}

export function guardarPreferencias(prefs: PreferenciasNfc): boolean {
  return safeSet(NFC_PREFS_KEY, JSON.stringify(prefs));
}

export function eliminarPreferencias(): void {
  safeRemove(NFC_PREFS_KEY);
}

export async function sincronizarConCuenta(prefs: PreferenciasNfc): Promise<{ ok: boolean; error?: string }> {
  const res = await mergeUserPrefs({ [CLAVE]: prefs });
  if (res.ok && res.atomic) {
    recordarPrefsServidor({ [CLAVE]: prefs });
  }
  return { ok: res.ok, error: res.error };
}

export function prefijoClave(): string {
  return NFC_PREFS_KEY;
}