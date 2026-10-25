/**
 * GUI1021G · Las tarjetas de la Guía de la red abren los temas de la fuente
 * única (`TODOS_LOS_TEMAS`) y ninguna habla ya de «varios cerebros».
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { AreasExplicadas, type AreaTip } from "../areas-explicadas";
import { AREAS } from "../onboarding-wizard";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

afterEach(() => cleanup());

// Ruta de la tarjeta → clave del tema del que salen sus textos.
const TEMA_POR_RUTA: Record<string, string> = {
  "/protomolecula": "protomolecula",
  "/red-mesh": "malla",
  "/network/politics": "pilar-politica",
  "/network/education": "pilar-educacion",
  "/network/culture": "pilar-cultura",
  "/cerebros": "neuronas-cerebro",
  "/cerebro": "neuronas-cerebro",
  "/library": "libreria-biblioteca",
  "/genesis": "genesis",
};

const RUTAS_NUEVAS = [
  "/protomolecula",
  "/network/politics",
  "/network/education",
  "/network/culture",
  "/genesis",
];

function areaDeRuta(ruta: string): AreaTip {
  return (
    AREAS.find((a) => a.path === ruta) ?? {
      path: ruta,
      label: ruta,
      icon: Sparkles,
      tip: "",
      accent: "text-white",
    }
  );
}

function temaDeRuta(ruta: string): TemaGuia {
  const clave = TEMA_POR_RUTA[ruta];
  const tema = TODOS_LOS_TEMAS.find((t) => t.key === clave);
  if (!tema) throw new Error(`Falta el tema ${clave} para ${ruta}`);
  return tema;
}

function abrirExplicacion(area: AreaTip): void {
  render(<AreasExplicadas areas={[area]} onIr={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(area.label) }));
}

describe("Guía de la red · tarjetas con los temas nuevos (GUI1021G)", () => {
  it("incluye una tarjeta por cada ruta nueva y Cerebro apunta a /cerebro", () => {
    for (const ruta of RUTAS_NUEVAS) {
      expect(AREAS.some((a) => a.path === ruta)).toBe(true);
    }
    expect(AREAS.some((a) => a.path === "/cerebro")).toBe(true);
    expect(AREAS.some((a) => a.path === "/cerebros")).toBe(false);
  });

  it("ninguna tarjeta habla de «varios cerebros»", () => {
    const tarjetas = AREAS.map((a) => `${a.label} ${a.tip}`).join(" ");
    expect(tarjetas.toLowerCase()).not.toContain("varios cerebros");
    for (const tema of TODOS_LOS_TEMAS) {
      expect(tema.cuerpo.toLowerCase()).not.toContain("varios cerebros");
    }
  });

  for (const [ruta, clave] of Object.entries(TEMA_POR_RUTA)) {
    it(`la tarjeta ${ruta} abre el tema ${clave}`, () => {
      const area = areaDeRuta(ruta);
      const tema = temaDeRuta(ruta);
      abrirExplicacion(area);

      expect(screen.getByText(tema.cuerpo)).toBeTruthy();
      for (const punto of tema.puntos) {
        expect(screen.getByText(punto)).toBeTruthy();
      }
      expect(screen.getByText(tema.preguntaAurora)).toBeTruthy();
    });
  }

  it("la tarjeta Cerebro no contiene el texto antiguo de varios cerebros", () => {
    abrirExplicacion(areaDeRuta("/cerebro"));
    expect(screen.queryByText(/varios cerebros/i)).toBeNull();
  });
});

