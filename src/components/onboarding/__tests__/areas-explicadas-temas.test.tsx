/**
 * Rescate RTIMN1021I · tarjetas de la Guía de la red.
 *
 * La rama `nube/40145158800` probaba que cada tarjeta abría un tema de `TODOS_LOS_TEMAS` y que
 * Cerebro iba a `/cerebro`. Main cambió ese contrato a propósito: `AreasExplicadas` mantiene sus
 * explicaciones propias (`EXPLICACIONES`) y la ruta plural `/cerebros`. Se conserva lo que main
 * sí hace y nadie probaba: la tarjeta abre su explicación y «Ir a» navega a su ruta.
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
  it("la tarjeta /library abre la explicación real de la Biblioteca", () => {
    abrir(area("/library"));
    const dialogo = screen.getByRole("dialog");

    expect(within(dialogo).getByText(/La biblioteca universal de la red/)).toBeInTheDocument();
    expect(within(dialogo).getByText("Instala apps y recursos con un clic; aparecen en tu dock y catálogo.")).toBeInTheDocument();
    expect(within(dialogo).getByText("Explora la biblioteca e instala una app que te llame la atención.")).toBeInTheDocument();
  });

  it("una ruta sin ficha propia cae en su tip y en cómo empezar, sin ventana vacía", () => {
    abrir(area("/ruta-sin-ficha", "Ruta rara"));
    const dialogo = screen.getByRole("dialog");

    expect(within(dialogo).getByText(TIP)).toBeInTheDocument();
    expect(within(dialogo).getByText("Abre Ruta rara y mira a tu alrededor sin miedo.")).toBeInTheDocument();
  });

  it("«Ir a» navega a la ruta de la tarjeta abierta", () => {
    const onIr = vi.fn();
    abrir(area("/cerebros", "Cerebros"), onIr);
    const dialogo = screen.getByRole("dialog");

    fireEvent.click(within(dialogo).getByRole("button", { name: /Ir a Cerebros/ }));
    expect(onIr).toHaveBeenCalledWith("/cerebros");
  });
});
