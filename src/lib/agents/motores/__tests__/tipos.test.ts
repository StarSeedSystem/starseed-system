import { describe, it, expect } from "vitest";
import {
  MOTORES_AGENTES,
  elegirMotor,
  type NecesidadesAgentes,
} from "../tipos";

/** Agente mínimo: la elección de motor es pura, no lee el resto de la ficha. */
const agente = { id: "ag-prueba" } as Parameters<typeof elegirMotor>[0];

describe("MOTORES_AGENTES · fichas por motor", () => {
  it("declara exactamente los seis motores del contrato", () => {
    expect(Object.keys(MOTORES_AGENTES).sort()).toEqual([
      "agno",
      "langgraph",
      "mastra",
      "nativo",
      "openai-agents",
      "pydantic-ai",
    ]);
  });

  it("nativo: TS en navegador, propio, sin dependencias", () => {
    expect(MOTORES_AGENTES.nativo).toMatchObject({
      lenguaje: "ts",
      dondeCorre: "navegador",
    });
  });

  it("mastra: TS en la neurona (node), Apache-2.0", () => {
    expect(MOTORES_AGENTES.mastra).toMatchObject({
      lenguaje: "ts",
      dondeCorre: "neurona-node",
      licencia: expect.stringContaining("Apache-2.0"),
    });
  });

  it("langgraph: Python en neurona, MIT, flujos con estado", () => {
    expect(MOTORES_AGENTES.langgraph).toMatchObject({
      lenguaje: "py",
      dondeCorre: "neurona-python",
      licencia: "MIT",
      aportes: expect.arrayContaining(["flujos-con-estado"]),
    });
  });

  it("cada ficha trae lenguaje, dónde corre y licencia", () => {
    for (const ficha of Object.values(MOTORES_AGENTES)) {
      expect(["ts", "py"]).toContain(ficha.lenguaje);
      expect(["navegador", "neurona-node", "neurona-python"]).toContain(
        ficha.dondeCorre,
      );
      expect(ficha.licencia.length).toBeGreaterThan(0);
      expect(ficha.aportes.length).toBeGreaterThan(0);
    }
  });

  it("cada motor declara el aporte que lo distingue", () => {
    expect(MOTORES_AGENTES.mastra.aportes).toContain("flujos-con-estado");
    expect(MOTORES_AGENTES["pydantic-ai"].aportes).toContain("salidas-tipadas");
    expect(MOTORES_AGENTES["openai-agents"].aportes).toContain("traspasos");
    expect(MOTORES_AGENTES.agno.aportes).toContain("equipos");
    expect(MOTORES_AGENTES.nativo.aportes).toContain("persona-en-el-bucle");
  });

  it("los cinco aportes del contrato están cubiertos por las fichas", () => {
    const todos = new Set(
      Object.values(MOTORES_AGENTES).flatMap((ficha) => ficha.aportes),
    );
    expect([...todos].sort()).toEqual([
      "equipos",
      "flujos-con-estado",
      "persona-en-el-bucle",
      "salidas-tipadas",
      "traspasos",
    ]);
  });

  it("los motores Python no dicen correr en el navegador ni en Node", () => {
    for (const ficha of Object.values(MOTORES_AGENTES)) {
      if (ficha.lenguaje === "py") {
        expect(ficha.dondeCorre).toBe("neurona-python");
      }
    }
  });
});

describe("elegirMotor · regla primero, un motor por agente", () => {
  const casos: Array<[NecesidadesAgentes, keyof typeof MOTORES_AGENTES]> = [
    [{}, "nativo"],
    [{ ejecucionLargaConReanudacion: true }, "langgraph"],
    [{ salidaConEsquema: true }, "pydantic-ai"],
    [{ traspasos: true }, "openai-agents"],
    [{ equipoConMemoriaCompartida: true }, "agno"],
    [{ correrEnNeuronaNode: true }, "mastra"],
    [
      {
        ejecucionLargaConReanudacion: true,
        salidaConEsquema: true,
        traspasos: true,
        equipoConMemoriaCompartida: true,
      },
      "langgraph",
    ],
    [{ salidaConEsquema: true, traspasos: true }, "pydantic-ai"],
    [{ traspasos: true, equipoConMemoriaCompartida: true }, "openai-agents"],
    [{ equipoConMemoriaCompartida: true, correrEnNeuronaNode: true }, "agno"],
  ];

  for (const [necesidades, esperado] of casos) {
    it(`con ${JSON.stringify(necesidades)} sugiere ${esperado}`, () => {
      expect(elegirMotor(agente, necesidades)).toBe(esperado);
    });
  }

  it("sin necesidades el agente queda nativo (gratis primero, sin dependencias)", () => {
    expect(elegirMotor(agente, { correrEnNeuronaNode: false })).toBe("nativo");
  });
});
