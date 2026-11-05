import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { VoiceOssPanel } from "../voice-oss-panel";
import { AppearanceProvider } from "@/context/appearance-context";

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe("VoiceOssPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  it("se renderiza sin errores", () => {
    const { container } = render(
      <AppearanceProvider>
        <VoiceOssPanel />
      </AppearanceProvider>
    );
    expect(container).toBeDefined();
  });

  it("muestra el interruptor de Oído en la nube", () => {
    render(
      <AppearanceProvider>
        <VoiceOssPanel />
      </AppearanceProvider>
    );
    expect(screen.getAllByText("Oído en la nube")[0]).toBeDefined();
  });

  it("muestra el estado del oído (navegador por defecto)", () => {
    render(
      <AppearanceProvider>
        <VoiceOssPanel />
      </AppearanceProvider>
    );
    expect(screen.getAllByText(/Sin voz previa/)[0]).toBeDefined();
  });

  it("el interruptor controla el estado de oído en la nube (está encendido por defecto)", () => {
    render(
      <AppearanceProvider>
        <VoiceOssPanel />
      </AppearanceProvider>
    );
    const checkboxes = screen.getAllByRole("checkbox", { name: /Encendido/i });
    expect(checkboxes[0]).toHaveProperty("checked", true);
  });
});