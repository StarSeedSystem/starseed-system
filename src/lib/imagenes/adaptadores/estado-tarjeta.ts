/**
 * Imágenes de Astraura · ESTADO PURO DE LA TARJETA DE OPCIONES (IMG1011C). Contrato: architecture/astraura-imagenes.md §6.
 *
 * Conversión entre la GALERÍA de `media-gen`/`proveedor-neuronas` (IMG1011B) y el estado de la
 * tarjeta, más las peticiones que se le hacen: sin React, sin red, sin disco — todo inyectable
 * y probado. La regla de oro queda intacta: la generación NO se duplica aquí.
 */
import type { GenerateImageOptions, MediaGenResult, MediaProviderId } from "@/ai/astraura/media/media-gen";
import type { OpcionGaleria } from "@/ai/astraura/media/proveedor-neuronas";

/** El generador que produce la galería: el real es `media-gen.generateImage`; en pruebas, uno simulado. */
export type GeneradorImagen = (opts: GenerateImageOptions) => Promise<MediaGenResult>;
export interface DependenciasTarjeta { generar?: GeneradorImagen }

export interface PeticionTarjeta {
  prompt: string;
  opciones?: number;
  prioridad?: "calidad" | "rapidez";
  comercial?: boolean;
  conReferencia?: boolean;
  permisoRemoto?: boolean;
}

export interface EstadoTarjeta {
  opciones: OpcionGaleria[];
  /** Por qué el plan descartó (capa sin servicio, modelo sin licencia…): honestidad a la vista. */
  descartes: string[];
  elegida: OpcionGaleria | null;
  cargando: boolean;
  error: string | null;
  aviso: string | null;
}

export const OPCIONES_DEFECTO = 4;
export const LICENCIA_WEB = "Pollinations (web gratis; sin licencia declarada del resultado)";

export const estadoInicial: EstadoTarjeta = { opciones: [], descartes: [], elegida: null, cargando: false, error: null, aviso: null };

/** Proveedor de media-gen que corresponde a la capa por la que salió una opción. */
export function providerDeCapa(capa: OpcionGaleria["capa"]): MediaProviderId {
  if (capa === "web-gratis") return "pollinations";
  if (capa === "espacio") return "hf-inference";
  return "neuronas";
}

/** Extrae las opciones VIVAS del resultado: la galería completa, o una sola si hubo failover a Pollinations. */
export function opcionesDeResultado(r: MediaGenResult): OpcionGaleria[] {
  if (r.galeria?.ok && r.galeria.opciones.length) return r.galeria.opciones;
  if (!(r.ok && r.url)) return [];
  return [{
    url: r.url,
    modelo: null,
    capa: r.provider === "pollinations" ? "web-gratis" : "externo",
    semilla: 0,
    licencia: r.provider === "pollinations" ? LICENCIA_WEB : "Por la vía clara en /servicios (endpoint propio o de pago)",
    uso: "libre",
    atribucion: r.provider === "pollinations" ? "Generada con Pollinations (web gratis)." : `Generada con el proveedor «${r.provider}».`,
    segundos: 0,
  }];
}

/** La petición que se le hace a media-gen: «neuronas» activa SIEMPRE el reparto por capas (IMG1011B). */
export function opcionesDeMedia(p: PeticionTarjeta, seed?: number): GenerateImageOptions {
  return {
    prompt: p.prompt,
    provider: "neuronas",
    opciones: Math.max(1, Math.min(8, p.opciones ?? OPCIONES_DEFECTO)),
    comercial: p.comercial === true,
    conReferencia: p.conReferencia === true,
    permisoRemoto: p.permisoRemoto === true,
    ...(p.prioridad ? { prioridad: p.prioridad } : {}),
    ...(typeof seed === "number" ? { seed } : {}),
  };
}

/** Junta la variación nueva con lo ya visto: sin URL repetida, nunca más de 8 en la rejilla. */
export function opcionesTrasVariar(anteriores: OpcionGaleria[], nuevas: OpcionGaleria[]): OpcionGaleria[] {
  const ya = new Set(anteriores.map((o) => o.url));
  return [...anteriores, ...nuevas.filter((o) => o.url && !ya.has(o.url))].slice(0, 8);
}
