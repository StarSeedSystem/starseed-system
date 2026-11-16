// Pruebas del planificador con Laya (Tarea F · Ola 1018L).
// SOLO funciones puras: sin red y sin reloj real (fetch, reloj e inyecciones INYECTADOS).
import { describe, expect, it, vi } from "vitest";
import {
  respuestasParaPlan,
  preguntarALayaConRelevo,
  type DepsPlanificador,
} from "../preguntar-plan";
import type { TaskProfile } from "../../../ai/astraura/router";

const PERFIL_EJEMPLO: TaskProfile = {
  kind: "chat",
  needsVision: false,
  chars: 120,
  difficulty: 0.5,
};

const RESPUESTA_LAYA = {
  dificultad: {
    type: "score",
    score: "alta",
    probabilities: { baja: 0.1, media: 0.2, alta: 0.7 },
    answer_confidence: 0.85,
  },
  basta_pequeno: {
    type: "noul",
    noul: 0.8,
    probabilities: { "sí": 0.8, "no": 0.2 },
    answer_confidence: 0.9,
  },
};

function crearDeps(
  opciones: {
    respuestas?: Record<string, unknown> | null;
    fallo?: boolean;
    plazoVencido?: boolean;
    medio?: "a1" | "mac" | "navegador" | "malla";
  } = {},
): DepsPlanificador {
  const ahora = vi.fn(() => 1000);
  const dormir = vi.fn(() => ({
    promesa: opciones.plazoVencido
      ? new Promise(() => {})
      : Promise.resolve(),
    cancelar: () => {},
  }));
  const fetch = vi.fn().mockResolvedValue(
    opciones.fallo
      ? new Response(null, { status: 503 })
      : new Response(JSON.stringify({ answers: opciones.respuestas ?? RESPUESTA_LAYA }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
  );

  return {
    ahora,
    dormir,
    fetch,
    medio: opciones.medio ?? "a1",
  };
}

describe("respuestasParaPlan", () => {
  it("devuelve las respuestas de Laya cuando el servidor local responde a tiempo", async () => {
    const deps = crearDeps();
    const resultado = await respuestasParaPlan("texto de prueba", deps, PERFIL_EJEMPLO);
    expect(resultado).toEqual(RESPUESTA_LAYA);
    expect(deps.fetch).toHaveBeenCalled();
  });

  it("devuelve null si el fetch falla", async () => {
    const deps = crearDeps({ fallo: true });
    const resultado = await respuestasParaPlan("texto de prueba", deps, PERFIL_EJEMPLO);
    expect(resultado).toBeNull();
  });

  it("devuelve null si las respuestas no tienen 'answers'", async () => {
    const deps = crearDeps({ respuestas: { sin: "answers" }});
    const resultado = await respuestasParaPlan("texto de prueba", deps, PERFIL_EJEMPLO);
    expect(resultado).toBeNull();
  });

  it("usa el medio especificado por defecto 'a1'", async () => {
    const deps = crearDeps();
    await respuestasParaPlan("texto", deps, PERFIL_EJEMPLO);
    expect(deps.fetch).toHaveBeenCalledWith(
      expect.stringContaining("127.0.0.1:4470"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("permite especificar un medio diferente", async () => {
    const deps = crearDeps({ medio: "mac" });
    await respuestasParaPlan("texto", deps, PERFIL_EJEMPLO, "mac");
    expect(deps.fetch).toHaveBeenCalled();
  });

  it("devuelve null si Laya no llega a tiempo (plazo vencido)", async () => {
    const deps = crearDeps({ plazoVencido: true });
    const resultado = await respuestasParaPlan("texto", deps, PERFIL_EJEMPLO);
    expect(resultado).toBeNull();
  });
});

describe("preguntarALayaConRelevo", () => {
  it("prepara la petición al punto plan.dificultad con las preguntas correctas", async () => {
    const relevoMalla = vi.fn().mockResolvedValue({
      answers: RESPUESTA_LAYA,
    });
    const deps = crearDeps();
    (deps as DepsPlanificador).relevoMalla = relevoMalla;

    const resultado = await preguntarALayaConRelevo("texto de prueba", deps, PERFIL_EJEMPLO);
    expect(resultado).toEqual(RESPUESTA_LAYA);
    expect(relevoMalla).toHaveBeenCalled();
  });

  it("devuelve null si el relevo a la malla falla", async () => {
    const relevoMalla = vi.fn().mockResolvedValue(null);
    const deps = crearDeps();
    (deps as DepsPlanificador).relevoMalla = relevoMalla;

    const resultado = await preguntarALayaConRelevo("texto", deps, PERFIL_EJEMPLO);
    expect(resultado).toBeNull();
  });
});