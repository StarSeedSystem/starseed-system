/*
 * video-por-malla — `capacidad.video.render` en el relé `capacidad.*` (VST1018I).
 * La bolsa de recursos elige la neurona; esta capa SOLO valida y encola: admite lo
 * de la misma cuenta o de un grupo con permiso, comprueba que la composición no
 * traiga GSAP editado por el OS (adaptadores.ts) ni recursos remotos privados
 * ajenos, y devuelve { ok:true, trabajoId } o un rechazo legible. Contratos:
 * architecture/video-hyperframes.md §4 y apps-en-la-malla.md §6. Pura: la cola
 * de render queda inyectada; sin red, disco ni procesos.
 */
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";
import { DURACION_MAX, DURACION_MIN, FORMATOS_VIDEO } from "@/lib/video-html/herramienta-componer";

/** Cuerpo de `capacidad.pedir` (tipo `render`) para vídeo HyperFrames. */
export interface PeticionVideoMalla {
  cuenta: string; composicion: string;
  grupo?: string; formato?: string; duracionSeg?: number;
  /** Si el OS editará la composición, GSAP queda prohibido (licencia, §2). */
  editar?: boolean;
}
/** Neurona que sirve: quién es y qué grupos dejan usar su cola de render. */
export interface ContextoServidaVideo { cuentaLocal: string; gruposPermitidos: string[]; sirveRender: boolean }
/** Trabajo que pasa a la cola de render de la neurona (inyectada). */
export interface TrabajoRender { composicion: string; formato: string; duracionSeg: number; cuenta: string; grupo?: string; editable: boolean }
export type PlanVideoMalla =
  | { ok: true; trabajoId: string; trabajo: TrabajoRender; motivo: string }
  | { ok: false; motivo: string };

