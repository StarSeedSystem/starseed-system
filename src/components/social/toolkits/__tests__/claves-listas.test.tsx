import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Timeline, claveEstable, clavesUnicas } from "../shared";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("claves estables en listas dinámicas", () => {
  it("compone la clave con los campos que identifican la entrada", () => {
    expect(claveEstable("Ana Pérez", "Salud")).toBe("ana-perez--salud");
  });

  it("no colisiona cuando dos personas comparten nombre", () => {
    const claves = clavesUnicas(
      [
        { name: "Ana", role: "Salud" },
        { name: "Ana", role: "Salud" },
        { name: "Ana", role: "Educación" },
      ],
      (p) => claveEstable(p.name, p.role),
    );

    expect(new Set(claves).size).toBe(3);
  });

  it("conserva la clave de cada entrada al reordenar", () => {
    const ana = { name: "Ana", role: "Salud" };
    const luis = { name: "Luis", role: "Educación" };
    const antes = clavesUnicas([ana, luis], (p) => claveEstable(p.name, p.role));
    const despues = clavesUnicas([luis, ana], (p) => claveEstable(p.name, p.role));

    expect(despues[0]).toBe(antes[1]);
    expect(despues[1]).toBe(antes[0]);
  });

  it("Timeline no avisa de claves duplicadas con entradas repetidas", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Timeline
        entries={[
          { time: "10:00", title: "Apertura" },
          { time: "10:00", title: "Apertura" },
        ]}
      />,
    );

    const avisos = error.mock.calls.map((call) => String(call[0])).join(" ");
    expect(avisos).not.toContain("same key");
  });
});
