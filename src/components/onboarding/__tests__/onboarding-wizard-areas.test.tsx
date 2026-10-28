/**
 * GUI1021Gb (parte 2) · tarjetas de la Guía de la red en onboarding-wizard.
 *
 * Las rutas nuevas de AREAS deben abrir SU explicación del tema de TODOS_LOS_TEMAS
 * (cuerpo, puntos y la pregunta a Aurora) y ninguna tarjeta puede seguir hablando
 * de «varios cerebros» ni llevar a /cerebros.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { AREAS } from "../onboarding-wizard";
import { AreasExplicadas, explicacionDe } from "../areas-explicadas";

afterEach(() => cleanup());

const RUTAS_NUEVAS = [
  "/protomolecula",
  "/network/politics",
  "/network/education",
  "/network/culture",
  "/genesis",
  "/cerebro",
  "/library",
  "/red-mesh",
] as const;

function abrirTarjeta(path: string): HTMLElement {
  const area = AREAS.find((a) => a.path === path);
  if (!area) throw new Error(`AREAS no tiene la ruta ${path}`);
  render(
    <AppearanceProvider>
      <AreasExplicadas areas={[area]} onIr={() => {}} />
    </AppearanceProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: new RegExp(area.label) }));
  return screen.getByRole("dialog");
}

describe("Guía de la red · AREAS del wizard", () => {
  it("cada ruta nueva abre el cuerpo de su tema (fuente única, §3)", () => {
    expect.hasAssertions();
    for (const ruta of RUTAS_NUEVAS) {
      const area = AREAS.find((a) => a.path === ruta);
      expect(area, `falta la tarjeta de ${ruta}`).toBeDefined();
      const exp = explicacionDe(area!);
      const tema = TODOS_LOS_TEMAS.find((t) => t.ruta === ruta && t.cuerpo === exp.queEs);
      expect(tema, `${ruta} no abre el cuerpo de su tema`).toBeDefined();
      expect(exp.empiezaPor).toMatch(/^Aurora, /);
    }
  });

  it("la tarjeta de Política abre la ventana con el cuerpo y la pregunta a Aurora", () => {
    const dialogo = abrirTarjeta("/network/politics");
    expect(within(dialogo).getByText(/Aquí no hay representantes/)).toBeInTheDocument();
    expect(within(dialogo).getByText("Aurora, llévame a Política")).toBeInTheDocument();
  });

  it("ninguna tarjeta habla de «varios cerebros» ni lleva a /cerebros", () => {
    expect(AREAS.some((a) => a.path === "/cerebros")).toBe(false);
    for (const area of AREAS) {
      expect(area.label, `${area.path}: etiqueta con «Cerebros»`).not.toMatch(/Cerebros/);
      expect(area.tip, `${area.path}: tip con «varios cerebros»`).not.toMatch(/varios cerebros/i);
    }
  });

  it("cada tarjeta tiene ruta única, icono, tip corto y acento", () => {
    const rutas = AREAS.map((a) => a.path);
    expect(new Set(rutas).size).toBe(rutas.length);
    for (const area of AREAS) {
      expect(area.icon).toBeDefined();
      expect(area.tip.length).toBeGreaterThan(0);
      expect(area.tip.length).toBeLessThan(200);
      expect(area.accent).toMatch(/^text-/);
    }
  });
});
