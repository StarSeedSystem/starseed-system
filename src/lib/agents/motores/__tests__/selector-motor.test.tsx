import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { SelectorMotor } from "@/components/agents/selector-motor";
import {
  MOTORES,
  elegirMotor,
  esMotorId,
  motorPorId,
  type AgenteParaMotor,
} from "../elegir-motor";

const AGENTE_BASE: AgenteParaMotor = {
  name: "Aurora",
  description: "Acompaña y responde en el chat del OS.",
  capabilities: ["taste"],
};

afterEach(() => {
  cleanup();
});

describe("elegirMotor · elección pura", () => {
  it("sin señales especiales sugiere el motor nativo, que ya corre hoy", () => {
    const s = elegirMotor(AGENTE_BASE);
    expect(s.motor.id).toBe("nativo");
    expect(s.motor.disponible).toBe(true);
    expect(s.ideal).toBeNull();
    expect(s.motivos.join(" ")).toContain("motor nativo");
  });

  it("un flujo largo con estado tiene a LangGraph como mejor encaje, aún próximamente", () => {
    const s = elegirMotor({
      name: "MetaGenesis",
      description: "Flujo largo con estado que se reanuda tras un fallo.",
      capabilities: ["pm"],
    });
    expect(s.motor.id).toBe("nativo");
    expect(s.ideal?.id).toBe("langgraph");
    expect(s.motivos.join(" ")).toContain("reanude");
    expect(s.motivos.join(" ")).toContain("corre en el motor nativo");
  });

  it("las decisiones con forma exacta apuntan a Pydantic AI", () => {
    const s = elegirMotor({
      name: "Director",
      description: "Director que valida una decisión con forma exacta.",
    });
    expect(s.ideal?.id).toBe("pydantic-ai");
  });

  it("los equipos con traspasos y guardas apuntan a OpenAI Agents SDK", () => {
    const s = elegirMotor({
      name: "PoliGenesis",
      description: "Equipo con traspasos entre roles y guardas de salida.",
    });
    expect(s.ideal?.id).toBe("openai-agents");
  });

  it("los equipos con memoria y conocimiento apuntan a Agno", () => {
    const s = elegirMotor({
      name: "Genesis",
      description: "Equipo con memoria y conocimiento en un AgentOS.",
    });
    expect(s.ideal?.id).toBe("agno");
  });

  it("las capacidades de app en TypeScript apuntan a Mastra", () => {
    const s = elegirMotor({
      name: "Constructor",
      description: "Crea una app con flujos, RAG y MCP.",
      capabilities: ["app-builder"],
    });
    expect(s.ideal?.id).toBe("mastra");
  });

  it("respeta una elección guardada que ya puede correr", () => {
    const s = elegirMotor({ ...AGENTE_BASE, motor: "nativo" });
    expect(s.motor.id).toBe("nativo");
    expect(s.ideal).toBeNull();
    expect(s.motivos).toEqual(["Elegido a mano para este agente."]);
  });

  it("una elección guardada sin adaptador no finge: corre el nativo y avisa", () => {
    const s = elegirMotor({ ...AGENTE_BASE, motor: "agno" });
    expect(s.motor.id).toBe("nativo");
    expect(s.ideal?.id).toBe("agno");
    expect(s.motivos.join(" ")).toContain("aún no tiene adaptador");
  });

  it("el catálogo tiene los seis motores, ids únicos y los externos con motivo", () => {
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
  it("muestra el motor elegido, los seis motores y dónde corre cada uno", () => {
    render(<SelectorMotor agente={AGENTE_BASE} />);

    expect(screen.getByTestId("selector-motor")).toBeInTheDocument();
    expect(screen.getByText("Motor del agente")).toBeInTheDocument();
    expect(screen.getByTestId("motor-elegido").textContent).toBe("Motor nativo del OS");
    expect(screen.getByText("Elegido")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    expect(screen.getByRole("radio", { name: /Motor nativo del OS/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByText(/En esta neurona: navegador o servidor Next\.js/).length).toBeGreaterThan(0);
  });

  it("para un flujo largo enseña el mejor encaje (LangGraph) con su porqué", () => {
    render(
      <SelectorMotor
        agente={{
          name: "MetaGenesis",
          description: "Flujo largo con estado que se reanuda tras un fallo.",
        }}
      />,
    );

    expect(screen.getByText("Mejor encaje cuando llegue")).toBeInTheDocument();
    expect(screen.getByText(/LangGraph · Próximamente/)).toBeInTheDocument();
    expect(screen.getByTestId("motivos-sugerencia").textContent).toContain("reanude");
  });

  it("los motores sin adaptador salen «Próximamente», desactivados y con su motivo", () => {
    render(<SelectorMotor agente={AGENTE_BASE} />);

    const mastra = screen.getByRole("radio", { name: /Mastra/ });
    expect(mastra).toBeDisabled();
    expect(mastra).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText("Próximamente").length).toBeGreaterThanOrEqual(5);
    expect(screen.getByTestId("motivo-mastra").textContent).toContain("falta su adaptador");

    const onCambiar = vi.fn();
    fireEvent.click(mastra);
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByTestId("motor-elegido").textContent).toBe("Motor nativo del OS");
  });

  it("elegir un motor disponible avisa para que la ficha lo guarde", () => {
    const onCambiar = vi.fn();
    render(<SelectorMotor agente={AGENTE_BASE} onCambiar={onCambiar} />);

    fireEvent.click(screen.getByRole("radio", { name: /Motor nativo del OS/ }));
    expect(onCambiar).toHaveBeenCalledWith("nativo");
  });

  it("una elección guardada sin adaptador se ve como elegida y explica que aún no corre", () => {
    render(<SelectorMotor agente={AGENTE_BASE} motor="agno" />);

    expect(screen.getByTestId("motor-elegido").textContent).toBe("Agno");
    expect(screen.getByText(/falta su adaptador Python para AgentOS/)).toBeInTheDocument();
  });
});
