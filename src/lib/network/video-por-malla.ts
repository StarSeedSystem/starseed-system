"use client";

/*
 * video-por-malla (Ola 1018H · tarea I) — manejador PURO de `capacidad.video.render`
 * del relé `capacidad.*` (capacidad-por-malla.ts, tipo `render`). Una neurona sin
 * HyperFrames pide el render a otra por la malla; aquí solo se admite y se encola:
 * la elección de la neurona la hace la bolsa de recursos (apps-en-la-malla.md §6).
 * Admisión: misma cuenta o la sesión de grupo que esta neurona comparte (como en
 * voz-por-malla). Validación: la composición con GSAP NO se edita por el OS
 * (licencia GSAP Standard, contrato §2) y los recursos privados no salen de las
 * neuronas de su dueño. Contrato: architecture/video-hyperframes.md §2 y §4.
 * Puro: sin red, disco ni procesos; la cola llega inyectada y las pruebas no la
 * tocan de verdad. Nada lanza: { ok:false, motivo } legible.
 */

import { detectarAdaptadores } from "@/lib/video-html/adaptadores";
import { FORMATOS_VIDEO } from "@/lib/video-html/herramienta-componer";

/** Tope del cuerpo del servicio local de vídeo (rutas.mjs, LIMITE_CUERPO_BYTES). */
export const VIDEO_MALLA_MAX_COMPOSICION = 8 * 1024 * 1024;

/** Cuerpo de `capacidad.pedir` con tipo `render`. */
export interface PeticionVideoMalla {
  /** Cuenta de quien pide; solo se compara, no se valida aquí. */
  cuenta: string;
  /** Sesión de grupo desde la que pide (debe ser la que esta neurona comparte). */
  grupo?: string;
  /** Composición HyperFrames (HTML) a renderizar. */
  composicion: string;
  /** Órdenes del SDK que el OS aplicará antes del render (tarea E). */
  ordenes?: Record<string, unknown>[];
  /** Formato de salida; por defecto mp4 (como en el servicio local). */
  formato?: string;
}

/** Neurona que sirve: su cuenta y la sesión de grupo que comparte, todo inyectado. */
export interface ContextoServidaVideo {
  cuentaLocal: string;
  sesionGrupo?: string | null;
}

/** Respuesta del manejador: trabajo encolado, o un rechazo legible. */
export type ResultadoVideoMalla =
  | { ok: true; aceptado: true; trabajoId: string }
  | { ok: false; aceptado: false; motivo: string };

/** Trabajo para la cola local de la neurona que sirve (misma forma que rutas.mjs). */
export interface TrabajoRenderVideoMalla {
  composicion: string;
  formato: string;
}

