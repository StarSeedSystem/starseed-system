import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SelectorMotor } from "@/components/agents/selector-motor";
import { MOTORES, elegirMotor, esMotorId, motorPorId, type AgenteParaMotor } from "../elegir-motor";
const BASE: AgenteParaMotor = {
  name: "Aurora",
  description: "Acompaña y responde en el chat del OS.",
  capabilities: ["taste"],
};
afterEach(() => cleanup());
describe("elegirMotor · elección pura", () => {
  it("sin señales especiales sugiere el motor nativo, que ya corre hoy", () => {
    const s = elegirMotor(BASE);
    expect(s.motor.id).toBe("nativo");
    expect(s.motor.disponible).toBe(true);
    expect(s.ideal).toBeNull();
    expect(s.motivos.join(" ")).toContain("motor nativo");
  });

  it("un flujo largo con estado apunta a LangGraph, aún próximamente", () => {
    const s = elegirMotor({ name: "MetaGenesis", description: "Flujo largo con estado que se reanuda tras un fallo." });
    expect(s.motor.id).toBe("nativo");
    expect(s.ideal?.id).toBe("langgraph");
    expect(s.motivos.join(" ")).toContain("reanude");
    expect(s.motivos.join(" ")).toContain("corre en el motor nativo");
  });

  it("las decisiones con forma exacta apuntan a Pydantic AI", () => {
    expect(elegirMotor({ name: "Director", description: "Valida una decisión con forma exacta." }).ideal?.id)
      .toBe("pydantic-ai");
  });

  it("los equipos con traspasos y guardas apuntan a OpenAI Agents SDK", () => {
    expect(elegirMotor({ name: "PoliGenesis", description: "Equipo con traspasos entre roles y guardas." }).ideal?.id)
      .toBe("openai-agents");
  });

  it("los equipos con memoria y conocimiento apuntan a Agno", () => {
    expect(elegirMotor({ name: "Genesis", description: "Equipo con memoria y conocimiento en un AgentOS." }).ideal?.id)
      .toBe("agno");
  });

  it("las capacidades de app y TypeScript apuntan a Mastra", () => {
    expect(elegirMotor({ name: "Constructor", description: "Crea una app con flujos, RAG y MCP.", capabilities: ["app-builder"] }).ideal?.id)
      .toBe("mastra");
  });

  it("respeta una elección guardada que ya puede correr", () => {
    const s = elegirMotor({ ...BASE, motor: "nativo" });
    expect(s.motor.id).toBe("nativo");
    expect(s.ideal).toBeNull();
    expect(s.motivos).toEqual(["Elegido a mano para este agente."]);
  });

  it("una elección sin adaptador no finge: corre el nativo y avisa", () => {
    const s = elegirMotor({ ...BASE, motor: "agno" });
    expect(s.motor.id).toBe("nativo");
    expect(s.ideal?.id).toBe("agno");
    expect(s.motivos.join(" ")).toContain("aún no tiene adaptador");
  });

  it("el catálogo tiene seis motores, ids únicos y los externos con motivo", () => {
    expect(MOTORES).toHaveLength(6);
    expect(new Set(MOTORES.map((m) => m.id)).size).toBe(6);
    for (const motor of MOTORES.filter((m) => m.id !== "nativo")) {
      expect(motor.disponible).toBe(false);
      expect(motor.motivoNoDisponible).toBeTruthy();
    }
    expect(esMotorId("langgraph")).toBe(true);
    expect(esMotorId("inventado")).toBe(false);
    expect(motorPorId("mastra")?.nombre).toBe("Mastra");
  });
});

describe("SelectorMotor · la ficha del agente", () => {
  it("muestra el motor elegido, los seis motores y dónde corre", () => {
    render(<SelectorMotor agente={BASE} />);
    expect(screen.getByTestId("selector-motor")).toBeInTheDocument();
    expect(screen.getByText("Motor del agente")).toBeInTheDocument();
    expect(screen.getByTestId("motor-elegido").textContent).toBe("Motor nativo del OS");
    expect(screen.getByText("Elegido")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    expect(screen.getByRole("radio", { name: /Motor nativo del OS/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByText(/En esta neurona: navegador o servidor Next\.js/).length).toBeGreaterThan(0);
  });

  it("para un flujo largo enseña el mejor encaje (LangGraph) con su porqué", () => {
    render(<SelectorMotor agente={{ name: "MetaGenesis", description: "Flujo largo con estado que se reanuda." }} />);
    expect(screen.getByText("Mejor encaje cuando llegue")).toBeInTheDocument();
    expect(screen.getByText(/LangGraph · Próximamente/)).toBeInTheDocument();
    expect(screen.getByTestId("motivos-sugerencia").textContent).toContain("reanude");
  });

  it("los motores sin adaptador salen «Próximamente», desactivados y con su motivo", () => {
    const onCambiar = vi.fn();
    render(<SelectorMotor agente={BASE} onCambiar={onCambiar} />);
    const mastra = screen.getByRole("radio", { name: /Mastra/ });
    expect(mastra).toBeDisabled();
    expect(mastra).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText("Próximamente").length).toBeGreaterThanOrEqual(5);
    expect(screen.getByTestId("motivo-mastra").textContent).toContain("falta su adaptador");
    fireEvent.click(mastra);
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByTestId("motor-elegido").textContent).toBe("Motor nativo del OS");
  });

  it("elegir un motor disponible avisa para que la ficha lo guarde", () => {
    const onCambiar = vi.fn();
    render(<SelectorMotor agente={BASE} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole("radio", { name: /Motor nativo del OS/ }));
    expect(onCambiar).toHaveBeenCalledWith("nativo");
  });

  it("una elección guardada sin adaptador se ve elegida y explica que aún no corre", () => {
    render(<SelectorMotor agente={BASE} motor="agno" />);
    expect(screen.getByTestId("motor-elegido").textContent).toBe("Agno");
    expect(screen.getByTestId("motivo-agno").textContent).toContain("falta su adaptador Python para AgentOS");
  });
});
