/**
 * GUI1021G · Las tarjetas de la Guía de la red usan la fuente única de textos.
 * Cada ruta nueva (/protomolecula, pilares, /genesis, /cerebro y las viejas
 * /cerebros, /library, /red-mesh) abre su explicación con los textos de
 * `TODOS_LOS_TEMAS` (§3 de architecture/guias-introduccion.md) y ninguna
 * tarjeta habla de «varios cerebros». Combina lo que main ya probaba (la
 * explicación preferente, el revoido por defecto y «Ir a») con el trabajo de
 * la nube (temas nuevos y Cerebro → /cerebro).
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
const areaNueva = (path: string, label: string): AreaTip => ({
  path,
  label,
  icon: Sparkles,
  tip: TIP,
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

function abrir(a: AreaTip, onIr: (path: string) => void = () => {}): void {
  render(
    <AppearanceProvider>
      <AreasExplicadas areas={[a]} onIr={onIr} />
    </AppearanceProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: new RegExp(a.label) }));
}

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
      const explicacion = explicacionDe(areaNueva(ruta, label));
      expect(explicacion.queEs).toBe(tema.cuerpo);
      expect(explicacion.comoFunciona.map((p) => p.texto)).toEqual([...tema.puntos]);
      expect(explicacion.empiezaPor).toBe(tema.preguntaAurora);
    }
  });

  it("cada ruta nueva abre su explicación al pulsar la tarjeta", () => {
    for (const [ruta, label] of RUTAS) {
      const tema = temaDe(ruta);
      if (!tema) continue;
      abrir(areaNueva(ruta, label));
      const dialogo = screen.getByRole("dialog");
      expect(within(dialogo).getByText(tema.cuerpo)).toBeInTheDocument();
      for (const punto of tema.puntos) {
        expect(within(dialogo).getByText(punto)).toBeInTheDocument();
      }
      expect(within(dialogo).getByText(tema.preguntaAurora)).toBeInTheDocument();
      cleanup();
    }
  });

  it("Librería, Red Mesh y el antiguo /cerebros también usan sus temas", () => {
    expect(TEMA_POR_RUTA["/library"]).toBe("libreria-biblioteca");
    expect(TEMA_POR_RUTA["/red-mesh"]).toBe("malla");
    expect(TEMA_POR_RUTA["/cerebros"]).toBe("neuronas-cerebro");
    expect(explicacionDe(areaNueva("/library", "Librería y Biblioteca")).queEs).toBe(
      temaDe("/library")?.cuerpo,
    );
    expect(explicacionDe(areaNueva("/red-mesh", "Redes mesh")).queEs).toBe(
      temaDe("/red-mesh")?.cuerpo,
    );
  });

  it("una ruta sin ficha propia cae en su tip y en cómo empezar, sin ventana vacía", () => {
    abrir(areaNueva("/ruta-sin-ficha", "Ruta rara"));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText(TIP)).toBeInTheDocument();
    expect(within(dialogo).getByText("Abre Ruta rara y mira a tu alrededor sin miedo.")).toBeInTheDocument();
  });

  it("«Ir a» navega a la ruta de la tarjeta abierta", () => {
    const onIr = vi.fn();
    abrir(areaNueva("/cerebro", "Cerebro"), onIr);
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: /Ir a Cerebro/ }));
    expect(onIr).toHaveBeenCalledWith("/cerebro");
  });

  it("ninguna tarjeta habla de «varios cerebros»", () => {
    const texto = AREAS.map((a) => `${a.label} ${a.tip}`).join(" ");
    expect(texto).not.toMatch(/varios cerebros/i);
    expect(AREAS.some((a) => a.path === "/cerebros")).toBe(false);
    expect(AREAS.find((a) => a.path === "/cerebro")?.tip).toMatch(/un cerebro por cuenta/i);
  });
});
