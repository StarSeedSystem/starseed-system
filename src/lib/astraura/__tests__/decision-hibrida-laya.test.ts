import { describe, expect, it } from "vitest";
import { MODELO_JEV } from "@/lib/jev/decisiones";
import {
  decidirConLaya,
  decidirHabilidad,
  decidirTipoDiagrama,
  planDeDecision,
  UMBRAL_LAYA_EJECUTAR,
  type RespuestaJev,
  type RespuestaLaya,
  type RespuestaLayaChoice,
} from "../decision-hibrida";
import { bloqueHabilidad } from "@/ai/astraura/habilidades/elegir-habilidad";
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

function respuestaLaya(choice = "buscar", confidence = 0.81,
  answerConfidence?: number): Response {
  return new Response(JSON.stringify({
    answers: { herramienta: { type: "choice", choice, confidence,
      ...(answerConfidence === undefined ? {} : { answer_confidence: answerConfidence }) } },
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
    // Con el cliente único (Ola 1018L · Tarea B) el cuerpo sale de construirPeticion:
    // formato nativo con `model` y la pregunta abierta del catálogo conserva «ninguna».
    expect(cuerpo).toEqual({
      model: MODELO_JEV,
      state: "encuentra un libro",
      questions: {
        herramienta: {
          type: "choice",
          instructions: "Elige la herramienta más adecuada para resolver la consulta",
          criteria: {
            buscar: "Busca información", guardar: "Guarda el resultado",
            ninguna: "Ninguna herramienta: basta con conversar",
          },
        },
      },
    });
  });

  it("lee la confianza calibrada: manda answer_confidence y confidence solo si falta", async () => {
    const calibrada = async () => respuestaLaya("buscar", 0.95, 0.42);
    await expect(decidirConLaya("consulta", herramientas, calibrada)).resolves.toEqual({
      herramienta: "buscar", confianza: 0.42, motor: "laya-local",
    });
    const sinCalibrar = async () => respuestaLaya("buscar", 0.77);
    await expect(decidirConLaya("consulta", herramientas, sinCalibrar)).resolves.toEqual({
      herramienta: "buscar", confianza: 0.77, motor: "laya-local",
    });
  });

  it("devuelve null ante fallo HTTP o una herramienta ajena al catálogo", async () => {
    const fallo = async () => new Response(null, { status: 503 });
    await expect(decidirConLaya("consulta", herramientas, fallo)).resolves.toBeNull();
    const ajena = async () => respuestaLaya("borrar", 0.95);
    await expect(decidirConLaya("consulta", herramientas, ajena)).resolves.toBeNull();
  });
});

describe("decidirTipoDiagrama", () => {
  it("pasa por el cliente único y lee answer_confidence antes que confidence", async () => {
    let cuerpo: unknown;
    const transporte = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("http://127.0.0.1:4470/v1/systemone");
      cuerpo = JSON.parse(String(init?.body)) as unknown;
      return new Response(JSON.stringify({
        answers: { tipo: { type: "choice", choice: "flowchart",
          probabilities: { flowchart: 0.91, gantt: 0.09 },
          confidence: 0.64, answer_confidence: 0.41 } },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    await expect(decidirTipoDiagrama("dibuja el flujo", ["flowchart", "gantt"], transporte))
      .resolves.toEqual({ tipo: "flowchart", confianza: 0.41, motor: "laya-local" });
    expect(cuerpo).toMatchObject({
      model: MODELO_JEV,
      state: "dibuja el flujo",
      questions: { tipo: { type: "choice", criteria: {
        flowchart: expect.any(String), gantt: expect.any(String),
      } } },
    });
  });

  it("cae a confidence si falta answer_confidence", async () => {
    const transporte = async () => new Response(JSON.stringify({
      answers: { tipo: { type: "choice", choice: "gantt", confidence: 0.72 } },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
    await expect(decidirTipoDiagrama("planifica", ["flowchart", "gantt"], transporte))
      .resolves.toEqual({ tipo: "gantt", confianza: 0.72, motor: "laya-local" });
  });

  it("devuelve null ante fallo HTTP o un tipo fuera de las opciones", async () => {
    const fallo = async () => new Response(null, { status: 503 });
    await expect(decidirTipoDiagrama("dibuja", ["flowchart"], fallo)).resolves.toBeNull();
    const ajeno = async () => new Response(JSON.stringify({
      answers: { tipo: { type: "choice", choice: "sankey", confidence: 0.9 } },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
    await expect(decidirTipoDiagrama("dibuja", ["flowchart"], ajeno)).resolves.toBeNull();
  });
});

describe("decidirHabilidad", () => {
  // Respuesta de Laya de ejemplo, con la forma real del punto `habilidad.elegir`:
  // choice + probabilities + answer_confidence (calibrada); `confidence` NO manda.
  function respuestaHabilidad(choice = "tdd", answerConfidence?: number): Response {
    return new Response(JSON.stringify({
      answers: { habilidad: { type: "choice", choice,
        probabilities: { [choice]: 0.88, ninguna: 0.12 },
        confidence: 0.95, ...(answerConfidence === undefined ? {} : { answer_confidence: answerConfidence }) } },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  it("pasa por el cliente único con la pregunta del punto «habilidad.elegir»", async () => {
    let cuerpo: unknown;
    const transporte = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("http://127.0.0.1:4470/v1/systemone");
      cuerpo = JSON.parse(String(init?.body)) as unknown;
      return respuestaHabilidad("tdd", 0.71);
    };
    await expect(decidirHabilidad("escribe primero los tests", transporte)).resolves.toEqual({
      choice: "tdd", answer_confidence: 0.71,
    });
    expect(cuerpo).toMatchObject({
      model: MODELO_JEV,
      state: "escribe primero los tests",
      questions: { habilidad: { type: "choice", instructions: expect.any(String),
        criteria: expect.objectContaining({ tdd: expect.any(String), ninguna: expect.any(String) }) } },
    });
  });

  it("solo decide con answer_confidence: sin calibrada no hay respuesta", async () => {
    const sinCalibrada = async () => respuestaHabilidad("code-review");
    await expect(decidirHabilidad("revisa esto", sinCalibrada)).resolves.toBeNull();
    const nan = async () => respuestaHabilidad("tdd", Number.NaN);
    await expect(decidirHabilidad("revisa esto", nan)).resolves.toBeNull();
  });

  it("devuelve null ante fallo HTTP, opción ajena al menú y «ninguna» vale igual", async () => {
    const fallo = async () => new Response(null, { status: 503 });
    await expect(decidirHabilidad("consulta", fallo)).resolves.toBeNull();
    const ajena = async () => respuestaHabilidad("no-existe", 0.9);
    await expect(decidirHabilidad("consulta", ajena)).resolves.toBeNull();
    const ninguna = async () => respuestaHabilidad("ninguna", 0.9);
    await expect(decidirHabilidad("consulta", ninguna)).resolves.toEqual({
      choice: "ninguna", answer_confidence: 0.9,
    });
  });

  it("lo devuelto alimenta bloqueHabilidad: la capa recibe su tamaño", async () => {
    const si = async () => respuestaHabilidad("tdd", 0.8);
    const respuesta: RespuestaLayaChoice | null = await decidirHabilidad("tarea", si);
    expect(bloqueHabilidad(respuesta, "reflejo")).not.toBe("");
    expect(bloqueHabilidad(respuesta, "memoria")).toBe("");
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
