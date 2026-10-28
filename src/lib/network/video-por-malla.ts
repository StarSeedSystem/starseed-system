/**
 * video-por-malla — manejador PURO del relé `capacidad.video.render` (Ola 1018H · I).
 * La bolsa de recursos elige la neurona; aquí solo se valida y se encola: misma cuenta
 * o grupo con permiso, composición sin GSAP editado por el OS (licencia GSAP Standard)
 * y sin recursos remotos privados ajenos. Sin red, disco ni reloj: todo se inyecta.
 * Contrato: architecture/video-hyperframes.md §2 y §4.4; apps-en-la-malla.md §6.
 */
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";

export type FormatoVideoMalla = "mp4" | "webm" | "mov" | "gif" | "png-sequence" | "hls";
export const FORMATOS_VIDEO_MALLA: readonly FormatoVideoMalla[] = ["mp4", "webm", "mov", "gif", "png-sequence", "hls"];
export const VIDEO_MALLA_MAX_COMPOSICION = 2 * 1024 * 1024;
export const VIDEO_MALLA_MAX_RECURSOS = 64;

/** Quién editó la composición: el editor del OS o una composición ajena. */
export type OrigenComposicion = "os" | "ajena";

/** Cuerpo de `capacidad.pedir` (tipo `render`) tal como llega por la malla. */
export interface PeticionVideoMalla {
  cuenta: string; grupo?: string; composicion: string; formato?: string;
  origen?: OrigenComposicion; privado?: boolean; recursos?: string[];
}

/** Trabajo ya validado que se entrega a la cola de render. */
export interface TrabajoVideoMalla {
  cuenta: string; grupo?: string; composicion: string; formato: FormatoVideoMalla;
  origen: OrigenComposicion; privado: boolean; recursos: string[];
}

/** Neurona que sirve: cuenta, grupos con permiso, anfitriones propios y cola inyectada. */
export interface ContextoServidaVideo {
  cuentaLocal: string; gruposPermitidos?: string[]; origenesPropios?: string[];
  encolar: (trabajo: TrabajoVideoMalla) => string | null | undefined;
}

export type ResultadoVideoMalla =
  | { aceptado: true; trabajoId: string; motivo: string }
  | { aceptado: false; motivo: string };

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
function normalizarFormato(v: unknown): FormatoVideoMalla | null {
  if (v === undefined) return "mp4";
  return typeof v === "string" && (FORMATOS_VIDEO_MALLA as readonly string[]).includes(v) ? (v as FormatoVideoMalla) : null;
}
/** Admisión: misma cuenta o un grupo con permiso explícito en esta neurona. Pura. */
export function admiteVideoMalla(p: { cuenta: string; grupo?: string }, ctx: Pick<ContextoServidaVideo, "cuentaLocal" | "gruposPermitidos">): { ok: boolean; motivo: string } {
  if (!p.cuenta) return { ok: false, motivo: "Rechazo: falta la cuenta de quien pide." };
  if (p.cuenta === ctx.cuentaLocal) return { ok: true, motivo: "misma cuenta" };
  if (p.grupo && (ctx.gruposPermitidos ?? []).includes(p.grupo)) return { ok: true, motivo: `grupo «${p.grupo}» con permiso` };
  return { ok: false, motivo: "Rechazo: solo se atienden peticiones de la misma cuenta o de un grupo con permiso." };
}
/** ¿El anfitrión es privado (LAN, bucle local o dominio interno)? Pura. */
export function esAnfitrionPrivado(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h === "::1" || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return !h.includes(".") || /\.(local|internal|lan)$/.test(h);
}
/** Anfitriones de recursos remotos privados que NO son de la propia cuenta. Pura. */
export function anfitrionesPrivadosAjenos(composicion: string, recursos: string[] = [], origenesPropios: string[] = []): string[] {
  const propios = new Set(origenesPropios.map((h) => h.trim().toLowerCase()));
  const urls = [...(composicion.match(/https?:\/\/[^\s"'`<>()]+/gi) ?? []), ...recursos];
  const ajenos: string[] = [];
  for (const url of urls) {
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch { continue; }
    if (host && esAnfitrionPrivado(host) && !propios.has(host) && !ajenos.includes(host)) ajenos.push(host);
  }
  return ajenos;
}
/** `capacidad.video.render`: valida, comprueba y encola. Nunca lanza y no usa red. */
export function renderVideoPorMalla(x: unknown, ctx: ContextoServidaVideo): ResultadoVideoMalla {
  if (!esObjeto(x) || typeof x.composicion !== "string" || !x.composicion.trim()) return { aceptado: false, motivo: "Rechazo: falta la composición HyperFrames." };
  if (x.composicion.length > VIDEO_MALLA_MAX_COMPOSICION) return { aceptado: false, motivo: `Rechazo: la composición supera ${VIDEO_MALLA_MAX_COMPOSICION} caracteres.` };
  const formato = normalizarFormato(x.formato);
  if (!formato) return { aceptado: false, motivo: "Rechazo: formato de vídeo desconocido." };
  const cuenta = typeof x.cuenta === "string" ? x.cuenta : "";
  const grupo = typeof x.grupo === "string" && x.grupo ? x.grupo : undefined;
  const origen: OrigenComposicion = x.origen === "ajena" ? "ajena" : "os";
  const privado = x.privado === true;
  const recursos = Array.isArray(x.recursos) ? x.recursos.filter((r): r is string => typeof r === "string") : [];
  if (recursos.length > VIDEO_MALLA_MAX_RECURSOS) return { aceptado: false, motivo: `Rechazo: máximo ${VIDEO_MALLA_MAX_RECURSOS} recursos por composición.` };
  const puerta = admiteVideoMalla({ cuenta, grupo }, ctx);
  if (!puerta.ok) return { aceptado: false, motivo: puerta.motivo };
  if (privado && cuenta !== ctx.cuentaLocal) return { aceptado: false, motivo: "Rechazo: lo privado solo se renderiza en las neuronas de su dueño." };
  const usaGsap = detectarAdaptadores(x.composicion).usados.includes("gsap");
  if (origen === "os" && usaGsap) return { aceptado: false, motivo: "Rechazo: el editor del OS no usa GSAP (licencia GSAP Standard); convierte la animación a WAAPI." };
  const ajenos = anfitrionesPrivadosAjenos(x.composicion, recursos, ctx.origenesPropios ?? []);
  if (ajenos.length) return { aceptado: false, motivo: `Rechazo: la composición usa ${ajenos.length} recurso(s) remoto(s) privado(s) que no son de esta cuenta.` };
  const trabajo: TrabajoVideoMalla = { cuenta, grupo, composicion: x.composicion, formato, origen, privado, recursos };
  try {
    const id = ctx.encolar(trabajo);
    if (typeof id !== "string" || !id.trim()) return { aceptado: false, motivo: "Rechazo: la cola de render no tiene sitio ahora mismo." };
    const motivo = origen === "ajena" && usaGsap ? "Encolado para render; composición ajena con GSAP: se reproduce, no se edita." : "Encolado para render.";
    return { aceptado: true, trabajoId: id, motivo };
  } catch {
    return { aceptado: false, motivo: "Rechazo: la cola de render no pudo aceptar el trabajo." };
  }
}
