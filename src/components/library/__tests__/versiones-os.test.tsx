import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { FichaVersionesOS } from "../versiones-os";
import { OS_VERSION, OS_FECHA, formatearFechaBuild } from "@/lib/version/os-release";

// Mock de la API de versiones (simulamos la respuesta)
vi.mock("@/lib/version/os-release", async () => {
  const actual = await vi.importActual<typeof import("@/lib/version/os-release")>("@/lib/version/os-release");
  return {
    ...actual,
    OS_VERSION: "v1.0.0",
    OS_FECHA: "2026-11-05",
    formatearFechaBuild: (fecha: string) => fecha,
  };
});

// Mock del componente GlassCard
vi.mock("@/components/ui/glass-card", () => ({
  GlassCard: ({ children }: { children: React.ReactNode }) => <div data-testid="glass-card">{children}</div>,
}));

// Mock del componente Button
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) => (
    <button data-testid="button" {...props}>{children}</button>
  ),
}));

// Mock del componente Badge
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span data-testid="badge">{children}</span>,
}));

// Mock de los iconos
vi.mock("lucide-react", () => ({
  Download: () => <div data-testid="download-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  History: () => <div data-testid="history-icon" />,
  Shield: () => <div data-testid="shield-icon" />,
}));

describe("FichaVersionesOS", () => {
  it("muestra la versión actual y el historial", () => {
    const { unmount } = render(<FichaVersionesOS />);

    // Verifica que se muestre la versión actual
    expect(screen.getByText("StarSeed OS v1.0.0")).toBeTruthy();
    expect(screen.getByText("Instalada: 2026-11-05")).toBeTruthy();

    // Verifica que se muestre el historial
    expect(screen.getByText("v0.8.0")).toBeTruthy();
    expect(screen.getByText("2026-10-01")).toBeTruthy();
    expect(screen.getByText("v0.7.5")).toBeTruthy();
    expect(screen.getByText("2026-09-15")).toBeTruthy();
    
    unmount();
  });

  it("muestra el botón de comprobar actualizaciones", () => {
    const { unmount } = render(<FichaVersionesOS />);
    expect(screen.getByText("Comprobar actualizaciones")).toBeTruthy();
    unmount();
  });
});
