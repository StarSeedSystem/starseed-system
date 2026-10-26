import { describe, it, expect, afterEach } from "vitest";
import type { ComponentType } from "react";
import { render, cleanup } from "@testing-library/react";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { StepDemo } from "../aurora-guide-demos";

afterEach(() => cleanup());

type Props = { accent: string; reduce: boolean };

/** Comprueba que una demo pinta un lienzo accesible (svg con etiqueta en español). */
function demoPinta(stepKey: string, reduce: boolean): void {
  const { container } = render(<StepDemo stepKey={stepKey} accent="#C9A8FF" reduce={reduce} />);
  const lienzo = container.querySelector('div.relative.h-28');
  expect(lienzo).not.toBeNull();
  const svg = lienzo?.querySelector("svg[role='img']");
  expect(svg).not.toBeNull();
  const etiqueta = svg?.getAttribute("aria-label") ?? "";
  expect(etiqueta.length).toBeGreaterThan(20);
}

describe("StepDemo · las diez demos de TODOS_LOS_TEMAS montan en el tour (GUI1021F)", () => {
  // Contrato §4: cada clave de los diez temas tiene su demostración en el tour.
  for (const tema of TODOS_LOS_TEMAS) {
    for (const reduce of [false, true]) {
      it(`monta la demo de «${tema.key}» (reduce=${reduce})`, () => {
        expect(() => demoPinta(tema.key, reduce)).not.toThrow();
      });
    }
  }

  it("cada demo de tema pinta su svg accesible en español", () => {
    for (const tema of TODOS_LOS_TEMAS) demoPinta(tema.key, true);
  });

  describe("claves viejas por compatibilidad", () => {
    // `cerebros` y `libreria` ya no tienen demo propia: apuntan a la del tema nuevo.
    it("la clave vieja «cerebros» monta la demo de «neuronas-cerebro»", () => {
      const { container: viejo } = render(<StepDemo stepKey="cerebros" accent="#C9A8FF" reduce />);
      cleanup();
      const { container: nuevo } = render(<StepDemo stepKey="neuronas-cerebro" accent="#C9A8FF" reduce />);
      expect(viejo.innerHTML).toBe(nuevo.innerHTML);
    });

    it("la clave vieja «libreria» monta la demo de «libreria-biblioteca»", () => {
      const { container: viejo } = render(<StepDemo stepKey="libreria" accent="#C9A8FF" reduce />);
      cleanup();
      const { container: nuevo } = render(<StepDemo stepKey="libreria-biblioteca" accent="#C9A8FF" reduce />);
      expect(viejo.innerHTML).toBe(nuevo.innerHTML);
    });
  });

  it("la demo cambió: los temas nuevos no muestran la estantería ni el grafo viejo", () => {
    // Las demos sustituidas eran div-grid con fichas / un svg sin role="img":
    // las nuevas siempre traen role="img" con su etiqueta accesible.
    for (const stepKey of ["neuronas-cerebro", "libreria-biblioteca"]) {
      const { container } = render(<StepDemo stepKey={stepKey} accent="#C9A8FF" reduce />);
      expect(container.querySelector("svg[role='img']")).not.toBeNull();
      cleanup();
    }
  });

  it("una clave sin demo no renderiza nada (la guía sigue)", () => {
    const { container } = render(<StepDemo stepKey="no-existe" accent="#C9A8FF" reduce />);
    expect(container.innerHTML).toBe("");
  });
});
