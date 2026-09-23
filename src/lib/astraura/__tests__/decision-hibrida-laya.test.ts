import { describe, expect, it } from "vitest";
import {
  decidirConLaya,
  planDeDecision,
  UMBRAL_LAYA_EJECUTAR,
  type RespuestaJev,
  type RespuestaLaya,
} from "../decision-hibrida";
import type { DecisionNeedle, HerramientaNeedle } from "../needle3-client";

const herramientas: HerramientaNeedle[] = [{
  name: "buscar",
  description: "Busca información",
  parameters: { type: "object", properties: {} },
}, {
  name: "guardar",
  description: "Guarda el resultado",
  parameters: { type: "object", properties: {} },
}];

const needleEscala: DecisionNeedle = { ok: true, confianza: 0.2, llamadas: [] };
const layaAlta: RespuestaLaya = {
  herramienta: "buscar", confianza: UMBRAL_LAYA_EJECUTAR, motor: "laya-local",
};
const jevAlta: RespuestaJev = { ok: true, probabilidad: 0.9,
  llamada: { nombre: "guardar", argumentos: {} } };

function respuestaLaya(choice = "buscar", confidence = 0.81): Response {
  return new Response(JSON.stringify({
    answers: { herramienta: { type: "choice", choice, confidence } },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("decidirConLaya", () => {
  it("envía una pregunta choice con nombres y descripciones de herramientas", async () => {
    let cuerpo: unknown;
    const transporte = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("http://127.0.0.1:4470/v1/systemone");
      cuerpo = JSON.parse(String(init?.body)) as unknown;
      return respuestaLaya();
    };

    await expect(decidirConLaya("encuentra un libro", herramientas, transporte)).resolves.toEqual({
      herramienta: "buscar", confianza: 0.81, motor: "laya-local",
    });
    expect(cuerpo).toEqual({
      state: "encuentra un libro",
      questions: {
        herramienta: {
          type: "choice",
          instructions: "Elige la herramienta más adecuada para resolver la consulta",
          criteria: { buscar: "Busca información", guardar: "Guarda el resultado" },
        },
      },
    });
  });

  it("devuelve null ante fallo HTTP o una herramienta ajena al catálogo", async () => {
    const fallo = async () => new Response(null, { status: 503 });
    await expect(decidirConLaya("consulta", herramientas, fallo)).resolves.toBeNull();
    const ajena = async () => respuestaLaya("borrar", 0.95);
    await expect(decidirConLaya("consulta", herramientas, ajena)).resolves.toBeNull();
  });
});

describe("planDeDecision con Laya local", () => {
  it("mantiene a Needle como primera capa", () => {
    const needle: DecisionNeedle = { ok: true, confianza: 0.8,
      llamadas: [{ nombre: "needle", argumentos: {} }] };
    expect(planDeDecision(needle, layaAlta, jevAlta)).toMatchObject({
      accion: "ejecutar", capa: "needle", llamada: { nombre: "needle" },
    });
  });

  it("ejecuta la elección de Laya desde el umbral y antes de Jev", () => {
    expect(planDeDecision(needleEscala, layaAlta, jevAlta)).toMatchObject({
      accion: "ejecutar", capa: "laya",
      llamada: { nombre: "buscar", argumentos: {} },
    });
  });

  it("escala a Jev cuando Laya queda por debajo del umbral", () => {
    const layaBaja: RespuestaLaya = { ...layaAlta, confianza: UMBRAL_LAYA_EJECUTAR - 0.01 };
    expect(planDeDecision(needleEscala, layaBaja, jevAlta)).toMatchObject({
      accion: "ejecutar", capa: "jev", llamada: { nombre: "guardar" },
    });
  });

  it("escala al LLM cuando Laya y Jev no deciden", () => {
    expect(planDeDecision(needleEscala, null, null)).toMatchObject({
      accion: "escalar_llm", capa: "llm",
    });
  });
});
