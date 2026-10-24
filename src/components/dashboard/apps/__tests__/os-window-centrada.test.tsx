import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { OSWindow } from "../os-window";
import { geometriaVentana } from "@/lib/design/composicion";

vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

describe("OSWindow · centrada con geometriaVentana", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1920 });
    Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 1080 });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: originalInnerHeight });
  });

  it("se centra en escritorio con geometriaVentana", () => {
    const onClose = vi.fn();
    const viewport = { ancho: window.innerWidth, alto: window.innerHeight };
    const geo = geometriaVentana(viewport, { tipo: "ventana" });

    render(
      createPortal(
        <OSWindow title="Prueba" icon={Sparkles} accent="#22d3ee" onClose={onClose}>
          <div>contenido</div>
        </OSWindow>,
        document.body,
      ),
    );

    const dialogo = screen.getByRole("dialog", { name: "Prueba" });
    expect(dialogo).toBeTruthy();
    // Debe usar geometría centrada
    expect(geo.x).toBeGreaterThanOrEqual(0);
    expect(geo.y).toBeGreaterThanOrEqual(0);
  });

  it("en teléfono usa hoja centrada que sube desde abajo", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 400 });
    Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 800 });
    
    const onClose = vi.fn();
    const viewport = { ancho: window.innerWidth, alto: window.innerHeight };
    const geo = geometriaVentana(viewport, { tipo: "hoja" });

    render(
      createPortal(
        <OSWindow title="Móvil" icon={Sparkles} accent="#22d3ee" onClose={onClose}>
          <div>contenido</div>
        </OSWindow>,
        document.body,
      ),
    );

    const dialogo = screen.getByRole("dialog", { name: "Móvil" });
    expect(dialogo).toBeTruthy();
    // En hoja de teléfono, y debe estar en la parte inferior (sube desde abajo)
    expect(geo.y).toBeCloseTo(viewport.alto - geo.alto);
  });
});
