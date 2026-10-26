import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TODOS_LOS_TEMAS } from "../../../lib/onboarding/guia-temas-red";
import { StepDemo } from "../aurora-guide-demos";

afterEach(cleanup);

const montar = (stepKey: string, reduce = true) =>
  render(<StepDemo stepKey={stepKey} accent="#C9A8FF" reduce={reduce} />);

const etiqueta = (stepKey: string): string | null => {
  const svg = montar(stepKey).container.querySelector("svg");
  return svg?.getAttribute("aria-label") ?? null;
};

describe("StepDemo · los diez temas de la guía montan su demostración (GUI1021F)", () => {
  it("cada clave de TODOS_LOS_TEMAS monta algo que se pinta", () => {
    expect(TODOS_LOS_TEMAS.map((t) => t.key)).toEqual([
      "protomolecula", "malla", "capas-conciencia", "neuronas-cerebro",
      "pilar-politica", "pilar-educacion", "pilar-cultura",
      "libreria-biblioteca", "genesis", "personalizacion-segura",
    ]);
    for (const tema of TODOS_LOS_TEMAS) {
      for (const reduce of [false, true]) {
        const { container, unmount } = montar(tema.key, reduce);
        expect(container.children.length, `demo de ${tema.key} vacía (reduce=${reduce})`).toBeGreaterThan(0);
        expect(container.querySelector("svg"), `sin SVG en ${tema.key} (reduce=${reduce})`).not.toBeNull();
        unmount();
      }
    }
  });

  it("cada demo nueva se anuncia en español con una etiqueta accesible que nombra el tema", () => {
    for (const tema of TODOS_LOS_TEMAS) {
      const etiquetaSvg = etiqueta(tema.key);
      expect(etiquetaSvg, `sin etiqueta en ${tema.key}`).toBeTruthy();
    }
  });

  it("las claves viejas cerebros y libreria apuntan a sus demos nuevas por compatibilidad", () => {
    expect(etiqueta("cerebros")).toBe(etiqueta("neuronas-cerebro"));
    expect(etiqueta("libreria")).toBe(etiqueta("libreria-biblioteca"));
  });

  it("una clave que no existe no renderiza nada, como siempre", () => {
    const { container } = montar("paso-que-no-existe");
    expect(container.children.length).toBe(0);
  });
});
