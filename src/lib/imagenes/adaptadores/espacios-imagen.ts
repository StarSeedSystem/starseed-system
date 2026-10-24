/**
 * Imágenes locales de Astraura · ADAPTADOR DE SPACES PÚBLICOS (IMG1011 · capa «espacio»).
 * Contrato: architecture/astraura-imagenes.md §3, §11.2 (decisión de Alex 2026-10-11).
 *
 * FLUX.1 [schnell] (Apache-2.0) y Qwen-Image (Apache-2.0) corren como Spaces públicos
 * de Hugging Face. Se llaman DESDE EL NAVEGADOR de cada persona (cada quien gasta su
 * cuota diaria: ZeroGPU 2 min sin cuenta, 5 con cuenta gratis, 40 con PRO). El token
 * de Hugging Face, si se pone, se guarda solo en el aparato (`safe-storage`) y nunca
 * viaja a nuestros servidores ni a registros.
 *
 * Regla de honestidad («basta de ilusiones»): si un Space está dormido, lleno o cambió
 * su API, se dice y se pasa a la siguiente opción del plan (`planImagen`). El Space
 * de Qwen-Image 2.1 (CPU básica) NO se usa (contrato §11.2).
 */

import type { ModeloImagen } from "../modelos";
import type { OpcionImagen } from "../plan";

export interface EspacioInfo {
  modelo: ModeloImagen | null;
  licencia: string;
  hechoEnSpace: string;
}

export const ESPACIOS_ACTIVOS: Record<string, string> = {
  "black-forest-labs/FLUX.1-schnell": "FLUX.1 [schnell] · Apache-2.0 · hecho en su Space público de Hugging Face",
  "Qwen/Qwen-Image": "Qwen-Image · Apache-2.0 · hecho en su Space público de Hugging Face",
};

export function esEspacioActivo(idEspacio: string): boolean {
  return !!ESPACIOS_ACTIVOS[idEspacio];
}

export function infoEspacio(idEspacio: string, modelo: ModeloImagen | null): EspacioInfo {
  const texto = ESPACIOS_ACTIVOS[idEspacio] ?? `Space público de ${idEspacio ?? "desconocido"}`;
  return {
    modelo,
    licencia: "Apache-2.0",
    hechoEnSpace: texto,
  };
}

export interface ResultadoEspacio {
  url?: string;
  segundos: number;
  licencia: string;
  hechoEnSpace: string;
}

const TIMEOUT_MS = 60000;

export async function ejecutarEspacio(
  op: OpcionImagen,
  prompt: string,
  fetcher: typeof fetch = typeof fetch !== "undefined" ? fetch : (() => Promise.resolve(new Response())) as typeof fetch,
): Promise<ResultadoEspacio | null> {
  const inicio = Date.now();
  const modelo = op.modelo;
  if (!modelo || !modelo.espacio) return null;
  const idEspacio = modelo.espacio;
  if (!esEspacioActivo(idEspacio)) return null;
  const info = infoEspacio(idEspacio, modelo);
  const urlBase = `https://huggingface.co/spaces/${encodeURIComponent(idEspacio)}`;
  try {
    const params = new URLSearchParams({ prompt: prompt.trim() });
    if (typeof op.semilla === "number" && Number.isFinite(op.semilla)) {
      params.set("seed", String(Math.floor(op.semilla)));
    }
    const url = `${urlBase}?${params.toString()}`;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => { try { controller.abort(); } catch { /* noop */ } }, TIMEOUT_MS)
      : null;
    const res = await fetcher(url, { method: "GET", signal: controller?.signal ?? undefined }).catch(() => null);
    if (timer) clearTimeout(timer);
    if (!res || !res.ok) return null;
    const texto = await res.text().catch(() => null);
    const urlImagen = texto && texto.trim().startsWith("http") ? texto.trim() : undefined;
    if (!urlImagen) return null;
    return {
      url: urlImagen,
      segundos: Math.round(((Date.now() - inicio) / 1000) * 10) / 10,
      licencia: info.licencia,
      hechoEnSpace: info.hechoEnSpace,
    };
  } catch {
    return null;
  }
}
