import { esVersionMasNueva, esVersionSemver } from "@/lib/version/os-release";
import { leerVersionNativa, tauriGlobal, type FuenteVersion, type InfoNeuronaNativa, type TauriConApp } from "@/lib/nativa/info-neurona";

export type Medio = "web" | "pwa" | "escritorio" | "android" | "ios";

export interface EntornoDeteccion {
  tauriPresente?: boolean;
  plataforma?: "android" | "ios" | "desktop";
  modoStandalone?: boolean;
}

export function medioActual(env: EntornoDeteccion): Medio {
  if (env.tauriPresente) {
    switch (env.plataforma) {
      case "android":
        return "android";
      case "ios":
        return "ios";
      case "desktop":
        return "escritorio";
      default:
        return "escritorio";
    }
  }
  if (env.modoStandalone) {
    return "pwa";
  }
  return "web";
}

interface HayActualizacionParams {
  medio: Medio;
  instalada: string | null | undefined;
  publicada: string | null | undefined;
}

export function hayActualizacion({ medio, instalada, publicada }: HayActualizacionParams): boolean {
  if (!instalada || !publicada) return false;
  if (medio === "web" || medio === "pwa") {
    return instalada !== publicada;
  }
  // (VER1107B) En las apps nativas solo se comparan versiones de verdad: un build de la web
  // («mvq6sg7z-kt91hk») o cualquier basura se leía como la versión 0 y todo parecía más nuevo.
  if (!esVersionSemver(instalada) || !esVersionSemver(publicada)) return false;
  return esVersionMasNueva(publicada, instalada);
}

/** Plataforma de la app nativa: la que dice la app (info_neurona) o, si no, el navegador. Pura. */
export function plataformaNativa(info: InfoNeuronaNativa | null, ua: string): "android" | "ios" | "desktop" {
  const p = info?.plataforma?.toLowerCase() ?? "";
  if (p === "android") return "android";
  if (p === "ios") return "ios";
  if (p) return "desktop";
  return /android/i.test(ua) ? "android" : /iphone|ipad/i.test(ua) ? "ios" : "desktop";
}

export interface Instalada {
  medio: Medio;
  /** App nativa: SOLO su versión semver (o null si no se sabe). Web/PWA: el build de /version.json. */
  version: string | null;
  /** De dónde salió la versión (null si no se sabe). */
  fuente: FuenteVersion | "version.json" | null;
  /** Lo que dijo la app nativa de sí misma (null en web o en apps anteriores a VER1107B). */
  info: InfoNeuronaNativa | null;
}

/**
 * Qué versión tiene instalada este medio. En la app nativa se lee del objeto GLOBAL de Tauri
 * (`lib/nativa/info-neurona.ts`) y NUNCA se cae al build de la web: si la app no dice su versión,
 * `version: null` (y la ventana «Hay una versión nueva» no se abre). Nunca lanza.
 */
export async function leerInstalada(tauri: TauriConApp | null = tauriGlobal()): Promise<Instalada> {
  const win = typeof window !== "undefined" ? window : undefined;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const ua = typeof nav?.userAgent === "string" ? nav.userAgent : "";
  if (tauri) {
    const leida = await leerVersionNativa(tauri).catch(() => null);
    const info = leida?.info ?? null;
    const medio = medioActual({ tauriPresente: true, plataforma: plataformaNativa(info, ua) });
    return { medio, version: leida?.version ?? null, fuente: leida?.fuente ?? null, info };
  }
  const modoStandalone =
    !!(win && typeof (win as unknown as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia === "function" &&
      (win as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia("(display-mode: standalone)").matches);
  const medio = medioActual({ tauriPresente: false, modoStandalone });
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const version = typeof data?.build === "string" ? data.build : null;
      return { medio, version, fuente: version ? "version.json" : null, info: null };
    }
  } catch {
    // sin conexión
  }
  return { medio, version: null, fuente: null, info: null };
}
