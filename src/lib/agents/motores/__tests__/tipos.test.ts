import { describe, it, expect } from "vitest";
import { elegirMotor, MOTORES_INFO, type MotorAgentes } from "../tipos";
import type { Agent } from "../../model";

const agenteBase: Partial<Agent> = {
  id: "a1",
  name: "test",
  persona: "x",
  capabilities: [],
};

describe("MOTORES_INFO", () => {
  it("contiene los 6 motores del contrato", () => {
    const ids: MotorAgentes[] = [
      "nativo",
      "mastra",
      "langgraph",
      "pydantic-ai",
      "openai-agents",
      "agno",
    ];
    for (const id of ids) {
      expect(MOTORES_INFO[id]).toBeDefined();
    }
  });

  it("nativo corre en navegador y neurona-node, ts, propio", () => {
    const m = MOTORES_INFO["nativo"];
    expect(m.lenguaje).toBe("ts");
    expect(m.dondeCorre).toEqual(["navegador", "neurona-node"]);
    expect(m.licencia).toBe("propio");
  });

  it("mastra es TS en neurona-node con Apache-2.0", () => {
    const m = MOTORES_INFO["mastra"];
    expect(m.lenguaje).toBe("ts");
    expect(m.dondeCorre).toEqual(["neurona-node"]);
    expect(m.licencia).toBe("Apache-2.0");
  });

  it("langgraph es py en neurona-python con MIT y flujos con estado", () => {
    const m = MOTORES_INFO["langgraph"];
    expect(m.lenguaje).toBe("py");
    expect(m.dondeCorre).toEqual(["neurona-python"]);
    expect(m.licencia).toBe("MIT");
    expect(m.aporta.flujosConEstado).toBe(true);
  });

  it("pydantic-ai es py con salidas tipadas/validadas", () => {
    const m = MOTORES_INFO["pydantic-ai"];
    expect(m.lenguaje).toBe("py");
    expect(m.aporta.salidasTipadas).toBe(true);
    expect(m.licencia).toBe("MIT");
  });

  it("openai-agents tiene traspasos y equipos", () => {
    const m = MOTORES_INFO["openai-agents"];
    expect(m.aporta.traspasos).toBe(true);
    expect(m.aporta.equipos).toBe(true);
    expect(m.lenguaje).toBe("py");
    expect(m.licencia).toBe("MIT");
  });

  it("agno es py con Apache-2.0 y equipos con memoria compartida", () => {
    const m = MOTORES_INFO["agno"];
    expect(m.lenguaje).toBe("py");
    expect(m.licencia).toBe("Apache-2.0");
    expect(m.aporta.equipos).toBe(true);
  });
});

describe("elegirMotor", () => {
  it("nativo por defecto", () => {
    expect(elegirMotor(agenteBase, {})).toBe("nativo");
  });

  it("LangGraph si hay ejecución larga con reanudación", () => {
    expect(elegirMotor(agenteBase, { ejecucionLargaConReanudacion: true })).toBe(
      "langgraph"
    );
  });

  it("Pydantic AI si la salida debe validar un esquema", () => {
    expect(elegirMotor(agenteBase, { salidaConEsquema: true })).toBe("pydantic-ai");
  });

  it("OpenAI Agents si hay traspasos entre roles", () => {
    expect(elegirMotor(agenteBase, { traspasosEntreRoles: true })).toBe(
      "openai-agents"
    );
  });

  it("Agno si es un equipo con memoria compartida", () => {
    expect(elegirMotor(agenteBase, { equipoConMemoriaCompartida: true })).toBe("agno");
  });

  it("Mastra si corre en la neurona en TS", () => {
    expect(elegirMotor(agenteBase, { correrEnNeuronaTS: true })).toBe("mastra");
  });

  it("LangGraph tiene prioridad sobre otras reglas", () => {
    expect(
      elegirMotor(agenteBase, {
        ejecucionLargaConReanudacion: true,
        salidaConEsquema: true,
        traspasosEntreRoles: true,
        equipoConMemoriaCompartida: true,
        correrEnNeuronaTS: true,
      })
    ).toBe("langgraph");
  });
});
