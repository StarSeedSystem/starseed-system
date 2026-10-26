import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
  MOTORES_CON_ADAPTADOR,
  SelectorMotor,
  etiquetaDondeCorre,
  motivoNoDisponible,
  motivoSugerencia,
} from "@/components/agents/selector-motor";

const agente = { id: "ag-prueba" };

afterEach(() => cleanup());

describe("helpers puros del selector", () => {
  it("traduce dónde corre cada motor", () => {
    expect(etiquetaDondeCorre("navegador")).toBe("En el navegador");
    expect(etiquetaDondeCorre("neurona-node")).toBe("En una neurona Node");
    expect(etiquetaDondeCorre("neurona-python")).toBe("En una neurona Python");
  });

  it("explica la sugerencia en el orden de la regla pura", () => {
    expect(motivoSugerencia({ traspasos: true, salidaConEsquema: true })).toContain("esquema exacto");
    expect(motivoSugerencia({ correrEnNeuronaNode: true })).toContain("neurona Node");
    expect(motivoSugerencia({})).toContain("sin necesidades especiales");
  });

  it("da motivo a cada motor sin adaptador", () => {
    expect(motivoNoDisponible("mastra")).toContain("neurona Node");
    expect(motivoNoDisponible("langgraph")).toContain("neurona Python");
    expect(motivoNoDisponible("agno")).toContain("AgentOS");
  });

  it("hoy solo el motor propio tiene adaptador", () => {
    expect([...MOTORES_CON_ADAPTADOR]).toEqual(["nativo"]);
  });
});

describe("SelectorMotor · ficha del agente", () => {
  it("sin necesidades muestra el motor propio, dónde corre y por qué", () => {
    render(<SelectorMotor agente={agente} />);
    expect(screen.getByTestId("motor-elegido")).toHaveTextContent("Nativo del OS");
    expect(screen.getByTestId("donde-corre")).toHaveTextContent("En el navegador");
    expect(screen.getByTestId("motivo-sugerencia")).toHaveTextContent(
      "sin necesidades especiales",
    );
  });

  it("con traspasos sugiere OpenAI Agents y lo marca próximamente con motivo", () => {
    render(<SelectorMotor agente={agente} necesidades={{ traspasos: true }} />);
    expect(screen.getByTestId("motor-elegido")).toHaveTextContent(
      "OpenAI Agents SDK",
    );
    expect(screen.getByTestId("donde-corre")).toHaveTextContent(
      "En una neurona Python",
    );
    expect(screen.getByTestId("motivo-sugerencia")).toHaveTextContent("traspasos");
    expect(screen.getByTestId("motor-proximamente-openai-agents")).toHaveTextContent(
      "Próximamente",
    );
    expect(screen.getByTestId("aviso-proximamente")).toHaveTextContent(
      "Adaptador OpenAI Agents",
    );
  });

  it("los cinco motores externos salen próximamente y deshabilitados", () => {
    render(<SelectorMotor agente={agente} />);
    for (const m of ["mastra", "langgraph", "pydantic-ai", "openai-agents", "agno"]) {
      expect(screen.getByTestId(`motor-proximamente-${m}`)).toHaveTextContent(
        "Próximamente",
      );
      expect(screen.getByTestId(`motor-opcion-${m}`)).toBeDisabled();
    }
  });

  it("permite elegir un motor disponible y avisa del cambio", () => {
    const cambios: string[] = [];
    render(
      <SelectorMotor
        agente={agente}
        disponibles={["nativo", "mastra"]}
        onCambiarMotor={(m) => cambios.push(m)}
      />,
    );
    fireEvent.click(screen.getByTestId("motor-opcion-mastra"));
    expect(cambios).toEqual(["mastra"]);
    expect(screen.getByTestId("motor-elegido")).toHaveTextContent("Mastra");
    expect(screen.getByTestId("donde-corre")).toHaveTextContent(
      "En una neurona Node",
    );
  });

  it("un clic en un motor sin adaptador no cambia la elección", () => {
    const cambios: string[] = [];
    render(
      <SelectorMotor agente={agente} onCambiarMotor={(m) => cambios.push(m)} />,
    );
    fireEvent.click(screen.getByTestId("motor-opcion-agno"));
    expect(cambios).toEqual([]);
    expect(screen.getByTestId("motor-elegido")).toHaveTextContent("Nativo del OS");
  });
});
