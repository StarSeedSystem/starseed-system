/*
 * video-por-malla — manejador PURO del relé `capacidad.video.render` (Ola 1018H · I).
 * La bolsa de recursos elige la neurona; aquí solo se valida, se comprueba la
 * privacidad y se encola. Contrato: architecture/video-hyperframes.md §2–§4.
 * Sin red, disco, procesos ni reloj: la cola se inyecta.
 */
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";

export const VIDEO_MALLA_CAPACIDAD = "capacidad.video.render";
export const VIDEO_MALLA_MAX_HTML_BYTES = 8 * 1024 * 1024;
export const FORMATOS_VIDEO_MALLA = ["mp4", "webm", "mov", "gif", "png-sequence", "hls"] as const;
export type FormatoVideoMalla = (typeof FORMATOS_VIDEO_MALLA)[number];
/** Recurso remoto de la composición, con su dueño y si es privado. */
export interface RecursoVideoMalla { url: string; cuenta?: string; privado?: boolean }
export interface PeticionVideoMalla {
  cuenta: string; grupo?: string; composicion: string; formato?: FormatoVideoMalla;
  /** `os` = la genera o edita el OS (sin GSAP); `ajena` = solo se reproduce y renderiza. */
  origen?: "os" | "ajena"; recursos?: RecursoVideoMalla[];
}
export interface ContextoVideoMalla { cuentaLocal: string; sesionGrupo?: string | null; gruposConPermiso?: string[] }
export interface TrabajoVideoMalla { composicion: string; formato: FormatoVideoMalla; cuenta: string; grupo?: string }
export interface DepsVideoMalla { encolar: (trabajo: TrabajoVideoMalla) => string }
export type ResultadoVideoMalla =
  | { aceptado: true; trabajoId: string; motivo: string }
  | { aceptado: false; motivo: string };

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
function esRecurso(x: unknown): x is RecursoVideoMalla {
  return esObjeto(x) && typeof x.url === "string" && !!x.url
    && (x.cuenta === undefined || typeof x.cuenta === "string")
    && (x.privado === undefined || typeof x.privado === "boolean");
}

/** Admisión: misma cuenta siempre; otro grupo solo si esta neurona lo tiene admitido. Pura. */
export function admiteVideoMalla(
  p: { cuenta: string; grupo?: string }, ctx: ContextoVideoMalla,
): { ok: boolean; motivo: string } {
  if (!p.cuenta) return { ok: false, motivo: "Rechazo: falta la cuenta que pide el render." };
  if (p.cuenta === ctx.cuentaLocal) return { ok: true, motivo: "petición de la misma cuenta" };
  const permitidos = new Set([...(ctx.gruposConPermiso ?? []), ...(ctx.sesionGrupo ? [ctx.sesionGrupo] : [])]);
  if (p.grupo && permitidos.has(p.grupo)) return { ok: true, motivo: `petición del grupo «${p.grupo}» con permiso` };
  return { ok: false, motivo: "Solo se atienden renders de la misma cuenta o de un grupo con permiso." };
}

/** Guard puro del cuerpo de `capacidad.pedir` tipo `render`. */
export function validarPeticionVideoMalla(
  x: unknown,
): { ok: true; peticion: PeticionVideoMalla } | { ok: false; motivo: string } {
  if (!esObjeto(x) || typeof x.cuenta !== "string" || !x.cuenta)
    return { ok: false, motivo: "Rechazo: falta la cuenta que pide el render." };
  if (typeof x.composicion !== "string" || !x.composicion.trim())
    return { ok: false, motivo: "Rechazo: falta la composición (HTML) que se va a renderizar." };
  if (new TextEncoder().encode(x.composicion).length > VIDEO_MALLA_MAX_HTML_BYTES)
    return { ok: false, motivo: "Rechazo: la composición pasa del tope de 8 MB." };
  if (x.formato !== undefined && (typeof x.formato !== "string" || !(FORMATOS_VIDEO_MALLA as readonly string[]).includes(x.formato)))
    return { ok: false, motivo: "Rechazo: formato de vídeo no admitido." };
  if (x.origen !== undefined && x.origen !== "os" && x.origen !== "ajena")
    return { ok: false, motivo: "Rechazo: origen de la composición no reconocido." };
  if (x.grupo !== undefined && typeof x.grupo !== "string")
    return { ok: false, motivo: "Rechazo: el grupo que pide no es válido." };
  if (x.recursos !== undefined) {
    const recursos: unknown[] = Array.isArray(x.recursos) ? x.recursos : [];
    if (!Array.isArray(x.recursos) || !recursos.every(esRecurso))
      return { ok: false, motivo: "Rechazo: la lista de recursos de la composición no es válida." };
  }
  return { ok: true, peticion: {
    cuenta: x.cuenta, grupo: typeof x.grupo === "string" ? x.grupo : undefined,
    composicion: x.composicion, formato: x.formato as FormatoVideoMalla | undefined,
    origen: x.origen === "ajena" ? "ajena" : x.origen === "os" ? "os" : undefined,
    recursos: Array.isArray(x.recursos) ? (x.recursos as RecursoVideoMalla[]) : undefined,
  } };
}

