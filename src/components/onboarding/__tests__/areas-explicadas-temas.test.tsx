/**
 * GUI1021G · Las tarjetas de la Guía de la red usan la fuente única de textos.
 * Cada ruta nueva abre su explicación (cuerpo, puntos y pregunta a Aurora) y
 * ninguna tarjeta habla de «varios cerebros».
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
import {
  AreasExplicadas,
  TEMA_POR_RUTA,
  explicacionDe,
  type AreaTip,
} from "../areas-explicadas";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { AREAS } from "../onboarding-wizard";

afterEach(() => cleanup());

const area = (path: string, label: string): AreaTip => ({
  path,
  label,
  icon: Sparkles,
  tip: "tip de prueba",
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
      const { unmount } = render(
        <AreasExplicadas areas={[area(ruta, label)]} onIr={() => {}} />,
      );
      fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
      expect(screen.getByText(tema.cuerpo)).toBeTruthy();
      for (const punto of tema.puntos) {
        expect(screen.getByText(punto)).toBeTruthy();
      }
      expect(screen.getByText(tema.preguntaAurora)).toBeTruthy();
      unmount();
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
    expect(AREAS.some((a) => a.path === "/cerebros")).toBe(false);
    expect(AREAS.find((a) => a.path === "/cerebro")?.tip).toMatch(
      /un cerebro por cuenta/i,
    );
  });
});
