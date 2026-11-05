/*
 * versión-por-medio — ¿Qué versión tiene ESTE medio y qué versión está publicada?
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * 
 *   · `medioActual(entorno)` → `web` · `pwa` · `escritorio` · `android` · `ios`
 *     (contrato §5 · «¿hay versión nueva en ESTE medio?»).
 *   · `leerInstalada()` → versión nativa con `getVersion` de Tauri o el build de `/version.json`.
 *   · `hayActualizacion({medio, instalada, publicada})` → `compararVersiones`/`esVersionMasNueva`
 *     de `src/lib/version/os-release.ts` (web/PWA: sha de `/version.json`; escritorio/Android: versión nativa).
 * 
 * SSR-safe, sin `node:*`. Nunca lanza.
 */

import { compararVersiones, esVersionMasNueva, OS_VERSION, NATIVE_VERSION } from "../version/os-release";

/** Tipo de medio según el contrato §5. */
export type MedioActual = "web" | "pwa" | "escritorio" | "android" | "ios";

/** ¿Qué medio es ESTE? (contrato §5). */
export function medioActual(flags?: {
  tauri?: boolean;
  plataforma?: "android" | "ios" | "escritorio";
  standalone?: boolean;
}): MedioActual {
  // Si recibe banderas (modo puro), prioriza Tauri, Android, escritorio/iOS, PWA, web
  if (flags) {
    if (flags.tauri) return "escritorio";
    if (flags.plataforma === "android") return "android";
    if (flags.plataforma === "ios") return "ios";
    if (flags.plataforma === "escritorio") return "escritorio";
    if (flags.standalone) return "pwa";
    return "web";
  }
  
  if (typeof window === "undefined") return "web";
  
  try {
    // Tauri (escritorio)
    if ("__TAURI__" in window || "__TAURI_INTERNALS__" in window) {
      return "escritorio";
    }
    
    // PWA standalone
    const standalone = typeof window !== "undefined" && 
      (window.matchMedia?.("(display-mode: standalone)").matches === true || 
       (navigator as any).standalone === true);
    if (standalone) return "pwa";
    
    // Web normal o móvil detectado por userAgent
    const ua = navigator.userAgent || "";
    if (/android/i.test(ua)) return "android";
    if (/iphone|ipad|ipod/i.test(ua)) return "ios";
    return "web";
  } catch {
    return "web";
  }
}

/** ¿Hay versión nueva en ESTE medio? (contrato §5). */
export async function hayActualizacion({
  medio,
  instalada,
  publicada,
}: {
  medio: MedioActual;
  instalada: string | null;
  publicada: string | null;
}): Promise<boolean> {
  if (!instalada || !publicada) return false;
  
  // Web/PWA: compara el sha de `/version.json` (OS_VERSION)
  if (medio === "web" || medio === "pwa") {
    return esVersionMasNueva(publicada, instalada);
  }
  
  // Escritorio/Android: compara la versión nativa (NATIVE_VERSION)
  return esVersionMasNueva(publicada, instalada);
}

/** Versión instalada en ESTE medio (contrato §5). */
export async function leerInstalada(): Promise<string | null> {
  try {
    // Tauri (escritorio) — import dinámico con try/catch
    if (typeof window !== "undefined" && "__TAURI__" in window) {
      try {
        // @ts-ignore import dinámico de Tauri
        const tauri = await import("@tauri-apps/api/app");
        return await tauri.getVersion().catch(() => null);
      } catch {
        return null;
      }
    }
    
    // Web/PWA: lee el build de `/version.json`
    if (typeof window !== "undefined") {
      const r = await fetch("/version.json", { cache: "no-store" });
      if (r.ok) {
        const { build } = await r.json().catch(() => ({ build: null }));
        return build || null;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/** Versión publicada para ESTE medio (contrato §5). */
export function versionPublicada(medio: MedioActual): string | null {
  if (medio === "web" || medio === "pwa") {
    return OS_VERSION;
  }
  
  // Escritorio/Android: NATIVE_VERSION
  return NATIVE_VERSION;
}