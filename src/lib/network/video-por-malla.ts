"use client";

/*
 * video-por-malla — Manejador PURO del relé `capacidad.video.render` (HFR1018I).
 * La bolsa de recursos elige la neurona; aquí solo se valida, se admite y se encola
 * (video-hyperframes.md §3–§4, apps-en-la-malla.md §6). Admisión: misma cuenta o
 * grupo con permiso. Lo que el OS edita no trae GSAP (adaptadores.ts) ni recursos
 * remotos privados ajenos. Sin red: la cola y los recursos propios llegan inyectados.
 */
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";

export type FormatoVideoRender = "mp4" | "webm" | "mov" | "gif" | "png-sequence" | "hls";
const FORMATOS: readonly FormatoVideoRender[] = ["mp4", "webm", "mov", "gif", "png-sequence", "hls"];

/** Cuerpo de `capacidad.pedir` con tipo `render` para el servicio hyperframes. */
export interface PeticionVideoRender {
  /** Cuenta de quien pide; solo se compara, no se valida aquí. */
  cuenta: string;
  /** Sesión de grupo desde la que pide (debe ser la que esta neurona comparte). */
  grupo?: string;
  /** Composición HyperFrames: HTML con atributos de tiempo (index.html). */
  composicion: string;
  /** El OS la va a editar con su editor visual: prohibido GSAP (adaptadores.ts). */
  editar?: boolean;
  /** Formato de salida (§1 de video-hyperframes.md); por defecto «mp4». */
  formato?: string;
}

/** Trabajo que entra en la cola de render de la neurona (servicio hyperframes §3). */
export interface TrabajoVideoRender {
  composicion: string;
  formato: FormatoVideoRender;
  editar: boolean;
}

/** Neurona que sirve: su cuenta, la sesión que comparte y su cola, todo inyectado. */
export interface ContextoNeuronaVideo {
  cuentaLocal: string;
  /** Sesión de grupo con permiso que esta neurona comparte (como voz-por-malla). */
  grupoCompartido?: string | null;
  /** Hosts de recursos privados propios (malla y pasarela de la misma persona). */
  recursosPrivadosPropios?: readonly string[];
  /** Pura: guarda el trabajo en la cola local y devuelve su id de trabajo. */
  encolar: (trabajo: TrabajoVideoRender) => string;
}

/** Resultado del manejador: id del trabajo encolado, o un rechazo legible. */
export type PlanVideoRender =
  | { aceptado: true; trabajoId: string; motivo: string }
  | { aceptado: false; motivo: string };

/** ¿La URL apunta a una red privada (localhost, malla local, RFC1918, mDNS)? */
export function esRecursoPrivado(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
      || host === "::1" || host.startsWith("fe80") || host.endsWith(".internal") || ipPrivada(host);
  } catch { return false; }
}

/** Si la parte de host es una IP, ¿está en un rango privado o de enlace? */
function ipPrivada(host: string): boolean {
  const m = /^172\.(\d+)\./.exec(host);
  return /^(10\.|127\.|192\.168\.)/.test(host) || (!!m && Number(m[1]) >= 16 && Number(m[1]) <= 31);
}

/** Extrae las URLs http(s) referenciadas por la composición (src y href). */
export function extraerUrls(composicion: string): string[] {
  const re = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  const urls: string[] = [];
  for (let m: RegExpExecArray | null; (m = re.exec(composicion));)
    if (/^https?:\/\//i.test(m[1].trim())) urls.push(m[1].trim());
  return Array.from(new Set(urls));
}

/** Admisión como en voz-por-malla: misma cuenta o la sesión de grupo compartida. Pura. */
function admiteVideo(p: { cuenta: string; grupo?: string }, ctx: ContextoNeuronaVideo): { ok: boolean; motivo: string } {
  if (!p.cuenta) return { ok: false, motivo: "Petición sin cuenta: nada que atender." };
  if (p.cuenta === ctx.cuentaLocal) return { ok: true, motivo: "misma cuenta" };
  if (p.grupo && p.grupo === ctx.grupoCompartido) return { ok: true, motivo: `sesión de grupo «${p.grupo}» compartida aquí` };
  return { ok: false, motivo: "Solo se atienden peticiones de la misma cuenta o de un grupo con permiso." };
}

/** `capacidad.video.render` por la malla: admite, valida y encola. Pura. */
export function videoRenderPorMalla(p: PeticionVideoRender, ctx: ContextoNeuronaVideo): PlanVideoRender {
  if (!p.composicion || typeof p.composicion !== "string") {
    return { aceptado: false, motivo: "Falta la composición HyperFrames que hay que renderizar." };
  }
  const puerta = admiteVideo(p, ctx);
  if (!puerta.ok) return { aceptado: false, motivo: puerta.motivo };
  const editar = p.editar === true;
  if (editar) {
    const det = detectarAdaptadores(p.composicion);
    if (!det.editableVisualmente) {
      return { aceptado: false, motivo: `La composición trae una animación GSAP y el OS la edita: ${det.motivo}` };
    }
  }
  for (const url of extraerUrls(p.composicion)) {
    if (esRecursoPrivado(url) && !recursoPropio(url, ctx.recursosPrivadosPropios)) {
      return { aceptado: false, motivo: "La composición trae un recurso remoto privado ajeno: no entra en el render." };
    }
  }
  const formato: FormatoVideoRender = FORMATOS.includes(p.formato as FormatoVideoRender)
    ? (p.formato as FormatoVideoRender) : "mp4";
  let trabajoId: string;
  try { trabajoId = ctx.encolar({ composicion: p.composicion, formato, editar }); }
  catch (e) {
    const causa = e instanceof Error && e.message ? e.message : "sin motivo";
    return { aceptado: false, motivo: `La cola de render de esta neurona rechazó el trabajo: ${causa}` };
  }
  const motivo = editar ? "encolada con edición propia del OS (sin GSAP)"
    : `encolada para render ${formato} en esta neurona (${puerta.motivo})`;
  return { aceptado: true, trabajoId, motivo };
}

/** Un recurso privado solo pasa si su host está marcado como propio de la persona. */
function recursoPropio(url: string, propios?: readonly string[]): boolean {
  if (!propios?.length) return false;
  const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return propios.map((h) => h.toLowerCase()).includes(host);
}
