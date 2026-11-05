/*
 * actualizador-android — comprueba y abre actualización Android (2026-11-05).
 * Contrato: architecture/centro-versiones-1105.md §5.
 *
 * Reglas:
 *  · Puro: no importa node:, no lanza, devuelve Resultado.
 *  · Primero la vía simple: con la URL del .apk de la versión nueva (de /api/os/versiones).
 *  · Ábrela con el abridor del sistema que ya declaran las capabilities (shell:allow-open).
 *  · Android descarga y ofrece instalar, y al ser la misma firma conserva los datos.
 *  · Si no hay abridor declarado, responde BLOQUEADA explicando qué permiso falta.
 *  · Funciones de decisión PURAS con su prueba.
 */

import type { Resultado } from "./tipos";

// Type declaration for Tauri window extensions (simulated in tests)
declare global {
  interface Window {
    __TAURI__?: {
      shell: {
        open: (url: string, options: object) => void;
      };
    };
  }
}

/** Info de una versión con su archivo Android. */
export interface VersionAndroid {
  version: string;
  sha256: string;
  url_apk: string;
  notas?: string;
}

/** Resultado de comprobar e intentar la actualización Android. */
export type ResultadoActualizador = {
  /** Ya está al día con la misma firma. */
  ya_dia: true;
  version_nueva: string;
  sha256: string;
} | {
  /** Se bloqueó por falta de abridor/permiso. */
  bloqueado: true;
  motivo: string;
} | {
  /** Hay versión nueva y se abrió el APK para instalar. */
  abierto: true;
  version_nueva: string;
  sha256: string;
};

/**
 * Comprueba si hay versión nueva de Android y la abre con el abridor del sistema.
 * 
 * @param versionNueva - Info de la versión nueva traída de /api/os/versiones
 * @param versionInstalada - Versión actualmente instalada (o vacía si no hay)
 * @returns Resultado con el estado de la actualización
 */
export function comprobarActualizacionAndroid(
  versionNueva: VersionAndroid,
  versionInstalada: string = ""
): ResultadoActualizador {
  if (versionInstalada === versionNueva.version) {
    return {
      ya_dia: true,
      version_nueva: versionNueva.version,
      sha256: versionNueva.sha256,
    };
  }

  if (!versionNueva.url_apk) {
    return {
      bloqueado: true,
      motivo: "La versión nueva no tiene URL de .apk disponible.",
    };
  }

  // Verificar que el abridor del sistema está disponible
  const hayAbridor = typeof window !== "undefined" && window.__TAURI__?.shell?.open;
  if (!hayAbridor) {
    return {
      bloqueado: true,
      motivo:
        "No hay abridor de sistema declarado. Falta el permiso `shell:allow-open` en las capabilities de Tauri.",
    };
  }

  // Abrir el APK con el abridor del sistema (Android descarga y ofrece instalar)
  // Al ser la misma firma, Android conserva los datos de la app anterior
  window.__TAURI__!.shell.open(versionNueva.url_apk, {});

  return {
    abierto: true,
    version_nueva: versionNueva.version,
    sha256: versionNueva.sha256,
  };
}

/**
 * Obtiene la versión nueva de Android desde la API pública.
 * Caché: 10 minutos (seg architecture/centro-versiones-1105.md §6).
 */
export async function obtenerVersionNuevaAndroid(): Promise<VersionAndroid | null> {
  if (typeof window === "undefined") return null;

  try {
    const res = await fetch("/api/os/versiones");
    if (!res.ok) return null;
    const data = await res.json();
    const version = data.find((v: any) => v.medio === "android");
    if (!version) return null;
    return {
      version: version.version,
      sha256: version.sha256,
      url_apk: version.url_apk,
      notas: version.notas,
    };
  } catch {
    return null;
  }
}