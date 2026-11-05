import { esVersionMasNueva } from "@/lib/version/os-release";

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
  return esVersionMasNueva(publicada, instalada);
}

export async function leerInstalada(): Promise<{ medio: Medio; version: string | null }> {
  const win = typeof window !== "undefined" ? window : undefined;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const tauriPresente = !!(win && (win as unknown as { __TAURI__?: unknown }).__TAURI__);
  const ua = typeof nav?.userAgent === "string" ? nav.userAgent : "";
  const plataforma = /android/i.test(ua)
    ? "android"
    : /iphone|ipad/i.test(ua)
    ? "ios"
    : "desktop";
  const modoStandalone =
    !!(win && typeof (win as unknown as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia === "function" &&
      (win as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia("(display-mode: standalone)").matches);
  const env: EntornoDeteccion = {
    tauriPresente,
    plataforma,
    modoStandalone,
  };
  const medio = medioActual(env);
  try {
    if (env.tauriPresente) {
      // @ts-expect-error - El entorno Tauri se resuelve en tiempo de ejecución
      const { app } = await import("@tauri-apps/api/app");
      const version = await app.getVersion();
      return { medio, version };
    }
  } catch {
    // sin Tauri o sin permiso
  }
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const version = typeof data?.build === "string" ? data.build : null;
      return { medio, version };
    }
  } catch {
    // sin conexión
  }
  return { medio, version: null };
}
