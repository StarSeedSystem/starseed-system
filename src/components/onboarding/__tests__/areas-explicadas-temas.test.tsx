/**
 * GUI1021G · Las tarjetas de la Guía de la red usan la fuente única de textos.
 * Cada ruta nueva abre su explicación (cuerpo, puntos y pregunta a Aurora) y
 * ninguna tarjeta habla de «varios cerebros».
 *
 * Del rescate RTIMN1021I se conservan las dos pruebas que siguen en pie con el
 * contrato de hoy: la caída honesta a un genérico para rutas sin ficha y el
 * «Ir a» que navega a la ruta de la tarjeta abierta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Sparkles } from "lucide-react";

import {
  AreasExplicadas,
  TEMA_POR_RUTA,
  explicacionDe,
  type AreaTip,
} from "../areas-explicadas";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { AREAS } from "../onboarding-wizard";

afterEach(() => cleanup());

const area = (path: string, label: string, tip = "tip de prueba"): AreaTip => ({
  path,
  label,
  icon: Sparkles,
  tip,
  accent: "text-cyan-300",
});

const temaDe = (ruta: string) =>
  TODOS_LOS_TEMAS.find((t) => t.key === TEMA_POR_RUTA[ruta]);

const RUTAS: Array<[string, string]> = [
  ["/protomolecula", "Protomolécula"],
  ["/network/politics", "Política"],
  ["/network/education", "Educación"],
  ["/network/culture", "Cultura"],
  ["/genesis", "Genesis"],
  ["/cerebro", "Cerebro"],
];

describe("Guía de la red · tarjetas con los temas nuevos (GUI1021G)", () => {
  it("cada ruta nueva está en AREAS con icono y tip", () => {
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

  it("cada ruta nueva abre su explicación al pulsar la tarjeta", () => {
    for (const [ruta, label] of RUTAS) {
      const tema = temaDe(ruta);
      if (!tema) continue;
      render(<AreasExplicadas areas={[area(ruta, label)]} onIr={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
      const dialogo = screen.getByRole("dialog");
      expect(within(dialogo).getByText(tema.cuerpo)).toBeTruthy();
      for (const punto of tema.puntos) {
        expect(within(dialogo).getByText(punto)).toBeTruthy();
      }
      expect(within(dialogo).getByText(tema.preguntaAurora)).toBeTruthy();
      cleanup();
    }
  });

  it("Librería, Red Mesh y el antiguo /cerebros también usan sus temas", () => {
    expect(TEMA_POR_RUTA["/library"]).toBe("libreria-biblioteca");
    expect(TEMA_POR_RUTA["/red-mesh"]).toBe("malla");
    expect(TEMA_POR_RUTA["/cerebros"]).toBe("neuronas-cerebro");
    expect(explicacionDe(area("/library", "Librería")).queEs).toBe(
      temaDe("/library")?.cuerpo,
    );
    expect(explicacionDe(area("/red-mesh", "Redes mesh")).queEs).toBe(
      temaDe("/red-mesh")?.cuerpo,
    );
  });

  it("ninguna tarjeta habla de «varios cerebros»", () => {
    const texto = AREAS.map((a) => `${a.label} ${a.tip}`).join(" ");
    expect(texto).not.toMatch(/varios cerebros/i);
    expect(texto).not.toMatch(/varias cerebros/i);
    expect(AREAS.some((a) => a.path === "/cerebros")).toBe(false);
    expect(AREAS.find((a) => a.path === "/cerebro")?.tip).toMatch(
      /un cerebro por cuenta/i,
    );
  });
});

describe("Guía de la red · conservado del rescate RTIMN1021I", () => {
  it("una ruta sin ficha propia cae en su tip y en cómo empezar, sin ventana vacía", () => {
    const tip = "Crear: instala apps, skills y recursos de la colección común.";
    render(<AreasExplicadas areas={[area("/ruta-sin-ficha", "Ruta rara", tip)]} onIr={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Ruta rara/ }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText(tip)).toBeInTheDocument();
    expect(
      within(dialogo).getByText("Abre Ruta rara y mira a tu alrededor sin miedo."),
    ).toBeInTheDocument();
  });

  it("«Ir a» navega a la ruta de la tarjeta abierta", () => {
    const onIr = vi.fn();
    render(<AreasExplicadas areas={[area("/cerebro", "Cerebro")]} onIr={onIr} />);
    fireEvent.click(screen.getByRole("button", { name: /Cerebro/ }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /Ir a Cerebro/ }),
    );
    expect(onIr).toHaveBeenCalledWith("/cerebro");
  });
});
