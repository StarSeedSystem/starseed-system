"use client";

/*
 * video-por-malla — Manejador PURO para el relé `capacidad.video.render` (Ola 1018H).
 * Admite solo peticiones de la misma cuenta o de un grupo con permiso,
 * comprueba que la composición no traiga GSAP editado por el OS (adaptadores.ts)
 * ni recursos remotos privados ajenos, y devuelve { aceptado, trabajoId }
 * o un rechazo legible. La elección de la neurona la hace la bolsa de recursos;
 * aquí solo se valida y se encola. Sin red en las pruebas.
 */

import type { TipoCapacidad, MsgPedir } from "./capacidad-por-malla";
import { detectarAdaptadores, type ResultadoDeteccion } from "@/lib/video-html/adaptadores";

export const VIDEO_RENDER_TIPO: TipoCapacidad = "render";

export interface ComposicionVideo {
  html: string;
  recursos?: RecursoRemoto[];
  parametros?: Record<string, unknown>;
}

export interface RecursoRemoto {
  url: string;
  tipo: "imagen" | "video" | "audio" | "fuente" | "datos";
  cuentaId?: string;
  privado?: boolean;
}

export interface PeticionRenderVideo {
  composicion: ComposicionVideo;
  cuentaId: string;
  grupoId?: string;
  rolEnGrupo?: "dueño" | "editor" | "comentarista" | "observador";
}

export interface RespuestaValidacion {
  aceptado: boolean;
  trabajoId?: string;
  motivo?: string;
  adaptadores?: ResultadoDeteccion;
}

function esRecursoPrivadoAjeno(recurso: RecursoRemoto, cuentaId: string): boolean {
  return recurso.privado === true && recurso.cuentaId !== undefined && recurso.cuentaId !== cuentaId;
}

function tienePermisoGrupo(grupoId: string | undefined, rol: string | undefined): boolean {
  if (!grupoId) return false;
  return rol === "dueño" || rol === "editor";
}

export function validarPeticionRender(peticion: PeticionRenderVideo): RespuestaValidacion {
  const { composicion, cuentaId, grupoId, rolEnGrupo } = peticion;

  if (!composicion?.html) {
    return { aceptado: false, motivo: "Composición vacía: falta HTML." };
  }

  const adaptadores = detectarAdaptadores(composicion.html);

  if (!adaptadores.editableVisualmente) {
    return {
      aceptado: false,
      motivo: adaptadores.motivo,
      adaptadores,
    };
  }

  if (composicion.recursos) {
    for (const recurso of composicion.recursos) {
      if (esRecursoPrivadoAjeno(recurso, cuentaId)) {
        return {
          aceptado: false,
          motivo: `Recurso privado ajeno no permitido: ${recurso.url}`,
          adaptadores,
        };
      }
    }
  }

  if (grupoId && !tienePermisoGrupo(grupoId, rolEnGrupo)) {
    return {
      aceptado: false,
      motivo: `Sin permiso en el grupo ${grupoId}: se requiere rol dueño o editor.`,
      adaptadores,
    };
  }

  const trabajoId = `render-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return { aceptado: true, trabajoId, adaptadores };
}

export function crearPeticionCapacidadVideo(
  peticion: PeticionRenderVideo,
): MsgPedir | { ok: false; motivo: string } {
  const validacion = validarPeticionRender(peticion);
  if (!validacion.aceptado) {
    return { ok: false, motivo: validacion.motivo || "Validación fallida." };
  }

  return {
    t: "capacidad.pedir",
    id: validacion.trabajoId!,
    tipo: VIDEO_RENDER_TIPO,
    cuerpo: {
      composicion: peticion.composicion,
      cuentaId: peticion.cuentaId,
      grupoId: peticion.grupoId,
      rolEnGrupo: peticion.rolEnGrupo,
    },
    sesionId: `video-render-${validacion.trabajoId}`,
  };
}