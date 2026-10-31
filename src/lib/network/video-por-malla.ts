/*
 * video-por-malla — manejador PURO del relé `capacidad.video.render` (Ola 1018H, HFR1018I).
 * Contrato: architecture/video-hyperframes.md §4 y apps-en-la-malla.md §6 (la neurona que
 * sirve admite, encola y puede cancelar; la ELECCIÓN de la neurona la hace la bolsa de
 * recursos — aquí solo se valida y se encola). Reglas: origen misma cuenta o grupo con
 * permiso (roles de salas.ts) · una composición ajena con GSAP se renderiza tal cual, pero
 * con EDICIÓN del OS se rechaza (licencia GSAP Standard, §2) · nada privado de otra cuenta ·
 * entidad única: se REFERENCIA, no se duplica — inline solo si cabe en el relé (16 KiB).
 */

import { detectarAdaptadores, type Adaptador } from "@/lib/video-html/adaptadores";
import { FORMATOS_VIDEO } from "@/lib/video-html/herramienta-componer";
import { CAPACIDAD_MALLA_MAX_BYTES, bytesUtf8, crearIdPeticion } from "@/lib/network/capacidad-por-malla";

export const VIDEO_RENDER_TIPO = "render";
const MSG_GSAP = "La composición usa GSAP: el OS no la edita (licencia GSAP Standard). Se puede renderizar tal cual o convertir la animación a WAAPI.";

export interface RecursoRenderVideo { url: string; privado?: boolean; cuentaId?: string; } // privado de ESA cuenta

/** Cuerpo de una `capacidad.pedir` con tipo "render" (contrato §4). */
export interface CuerpoRenderVideo {
  cuentaId?: string; // cuenta del que pide; ausente ⇒ solo por grupo con permiso
  grupoId?: string;
  composicion?: string; // inline: misma entidad del lienzo, solo si cabe en el relé
  composicionRef?: string; // entidad de contenido: se referencia, NO se duplica
  edicion?: boolean; // la petición aplica parches de edición del OS (SDK)
  adaptadores?: Adaptador[]; // detectados por la neurona origen (composición por referencia)
  formato?: string;
  recursos?: unknown[];
}

export type ResolucionVideoMalla = { aceptado: true; trabajoId: string } | { aceptado: false; estado: number; motivo: string };

/** Petición ya validada, lista para la cola de render de la neurona que sirve. */
export interface TrabajoRenderVideo { cuentaId?: string; grupoId?: string; composicion?: string; composicionRef?: string; formato: string; recursos: RecursoRenderVideo[]; }

export interface DepsVideoMalla {
  miCuentaId: string;
  esGrupoConPermiso?: (grupoId: string, cuentaPeticion?: string) => boolean; // permiso de préstamo (roles de salas.ts)
  encolar?: (p: TrabajoRenderVideo) => string; // cola real de la neurona (cola-render.mjs)
}
function rechazo(estado: number, motivo: string): ResolucionVideoMalla {
  return { aceptado: false, estado, motivo: motivo.slice(0, 300) }; // nunca IPs, claves ni rutas absolutas
}

/** Origen: misma cuenta, o grupo con permiso (§6, regla 1). `null` si admite. */
function admiteOrigen(p: CuerpoRenderVideo, deps: DepsVideoMalla): ResolucionVideoMalla | null {
  if (p.cuentaId && p.cuentaId === deps.miCuentaId) return null;
  if (p.grupoId) {
    const permitido = deps.esGrupoConPermiso ? deps.esGrupoConPermiso(p.grupoId, p.cuentaId) : false;
    return permitido ? null : rechazo(403, `El grupo «${p.grupoId}» no tiene permiso de render en esta neurona.`);
  }
  return rechazo(403, "Solo se admite una petición de esta cuenta o de un grupo con permiso de préstamo.");
}

