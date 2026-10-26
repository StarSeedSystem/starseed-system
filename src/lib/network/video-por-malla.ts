"use client";

/*
 * video-por-malla — manejador PURO del relé `capacidad.video.render`
 * (Ola 1018H · tarea I). La bolsa de recursos elige la neurona; aquí SOLO se
 * valida y se encola: cuenta propia o grupo con permiso; GSAP nunca se EDITA
 * en el editor del OS (una composición ajena se renderiza tal cual, con
 * aviso); ningún recurso privado ajeno. Cuenta, grupo, cola y reloj
 * inyectables. Contrato: video-hyperframes.md §4-§5.
 */

import { crearIdPeticion } from "@/lib/network/capacidad-por-malla";
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";
export type FormatoRender = (typeof FORMATOS_RENDER_HYPERFRAMES)[number];
/** Tope bruto de duración del manejador (la neurona puede apretar más). */
export const TOPE_DURACION_RENDER_S = 21_600;

/** Recurso que la composición declara; `privado` lo ata a su cuenta dueña. */
export interface RecursoComposicion { url?: string; privado?: boolean; cuenta?: string; }

/** Cuerpo saneado de un `capacidad.pedir` de tipo `render` para vídeo. */
export interface CuerpoRenderVideo {
  composicionHtml: string; formato: FormatoRender; duracionS?: number;
  ancho?: number; alto?: number; variables: Record<string, string>; recursos: RecursoComposicion[];
  grupoId?: string; edicionVisual: boolean;
}

/** Trabajo validado, listo para la cola de render de la neurona que la bolsa elija. */
export interface TrabajoRenderVideo {
  trabajoId: string; peerId: string; cuentaSolicitante: string; formato: FormatoRender;
  duracionS?: number; ancho?: number; alto?: number; variables: Record<string, string>;
  composicionHtml: string; usaGsap: boolean; creadoEn: number;
}
  | "peticion-malformada" | "sin-cuenta-identificable" | "sin-permiso" | "duracion-invalida"
  | "recurso-privado-verificado" | "recurso-privado-ajeno" | "gsap-en-edicion" | "cola-rechazo";

export type ResultadoRenderVideo =
  | { aceptado: true; trabajoId: string; avisos: string[] }
  | { aceptado: false; codigo: CodigoRechazoVideo; motivo: string };

function esObjeto(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object" && !Array.isArray(x); }
function numeroPositivo(x: unknown): number | undefined { return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined; }

function variablesDe(v: unknown): Record<string, string> | null {
  const out: Record<string, string> = {};
  if (v === undefined || v === null) return out;
  if (!esObjeto(v)) return null;
  for (const [k, val] of Object.entries(v)) { if (typeof val !== "string") return null; out[k] = val; }
  return out;
}
export function parseCuerpoRenderVideo(cuerpo: unknown): CuerpoRenderVideo | null {
  if (!esObjeto(cuerpo)) return null;
  if (typeof cuerpo.composicionHtml !== "string" || cuerpo.composicionHtml.trim().length < 20) return null;
  const variables = variablesDe(cuerpo.variables);
  if (!variables) return null;
  let recursos: RecursoComposicion[] = [];
  if (cuerpo.recursos !== undefined && cuerpo.recursos !== null) {
    if (!Array.isArray(cuerpo.recursos)) return null;
    for (const r of cuerpo.recursos) {
      if (!esObjeto(r)) return null;
      recursos.push({
        url: typeof r.url === "string" ? r.url : undefined,
        privado: typeof r.privado === "boolean" ? r.privado : undefined,
        cuenta: typeof r.cuenta === "string" ? r.cuenta : undefined,
      });
    }
  } else if (cuerpo.recursos !== undefined) { return null; }
  const formato = typeof cuerpo.formato === "string" ? cuerpo.formato.toLowerCase() : "mp4";
  if (!FORMATOS_RENDER_HYPERFRAMES.includes(formato as FormatoRender)) return null;
  const duracionS = numeroPositivo(cuerpo.duracionS);
  if (cuerpo.duracionS !== undefined && duracionS === undefined) return null;
  return {
    composicionHtml: cuerpo.composicionHtml, formato: formato as FormatoRender, duracionS,
    ancho: numeroPositivo(cuerpo.ancho), alto: numeroPositivo(cuerpo.alto),
    variables, recursos,
    grupoId: typeof cuerpo.grupoId === "string" && cuerpo.grupoId ? cuerpo.grupoId : undefined,
    edicionVisual: cuerpo.edicionVisual === true,
  };
}
  cuentaLocal: () => string;
  cuentaDePeer: (peerId: string) => string | null;
  permisoGrupo?: (grupoId: string, cuentaSolicitante: string) => boolean;
  encolar?: (trabajo: TrabajoRenderVideo) => boolean;
  ahora?: () => number;
  nuevoId?: () => string;
}

