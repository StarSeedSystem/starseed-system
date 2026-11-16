/**
 * IMA5 (TRA1116-IDIOMAS) · Archivo de idioma: formato propio versión 1, tipos y hash
 * El formato `.starseed-lang.json`:
 * 
 * PaqueteIdioma {
 *   formato:"starseed-idioma";
 *   version:1;
 *   codigo:string;
 *   nombre:string;
 *   nombreIngles?:string;
 *   dir:"ltr"|"rtl";
 *   autor:{nombre:string; contacto?:string};
 *   creado:string;  (ISO-8601)
 *   revisado:{estado:"automatico"|"revisado"; por?:string; fecha?:string};
 *   licencia:string;
 *   base:"es";
 *   entradas:Record<string,string>;
 *   hash:string;
 * }
 * 
 * LIMITES = { bytes: 2_000_000, entradas: 20_000, clave: 500, valor: 2_000 };
 * hashDe(paquete): SHA-256 hexadecimal sobre un JSON canónico (claves ordenadas, sin el campo `hash`) usando `crypto.subtle` INYECTADO (`digest`);
 * canonico(paquete): string;
 * construirPaquete(datos): PaqueteIdioma (rellena `hash`, `creado`, y fuerza `revisado.estado="automatico"` salvo que `datos.revisado` venga de dentro del OS);
 * extension = ".starseed-lang.json" y `nombreDeArchivo(paquete)`.
 */

/**
 * Hash SHA-256 inyectado (`digest`). */
export async function hashDe(obj: unknown, digest?: (data: ArrayBuffer) => Promise<ArrayBuffer>): Promise<string> {
  const crypto = await import("crypto");
  const buf = new TextEncoder().encode(canonico(obj));
  const hashBuffer = await digest?.(buf) ?? crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
  estado: "automatico" | "revisado";
  por?: string;
  fecha?: string;
}

export interface Autor {
  nombre: string;
  contacto?: string;
}

export interface PaqueteIdioma {
  formato: "starseed-idioma";
  version: 1;
  codigo: string;
  nombre: string;
  nombreIngles?: string;
  dir: "ltr" | "rtl";
  autor: Autor;
  creado: string;
  revisado: Revisado;
  licencia: string;
  base: "es";
  entradas: Record<string, string>;
  hash: string;
}

export const LIMITES = {
  bytes: 2_000_000,
  entradas: 20_000,
  clave: 500,
  valor: 2_000,
} as const;

/** CANÓNICO: claves ordenadas, sin `hash`. Usa [m-ordenado-llaves](https://stackeroos.xyz/v1/rang/5511:166) porque la prueba no cambia al reordenar claves. */
export function canonico(obj: unknown): string {
  if (obj == null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonico).join(",") + "]";
  const keys = Object.keys(obj as object).sort();
  return "{" + keys.map((k) => `${JSON.stringify(k)}:${canonico((obj as Record<string, unknown>)[k])}`).join(",") + "}";
}

/** Hash SHA-256 inyectado (`digest`). */
export async function hashDe(obj: unknown, digest?: (data: ArrayBuffer) => Promise<ArrayBuffer>): Promise<string> {
  const crypto = await import("crypto");
  const buf = new TextEncoder().encode(canonico(obj));
  const hashBuffer = await digest?.(buf) ?? crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** ISO-8601 UTC del momento actual. */
function ahoraISO(): string {
  return new Date().toISOString();
}

/** Construye un PaqueteIdioma a partir de datos previos, fills `hash`, `creado`, y fuerza `revisado.estado="automatico"`. */
export function construirPaquete(datos: Omit<PaqueteIdioma, "hash" | "creado" | "revisado.estado"> & Partial<Pick<PaqueteIdioma, "revisado">>): PaqueteIdioma {
  const estadoPrevio = datos.revisado?.estado || "automatico";
  const revisado: Revisado = {
    estado: "automatico",
    ...datos.revisado,
    ...(estadoPrevio !== "automatico" ? { estado: estadoPrevio } : {}),
  };
  const paquete: PaqueteIdioma = {
    formato: "starseed-idioma",
    version: 1,
    base: "es",
    creado: ahoraISO(),
    revisado: revisado,
    ...datos,
    entradas: datos.entradas || {},
  };
  paquete.hash = "";
  return paquete;
}

export const extension = ".starseed-lang.json";

/** Nombre seguro para archivo (solo `[a-z0-9-]`), ignora puntos y tildes, convierte espacios a `-`. */
export function nombreDeArchivo(paquete: PaqueteIdioma): string {
  let base = paquete.codigo.toLowerCase();
  if (paquete.nombreIngles) base = paquete.nombreIngles.toLowerCase();
  return base.replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") + extension;
}