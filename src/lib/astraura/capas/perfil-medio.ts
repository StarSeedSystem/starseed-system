// Extends horizontal profile detection with media properties.
// This module imports the hardware profile from ../../perfil-hardware.ts
// and adds browser related metrics.

import type { EntornoMedicion, PerfilHardware } from "../../perfil-hardware";

// Extended environment input
export interface EntornoMedio extends EntornoMedicion {
  // WebGPU support and max buffer size in bytes
  webgpu?: boolean;
  webgpuMaxBufferSize?: number;
  // WASM compilation flags
  wasmSimd?: boolean;
  wasmThreads?: boolean;
  // Persistent storage grant
  persist?: boolean;
  // Storage estimate from navigator.storage.estimate()
  storageEstimate?: { quota: number; usage: number };
  // Page visibility
  visible?: boolean;
}

// Extended profile output
export type PerfilMedio = PerfilHardware & {
  webgpu: boolean;
  maxBufferSize: number;
  wasmSimd: boolean;
  wasmThreads: boolean;
  persist: boolean;
  storageEstimate: { quota: number; usage: number };
  visible: boolean;
};

import { medirPerfil } from "../../perfil-hardware";

export function medirPerfilMedio(e: EntornoMedio): PerfilMedio {
  const base = medirPerfil(e);
  return {
    ...base,
    webgpu: e.webgpu ?? false,
    maxBufferSize: e.webgpuMaxBufferSize ?? 0,
    wasmSimd: e.wasmSimd ?? false,
    wasmThreads: e.wasmThreads ?? false,
    persist: e.persist ?? false,
    storageEstimate: e.storageEstimate ?? { quota: 0, usage: 0 },
    visible: e.visible ?? true,
  };
}

// Budget calculation based on tabla 4 in architecture/capas-autoadaptables.md
export interface PresupuestoMedio {
  disco_mb: number;
  ram_mb: number | null;
  capas_guardables: string[];
  segundo_plano: boolean;
  motivo: string;
}

// Simple implementation using only the medium and profile.
export function presupuestoMedio(p: PerfilHardware, ajustes?: { freeDiskMb?: number; server?: boolean }): PresupuestoMedio {
  const { plataforma, ramGb } = p;
  const freeDiskMb = ajustes?.freeDiskMb ?? 0;
  const server = ajustes?.server ?? false;

  let disco_mb = 0;
  let capas_guardables: string[] = [];
  let motivo = "";

  switch (plataforma) {
    case "web":
      disco_mb = 12;
      capas_guardables = ["reflejo", "palabra"];
      motivo = "web visitante";
      break;
    case "pwa":
      disco_mb = 1024;
      capas_guardables = ["reflejo", "memoria", "palabra"];
      motivo = "pwa instalada";
      break;
    case "tauri":
    case "android":
    case "ios":
      disco_mb = Math.min(Math.floor(freeDiskMb * 0.15), 8 * 1024);
      capas_guardables = ["reflejo", "memoria", "palabra", "razón"];
      motivo = "nativo";
      break;
    case "servidor":
      disco_mb = server ? 0 : 0;
      capas_guardables = ["reflejo", "memoria", "palabra", "razón", "profunda"];
      motivo = "servidor";
      break;
    default:
      disco_mb = 0;
  }

  return {
    disco_mb,
    ram_mb: ramGb ? ramGb * 1024 : null,
    capas_guardables,
    segundo_plano: plataforma === "web" || plataforma === "pwa", // example rule
    motivo,
  };
}
