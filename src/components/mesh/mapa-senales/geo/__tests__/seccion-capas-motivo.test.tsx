import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as renderCrudo, screen } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { SeccionCapas } from "../seccion-capas";
import type { EstadoCapas } from "@/lib/senales/geo/capas";

const ESTADO: EstadoCapas = { activas: [], opacidad: {} };

const BASE = {
  onAlternar: vi.fn(),
  onOpacidad: vi.fn(),
  permiso: "desconocido" as const,
  compartir: false,
  canal: { union: "sin-intentar" as const, motivo: "todavía no se intentó unir el canal privado de posición" },
  onCompartir: vi.fn(),
  onUbicarme: vi.fn(),
};

const render = (publicadas?: { estado: "ok" | "sin-tabla" | "sin-sesion" | "error"; motivo?: string }) =>
  renderCrudo(
    <AppearanceProvider>
      <SeccionCapas estado={ESTADO} {...BASE} publicadas={publicadas} />
    </AppearanceProvider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SeccionCapas: el panel dice el motivo si la lectura de señales publicadas falla (AUD1117)", () => {
  it("con error de lectura, el grupo «red» del panel dice el motivo completo", () => {
    render({ estado: "error", motivo: "permission denied" });
    const motivo = screen.getByTestId("motivo-publicadas-panel");
    expect(motivo).toHaveTextContent("Señales publicadas de la red: permission denied.");
  });

  it("si la tabla no existe, el panel dice el motivo en vez de pintar cero", () => {
    render({ estado: "sin-tabla", motivo: "la tabla os_senales_publicas no existe en este proyecto" });
    expect(screen.getByTestId("motivo-publicadas-panel")).toHaveTextContent("os_senales_publicas");
  });

  it("sin sesión, el panel también lo dice", () => {
    render({ estado: "sin-sesion", motivo: "no hay cliente de Supabase (sesión no iniciada)" });
    expect(screen.getByTestId("motivo-publicadas-panel")).toHaveTextContent(/Supabase/);
  });

  it("con la lectura bien, el panel no dice ningún motivo", () => {
    render({ estado: "ok" });
    expect(screen.queryByTestId("motivo-publicadas-panel")).not.toBeInTheDocument();
  });

  it("sin lectura alguna no se inventa ningún motivo", () => {
    render(undefined);
    expect(screen.queryByTestId("motivo-publicadas-panel")).not.toBeInTheDocument();
  });
});
