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
  it("pregunta con la choice de las habilidades + «ninguna», y la capa manda el tamaño", async () => {
    let cuerpo: unknown;
    const deLaya = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("http://127.0.0.1:4470/v1/systemone");
      cuerpo = JSON.parse(String(init?.body)) as unknown;
      return new Response(JSON.stringify({
        answers: { habilidad: { type: "choice", choice: "tdd",
          probabilities: { tdd: 0.83 }, confidence: 0.9, answer_confidence: 0.83 } },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    await expect(decidirHabilidad("entra con pruebas rojas", "reflejo", deLaya))
      .resolves.toMatchObject({
        habilidad: "tdd", confianza: 0.83, motor: "laya-local",
        bloque: expect.stringContaining("TDD"),
      });
    expect(cuerpo).toMatchObject({
      model: MODELO_JEV,
      state: "entra con pruebas rojas",
      questions: { habilidad: { type: "choice", criteria: {
        tdd: expect.any(String), ninguna: expect.any(String),
      } } },
    });
    // La misma elección con una capa mayor lleva menos del texto completo (referencia).
    const completa = await decidirHabilidad("entra con pruebas rojas", "nube", deLaya);
    expect(completa?.bloque).toContain("tdd/SKILL.md");
  });

  it("con «ninguna» o bajo el umbral responde normalmente: bloque vacío, sin fallo", async () => {
    const ninguna = async () => new Response(JSON.stringify({
      answers: { habilidad: { type: "choice", choice: "ninguna",
        confidence: 0.95, answer_confidence: 0.95 } },
    }), { status: 200 });
    await expect(decidirHabilidad("hola", "razón", ninguna)).resolves.toEqual({
      habilidad: "ninguna", confianza: 0.95, bloque: "", motor: "laya-local",
    });
    const dudosa = async () => new Response(JSON.stringify({
      answers: { habilidad: { type: "choice", choice: "tdd",
        confidence: 0.95, answer_confidence: 0.4 } },
    }), { status: 200 });
    const r = await decidirHabilidad("consulta", "razón", dudosa);
    expect(r?.habilidad).toBe("tdd");
    expect(r?.bloque).toBe("");
  });

  it("devuelve null ante fallo HTTP, forma rara o un id fuera de las opciones", async () => {
    const fallo = async () => new Response(null, { status: 503 });
    await expect(decidirHabilidad("consulta", "razón", fallo)).resolves.toBeNull();
    const fantasma = async () => new Response(JSON.stringify({
      answers: { habilidad: { type: "choice", choice: "no-existe", confidence: 0.9 } },
    }), { status: 200 });
    await expect(decidirHabilidad("consulta", "razón", fantasma)).resolves.toBeNull();
    const vacia = async () => new Response(JSON.stringify({ answers: {} }), { status: 200 });
    await expect(decidirHabilidad("consulta", "razón", vacia)).resolves.toBeNull();
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
