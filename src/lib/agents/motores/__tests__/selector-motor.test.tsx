import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SelectorMotor } from "@/components/agents/selector-motor";
import {
  elegirMotor,
  MotorAgentes,
  type NecesidadesAgentes,
  MOTORES_AGENTES,
} from "@/lib/agents/motores/tipos";
import type { Agent } from "@/lib/agents/model";

/** Agente mínimo: la elección de motor es pura, no lee el resto de la ficha. */
const agente: Agent = { id: "ag-prueba", name: "Agente Prueba", description: "", persona: "", capabilities: [], icon: "Bot", author: "Tú", visibility: "private", version: "1.0.0", createdAt: Date.now(), updatedAt: Date.now() };

/** Casos de `elegirMotor` idénticos a los de tipos.test.ts */
const casosMotor: Array<[NecesidadesAgentes, MotorAgentes]> = [
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

describe("SELECTOR MOTOR · elegirMotor · regla pura primera bandera activa", () => {
  for (const [necesidades, esperado] of casosMotor) {
    it(`con ${JSON.stringify(necesidades)} sugiere ${esperado}`, () => {
      expect(elegirMotor(agente, necesidades)).toBe(esperado);
    });
  }

  it("sin necesidades el agente queda nativo (gratis primero, sin dependencias)", () => {
    expect(elegirMotor(agente, {})).toBe("nativo");
  });

  it("correrEnNeuronaNode: false deja el agente nativo a pesar de la flag explícita", () => {
    expect(elegirMotor(agente, { correrEnNeuronaNode: false })).toBe("nativo");
  });
});

describe("SELECTOR MOTOR · ficha renderizada", () => {
  const motorNativo: MotorAgentes = "nativo";
  const motorLanggraph: MotorAgentes = "langgraph";
  const motorPydantic: MotorAgentes = "pydantic-ai";

  it("renderiza ficha nativo con lenguaje TS y navegador", () => {
    const { container } = render(<SelectorMotor agente={agente} motor={motorNativo} />);
    const card = container.querySelector("[data-card=nativo]");
    expect(card).toBeInTheDocument();
  });

  it("renderiza ficha langgraph con lenguaje PY y neurona Python", () => {
    const { container } = render(<SelectorMotor agente={agente} motor={motorLanggraph} />);
    const card = container.querySelector("[data-card=langgraph]");
    expect(card).toBeInTheDocument();
  });

  it("renderiza ficha pydantic-ai con salida con esquema", () => {
    const { container } = render(<SelectorMotor agente={agente} motor={motorPydantic} />);
    const card = container.querySelector("[data-card=pydantic-ai]");
    expect(card).toBeInTheDocument();
  });
});

describe("SELECTOR MOTOR · por qué se sugiere", () => {
  it("muestra razón cuando ejecucionLargaConReanudacion es verdadera", () => {
    const { getByText } = render(
      <SelectorMotor agente={agente} necesidades={{ ejecucionLargaConReanudacion: true }} />
    );
    const texto = getByText(/se sugiere langgraph por ejec/i);
    expect(texto).toBeInTheDocument();
  });

  it("muestra razón cuando salidaConEsquema es verdadera", () => {
    const { getByText } = render(
      <SelectorMotor agente={agente} necesidades={{ salidaConEsquema: true }} />
    );
    const texto = getByText(/se sugiere pydantic-ai por salida/i);
    expect(texto).toBeInTheDocument();
  });

  it("muestra razón por defecto: motor nativo sin flags", () => {
    const { getByText } = render(<SelectorMotor agente={agente} />);
    const texto = getByText(/motor nativo por defecto/i);
    expect(texto).toBeInTheDocument();
  });
});

describe("SELECTOR MOTOR · conexión con barrel", () => {
  it("el barrel de Agentes expone elegirMotor y MOTORES_AGENTES", () => {
    expect(elegirMotor).toBeDefined();
    expect(MotorAgentes).toBeDefined();
  });
});