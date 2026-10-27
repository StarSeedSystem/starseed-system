"use client";

/**
 * Aurora · ACCIÓN «animar_escena» (ola 1023X). Texto → escena de ManimGX →
 * Protomolécula con el átomo de MGX1023C cargado. El MODELO escribe la escena
 * (API de Manim CE); aquí solo se VALIDA con `validarEscena` (MGX1023A) y se
 * ABRE la Protomolécula: el código NUNCA se ejecuta fuera del Worker (regla
 * dura §3 de architecture/repos-3d-oido-agentes-1023.md).
 */

import { validarEscena } from "@/lib/protomolecula/manimgx/escena";
import type { AuroraActionContext } from "@/lib/aurora/actions";
import type { AuroraActionResult } from "@/lib/aurora/actions";
import type { AuroraActionHandler } from "@/lib/aurora/actions";

/** Id del átomo de la Protomolécula (MGX1023C) que abre la acción. */
export const ATOMO_ANIMACION = "animacion-manimgx";

export interface DepsAnimarEscena {
  /** El modelo: descripción (+ calidad) → TEXTO del modelo con la escena. */
  pedirEscena: (descripcion: string, calidad: string) => Promise<string | null>;
  /** La ruta: abre la Protomolécula con el átomo cargado. */
  abrirConAtomo: (args: Record<string, unknown>, ctx: AuroraActionContext) => Promise<AuroraActionResult>;
}

export function pedidoEscena(descripcion: string, calidad: string): string {
  const resolucion = ["480p", "720p", "1080p"].includes(calidad) ? calidad : "720p";
  return [
    "Escribe una ESCENA de ManimGX con la API de Manim CE para este pedido:",
    `«${descripcion}»`,
    `Calidad de referencia: ${resolucion}.`,
    "Reglas OBLIGATORIAS:",
    "- Devuelve SOLO un bloque de código ```python con la escena completa, sin explicaciones.",
    "- Declara UNA clase que herede de Scene (o ThreeDScene) y le pase `self`.",
    "- Anima dentro de un método construct(self) (self.play, self.wait); duración corta, menos de 5 segundos.",
    "- Importa SOLO módulos de manim, manimgx, math y numpy (p. ej. `from manim import *`).",
    "- PROHIBIDO usar open, exec, eval, __import__, subprocess, os., sys. o cualquier acceso a red.",
  ].join("\n");
}

export function extraerCodigoPython(texto: string): string | null {
  const raw = String(texto ?? "");
  if (!raw.trim()) return null;
  const cerca = raw.match(/```(?:python)?\s*([\s\S]*?)```/i);
  if (cerca?.[1]?.trim()) return cerca[1].trim();
  // Sin cercos: si al menos parece Python (clase o import), lo devolvemos tal cual.
  return /\b(class|import|from)\b/.test(raw) ? raw.trim() : null;
}

export function crearAccionAnimarEscena(deps: DepsAnimarEscena): AuroraActionHandler {
  return async (args, ctx) => {
    const descripcion = String(args["descripcion"] ?? args["escena"] ?? "").trim();
    if (!descripcion) {
      return {
        ok: false,
        message: "Describme la escena que quieres animar (p. ej. «un cubo girando con la flor de la vida»).",
      };
    }
    const calidad = String(args["calidad"] ?? "720p").trim();
    ctx.onStatus?.("Diseñando la escena de ManimGX…");
    const respuesta = await deps.pedirEscena(descripcion, calidad);
    if (!respuesta) {
      return {
        ok: false,
        message: "El modelo no devolvió una escena: no pude animarla ahora mismo.",
        status: "Escena de ManimGX",
      };
    }
    const codigo = extraerCodigoPython(respuesta);
    if (!codigo) {
      return {
        ok: false,
        message: "El modelo respondió pero no trajo código Python: pídemela de nuevo con otra descripción.",
        status: "Escena de ManimGX",
      };
    }
    const validacion = validarEscena(codigo);
    if (!validacion.ok) {
      return {
        ok: false,
        message: `La escena no pasa la validación de ManimGX (no se ejecuta nada fuera del Worker): ${validacion.motivos.join(" · ")}`,
        status: "Escena de ManimGX",
      };
    }
    const abierto = await deps.abrirConAtomo({ accion: "abrir", herramienta: ATOMO_ANIMACION, animar: codigo }, ctx);
    return {
      ok: abierto.ok,
      message: abierto.ok
        ? `Escena lista y validada: ${abierto.message}`
        : `La escena está lista, pero no pude abrir la Protomolécula: ${abierto.message}`,
      status: abierto.status ?? "Abriendo la Protomolécula…",
    };
  };
}

/** Deps por defecto del MODELO: el router de Astraura (gratis-primero), inyectables en pruebas. */
export async function pedirEscenaAlModelo(descripcion: string, calidad: string): Promise<string | null> {
  try {
    const { astrauraChat } = await import("@/ai/astraura/router");
    const r = await astrauraChat({
      messages: [
        { role: "system", content: pedidoEscena(descripcion, calidad) },
        { role: "user", content: descripcion },
      ],
      taskHint: "code",
      maxTokens: 1200,
    });
    return r?.text ?? null;
  } catch {
    return null;
  }
}
