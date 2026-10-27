/**
 * GUI1021G · Las tarjetas de la Guía de la red usan la fuente única de textos.
 * Cada ruta nueva abre su explicación (cuerpo, puntos y pregunta a Aurora) y
 * ninguna tarjeta habla de «varios cerebros». Se conservan las pruebas del
 * rescate RTIMN1021I que siguen valiendo: el texto genérico para rutas sin
 * ficha y el «Ir a» que navega a la ruta de la tarjeta.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { Sparkles } from "lucide-react";

import { AppearanceProvider } from "@/context/appearance-context";
import {
  AreasExplicadas,
  TEMA_POR_RUTA,
  explicacionDe,
  type AreaTip,
} from "../areas-explicadas";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { AREAS } from "../onboarding-wizard";

afterEach(() => cleanup());

const TIP = "tip de prueba";

const area = (path: string, label: string): AreaTip => ({
  path,
  label,
  icon: Sparkles,
  tip: TIP,
  accent: "text-cyan-300",
});

function abrir(a: AreaTip, onIr: (path: string) => void = () => {}): HTMLElement {
  render(
    <AppearanceProvider>
      <AreasExplicadas areas={[a]} onIr={onIr} />
    </AppearanceProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: new RegExp(a.label) }));
  return screen.getByRole("dialog");
}

const temaDe = (ruta: string) =>
  TODOS_LOS_TEMAS.find((t) => t.key === TEMA_POR_RUTA[ruta]);

const RUTAS: Array<[string, string]> = [
  ["/protomolecula", "Protomolécula"],
  ["/network/politics", "Política"],
  ["/network/education", "Educación"],
  ["/network/culture", "Cultura"],
  ["/genesis", "Genesis"],
  ["/cerebro", "Cerebro"],
  ["/library", "Librería y Biblioteca"],
  ["/red-mesh", "Redes mesh"],
];

describe("Guía de la red · tarjetas con los temas nuevos (GUI1021G)", () => {
  it("cada ruta nueva y renovada está en AREAS con icono y tip", () => {
    for (const [ruta] of RUTAS) {
      const tarjeta = AREAS.find((a) => a.path === ruta);
      expect(tarjeta, `falta la tarjeta ${ruta}`).toBeDefined();
      expect(tarjeta?.icon).toBeTruthy();
      expect(tarjeta?.tip.length).toBeGreaterThan(0);
    }
  });

  it("la explicación copia cuerpo, puntos y pregunta del tema", () => {
    for (const [ruta, label] of RUTAS) {
      const tema = temaDe(ruta);
      expect(tema, `sin tema para ${ruta}`).toBeDefined();
      if (!tema) continue;
      const explicacion = explicacionDe(area(ruta, label));
      expect(explicacion.queEs).toBe(tema.cuerpo);
      expect(explicacion.comoFunciona.map((p) => p.texto)).toEqual([
        ...tema.puntos,
      ]);
      expect(explicacion.empiezaPor).toBe(tema.preguntaAurora);
    }
  });

  it("cada ruta abre su explicación al pulsar la tarjeta", () => {
    for (const [ruta, label] of RUTAS) {
      const tema = temaDe(ruta);
      if (!tema) continue;
      const dialogo = abrir(area(ruta, label));
      expect(within(dialogo).getByText(tema.cuerpo)).toBeInTheDocument();
      for (const punto of tema.puntos) {
        expect(within(dialogo).getByText(punto)).toBeInTheDocument();
      }
      expect(within(dialogo).getByText(tema.preguntaAurora)).toBeInTheDocument();
    }
  });

  it("ninguna tarjeta habla de «varios cerebros»", () => {
    const texto = AREAS.map((a) => `${a.label} ${a.tip}`).join(" ");
    expect(texto).not.toMatch(/varios cerebros/i);
    expect(AREAS.some((a) => a.path === "/cerebros")).toBe(false);
    expect(AREAS.find((a) => a.path === "/cerebro")?.tip).toMatch(
      /un cerebro por cuenta/i,
    );
  });

  it("el antiguo /cerebros sigue abriendo su explicación por compatibilidad", () => {
    const tema = temaDe("/cerebros");
    expect(tema?.key).toBe("neuronas-cerebro");
    expect(explicacionDe(area("/cerebros", "Cerebros")).queEs).toBe(tema?.cuerpo);
  });

  it("una ruta sin ficha propia cae en su tip y en cómo empezar, sin ventana vacía", () => {
    const dialogo = abrir(area("/ruta-sin-ficha", "Ruta rara"));
    expect(within(dialogo).getByText(TIP)).toBeInTheDocument();
    expect(within(dialogo).getByText("Abre Ruta rara y mira a su alrededor sin miedo.")).toBeInTheDocument();
  });

  it("«Ir a» navega a la ruta de la tarjeta abierta", () => {
    const onIr = vi.fn();
    abrir(area("/cerebro", "Cerebro"), onIr);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /Ir a Cerebro/ }),
    );
    expect(onIr).toHaveBeenCalledWith("/cerebro");
  });
});
