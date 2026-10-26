/**
 * Selector de motor de los agentes (AGF1023H).
 * Prueba la sugerencia pura (`elegirMotor`) y lo que ve la persona con
 * Testing Library: motor elegido, motivo, dónde corre y «próximamente».
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SelectorMotor } from "@/components/agents/selector-motor";
import { MOTORES, elegirMotor } from "../selector-motor";

afterEach(() => cleanup());

describe("elegirMotor", () => {
  it("sin capacidades sugiere el nativo, que ya está listo", () => {
    const sugerencia = elegirMotor();
    expect(sugerencia.id).toBe("nativo");
    expect(sugerencia.disponible).toBe(true);
    expect(sugerencia.donde).toContain("Navegador");
    expect(sugerencia.pendiente).toBeNull();
  });

  it("los traspasos entre roles piden OpenAI Agents y avisan de próximamente", () => {
    const sugerencia = elegirMotor({ capabilities: ["handoff"] });
    expect(sugerencia.id).toBe("openai-agents");
    expect(sugerencia.disponible).toBe(false);
    expect(sugerencia.pendiente).toContain("set_tracing_disabled(True)");
    expect(sugerencia.donde).toContain("PoliGenesis");
  });

  it("los flujos largos piden LangGraph y un adaptador instalado lo desbloquea", () => {
    const pendiente = elegirMotor({ capabilities: ["flow-builder"] });
    expect(pendiente.id).toBe("langgraph");
    expect(pendiente.disponible).toBe(false);

    const listo = elegirMotor({ capabilities: ["flow-builder"] }, { adaptadores: ["langgraph"] });
    expect(listo.disponible).toBe(true);
    expect(listo.pendiente).toBeNull();
  });

  it("la primera regla manda: pm + research sugiere Pydantic AI", () => {
    expect(elegirMotor({ capabilities: ["pm", "research"] }).id).toBe("pydantic-ai");
    expect(elegirMotor({ capabilities: ["research"] }).id).toBe("agno");
  });

  it("el catálogo declara nombre, lugar y motivo en todos los motores", () => {
    expect(MOTORES).toHaveLength(6);
    for (const motor of MOTORES) {
      expect(motor.nombre.length).toBeGreaterThan(0);
      expect(motor.donde.length).toBeGreaterThan(0);
      expect(motor.motivo.length).toBeGreaterThan(0);
      expect(motor.adaptador || motor.pendiente.length > 0).toBe(true);
    }
  });
});

describe("SelectorMotor", () => {
  it("enseña el motor sugerido, por qué, dónde y que es próximamente", () => {
    render(<SelectorMotor agent={{ capabilities: ["handoff"] }} />);

    expect(screen.getAllByText(/OpenAI Agents SDK/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Dónde corre: PoliGenesis/)).toBeInTheDocument();
    expect(screen.getByText(/Próximamente: Aún sin adaptador/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /OpenAI Agents SDK/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("al elegir el nativo cambia el detalle y avisa del cambio", () => {
    const onChange = vi.fn();
    render(<SelectorMotor agent={{ capabilities: ["handoff"] }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: /Nativo/ }));

    expect(onChange).toHaveBeenCalledWith("nativo");
    expect(screen.getByRole("radio", { name: /Nativo/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/Por qué: Ya corre en el OS/)).toBeInTheDocument();
    expect(screen.getByText(/Sugerencia para este agente: OpenAI Agents SDK/)).toBeInTheDocument();
  });

  it("value fija el motor elegido aunque la sugerencia sea otro", () => {
    render(<SelectorMotor agent={{ capabilities: ["pm"] }} value="langgraph" />);

    expect(screen.getByRole("radio", { name: /LangGraph/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/Sugerencia para este agente: Pydantic AI/)).toBeInTheDocument();
  });

  it("un adaptador instalado quita el aviso de próximamente", () => {
    render(<SelectorMotor agent={{ capabilities: ["flow-builder"] }} adaptadores={["langgraph"]} />);

    expect(screen.queryByText(/^Próximamente: /)).not.toBeInTheDocument();
    expect(screen.getAllByText("Listo").length).toBeGreaterThan(0);
  });
});
