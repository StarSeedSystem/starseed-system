/**
 * Rescate RTIMN1021I · las tarjetas de la Guía de la red siguen abriendo su explicación.
 * ─────────────────────────────────────────────────────────────────────────────
 * La rama nube/40145158800 cruzaba cada tarjeta con un «tema» y exigía que Cerebro apuntara a
 * `/cerebro` y que no se hablara de «varios cerebros». Main cambió ese contrato a propósito: el
 * área es `/cerebros` y su texto explica los varios cerebros por cuenta. Se descarta esa parte y
 * se rescata lo que sigue siendo cierto: cada ruta de la guía tiene su tarjeta y su explicación
 * propia (no la genérica), y «Ir a…» lleva a su ruta.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { Sparkles } from "lucide-react";

import { AppearanceProvider } from "@/context/appearance-context";
import { AreasExplicadas, type AreaTip } from "@/components/onboarding/areas-explicadas";

const RUTAS: { path: string; label: string }[] = [
  { path: "/agent", label: "Agente · Aurora" },
  { path: "/memorias", label: "Memorias" },
  { path: "/cerebros", label: "Cerebros" },
  { path: "/decisiones", label: "Decisiones" },
  { path: "/pizarra", label: "Pizarra" },
  { path: "/navegador", label: "Navegador" },
  { path: "/conexiones", label: "Conexiones" },
  { path: "/correos", label: "Correos · @star.seed" },
  { path: "/seguridad", label: "Seguridad" },
  { path: "/library", label: "Biblioteca" },
  { path: "/hub", label: "Hub · Comunidades" },
  { path: "/crear", label: "Crear · Lienzo Universal" },
  { path: "/profile", label: "Perfil" },
  { path: "/escritorios", label: "Escritorios" },
  { path: "/red-mesh", label: "Red Mesh" },
];

const area = ({ path, label }: { path: string; label: string }): AreaTip => ({
  path,
  label,
  icon: Sparkles,
  accent: "text-cyan-300",
  tip: `Entrar en ${label}`,
});

afterEach(() => cleanup());

describe("AreasExplicadas · una tarjeta por ruta con su explicación", () => {
  it.each(RUTAS)("la tarjeta $path abre su explicación y «Ir a…» navega a $path", ({ path, label }) => {
    const irA = vi.fn();
    render(
      <AppearanceProvider>
        <AreasExplicadas areas={[area({ path, label })]} onIr={irA} />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));

    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText("Qué es")).toBeTruthy();
    expect(within(dialogo).getByText("Cómo funciona")).toBeTruthy();
    expect(within(dialogo).getByText("Empieza por")).toBeTruthy();
    expect(within(dialogo).queryByText(/Entra y explora: la zona se explica sola/)).toBeNull();

    fireEvent.click(within(dialogo).getByRole("button", { name: /^Ir a / }));
    expect(irA).toHaveBeenCalledWith(path);
  });
});