/** Licencia §2: GSAP NO se edita con el OS (se renderiza si llega tal cual). */
function gsapEditable(p: CuerpoRenderVideo): ResolucionVideoMalla | null {
  if (!p.edicion) return null;
  const gsap = (Array.isArray(p.adaptadores) && p.adaptadores.includes("gsap")) || (typeof p.composicion === "string" && detectarAdaptadores(p.composicion).usados.includes("gsap"));
  return gsap ? rechazo(403, MSG_GSAP) : null;
}

/** Privacidad §3 de la bolsa: nada privado de otra cuenta, nada sin dueño. */
function recursosValidos(recursos: unknown[], cuentaPeticion?: string): ResolucionVideoMalla | null {
  for (const r of recursos) {
    const rec = r as RecursoRenderVideo | null;
    if (!rec || typeof rec !== "object" || typeof rec.url !== "string") {
      return rechazo(400, "Un recurso remoto no trae url: la petición referencia la pieza, no la manda rota.");
    }
    if (!rec.privado) continue;
    if (!rec.cuentaId) return rechazo(403, "Un recurso privado no declara su cuenta: no se puede comprobar que sea tuyo.");
    if (!cuentaPeticion || rec.cuentaId !== cuentaPeticion) {
      return rechazo(403, "La petición trae un recurso privado de otra cuenta: lo privado nunca sale de las neuronas de la persona.");
    }
  }
  return null;
}

/** Peso inline: si no cabe en el relé, la entidad se REFERENCIA (§6, invariante). */
function composicionValida(p: CuerpoRenderVideo): ResolucionVideoMalla | null {
  const inline = typeof p.composicion === "string" ? p.composicion : null;
  const ref = typeof p.composicionRef === "string" && p.composicionRef ? p.composicionRef : null;
  if (inline && ref) return rechazo(400, "Referencia la composición única con composicionRef, o mándala inline: no las dos cosas.");
  if (!inline && !ref) return rechazo(400, "Falta la composición: pásala inline o por referencia (composicionRef).");
  if (!inline) return null;
  if (!inline.trim()) return rechazo(400, "La composición inline está vacía.");
  if (bytesUtf8(inline) > CAPACIDAD_MALLA_MAX_BYTES) {
    return rechazo(413, "La composición no cabe en un mensaje del relé (16 KiB): guárdala como entidad y refiéreala por composicionRef.");
  }
  return null;
}

/** manejarRenderVideoMalla — admite y encola UNA `capacidad.video.render`; jamás lanza. */
export function manejarRenderVideoMalla(cuerpo: unknown, deps: DepsVideoMalla): ResolucionVideoMalla {
  if (!cuerpo || typeof cuerpo !== "object") return rechazo(400, "El cuerpo de la petición de render no es un objeto.");
  const p = cuerpo as CuerpoRenderVideo;
  const origen = admiteOrigen(p, deps);
  if (origen) return origen;
  const formato = typeof p.formato === "string" && p.formato.trim() ? p.formato.trim().toLowerCase() : "mp4";
  if (!(FORMATOS_VIDEO as readonly string[]).includes(formato)) {
    return rechazo(400, `El formato «${p.formato}» no lo renderiza HyperFrames: uso ${FORMATOS_VIDEO.join(", ")}.`);
  }
  const gsap = gsapEditable(p);
  if (gsap) return gsap;
  const inline = composicionValida(p);
  if (inline) return inline;
  const recursos = Array.isArray(p.recursos) ? p.recursos : [];
  const malos = recursosValidos(recursos, p.cuentaId);
  if (malos) return malos;
  try {
    const trabajoId = deps.encolar
      ? deps.encolar({ cuentaId: p.cuentaId, grupoId: p.grupoId, composicion: p.composicion, composicionRef: p.composicionRef, formato, recursos: recursos as RecursoRenderVideo[] })
      : `tr-${crearIdPeticion()}`; // cola por defecto: id nuevo, sin tocar nada
    return { aceptado: true, trabajoId };
  } catch (e) {
    const causa = e instanceof Error && e.message ? e.message : "cola de render";
    return rechazo(500, `No se pudo encolar el render: ${causa}`);
  }
}
