/**
 * GUI1021G · Las tarjetas de la Guía de la red usan los textos del §3 de
 * `architecture/guias-introduccion.md` (fuente única: `TODOS_LOS_TEMAS`).
 *
 * Cubre las rutas nuevas (Protomolécula, los tres pilares, Genesis y Cerebro),
 * las tres correcciones de la ola (Cerebros, Librería y Red Mesh) y que ya
 * ninguna tarjeta repita el «varios cerebros» que contradecía al código.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AreasExplicadas, RUTA_A_TEMA, explicacionDeTemaDeRuta } from "../areas-explicadas";
import { AREAS } from "../onboarding-wizard";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { AppearanceProvider } from "@/context/appearance-context";

/** Rutas que la ola añade a la Guía de la red. */
const RUTAS_NUEVAS = [
  "/protomolecula",
  "/network/politics",
  "/network/education",
  "/network/culture",
  "/genesis",
  "/cerebro",
] as const;

const tema = (clave: string) => TODOS_LOS_TEMAS.find((t) => t.key === clave);

afterEach(() => cleanup());

describe("Guía de la red · textos de los temas", () => {
  it("cada ruta nueva abre su ventana con el texto del tema", async () => {
    for (const ruta of RUTAS_NUEVAS) {
      const area = AREAS.find((a) => a.path === ruta);
      expect(area, ruta).toBeDefined();
      if (!area) continue;
      const { unmount } = render(
        <AppearanceProvider>
          <AreasExplicadas areas={[area]} onIr={() => {}} />
        </AppearanceProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: new RegExp(area.label) }));
      const esperado = explicacionDeTemaDeRuta(ruta);
      expect(esperado, ruta).not.toBeNull();
      expect(await screen.findByText(esperado?.queEs ?? "")).toBeInTheDocument();
      unmount();
    }
  });

  it("cada ruta nueva abre su explicación con el texto de §3", () => {
    for (const ruta of RUTAS_NUEVAS) {
      const clave = RUTA_A_TEMA[ruta];
      expect(clave, ruta).toBeTruthy();
      const explicacion = explicacionDeTemaDeRuta(ruta);
      expect(explicacion, ruta).not.toBeNull();
      const fuente = tema(clave);
      expect(fuente, clave).toBeDefined();
      expect(explicacion?.queEs).toBe(fuente?.cuerpo);
      expect(explicacion?.comoFunciona.map((p) => p.texto)).toEqual([...(fuente?.puntos ?? [])]);
      expect(explicacion?.empiezaPor).toBe(fuente?.preguntaAurora);
    }
  });

  it("Cerebros, Librería y Red Mesh usan los temas corregidos", () => {
    expect(RUTA_A_TEMA["/cerebros"]).toBe("neuronas-cerebro");
    expect(RUTA_A_TEMA["/cerebro"]).toBe("neuronas-cerebro");
    expect(RUTA_A_TEMA["/library"]).toBe("libreria-biblioteca");
    expect(RUTA_A_TEMA["/red-mesh"]).toBe("malla");
  });

  it("ninguna tarjeta ni explicación habla de «varios cerebros»", () => {
    const textos: string[] = [];
    for (const area of AREAS) textos.push(area.label, area.tip);
    for (const t of TODOS_LOS_TEMAS) textos.push(t.titulo, t.cuerpo, t.voz, ...t.puntos);
    for (const ruta of Object.keys(RUTA_A_TEMA)) {
      const explicacion = explicacionDeTemaDeRuta(ruta);
      if (!explicacion) continue;
      textos.push(
        explicacion.queEs,
        explicacion.empiezaPor,
        ...explicacion.comoFunciona.map((p) => p.texto),
      );
    }
    for (const texto of textos) {
      expect(texto.toLowerCase()).not.toContain("varios cerebros");
    }
  });

  it("las rutas nuevas tienen tarjeta con icono y tip corto", () => {
    for (const ruta of RUTAS_NUEVAS) {
      const area = AREAS.find((a) => a.path === ruta);
      expect(area, ruta).toBeDefined();
      expect(area?.icon).toBeTruthy();
      expect(area?.tip.trim().length).toBeGreaterThan(0);
    }
    expect(AREAS.some((a) => a.path === "/cerebros")).toBe(false);
  });
});
