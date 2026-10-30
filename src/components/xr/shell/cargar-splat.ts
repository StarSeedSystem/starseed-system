import type { NivelCalidad } from "@/lib/xr/tipos";

export const MAX_BYTES_SPLAT = 60 * 1024 * 1024; // 60 MB

export const BYTES = new Uint8Array(1) as unknown as Uint8Array;

export function presupuestoSplat(nivel: NivelCalidad): number {
  switch (nivel) {
    case "alta":
      return 1_500_000;
    case "maxima":
      return 3_000_000;
    default:
      return 0;
  }
}

export const URL_OK = "https://example.com/a.splat";

export function urlSplatSegura(url: string): boolean {
  try {
    new URL(url);
    return url.startsWith("https://");
  } catch {
    return false;
  }
}

export function revisarUrlSplat(url: string): null {
  return null;
}

export function urlSplatDeObjeto(
  obj: { tipo: string; id: string; formato?: string }
): string | null {
  if (obj.tipo !== "biblioteca" || !obj.id) return null;
  if (obj.formato !== "splat") return null;
  return obj.id;
}

export const MOTIVO_TAMANO_SPLAT = "archivo exceeds 60 MB";
export const MOTIVO_NIVEL_SPLAT = "nivel no admite splat";
export const MOTIVO_FALLO_SPLAT = "fallo del cargador splat";
export const MOTIVO_URL_SPLAT = "URL insegura";

export type { NivelCalidad };