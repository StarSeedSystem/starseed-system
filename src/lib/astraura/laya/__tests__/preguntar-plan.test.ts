// Tests para respuestasParaPlan (JLA1116A).
import { describe, it, expect, vi } from "vitest";
import { respuestasParaPlan } from "../preguntar-plan";
import type { DepsLaya } from "../cliente-laya";

describe("respuestasParaPlan", () => {
  const depsMock: DepsLaya = {
    ahora: () => 0,
    dormir: () => ({ promesa: new Promise(() => {}), cancelar: () => {} }),
    fetch: vi.fn(),
  };

  it("devuelve null si Laya no responde (timeout)", async () => {
    // Simulamos fallo en fetch/malla
    const depsConFallo: DepsLaya = { ...depsMock, fetch: vi.fn().mockRejectedValue(new Error("timeout")) };
    const resultado = await respuestasParaPlan("tarea simple", depsConFallo);
    expect(resultado).toBeNull();
  });

  it("refina dificultad cuando Laya responde a tiempo", async () => {
    const respuestasLaya = {
      dificultad: { score: "alta", answer_confidence: 0.9 },
    };
    
    // Inyectamos relevoMalla para simular la respuesta de Laya
    const depsConRespuesta: DepsLaya = {
      ...depsMock,
      relevoMalla: vi.fn().mockResolvedValue({ answers: respuestasLaya }),
    };

    const resultado = await respuestasParaPlan("tarea difícil", depsConRespuesta, "malla");
    expect(resultado).not.toBeNull();
    // alta -> 0.85 en DIFICULTAD_POR_NIVEL
    expect(resultado?.difficulty).toBe(0.85);
  });

  it("devuelve null si la respuesta está mal formada", async () => {
    const depsConRespuestaMalFormada: DepsLaya = {
      ...depsMock,
      relevoMalla: vi.fn().mockResolvedValue({ algo: "raro" }),
    };
    const resultado = await respuestasParaPlan("tarea simple", depsConRespuestaMalFormada, "malla");
    expect(resultado).toBeNull();
  });
});
