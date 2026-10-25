import { describe, it, expect } from "vitest";
import {
  MOTORES_AGENTES,
  elegirMotor,
  getBuiltinAgents,
  type MotorAgentes,
  type NecesidadesAgentes,
} from "@/lib/agents";
import { MOTORES_AGENTES as FICHAS_DIRECTO } from "@/lib/agents/motores/tipos";

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

describe("conexión · el contrato vive en el subsistema de Agentes (barrel)", () => {
  it("el barrel de Agentes expone EXACTAMENTE el módulo del contrato (mismo binding)", () => {
    expect(MOTORES_AGENTES).toBe(FICHAS_DIRECTO);
  });

  it("APLICADO: los agentes que existen hoy resuelvan un motor válido, con su ficha", () => {
    const builtins = getBuiltinAgents();
    expect(builtins.length).toBeGreaterThan(0);
    for (const a of builtins) {
      const motor: MotorAgentes = elegirMotor(a, {});
      expect(MOTORES_AGENTES[motor]).toBeDefined();
    }
  });

  it("APLICADO: hoy los agentes corren NATIVO (sin adaptadores de terceros montados aún)", () => {
    for (const a of getBuiltinAgents()) {
      expect(elegirMotor(a, {})).toBe("nativo");
      expect(MOTORES_AGENTES.nativo.lenguaje).toBe("ts");
    }
  });
});
