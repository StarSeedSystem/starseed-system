"use client";

/*
 * video-por-malla — manejador PURO de `capacidad.video.render` (Ola 1018H · I).
 * Valida la petición y la encola; la elección de la neurona la hace la bolsa de
 * recursos. Admisión: peticiones de la misma cuenta o de un grupo con permiso en
 * esta neurona. La composición nunca se EDITA por el OS si trae GSAP (§2, licencia
 * GSAP Standard; ver detectarAdaptadores en video-html/adaptadores.ts) y ningún
 * recurso remoto ajeno sale a buscar: los recursos viajan con la petición o los
 * trae la bolsa. El resultado se REFERENCIA por su `trabajoId`, nunca se duplica
 * (contenido = entidad única). Todo inyectado: sin red, disco ni reloj aquí.
 * Contrato: architecture/video-hyperframes.md §2 y §4.
 */

import { bytesUtf8, crearIdPeticion } from "./capacidad-por-malla";
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";

export const FORMATOS_VIDEO = ["mp4", "webm", "mov", "gif", "png-sequence", "hls"] as const;
export type FormatoVideo = (typeof FORMATOS_VIDEO)[number];
export const TOPE_COMPOSICION_BYTES = 15 * 1024;

export interface PeticionRenderVideo {
  cuenta: string;
  grupo?: string;
  composicion: string;
  ordenes?: unknown[];
  formato?: FormatoVideo;
  variables?: Record<string, string | number | boolean>;
}

export interface PeticionEnCola {
  trabajoId: string;
  cuenta: string;
  grupo?: string;
  composicion: string;
  ordenes?: unknown[];
  formato: FormatoVideo;
  variables: Record<string, string | number | boolean>;
}

export interface ContextoRenderVideo {
  cuentaLocal: string;
  sesionGrupo?: string | null;
  /** Encola el trabajo y devuelve su id; `null` si la cola está llena. Inyectado. */
  encolar: (p: PeticionEnCola) => string | null;
  topeComposicionBytes?: number;
}

export type PlanRenderVideo =
  | { aceptado: true; trabajoId: string; motivo: string }
  | { aceptado: false; motivo: string };

const RE_REMOTO = /(?:src|href|poster)\s*=\s*["']?\s*https?:\/\/|url\(\s*["']?\s*https?:\/\//i;
const RE_DISCO = /(?:src|href|poster)\s*=\s*["']?\s*(?:\/|\.\.\/|~|[A-Za-z]:\\|\\\\)|url\(\s*["']?\s*(?:\/|\.\.\/|~|[A-Za-z]:\\|\\\\)/i;

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function esVariablesValidas(v: unknown): boolean {
  return esObjeto(v) && Object.values(v).every(
    (x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean",
  );
}

/** Parseo defensivo del cuerpo: `null` si falta algo o hay algo no válido. Pura. */
export function parsearRenderVideo(x: unknown): PeticionRenderVideo | null {
  if (!esObjeto(x)) return null;
  const { cuenta, grupo, composicion, ordenes, formato, variables } = x;
  if (typeof cuenta !== "string" || !cuenta.trim()) return null;
  if (typeof composicion !== "string" || !composicion.trim()) return null;
  if (grupo !== undefined && typeof grupo !== "string") return null;
  if (ordenes !== undefined && !Array.isArray(ordenes)) return null;
  if (formato !== undefined && !(FORMATOS_VIDEO as readonly string[]).includes(formato as string)) return null;
  if (variables !== undefined && !esVariablesValidas(variables)) return null;
  return { cuenta, composicion, grupo, ordenes, formato, variables } as PeticionRenderVideo;
}

/** Admisión: misma cuenta SIEMPRE; grupo solo si esta neurona comparte esa sesión. Pura. */
export function admiteRenderVideo(
  p: { cuenta: string; grupo?: string },
  ctx: { cuentaLocal: string; sesionGrupo?: string | null },
): { ok: boolean; motivo: string } {
  if (p.cuenta === ctx.cuentaLocal) return { ok: true, motivo: "misma cuenta" };
  if (p.grupo && p.grupo === ctx.sesionGrupo) return { ok: true, motivo: `grupo «${p.grupo}» con permiso en esta neurona` };
  return { ok: false, motivo: "Solo se atienden peticiones de la misma cuenta o de un grupo con permiso." };
}

/** Primer recurso prohibido de la composición, con motivo legible; `null` si no trae ninguno. */
export function primerRecursoProhibido(composicion: string): string | null {
  if (RE_REMOTO.test(composicion)) {
    return "La composición trae un recurso remoto: al renderizar nada ajeno sale a buscar; los recursos viajan con la petición o los trae la bolsa de recursos.";
  }
  if (RE_DISCO.test(composicion)) {
    return "La composición trae una ruta fuera del proyecto: los recursos del disco se declaran aparte (recursos), nunca dentro de la composición.";
  }
  return null;
}

/** `capacidad.video.render` (tipo `render`): admite, valida y encola. Pura. */
export function manejarRenderVideo(x: unknown, ctx: ContextoRenderVideo): PlanRenderVideo {
  const p = parsearRenderVideo(x);
  if (!p) return { aceptado: false, motivo: "Petición mal formada: cuenta, composición, formato o variables no válidas." };
  const puerta = admiteRenderVideo({ cuenta: p.cuenta, grupo: p.grupo }, ctx);
  if (!puerta.ok) return { aceptado: false, motivo: puerta.motivo };
  if (bytesUtf8(p.composicion) > (ctx.topeComposicionBytes ?? TOPE_COMPOSICION_BYTES)) {
    return { aceptado: false, motivo: "La composición es demasiado grande para el mensaje: viaja como banda por archivos-malla." };
  }
  const recurso = primerRecursoProhibido(p.composicion);
  if (recurso) return { aceptado: false, motivo: recurso };
  // Con GSAP se reproduce y se renderiza; lo que nunca hace el OS es EDITARLA (§2).
  const deteccion = detectarAdaptadores(p.composicion);
  if (deteccion.usados.includes("gsap") && (p.ordenes?.length ?? 0) > 0) {
    return { aceptado: false, motivo: `El OS no edita animaciones de GSAP: ${deteccion.motivo}` };
  }
  const formato = p.formato ?? "mp4";
  const encolado = ctx.encolar({
    trabajoId: `vr-${crearIdPeticion()}`,
    cuenta: p.cuenta,
    grupo: p.grupo,
    composicion: p.composicion,
    ordenes: p.ordenes,
    formato,
    variables: p.variables ?? {},
  });
  if (!encolado) return { aceptado: false, motivo: "La cola de render está llena: prueba más tarde." };
  return {
    aceptado: true,
    trabajoId: encolado,
    motivo: `${puerta.motivo} · render «${formato}» en la neurona que elija la bolsa de recursos; el resultado se referencia por su trabajoId`,
  };
}
