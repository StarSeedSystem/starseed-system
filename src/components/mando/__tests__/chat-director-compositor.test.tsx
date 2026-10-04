import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CompositorDirector, modeloInicial } from "../chat-director-compositor";

const MODELOS = [
  { id: "nim/mixtral", nombre: "Mixtral (nim)", grupo: "Catálogo" },
];

describe("modeloInicial", () => {
  const disponibles = ["nim/mixtral", "hermes/predeterminado"];

  it("usa el guardado si está entre los disponibles", () => {
    expect(modeloInicial("hermes/predeterminado", "nim/mixtral", disponibles)).toBe("hermes/predeterminado");
  });

  it("usa el último si el guardado no está disponible", () => {
    expect(modeloInicial("borrado/modelo", "nim/mixtral", disponibles)).toBe("nim/mixtral");
  });

  it("usa el de defecto si no hay guardado válido ni último", () => {
    expect(modeloInicial(null, "", disponibles)).toBe("claude-cowork/claude-opus-5-5");
  });
});

describe("CompositorDirector", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("preselecciona el último modelo usado", () => {
    render(<CompositorDirector modelos={MODELOS} ultimoModelo="nim/mixtral" onEnviar={() => {}} />);
    const selector = screen.getByLabelText("Modelo con el que responder") as HTMLSelectElement;
    expect(selector.value).toBe("nim/mixtral");
  });

  it("enviar llama onEnviar con texto, modelo y canal del motor", () => {
    const llamadas: unknown[] = [];
    render(<CompositorDirector modelos={MODELOS} ultimoModelo="claude-cowork/claude-opus-5-5" onEnviar={(p) => llamadas.push(p)} />);
    fireEvent.change(screen.getByLabelText("Mensaje a la dirección"), { target: { value: "Hola, dirección" } });
    fireEvent.click(screen.getByText("Enviar"));
    expect(llamadas).toEqual([{ texto: "Hola, dirección", modelo: "claude-cowork/claude-opus-5-5", canales: ["claude-cowork"] }]);
  });

  it("el texto vacío no envía", () => {
    const llamadas: unknown[] = [];
    render(<CompositorDirector modelos={MODELOS} ultimoModelo="nim/mixtral" onEnviar={(p) => llamadas.push(p)} />);
    fireEvent.click(screen.getByText("Enviar"));
    expect(llamadas).toHaveLength(0);
  });
});
