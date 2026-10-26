import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StepDemo } from "../aurora-guide-demos";
import { TODOS_LOS_TEMAS } from "../../../lib/onboarding/guia-temas-red";

/** Cada clave de tema monta SU demostración: se distingue por la etiqueta accesible del SVG. */
const ETIQUETA_POR_CLAVE: Record<string, RegExp> = {
  protomolecula: /^Protomolécula:/,
  malla: /^Redes mesh:/,
  "capas-conciencia": /^Capas de conciencia/,
  "neuronas-cerebro": /^Neuronas y cerebro:/,
  "pilar-politica": /^Política:/,
  "pilar-educacion": /^Educación:/,
  "pilar-cultura": /^Cultura:/,
  "libreria-biblioteca": /^Librería y Biblioteca:/,
  genesis: /^Genesis:/,
  "personalizacion-segura": /^Personalización segura:/,
};

const monta = (stepKey: string, reduce: boolean): ReturnType<typeof render> =>
  render(<StepDemo stepKey={stepKey} accent="#C9A8FF" reduce={reduce} />);

afterEach(cleanup);

describe("guía · StepDemo monta la demostración de cada tema del tour (GUI1021F)", () => {
  for (const clave of Object.keys(ETIQUETA_POR_CLAVE)) {
    for (const reduce of [false, true]) {
      it(`cada clave de TODOS_LOS_TEMAS (${clave}, reduce=${reduce}) monta su demostración`, () => {
        expect(TODOS_LOS_TEMAS.map((t) => t.key)).toContain(clave);
        const { container } = monta(clave, reduce);
        const svg = screen.getByRole("img", { name: ETIQUETA_POR_CLAVE[clave] });
        expect(container.contains(svg)).toBe(true);
      });
    }
  }

  it("la lista de claves cubiertas coincide con TODOS_LOS_TEMAS de la guía", () => {
    expect(new Set(Object.keys(ETIQUETA_POR_CLAVE))).toEqual(
      new Set(TODOS_LOS_TEMAS.map((t) => t.key)),
    );
  });

  it("las claves viejas del tour (cerebros, libreria) montan las demos nuevas", () => {
    const { container: conCerebros } = monta("cerebros", true);
    expect(
      screen.getByRole("img", { name: ETIQUETA_POR_CLAVE["neuronas-cerebro"] }),
    ).toBe(conCerebros.querySelector("svg"));
    cleanup();
    const { container: conLibreria } = monta("libreria", true);
    expect(
      screen.getByRole("img", { name: ETIQUETA_POR_CLAVE["libreria-biblioteca"] }),
    ).toBe(conLibreria.querySelector("svg"));
  });

  it("una clave sin demostración no renderiza nada (la guía sigue)", () => {
    const { container } = monta("paso-sin-demo", false);
    expect(container.querySelector("svg")).toBeNull();
  });
});
