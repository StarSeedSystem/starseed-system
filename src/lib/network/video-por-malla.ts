/*
 * video-por-malla (Ola 1018H · tarea I) — manejador PURO del relé
 * `capacidad.video.render` (§4 de architecture/video-hyperframes.md): admite
 * peticiones de la misma cuenta o de un grupo con permiso, rechaza GSAP editado
 * por el OS (§2) y recursos privados ajenos, y encola. La neurona la elige la
 * bolsa de recursos; reloj, ids y cola se inyectan. Sin red ni disco.
 */
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";

export const VIDEO_MALLA_NS = "capacidad.video.render.";
export const VIDEO_MALLA_MAX_HTML_BYTES = 512 * 1024;
export const VIDEO_MALLA_MAX_DURACION_S = 600;
export type FormatoVideoMalla = "mp4" | "webm" | "mov" | "gif" | "png-sequence" | "hls";
const FORMATOS: readonly FormatoVideoMalla[] = ["mp4", "webm", "mov", "gif", "png-sequence", "hls"];

export interface RecursoVideoMalla { url: string; privado?: boolean; cuentaId?: string }
export interface ComposicionVideoMalla {
  html: string;
  /** `os` = la editó StarSeed (nunca con GSAP); `ajena` = de fuera (se puede renderizar). */
  origen: "os" | "ajena";
  recursos?: RecursoVideoMalla[];
  formato?: FormatoVideoMalla;
  duracionS?: number;
}
export interface PeticionVideoMalla { cuentaId: string; grupoId?: string; composicion: ComposicionVideoMalla }
export interface ReglasAdmisionVideo { mismaCuenta: boolean; gruposConPermiso?: readonly string[] }
export type ResultadoVideoMalla =
  | { aceptado: true; trabajoId: string }
  | { aceptado: false; motivo: string };

/** Admisión: la misma cuenta siempre; otro grupo solo si está en la lista con permiso. */
export function admiteVideoMalla(
  p: Pick<PeticionVideoMalla, "grupoId">, r: ReglasAdmisionVideo,
): { aceptado: boolean; motivo: string } {
  if (r.mismaCuenta) return { aceptado: true, motivo: "petición de la misma cuenta" };
  if (p.grupoId && (r.gruposConPermiso ?? []).includes(p.grupoId))
    return { aceptado: true, motivo: "petición de un grupo con permiso de render" };
  return { aceptado: false, motivo: "Rechazo: el render solo se presta a la misma cuenta o a un grupo con permiso." };
}

function esObjeto(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object" && !Array.isArray(x); }
function esFormato(x: unknown): x is FormatoVideoMalla { return typeof x === "string" && (FORMATOS as readonly string[]).includes(x); }
function bytesUtf8(s: string): number { return new TextEncoder().encode(s).length; }

/** Guard puro: cuenta, composición, formato, duración, GSAP del OS y recursos privados. */
export function validarPeticionVideoMalla(
  x: unknown,
): { ok: true; peticion: PeticionVideoMalla } | { ok: false; motivo: string } {
  if (!esObjeto(x) || typeof x.cuentaId !== "string" || !x.cuentaId)
    return { ok: false, motivo: "Rechazo: falta el id de cuenta del que pide." };
  if (x.grupoId !== undefined && (typeof x.grupoId !== "string" || !x.grupoId))
    return { ok: false, motivo: "Rechazo: el id de grupo no es válido." };
  const c = x.composicion;
  if (!esObjeto(c) || typeof c.html !== "string" || !c.html.trim())
    return { ok: false, motivo: "Rechazo: la composición HyperFrames (html) es obligatoria." };
  if (bytesUtf8(c.html) > VIDEO_MALLA_MAX_HTML_BYTES)
    return { ok: false, motivo: `Rechazo: la composición supera ${VIDEO_MALLA_MAX_HTML_BYTES} bytes.` };
  if (c.origen !== "os" && c.origen !== "ajena")
    return { ok: false, motivo: "Rechazo: el origen de la composición debe ser «os» o «ajena»." };
  if (c.formato !== undefined && !esFormato(c.formato))
    return { ok: false, motivo: "Rechazo: formato de vídeo no admitido." };
  if (c.duracionS !== undefined && (typeof c.duracionS !== "number" || !Number.isFinite(c.duracionS)
    || c.duracionS <= 0 || c.duracionS > VIDEO_MALLA_MAX_DURACION_S))
    return { ok: false, motivo: `Rechazo: la duración debe estar entre 0 y ${VIDEO_MALLA_MAX_DURACION_S} s.` };
  // §2: el OS nunca edita ni genera GSAP; una composición ajena con GSAP se
  // puede renderizar, pero no se abre en el editor visual del OS.
  if (c.origen === "os" && detectarAdaptadores(c.html).usados.includes("gsap"))
    return { ok: false, motivo: "Rechazo: el OS no edita ni genera GSAP (licencia GSAP Standard, §2); convierte la animación a WAAPI." };
  if (c.recursos !== undefined && !Array.isArray(c.recursos))
    return { ok: false, motivo: "Rechazo: la lista de recursos de la composición no es válida." };
  for (const r of Array.isArray(c.recursos) ? c.recursos : []) {
    if (!esObjeto(r) || typeof r.url !== "string" || !r.url)
      return { ok: false, motivo: "Rechazo: hay un recurso de la composición sin URL." };
    if (r.privado === true && r.cuentaId !== x.cuentaId) // lo privado no sale de sus neuronas
      return { ok: false, motivo: "Rechazo: la composición pide recursos privados de otra cuenta y no salen de sus neuronas." };
  }
  return { ok: true, peticion: x as unknown as PeticionVideoMalla };
}

export interface TrabajoVideoMalla { id: string; cuentaId: string; composicion: ComposicionVideoMalla; creadoEn: number }
export interface DepsVideoMalla {
  /** Cola de render de la neurona; recibe el trabajo ya validado. */
  encolar?: (trabajo: TrabajoVideoMalla) => boolean;
  nuevoId?: () => string;
  ahora?: () => number;
}

function crearTrabajoId(): string {
  try { return crypto.randomUUID(); }
  catch { return `vr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
}

/** Manejador del relé: valida, admite y encola; { aceptado, trabajoId } o rechazo legible. */
export function manejarPeticionVideoMalla(
  x: unknown, reglas: ReglasAdmisionVideo, deps: DepsVideoMalla = {},
): ResultadoVideoMalla {
  const v = validarPeticionVideoMalla(x);
  if (!v.ok) return { aceptado: false, motivo: v.motivo };
  const a = admiteVideoMalla(v.peticion, reglas);
  if (!a.aceptado) return { aceptado: false, motivo: a.motivo };
  const trabajo: TrabajoVideoMalla = {
    id: deps.nuevoId?.() ?? crearTrabajoId(), cuentaId: v.peticion.cuentaId,
    composicion: v.peticion.composicion, creadoEn: deps.ahora?.() ?? Date.now(),
  };
  if (deps.encolar && !deps.encolar(trabajo))
    return { aceptado: false, motivo: "Rechazo: la cola de render de esta neurona está llena." };
  return { aceptado: true, trabajoId: trabajo.id };
}
