"use client";

/*
 * video-por-malla — manejador PURO del relé `capacidad.video.render`
 * (architecture/video-hyperframes.md §4.6 · apps-en-la-malla.md §6).
 * Valida aquí: origen = misma cuenta o grupo prestado; GSAP solo si el OS
 * EDITA la composición (una ajena con GSAP sí se renderiza, §2); y nada de
 * recursos privados ajenos. La ELECCIÓN de neurona la hace la bolsa de
 * recursos; aquí solo se valida y se encola (`encolar` inyectada). Sin red,
 * sin disco y sin reloj: todo lo externo entra por parámetros.
 */

import type { MsgPedir } from "@/lib/network/capacidad-por-malla";
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";

/** Formatos de salida que el servicio hyperframes sabe renderizar (§1). */
export const FORMATOS_VIDEO_RENDER = ["mp4", "webm", "mov", "gif", "png-sequence", "hls"] as const;
export type FormatoVideoRender = (typeof FORMATOS_VIDEO_RENDER)[number];
export const FORMATO_VIDEO_DEFECTO: FormatoVideoRender = "mp4";

/** Un medio externo que la composición referencia: se cita, no se duplica (regla del área). */
export interface RecursoRemotoVideo { url: string; privado?: boolean; cuentaId?: string }

export interface ComposicionVideo { html: string; recursos?: RecursoRemotoVideo[] }

export interface CuerpoVideoRender {
  composicion: ComposicionVideo;
  formato?: string;
  /** true = el OS va a ABRIR la composición y a editarla visualmente. */
  editarVisualmente?: boolean;
}

/** Quien pide: cuenta y grupos con los que pide (lo descodifica la capa de la malla). */
export interface OrigenPeticion { cuentaId?: string; grupos?: string[] }
/** A quién presta esta neurona: su cuenta (sí por defecto) y grupos elegidos (§3). */
export interface OfertaNeurona { cuentaId?: string; gruposPrestados?: string[] }

/** Veredicto del manejador: `{ aceptado, trabajoId }` o un rechazo legible. */
export type VeredictoVideoMalla =
  | { aceptado: true; trabajoId: string }
  | { aceptado: false; motivo: string };

/** El trabajo listo para la cola del servicio local de la neurona. */
export interface TrabajoVideoRender { peticionId: string; composicion: ComposicionVideo; formato: FormatoVideoRender }

/** Contexto del que sirve (todo inyectable: nada de red ni disco aquí). */
export interface ContextoServidorVideo {
  oferta: OfertaNeurona;
  miCuentaId?: string;
  encolar: (trabajo: TrabajoVideoRender) => string | Promise<string>;
}

/**
 * admiteOrigen — misma cuenta, o pide a nombre de un grupo al que prestamos.
 * Regla de la bolsa (apps-en-la-malla.md §4.1): un grupo solo usa lo que sus
 * miembros le prestan. Pura.
 */
export function admiteOrigen(origen: OrigenPeticion, oferta: OfertaNeurona): boolean {
  if (!origen.cuentaId || !oferta.cuentaId) return false;
  if (origen.cuentaId === oferta.cuentaId) return true;
  const grupos = origen.grupos ?? [];
  return (oferta.gruposPrestados ?? []).some((g) => grupos.includes(g));
}

/**
 * recursosPrivadosAjenos — los recursos privados cuya dueña no es esta cuenta:
 * nunca salen de las neuronas de quien los creó (§4 del contrato). Un recurso
 * privado sin cuenta dueña cuenta como ajeno (lo legible manda a decidir).
 */
export function recursosPrivadosAjenos(recursos: RecursoRemotoVideo[], miCuentaId?: string): RecursoRemotoVideo[] {
  if (!recursos.length) return [];
  return recursos.filter((r) => r.privado === true && (!r.cuentaId || r.cuentaId !== miCuentaId));
}

/** Guard puro del cuerpo de `capacidad.pedir` con tipo «render». */
export function esCuerpoVideoRender(x: unknown): x is CuerpoVideoRender {
  if (!esObjeto(x)) return false;
  const comp = x.composicion;
  if (!esObjeto(comp) || typeof comp.html !== "string" || typeof x.formato === "boolean") return false;
  if (typeof x.formato !== "undefined" && !(typeof x.formato === "string" && FORMATOS_VIDEO_RENDER.includes(x.formato as FormatoVideoRender))) return false;
  const rec = comp.recursos;
  if (typeof rec !== "undefined" && !(Array.isArray(rec) && rec.every((r) => esObjeto(r) && typeof (r as Record<string, unknown>).url === "string"))) return false;
  return true;
}

/** Veredicto negativo con motivo en español y legible para quien pide. */
export function rechazo(motivo: string): VeredictoVideoMalla {
  return { aceptado: false, motivo };
}

/**
 * manejarPeticionVideoMalla — atiende UN `capacidad.pedir` con tipo «render».
 * Orden de la validación (tu regla primero, la bolsa elige después): tipo y
 * cuerpo → origen admitido → GSAP solo si el OS lo edita → recursos privados
 * ajenos → encolar. Nunca lanza: todo rechazo es legible.
 */
export async function manejarPeticionVideoMalla(
  msg: MsgPedir,
  origen: OrigenPeticion,
  ctx: ContextoServidorVideo,
): Promise<VeredictoVideoMalla> {
  if (msg.tipo !== "render") {
    return rechazo("El manejador de vídeo solo atiende el tipo de capacidad «render».");
  }
  if (!esCuerpoVideoRender(msg.cuerpo)) {
    return rechazo("Cuerpo de render no válido: falta la composición o el formato no se admite.");
  }
  const cuerpo = msg.cuerpo;
  if (!admiteOrigen(origen, ctx.oferta)) {
    return rechazo("Esta neurona solo presta render a su cuenta o a los grupos elegidos.");
  }
  if (cuerpo.editarVisualmente === true) {
    const adaptadores = detectarAdaptadores(cuerpo.composicion.html);
    if (adaptadores.usados.includes("gsap")) {
      return rechazo(adaptadores.motivo || "La composición usa GSAP y no se edita con el OS.");
    }
  }
  const ajenos = recursosPrivadosAjenos(cuerpo.composicion.recursos ?? [], ctx.miCuentaId);
  if (ajenos.length > 0) {
    return rechazo(`${ajenos.length} recurso(s) privado(s) de otra cuenta no se pueden usar en este render.`);
  }
  const formato = (FORMATOS_VIDEO_RENDER as readonly string[]).includes(cuerpo.formato ?? "")
    ? (cuerpo.formato as FormatoVideoRender)
    : FORMATO_VIDEO_DEFECTO;
  try {
    const trabajoId = await ctx.encolar({ peticionId: msg.id, composicion: cuerpo.composicion, formato });
    if (typeof trabajoId !== "string" || !trabajoId.trim()) {
      return rechazo("La cola de render no devolvió un identificador de trabajo.");
    }
    return { aceptado: true, trabajoId };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error al encolar el render.";
    return rechazo(`La cola de render rechazó el trabajo: ${mensaje}`);
  }
}

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}