/** Referencias de recursos que la composición pide: src/href y url(). Pura. */
export function extraerReferenciasRecursos(html: string): string[] {
  const refs: string[] = [];
  const push = (v: string) => { const t = v.trim(); if (t && !refs.includes(t)) refs.push(t); };
  for (const patron of [
    /(?:^|\s)(?:src|href|data-src|poster)\s*=\s*["']?([^"\s'>]+)/gi,
    /url\(\s*["']?([^'")]+?)["']?\s*\)/gi,
  ]) for (const m of html.matchAll(patron)) push(m[1]);
  return refs;
}
const ESQUEMA = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const RED_PRIVADA = /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:[/?#]|$)/i;
const MALLA_PRIVADA = /\.local(?::\d+)?(?:[/?#]|$)|^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;
/** ¿Atiende la malla esta referencia? Sí: vacía, relativa (vive en la neurona que renderiza),
 *  data: (embebida), starseed://library/ (Biblioteca compartida), local-archivos-malla:// (va con
 *  permiso de archivos-malla) y http(s) público. No: otro `starseed://` (entidad privada del OS,
 *  no sale de las neuronas de su dueño), esquemas locales de aparato y direcciones privadas de red. */
export function esReferenciaAdmitida(ref: string): boolean {
  const t = ref.trim();
  if (!t || /^data:/i.test(t)) return true;
  if (t.startsWith("starseed://library/")) return true;
  if (t.startsWith("starseed://")) return false;
  if (t.startsWith("local-archivos-malla://")) return true;
  if (/^https?:\/\//i.test(t)) {
    const anfitrion = t.slice(t.indexOf("://") + 3).split(/[/?#]/)[0];
    return !RED_PRIVADA.test(anfitrion) && !MALLA_PRIVADA.test(anfitrion);
  }
  return !ESQUEMA.test(t);
}

/** Admisión: lo de la misma cuenta o de un grupo con permiso. Pura. */
export function admiteVideoMalla(p: { cuenta: string; grupo?: string }, ctx: ContextoServidaVideo): { ok: boolean; motivo: string } {
  if (!p.cuenta) return { ok: false, motivo: "Petición sin cuenta: nada que atender." };
  if (p.cuenta === ctx.cuentaLocal) return { ok: true, motivo: "misma cuenta" };
  if (p.grupo && ctx.gruposPermitidos.includes(p.grupo)) return { ok: true, motivo: `grupo «${p.grupo}» con permiso aquí` };
  return { ok: false, motivo: "Solo se atienden peticiones de la misma cuenta o de un grupo con permiso." };
}

/** `capacidad.video.render` por la malla: admite, valida y encola en la cola
 *  INYECTADA (la bolsa ya eligió esta neurona). Nunca lanza. */
export function videoRenderPorMalla(
  p: PeticionVideoMalla, ctx: ContextoServidaVideo,
  cola: { encolar: (t: TrabajoRender) => string | Promise<string> },
): Promise<PlanVideoMalla> {
  const valida = admiteYValida(p, ctx);
  if (!valida.ok) return Promise.resolve(valida);
  const noEncola = (e: unknown) => ({ ok: false as const, motivo: `No encolé el render: ${e instanceof Error ? e.message : "error de la cola"}.` });
  try {
    return Promise.resolve(cola.encolar(valida.trabajo)).then(
      (trabajoId) => ({ ok: true as const, trabajoId, trabajo: valida.trabajo, motivo: valida.motivo }),
      noEncola,
    );
  } catch (e) { return Promise.resolve(noEncola(e)); }
}

/** Todas las puertas de una vez: el trabajo listo o el motivo del rechazo. Pura. */
function admiteYValida(
  p: PeticionVideoMalla, ctx: ContextoServidaVideo,
): { ok: true; trabajo: TrabajoRender; motivo: string } | { ok: false; motivo: string } {
  const puerta = admiteVideoMalla(p, ctx);
  if (!puerta.ok) return { ok: false, motivo: puerta.motivo };
  if (!ctx.sirveRender) return { ok: false, motivo: "Esta neurona no tiene cola de render de vídeo." };
  const composicion = typeof p.composicion === "string" ? p.composicion.trim() : "";
  if (!composicion) return { ok: false, motivo: "La petición no trae composición." };
  const formato = (p.formato ?? "mp4").trim().toLowerCase();
  if (!(FORMATOS_VIDEO as readonly string[]).includes(formato)) {
    return { ok: false, motivo: `El formato «${formato}» no lo renderiza HyperFrames: uso mp4 (${FORMATOS_VIDEO.join(", ")}).` };
  }
  const duracion = p.duracionSeg ?? 3;
  if (!Number.isFinite(duracion) || duracion < DURACION_MIN || duracion > DURACION_MAX) {
    return { ok: false, motivo: `La duración (${duracion}) queda fuera del rango: de ${DURACION_MIN} a ${DURACION_MAX} s.` };
  }
  const ajena = extraerReferenciasRecursos(composicion).find((r) => !esReferenciaAdmitida(r));
  if (ajena) {
    return { ok: false, motivo: `La composición menciona un recurso privado ajeno (${cuentaReferencia(ajena)}) que no sale de las neuronas de su dueño.` };
  }
  const adaptadores = detectarAdaptadores(composicion);
  if (p.editar === true && !adaptadores.editableVisualmente) {
    return { ok: false, motivo: `No edito nunca una composición con GSAP: ${adaptadores.motivo}` };
  }
  const grupo = p.grupo && p.grupo !== ctx.cuentaLocal && ctx.gruposPermitidos.includes(p.grupo) ? p.grupo : undefined;
  return {
    ok: true,
    trabajo: { composicion, formato, duracionSeg: duracion, cuenta: p.cuenta, grupo, editable: adaptadores.editableVisualmente },
    motivo: `Render encolado: ${formato}, ${duracion} s; animación ${adaptadores.editableVisualmente ? "editable" : "solo reproducible"}.`,
  };
}

/** Solo el dueño del recurso en el rechazo, nunca rutas ni direcciones de nadie. */
function cuentaReferencia(ref: string): string {
  const anfitrion = ref.replace(/^starseed:\/\//, "").replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "").split(/[/?#]/)[0];
  return anfitrion || "esquema local";
}