/** El OS nunca genera ni edita GSAP (licencia Standard, §2); una composición ajena solo se renderiza. Pura. */
export function composicionSinGsapParaOs(
  html: string, origen: "os" | "ajena" = "os",
): { ok: boolean; motivo: string } {
  if (origen === "ajena") return { ok: true, motivo: "composición ajena: GSAP se reproduce pero no se edita en el OS" };
  if (detectarAdaptadores(html).usados.includes("gsap"))
    return { ok: false, motivo: "Rechazo: el OS no genera ni edita composiciones con GSAP (licencia Standard, §2)." };
  return { ok: true, motivo: "composición del OS sin GSAP" };
}

/** Un recurso privado de otra cuenta no sale de sus neuronas: se rechaza. Pura. */
export function recursosPrivadosAjenos(
  recursos: RecursoVideoMalla[] = [], cuentaLocal = "",
): { ok: boolean; motivo: string } {
  for (const r of recursos) {
    if (r.privado !== true) continue;
    if (!r.cuenta) return { ok: false, motivo: "Rechazo: recurso privado sin cuenta verificable." };
    if (r.cuenta !== cuentaLocal) return { ok: false, motivo: "Rechazo: la composición usa un recurso privado de otra cuenta." };
  }
  return { ok: true, motivo: "sin recursos remotos privados ajenos" };
}

/** Quita rutas absolutas e IPs del motivo de error antes de devolverlo. */
function motivoSeguro(e: unknown): string {
  const texto = e instanceof Error ? e.message : "error desconocido";
  return texto.replace(/(?:[A-Za-z]:)?[\\/](?:Users|home|private|var|tmp|srv|opt)[^\s"'`]*/g, "<ruta>")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<ip>").slice(0, 200);
}

/** Manejador del relé: valida, admite, comprueba GSAP y privacidad, y encola. Nunca lanza. */
export function manejarPeticionVideoMalla(
  x: unknown, ctx: ContextoVideoMalla, deps: DepsVideoMalla,
): ResultadoVideoMalla {
  const v = validarPeticionVideoMalla(x);
  if (!v.ok) return { aceptado: false, motivo: v.motivo };
  const p = v.peticion;
  const admision = admiteVideoMalla(p, ctx);
  if (!admision.ok) return { aceptado: false, motivo: admision.motivo };
  const gsap = composicionSinGsapParaOs(p.composicion, p.origen ?? "os");
  if (!gsap.ok) return { aceptado: false, motivo: gsap.motivo };
  const privados = recursosPrivadosAjenos(p.recursos ?? [], ctx.cuentaLocal);
  if (!privados.ok) return { aceptado: false, motivo: privados.motivo };
  const formato = p.formato ?? "mp4";
  try {
    const trabajoId = deps.encolar({ composicion: p.composicion, formato, cuenta: p.cuenta, grupo: p.grupo });
    if (typeof trabajoId !== "string" || !trabajoId)
      return { aceptado: false, motivo: "Rechazo: la cola de render no devolvió un id de trabajo." };
    return { aceptado: true, trabajoId, motivo: `render encolado en ${formato} (${admision.motivo})` };
  } catch (e) {
    return { aceptado: false, motivo: `Rechazo: la cola de render no pudo encolar (${motivoSeguro(e)}).` };
  }
}