/**
 * manejarRenderVideo — valida una petición `capacidad.video.render` del peer
 * y, si hay cola inyectada, la encola. Devuelve { aceptado, trabajoId } o un
 * rechazo legible. Pura: red, disco y reloj llegan por `deps`.
 */
export function manejarRenderVideo(peerId: string, cuerpo: unknown, deps: DepsRenderVideo): ResultadoRenderVideo {
  const no = (codigo: CodigoRechazoVideo, motivo: string): ResultadoRenderVideo => ({ aceptado: false, codigo, motivo });
  const parse = parseCuerpoRenderVideo(cuerpo);
  if (!parse) return no("peticion-malformada", "La petición de render no trae una composición utilizable.");
  const cuenta = deps.cuentaDePeer(peerId);
  if (!cuenta) return no("sin-cuenta-identificable", "No se pudo identificar la cuenta del dispositivo que pide el render.");
  const misma = cuenta === deps.cuentaLocal();
  const grupo = parse.grupoId ? (deps.permisoGrupo?.(parse.grupoId, cuenta) ?? false) : false;
  if (!misma && !grupo) return no("sin-permiso", "Solo la misma cuenta o un grupo con permiso pueden renderizar en la neurona.");
  if (parse.duracionS && parse.duracionS > TOPE_DURACION_RENDER_S) {
    return no("duracion-invalida", `La duración pasa el tope de ${TOPE_DURACION_RENDER_S} segundos de la cola de render.`);
  }
  for (const r of parse.recursos) {
    if (r.privado !== true) continue;
    if (!r.cuenta) return no("recurso-privado-verificado", "Un recurso privado de la composición no declara su cuenta dueña y no puede verificarse.");
    if (r.cuenta !== cuenta) return no("recurso-privado-ajeno", "La composición usa un recurso privado de otra cuenta; lo privado nunca sale de las neuronas del dueño.");
  }
  const deteccion = detectarAdaptadores(parse.composicionHtml);
  const usaGsap = deteccion.usados.includes("gsap");
  if (usaGsap && parse.edicionVisual) {
    return no("gsap-en-edicion", `La licencia de GSAP Standard prohíbe que el editor del OS la edite visualmente. ${deteccion.motivo}`);
  }
  const avisos: string[] = usaGsap ? ["La composición usa GSAP: se renderiza tal cual; su animación no se edita en el editor del OS."] : [];
  const trabajo: TrabajoRenderVideo = {
    trabajoId: deps.nuevoId?.() ?? crearIdPeticion(), peerId, cuentaSolicitante: cuenta, formato: parse.formato,
    duracionS: parse.duracionS, ancho: parse.ancho, alto: parse.alto, variables: parse.variables,
    composicionHtml: parse.composicionHtml, usaGsap, creadoEn: deps.ahora?.() ?? Date.now(),
  };
  if (deps.encolar) {
    try {
      if (!deps.encolar(trabajo)) return no("cola-rechazo", "La cola de render de la neurona no aceptó el trabajo ahora mismo.");
    } catch {
      return no("cola-rechazo", "La cola de render de la neurona falló al recibir el trabajo.");
    }
  }
  return { aceptado: true, trabajoId: trabajo.trabajoId, avisos };
}