/** ¿Este recurso apunta a un ámbito privado (el OS, la LAN propia o el disco)? */
export function esRecursoPrivado(valor: string): boolean {
  const v = valor.trim();
  if (!v || v.startsWith("data:") || v.startsWith("blob:")) return false;
  if (v.startsWith("/") || v.startsWith("file:") || v.startsWith("ws:") || v.startsWith("wss:")) return true;
  const m = /^https?:\/\/([^/?#]+)/i.exec(v);
  if (!m) return false;
  const host = m[1].replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host.endsWith(".local") || /^[a-z0-9_-]+$/.test(host)
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^(::1|f[cd]|fe80):/.test(host);
}

/** Recursos del HTML (src/href/poster y periodos url() de CSS). */
export function recursosDeComposicion(html: string): string[] {
  const valores: string[] = [];
  for (const m of html.matchAll(/\b(?:src|href|poster)\s?=\s?["']([^"']+)["']/gi)) valores.push(m[1]);
  for (const m of html.matchAll(/url\(\s?["']?([^"')]+)["']?\s?\)/gi)) valores.push(m[1]);
  return valores.filter(Boolean);
}

/** Lo privado no sale de las neuronas de su dueño: solo la misma cuenta puede traer recursos privados. */
export function rechazoPorRecursosPrivados(html: string, mismaCuenta: boolean): string | null {
  if (mismaCuenta) return null;
  const privado = recursosDeComposicion(html).find(esRecursoPrivado);
  return privado === undefined
    ? null
    : "Rechazo: la composición trae recursos privados y el render no sale de las neuronas de su dueño.";
}

/** Admisión: misma cuenta o la sesión de grupo que esta neurona comparte. Pura. */
export function admiteVideoMalla(
  p: Pick<PeticionVideoMalla, "cuenta" | "grupo">, ctx: ContextoServidaVideo,
): { ok: boolean; motivo: string } {
  if (!p.cuenta) return { ok: false, motivo: "Petición sin cuenta: nada que atender." };
  if (p.cuenta === ctx.cuentaLocal) return { ok: true, motivo: "misma cuenta" };
  if (p.grupo && p.grupo === ctx.sesionGrupo) return { ok: true, motivo: `sesión de grupo «${p.grupo}» compartida aquí` };
  return { ok: false, motivo: "Solo se atienden renders de la misma cuenta o de un grupo con permiso." };
}

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/** Guard puro: cuenta, composición dentro del tope, órdenes del SDK y formato válido. */
export function validarPeticionVideoMalla(
  x: unknown,
): { ok: true; peticion: PeticionVideoMalla } | { ok: false; motivo: string } {
  if (!esObjeto(x) || typeof x.cuenta !== "string" || !x.cuenta.trim())
    return { ok: false, motivo: "Rechazo: falta la cuenta de quien pide." };
  if (typeof x.composicion !== "string" || !x.composicion.trim())
    return { ok: false, motivo: "Rechazo: falta la composición (HTML)." };
  if (new TextEncoder().encode(x.composicion).length > VIDEO_MALLA_MAX_COMPOSICION)
    return { ok: false, motivo: "Rechazo: la composición pasa del tope del servicio (8 MB)." };
  if (x.ordenes !== undefined && (!Array.isArray(x.ordenes) || x.ordenes.some((o) => !esObjeto(o))))
    return { ok: false, motivo: "Rechazo: las órdenes de edición han de ser una lista de objetos del SDK." };
  if (/gsap/i.test(x.ordenes ? JSON.stringify(x.ordenes) : ""))
    return { ok: false, motivo: "Rechazo: GSAP no se usa en el OS (licencia, §2)." };
  if (x.formato !== undefined) {
    const f = typeof x.formato === "string" ? x.formato.trim().toLowerCase() : "";
    if (!(FORMATOS_VIDEO as readonly string[]).includes(f))
      return { ok: false, motivo: `Rechazo: el formato «${String(x.formato)}» no lo renderiza HyperFrames.` };
  }
  return { ok: true, peticion: x as unknown as PeticionVideoMalla };
}

/** Mensaje de error sin rutas absolutas del disco (nunca salen en los mensajes). */
function sinRutas(texto: string): string {
  return texto.replace(/(?:[A-Za-z]:)?[\\/](?:Users|home|private|var|tmp|srv|opt)[^\s"'`]*/g, "<ruta>");
}

/* Deps del manejador: la cola local de render llega inyectada (servicios/hyperframes, tarea G). */
export interface DepsVideoMalla {
  encolar?: (t: TrabajoRenderVideoMalla) => Promise<string>;
}

/** `capacidad.video.render` por la malla: admite, valida y encola en la neurona que sirve. Pura (todo inyectado). */
export async function videoRenderPorMalla(
  x: unknown, ctx: ContextoServidaVideo, deps: DepsVideoMalla = {},
): Promise<ResultadoVideoMalla> {
  const v = validarPeticionVideoMalla(x);
  if (!v.ok) return { ok: false, aceptado: false, motivo: v.motivo };
  const p = v.peticion;
  const puerta = admiteVideoMalla(p, ctx);
  if (!puerta.ok) return { ok: false, aceptado: false, motivo: puerta.motivo };
  if ((p.ordenes?.length ?? 0) > 0 && detectarAdaptadores(p.composicion).usados.includes("gsap"))
    return { ok: false, aceptado: false, motivo: "Rechazo: una composición con GSAP no se edita con el OS (licencia, §2)." };
  const recurso = rechazoPorRecursosPrivados(p.composicion, p.cuenta === ctx.cuentaLocal);
  if (recurso) return { ok: false, aceptado: false, motivo: recurso };
  const formato = (p.formato ?? "mp4").trim().toLowerCase();
  if (typeof deps.encolar !== "function")
    return { ok: false, aceptado: false, motivo: "Rechazo: sin cola de render en esta neurona." };
  try {
    const trabajoId = await deps.encolar({ composicion: p.composicion, formato });
    return { ok: true, aceptado: true, trabajoId };
  } catch (e) {
    return { ok: false, aceptado: false, motivo: `Rechazo: no se encoló el render (${sinRutas(e instanceof Error ? e.message : String(e))}).` };
  }
}
