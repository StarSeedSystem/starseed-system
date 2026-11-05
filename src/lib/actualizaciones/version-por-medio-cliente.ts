/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Cliente para lectura de versión del medio actual (contrato §5).
 *
 * `leerInstalada()` - función que obtiene la versión nativa con getVersion de
 * @tauri-apps/api/app si existe (import dinámico con try/catch) o el build
 * de /version.json.
 *
 * NO es puro: hace fetch y usa window. El núcleo puro está en
 * src/lib/actualizaciones/version-por-medio.ts.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { OS_VERSION } from "@/lib/version/os-release";
import {
  medioActual,
  type MedioOS,
  type BanderasEntorno,
  type InfoInstalada,
} from "./version-por-medio";

interface TauriApp {
  app?: { getVersion?: () => Promise<string> };
}

export { type InfoInstalada };

export async function leerInstalada(): Promise<InfoInstalada> {
  const banderas = obtenerBanderas();

  const medio = medioActual(banderas);

  const tauri = typeof window !== "undefined"
    ? (window as unknown as { __TAURI__?: TauriApp }).__TAURI__
    : undefined;

  if (tauri?.app?.getVersion) {
    try {
      const version = await tauri.app.getVersion().catch(() => null);
      if (version) return { medio: "escritorio", version };
    } catch {
      /* no es la app nativa */
    }
  }

  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { version?: string | null };
      if (data?.version) {
        return { medio, version: data.version };
      }
    }
  } catch {
    /* sin red o respuesta no válida */
  }

  if (medio === "web" || medio === "pwa") {
    return { medio, version: OS_VERSION };
  }

  return { medio, version: null };
}

function obtenerBanderas(): BanderasEntorno {
  if (typeof window === "undefined") {
    return {
      tauriPresente: false,
      esAndroid: false,
      esIOS: false,
      estaStandalone: false,
      esLocal: false,
      displayModeWeb: null,
    } as BanderasEntorno;
  }

  const w = window as unknown as Record<string, unknown>;
  const tauriPresente = "__TAURI__" in w || "__TAURI_INTERNALS__" in w;

  const ua = navigator.userAgent || "";
  const esAndroid = /android/i.test(ua);
  const esIOS = /ipad|iphone|ipod/i.test(ua);

  let estaStandalone = false;
  try {
    estaStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    /* noop */
  }

  let esLocal = false;
  try {
    esLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(window.location?.host ?? "");
  } catch {
    /* noop */
  }

  return {
    tauriPresente,
    esAndroid,
    esIOS,
    estaStandalone,
    esLocal,
    displayModeWeb: estaStandalone ? true : null,
  } as BanderasEntorno;
}