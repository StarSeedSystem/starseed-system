/**
 * Imágenes locales de Astraura · HIERRO REAL DE ESTA NEURONA (IMG1011E). Contrato: architecture/astraura-imagenes.md §5, §8.
 *
 * La app nativa pregunta al servicio local de imágenes (IMG1011A) por el hierro REAL: sistema, GPU,
 * VRAM, RAM dedicable y disco libre. En la web solo se sabe si hay WebGPU y una estimación de memoria
 * (navigator.gpu / deviceMemory): lo que no se puede saber se declara DESCONOCIDO, nunca se inventa.
 * Aquí también vive lo PURO de la tarjeta «Astraura te sugiere instalar…»: elegir los archivos exactos
 * a descargar entre los listados de Hugging Face, la regla de seguridad de espacio (≥ 3× el tamaño) y
 * la huella para mostrar la sugerencia una sola vez hasta que cambie el hierro o el catálogo (IMG1011G).
 */
import type { ModeloImagen } from "../modelos";
import type { Cuantizacion } from "../plan";
import type { HierroImg, SistemaNeurona } from "../sugerencias";
import { puedeDescargarPesos } from "./webgpu-sd-turbo";

/** Servicio local de imágenes por neurona (IMG1011A); la app puede apuntarlo con NEXT_PUBLIC_ASTRAURA_IMAGENES_LOCAL_URL. */
export const URL_SERVICIO_IMAGENES_POR_DEFECTO = "http://127.0.0.1:4700";

export interface ArchivoRepo { ruta: string; bytes: number | null }
/** Lo que el servicio local mide de verdad (desconocido = null, jamás estimado a la fuerza). */
export interface HierroLocal extends HierroImg { discoLibreBytes: number | null; enLaMalla: string[] }
export interface SeleccionDescarga { archivos: string[]; bytesTotales: number; incompleto: boolean }

const SO: readonly SistemaNeurona[] = ["macos", "windows", "linux", "android", "ios"];
const GPU: readonly HierroImg["gpu"][] = ["nvidia", "apple", "amd", "ninguna"];

/** Plataforma (userAgentData.platform o navigator.platform) → sistema; si no se reconoce, null. */
export function sistemaDesdePlataforma(p: string | null | undefined): SistemaNeurona | null {
  const s = (p ?? "").toLowerCase();
  if (/mac/.test(s)) return "macos";
  if (/win/.test(s)) return "windows";
  if (/android/.test(s)) return "android";
  if (/iphone|ipad|ipod|ios/.test(s)) return "ios";
  if (/linux|cros|x11/.test(s)) return "linux";
  return null;
}

