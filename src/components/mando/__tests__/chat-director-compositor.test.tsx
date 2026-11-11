import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CLAVE_MIGRACION_PRESIDENTE, CompositorDirector, migrarAPresidente, modeloInicial } from "../chat-director-compositor";

const MODELOS = [
  { id: "nim/mixtral", nombre: "Mixtral (nim)", grupo: "Catálogo" },
];

describe("modeloInicial", () => {
  const disponibles = ["nim/mixtral", "hermes/predeterminado"];

  it("usa el guardado si está entre los disponibles", () => {
    expect(modeloInicial("hermes/predeterminado", "nim/mixtral", disponibles)).toBe("hermes/predeterminado");
  });

  // DIR1111G: sin guardado válido, el destinatario es el Director presidente (no el último del feed).
  it("sin guardado válido abre el Director presidente aunque haya un último", () => {
    expect(modeloInicial("borrado/modelo", "nim/mixtral", disponibles)).toBe("director-presidente/auto");
    expect(modeloInicial(null, "", disponibles)).toBe("director-presidente/auto");
  });
});

describe("CompositorDirector", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("por defecto escribe al Director presidente, con su ayuda a la vista", () => {
    const llamadas: unknown[] = [];
    render(<CompositorDirector modelos={MODELOS} ultimoModelo="nim/mixtral" onEnviar={(p) => llamadas.push(p)} />);
    const selector = screen.getByLabelText("Modelo con el que responder") as HTMLSelectElement;
    expect(selector.value).toBe("director-presidente/auto");
    expect(screen.getByTestId("ayuda-motor")).toHaveTextContent("queda en cola");
    fireEvent.change(screen.getByLabelText("Mensaje a la dirección"), { target: { value: "Hola, dirección" } });
    fireEvent.click(screen.getByText("Enviar"));
    expect(llamadas).toEqual([{ texto: "Hola, dirección", modelo: "director-presidente/auto", canales: ["director-presidente"] }]);
  });

  it("después de la migración, lo que Alex elige se respeta", () => {
    window.localStorage.setItem("starseed.mando.director.modelo", "hermes/predeterminado");
    const llamadas: unknown[] = [];
    render(<CompositorDirector modelos={MODELOS} ultimoModelo="" onEnviar={(p) => llamadas.push(p)} />);
    // Primera vez en este aparato: pasa al presidente.
    expect((screen.getByLabelText("Modelo con el que responder") as HTMLSelectElement).value).toBe("director-presidente/auto");
    fireEvent.change(screen.getByLabelText("Modelo con el que responder"), { target: { value: "claude-cowork/claude-opus-5-5" } });
    cleanup();
    render(<CompositorDirector modelos={MODELOS} ultimoModelo="" onEnviar={(p) => llamadas.push(p)} />);
    expect((screen.getByLabelText("Modelo con el que responder") as HTMLSelectElement).value).toBe("claude-cowork/claude-opus-5-5");
  });

  it("migrarAPresidente es de una sola vez", () => {
    const m = new Map<string, string>([["starseed.mando.director.modelo", "nim/mixtral"]]);
    const almacen = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(migrarAPresidente(almacen)).toBe("director-presidente/auto");
    expect(m.get(CLAVE_MIGRACION_PRESIDENTE)).toBe("1");
    m.set("starseed.mando.director.modelo", "nim/mixtral");
    expect(migrarAPresidente(almacen)).toBe("nim/mixtral");
  });

  it("el texto vacío no envía", () => {
    const llamadas: unknown[] = [];
    render(<CompositorDirector modelos={MODELOS} ultimoModelo="nim/mixtral" onEnviar={(p) => llamadas.push(p)} />);
    fireEvent.click(screen.getByText("Enviar"));
    expect(llamadas).toHaveLength(0);
  });
});
