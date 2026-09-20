import { describe, it, expect } from "vitest";
import { planDeDecision, decidirConJev, type RespuestaJev } from "../decision-hibrida";
import { type DecisionNeedle } from "../needle3-client";

const needleEjecutar: DecisionNeedle = {
  ok: true,
  confianza: 0.85,
  llamadas: [{ nombre: "cambiar_tema", argumentos: { tema: "oscuro" } }],
};

const needleConfirmar: DecisionNeedle = {
  ok: true,
  confianza: 0.5,
  llamadas: [{ nombre: "restaurar", argumentos: {} }],
};

const needleEscalar: DecisionNeedle = {
  ok: true,
  confianza: 0.2,
  llamadas: [],
};

describe("planDeDecision - 6 casos de la regla híbrida", () => {
  it("Caso 1: Needle en zona ejecutar determina ejecución directa con Needle", () => {
    const res = planDeDecision(needleEjecutar, null);
    expect(res.accion).toBe("ejecutar");
    expect(res.capa).toBe("needle");
    expect(res.llamada?.nombre).toBe("cambiar_tema");
  });

  it("Caso 2: Needle en zona confirmar requiere confirmación con Needle", () => {
    const res = planDeDecision(needleConfirmar, null);
    expect(res.accion).toBe("confirmar");
    expect(res.capa).toBe("needle");
  });

  it("Caso 3: Needle escalar + Jev prob ≥ 0.75 ejecuta con capa Jev", () => {
    const jev: RespuestaJev = {
      ok: true,
      probabilidad: 0.8,
      llamada: { nombre: "apariencia", argumentos: { fondo: "cristal" } },
    };
    const res = planDeDecision(needleEscalar, jev);
    expect(res.accion).toBe("ejecutar");
    expect(res.capa).toBe("jev");
    expect(res.llamada?.nombre).toBe("apariencia");
  });

  it("Caso 4: Needle escalar + Jev prob 0.5-0.75 confirma con capa Jev", () => {
    const jev: RespuestaJev = {
      ok: true,
      probabilidad: 0.6,
      llamada: { nombre: "distribucion", argumentos: {} },
    };
    const res = planDeDecision(needleEscalar, jev);
    expect(res.accion).toBe("confirmar");
    expect(res.capa).toBe("jev");
  });

  it("Caso 5: Needle escalar + Jev prob < 0.5 escala a LLM", () => {
    const jev: RespuestaJev = {
      ok: true,
      probabilidad: 0.3,
    };
    const res = planDeDecision(needleEscalar, jev);
    expect(res.accion).toBe("escalar_llm");
    expect(res.capa).toBe("llm");
  });

  it("Caso 6: Needle escalar + Jev null (sin clave/sin respuesta) escala a LLM", () => {
    const res = planDeDecision(needleEscalar, null);
    expect(res.accion).toBe("escalar_llm");
    expect(res.capa).toBe("llm");
  });
});

describe("decidirConJev - transporte mock", () => {
  it("devuelve probabilidad cuando la API responde OK", async () => {
    const transporteMock = async () =>
      new Response(JSON.stringify({ probabilidad: 0.82, llamada: { nombre: "test", argumentos: {} } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const res = await decidirConJev("consulta", [], "test-key", transporteMock);
    expect(res.ok).toBe(true);
    expect(res.probabilidad).toBe(0.82);
  });

  it("devuelve error sin apiKey", async () => {
    const res = await decidirConJev("consulta", [], "");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Sin clave");
  });
});
