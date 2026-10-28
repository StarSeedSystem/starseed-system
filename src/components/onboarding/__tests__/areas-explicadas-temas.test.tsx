/**
 * Pruebas de las tarjetas de la Guía de la red (GUI1021G).
 *
 * Cada tarjeta abre su explicación tomada de `TODOS_LOS_TEMAS` (fuente única de textos)
 * y «Ir a» navega a la ruta de la tarjeta. La ruta `/cerebros` cambió a `/cerebro`
 * y usa el tema `neuronas-cerebro`. Las rutas nuevas del §3 de `architecture/guias-introduccion.md`
 * (protomolecula, network/politics, network/education, network/culture, genesis, cerebro,
 * library, red-mesh) usan sus temas correspondientes.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { Sparkles } from "lucide-react";

import { AppearanceProvider } from "@/context/appearance-context";
import { AreasExplicadas, type AreaTip } from "../areas-explicadas";

afterEach(() => cleanup());

const TIP = "Crear: instala apps, skills y recursos de la colección común.";

function area(path: string, label = "Biblioteca"): AreaTip {
  return { path, label, icon: Sparkles, tip: TIP, accent: "text-white" };
}

function abrir(a: AreaTip, onIr: (path: string) => void = () => {}): void {
  render(
    <AppearanceProvider>
      <AreasExplicadas areas={[a]} onIr={onIr} />
    </AppearanceProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: new RegExp(a.label) }));
}

describe("Guía de la red · la tarjeta abre su explicación", () => {
  it("la tarjeta /library abre la explicación del tema libreria-biblioteca", () => {
    abrir(area("/library"));
    const dialogo = screen.getByRole("dialog");

    expect(within(dialogo).getByText(/La Librería es el catálogo en línea de toda la red/)).toBeInTheDocument();
    expect(within(dialogo).getByText("instalar y actualizar solas")).toBeInTheDocument();
    expect(within(dialogo).getByText("Aurora, abre la Librería")).toBeInTheDocument();
  });

  it("la tarjeta /cerebro abre la explicación del tema neuronas-cerebro", () => {
    abrir(area("/cerebro", "Neuronas y cerebro"));
    const dialogo = screen.getByRole("dialog");

    expect(within(dialogo).getByText(/Cada aparato donde usas StarSeed es una neurona/)).toBeInTheDocument();
    expect(within(dialogo).getByText("neurona = aparato, medio = forma de abrirlo")).toBeInTheDocument();
    expect(within(dialogo).getByText("Aurora, abre mi cerebro")).toBeInTheDocument();
  });

  it("la tarjeta /protomolecula abre la explicación del tema protomolecula", () => {
    abrir(area("/protomolecula", "Protomolécula"));
    const dialogo = screen.getByRole("dialog");

    expect(within(dialogo).getByText(/La Protomolécula es la función universal de creación/)).toBeInTheDocument();
    expect(within(dialogo).getByText("átomos = herramientas, con su grado de integración")).toBeInTheDocument();
    expect(within(dialogo).getByText("Aurora, abre la Protomolécula")).toBeInTheDocument();
  });

  it("la tarjeta /network/politics abre la explicación del tema pilar-politica", () => {
    abrir(area("/network/politics", "Política"));
    const dialogo = screen.getByRole("dialog");

    expect(within(dialogo).getByText(/Aquí no hay representantes/)).toBeInTheDocument();
    expect(within(dialogo).getByText("voto líquido revocable")).toBeInTheDocument();
    expect(within(dialogo).getByText("Aurora, llévame a Política")).toBeInTheDocument();
  });

  it("la tarjeta /network/education abre la explicación del tema pilar-educacion", () => {
    abrir(area("/network/education", "Educación"));
    const dialogo = screen.getByRole("dialog");

    expect(within(dialogo).getByText(/La red de categorías y temas y el Mapa del Conocimiento/)).toBeInTheDocument();
    expect(within(dialogo).getByText("mapa del conocimiento")).toBeInTheDocument();
    expect(within(dialogo).getByText("Aurora, llévame a Educación")).toBeInTheDocument();
  });

  it("la tarjeta /network/culture abre la explicación del tema pilar-cultura", () => {
    abrir(area("/network/culture", "Cultura"));
    const dialogo = screen.getByRole("dialog");

    expect(within(dialogo).getByText(/Publica y crea en el Lienzo Universal/)).toBeInTheDocument();
    expect(within(dialogo).getByText("crear en el Lienzo o la pizarra")).toBeInTheDocument();
    expect(within(dialogo).getByText("Aurora, llévame a Cultura")).toBeInTheDocument();
  });

  it("la tarjeta /genesis abre la explicación del tema genesis", () => {
    abrir(area("/genesis", "Genesis"));
    const dialogo = screen.getByRole("dialog");

    expect(within(dialogo).getByText(/Genesis es tu taller del sistema/)).toBeInTheDocument();
    expect(within(dialogo).getByText("Mi Genesis")).toBeInTheDocument();
    expect(within(dialogo).getByText("Aurora, abre Genesis")).toBeInTheDocument();
  });

  it("la tarjeta /red-mesh abre la explicación del tema malla", () => {
    abrir(area("/red-mesh", "Red Mesh"));
    const dialogo = screen.getByRole("dialog");

    expect(within(dialogo).getByText(/Tus aparatos forman una malla/)).toBeInTheDocument();
    expect(within(dialogo).getByText("autovínculo de tus neuronas")).toBeInTheDocument();
    expect(within(dialogo).getByText("Aurora, abre la red mesh")).toBeInTheDocument();
  });

  it("una ruta sin ficha propia cae en su tip y en cómo empezar, sin ventana vacía", () => {
    abrir(area("/ruta-sin-ficha", "Ruta rara"));
    const dialogo = screen.getByRole("dialog");

    expect(within(dialogo).getByText(TIP)).toBeInTheDocument();
    expect(within(dialogo).getByText("Abre Ruta rara y mira a tu alrededor sin miedo.")).toBeInTheDocument();
  });

  it("«Ir a» navega a la ruta de la tarjeta abierta", () => {
    const onIr = vi.fn();
    abrir(area("/cerebro", "Neuronas y cerebro"), onIr);
    const dialogo = screen.getByRole("dialog");

    fireEvent.click(within(dialogo).getByRole("button", { name: /Ir a Neuronas y cerebro/ }));
    expect(onIr).toHaveBeenCalledWith("/cerebro");
  });

  it("ninguna tarjeta menciona «varios cerebros»", () => {
    abrir(area("/cerebro", "Neuronas y cerebro"));
    const dialogo = screen.getByRole("dialog");

    expect(within(dialogo).queryByText(/varios cerebros/i)).not.toBeInTheDocument();
    expect(within(dialogo).queryByText(/varios cerebros/i)).not.toBeInTheDocument();
  });
});
