/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Detección de medio del OS y verificación de actualizaciones (contrato §5).
 *
 * Tipos de medio: web, pwa, escritorio, android, ios.
 * Compara versión instalada vs. publicada para cada medio.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { esVersionMasNueva } from "@/lib/version/os-release";

export type MedioOS = "web" | "pwa" | "escritorio" | "android" | "ios";

export interface BanderasEntorno {
  readonly tauriPresente: boolean;
  readonly esAndroid: boolean;
  readonly esIOS: boolean;
  readonly estaStandalone: boolean;
  readonly esLocal: boolean;
  readonly displayModeWeb: boolean | null;
}

export interface InfoInstalada {
  readonly medio: MedioOS;
  readonly version: string | null;
}

export function medioActual(banderas: BanderasEntorno): MedioOS {
  const { tauriPresente, esAndroid, esIOS, estaStandalone, esLocal, displayModeWeb } = banderas;

  if (esAndroid) return "android";
  if (esIOS) return "ios";
  if (tauriPresente) return "escritorio";
  if (estaStandalone) return "pwa";
  if (esLocal) return "web";
  if (displayModeWeb === true) return "pwa";
  return "web";
}

export interface VerificacionActualizacion {
  hayActualizacion: boolean;
  versionInstalada: string | null;
  versionPublicada: string;
}

export function hayActualizacion(
  params: { medio: MedioOS; instalada: string | null; publicada: string },
): boolean {
  const { instalada, publicada } = params;
  if (!instalada || !publicada) return false;
  return esVersionMasNueva(publicada, instalada);
}

export function verificarActualizacion(
  medio: MedioOS,
  instalada: string | null,
  publicada: string,
): VerificacionActualizacion {
  return {
    hayActualizacion: hayActualizacion({ medio, instalada, publicada }),
    versionInstalada: instalada,
    versionPublicada: publicada,
  };
}