/** Vendedor que informa el adaptador WebGPU (GPUAdapterInfo.vendor) → GPU del catálogo; si no, null. */
export function gpuDesdeVendor(v: string | null | undefined): HierroImg["gpu"] | null {
  const s = (v ?? "").toLowerCase();
  if (/nvidia/.test(s)) return "nvidia";
  if (/apple/.test(s)) return "apple";
  if (/amd|advanced micro/.test(s)) return "amd";
  return null;
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
const texto = (x: unknown): string => (typeof x === "string" ? x : "");

/** Valida la respuesta de `GET /hierro` del servicio local. Devuelve null si no es fiable: nunca se inventa. */
export function parseaHierroLocal(json: unknown): HierroLocal | null {
  if (typeof json !== "object" || json === null) return null;
  const o = json as Record<string, unknown>;
  const so = texto(o.so) as SistemaNeurona;
  const gpu = texto(o.gpu) as HierroImg["gpu"];
  const ram = num(o.ramGB);
  if (!SO.includes(so) || !GPU.includes(gpu) || ram === null || ram <= 0) return null;
  return {
    so, gpu, ramGB: ram,
    vramGB: num(o.vramGB),
    webgpu: o.webgpu === true,
    discoLibreBytes: num(o.discoLibreBytes),
    enLaMalla: Array.isArray(o.enLaMalla) ? o.enLaMalla.filter((x): x is string => typeof x === "string") : [],
  };
}

/** Señales que la WEB sí puede medir (quien llama lee navigator): WebGPU, vendedor del adaptador y memoria estimada. */
export interface SondasWeb {
  webgpu: boolean;
  vendedorGpu?: string | null;
  /** navigator.deviceMemory (aproximada y redondeada por el navegador) o null si no la da. */
  memoriaGB?: number | null;
  plataforma?: string | null;
}

/**
 * Hierro honesto en la web: sin sistema reconocido o sin estimación de memoria no hay sugerencia
 * instalable aquí (se dice así), y una GPU que WebGPU no identifica queda en «ninguna» (solo CPU).
 */
export function hierroDesdeSondasWeb(s: SondasWeb): HierroImg | null {
  const so = sistemaDesdePlataforma(s.plataforma);
  const ram = s.memoriaGB;
  if (!so || typeof ram !== "number" || !Number.isFinite(ram) || ram <= 0) return null;
  return { so, gpu: gpuDesdeVendor(s.vendedorGpu) ?? "ninguna", vramGB: null, ramGB: ram, webgpu: s.webgpu };
}

const TOKEN_Q: Record<Cuantizacion, string[]> = {
  q4: ["q4_k_m", "q4"],
  q8: ["q8_1", "q8_0", "q8"],
  nativa: [],
};

/** Suma con honestidad: un solo archivo sin tamaño conocido marca la selección como incompleta. */
function suma(archivos: readonly ArchivoRepo[], rutas: readonly string[]): SeleccionDescarga {
  let bytes = 0, incompleto = false;
  for (const r of rutas) {
    const a = archivos.find((x) => x.ruta === r);
    if (a && typeof a.bytes === "number") bytes += a.bytes; else incompleto = true;
  }
  return { archivos: [...rutas], bytesTotales: bytes, incompleto };
}

/**
 * Los archivos EXACTOS a descargar de Hugging Face para correr este modelo con sd.cpp/motor cuantizado:
 * un solo GGUF si el repo los ofrece (elegido por la cuantización); si no, todos los pesos
 * safetensors más los archivos ligeros de configuración (sin duplicar los .bin heredados).
 * Con la lista vacía devuelve null: sin listado real no se promete ningún tamaño.
 */
export function eligeArchivosDescarga(m: ModeloImagen, c: Cuantizacion, archivos: readonly ArchivoRepo[]): SeleccionDescarga | null {
  if (!archivos.length) return null;
  const ggufs = archivos.filter((a) => a.ruta.toLowerCase().endsWith(".gguf"));
  if (ggufs.length) {
    if (c === "nativa") return suma(ggufs, [ggufs.reduce((x, y) => ((x.bytes ?? 0) >= (y.bytes ?? 0) ? x : y)).ruta]);
    for (const t of TOKEN_Q[c]) {
      const hit = ggufs.find((a) => a.ruta.toLowerCase().includes(t));
      if (hit) return suma(ggufs, [hit.ruta]);
    }
    return suma(ggufs, [ggufs.reduce((x, y) => ((x.bytes ?? 0) <= (y.bytes ?? 0) ? x : y)).ruta]);
  }
  const safe = archivos.filter((a) => /\.safetensors$/i.test(a.ruta)).map((a) => a.ruta);
  const ligeros = archivos
    .filter((a) => /\.(json|txt|model)$/i.test(a.ruta) && !/\.bin$/i.test(a.ruta) && !a.ruta.toLowerCase().endsWith(".safetensors"))
    .filter((a) => (a.bytes ?? 0) < 50 * 1024 * 1024)
    .map((a) => a.ruta);
  const pesos = safe.length ? safe : archivos.filter((a) => /\.bin$/i.test(a.ruta)).map((a) => a.ruta);
  return pesos.length ? suma(archivos, [...pesos, ...ligeros]) : null;
}

/** Regla dura del contrato: nada se descarga sin ≥ 3× su tamaño libre en el disco destino. */
export function espacioSuficiente(bytesLibre: number, bytesDescarga: number): { ok: boolean; mensaje: string } {
  const gb = (b: number) => (b / 1024 ** 3).toFixed(1).replace(".", ",");
  if (bytesDescarga <= 0) return { ok: false, mensaje: "Tamaño de descarga desconocido: no se comprueba el espacio, no se descarga." };
  const verif = puedeDescargarPesos(["model.gguf"], bytesDescarga, bytesLibre);
  return bytesLibre >= bytesDescarga * 3
    ? { ok: true, mensaje: `Hay ${gb(bytesLibre)} GB libres; hacen falta ${gb(bytesDescarga)} GB (se pide el triple por seguridad). ${verif.mensaje}` }
    : { ok: false, mensaje: `Hacen falta ${gb(bytesDescarga * 3)} GB libres (tres veces la descarga) y solo hay ${gb(bytesLibre)} GB. ${verif.mensaje}` };
}

/** La sugerencia sale una vez y vuelve solo si cambia el hierro, la malla o la versión del catálogo (IMG1011G). */
export function huellaSugerencias(h: HierroImg, versionCatalogo: string, enLaMalla: readonly string[] = []): string {
  return [h.so, h.gpu, h.vramGB ?? "-", h.ramGB, h.webgpu ? "w" : "-", versionCatalogo, ...[...enLaMalla].sort()].join("|");
}

/** Explicación en claro de un modelo «gated» con su enlace directo para aceptar los términos. */
export function textoGated(m: ModeloImagen): string {
  return `Para descargarlo hay que entrar en https://huggingface.co/${m.hf} con tu cuenta (gratis), aceptar sus términos y crear un token de lectura en https://huggingface.co/settings/tokens. Ese token se pone en la variable de entorno HF_TOKEN de tu app; nunca se escribe en el código ni se envía a StarSeed.`;
}

/* —— Acceso en vivo (delgado; la lógica probada está arriba) —— */

type Fetcher = typeof fetch;

/** Pregunta al servicio local de imágenes por el hierro real. Si no responde o miente, devuelve null. */
export async function leeHierroServicioLocal(base: string, f: Fetcher = fetch): Promise<HierroLocal | null> {
  try {
    const r = await f(`${base.replace(/\/$/, "")}/hierro`, { cache: "no-store" });
    return r.ok ? parseaHierroLocal(await r.json()) : null;
  } catch {
    return null; // No hay servicio local (web sin app instalada): se dirá, no se inventa.
  }
}

/** Listado real de archivos del repo en Hugging Face (API pública, /tree recursivo). */
export async function archivosDelRepo(repoHf: string, f: Fetcher = fetch): Promise<ArchivoRepo[]> {
  try {
    const r = await f(`https://huggingface.co/api/models/${repoHf}/tree/main?recursive=true`);
    if (!r.ok) return [];
    const lista: unknown = await r.json();
    if (!Array.isArray(lista)) return [];
    return lista
      .map((x) => {
        const o = (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
        return { ruta: texto(o.path), bytes: num(o.size) };
      })
      .filter((a) => a.ruta.length > 0);
  } catch {
    return [];
  }
}
