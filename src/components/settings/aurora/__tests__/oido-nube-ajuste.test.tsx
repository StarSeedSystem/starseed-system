"use client";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { VoiceOssPanel } from "@/components/settings/aurora/voice-oss-panel";
import { AppearanceProvider } from "@/context/appearance-context";

const renderWithProviders = (ui: React.ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);

describe("VoiceOssPanel — Oído en la nube", () => {
  const originalLocalStorage = global.localStorage;
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    if (!("ResizeObserver" in globalThis)) {
      (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    mockLocalStorage = {};
    global.localStorage = {
      ...originalLocalStorage,
      getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorage[key];
      }),
      clear: vi.fn(() => {
        mockLocalStorage = {};
      }),
    } as unknown as Storage;

    vi.useFakeTimers();
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("renderiza el interruptor «Oído en la nube (Groq Whisper o Gemini)»", () => {
    renderWithProviders(<VoiceOssPanel />);
    const checkboxes = screen.getAllByRole("checkbox", { name: /oído en la nube/i });
    expect(checkboxes.length).toBeGreaterThan(0);
    expect(checkboxes[0]).toBeInTheDocument();
  });

  it("el interruptor está activado por defecto (localStorage no tiene la clave)", () => {
    renderWithProviders(<VoiceOssPanel />);
    const checkboxes = screen.getAllByRole("checkbox", { name: /oído en la nube/i });
    expect(checkboxes.length).toBeGreaterThan(0);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
  });

  it("el interruptor está desactivado si localStorage['starseed.oido.nube'] === '0'", () => {
    mockLocalStorage["starseed.oido.nube"] = "0";
    renderWithProviders(<VoiceOssPanel />);
    const checkboxes = screen.getAllByRole("checkbox", { name: /oído en la nube/i });
    expect(checkboxes.length).toBeGreaterThan(0);
    // El último checkbox renderizado refleja el estado actual
    expect((checkboxes[checkboxes.length - 1] as HTMLInputElement).checked).toBe(false);
  });

  it("cambiar el interruptor guarda en localStorage['starseed.oido.nube']", () => {
    renderWithProviders(<VoiceOssPanel />);
    const checkboxes = screen.getAllByRole("checkbox", { name: /oído en la nube/i });
    expect(checkboxes.length).toBeGreaterThan(0);
    fireEvent.click(checkboxes[0]);
    
    expect(global.localStorage.setItem).toHaveBeenCalledWith("starseed.oido.nube", "0");
  });

  it("muestra línea honesta: el audio de cada tramo se manda a transcribir y no se guarda", () => {
    renderWithProviders(<VoiceOssPanel />);
    const honestLine = screen.getAllByText(/el audio de cada tramo se manda a transcribir y no se guarda/i);
    expect(honestLine.length).toBeGreaterThan(0);
  });

  it("muestra línea de estado: qué oído usa este dispositivo y qué voz habló la última vez", () => {
    mockLocalStorage["starseed.aurora.voice.motor-vivo.v1"] = "kokoro";
    renderWithProviders(<VoiceOssPanel />);
    
    const deviceLines = screen.getAllByText(/oído en este dispositivo/i);
    expect(deviceLines.length).toBeGreaterThan(0);
    const lastLines = screen.getAllByText(/última voz que sonó/i);
    expect(lastLines.length).toBeGreaterThan(0);
  });

  it("la línea de estado refleja motor-vivo si existe", () => {
    mockLocalStorage["starseed.aurora.voice.motor-vivo.v1"] = "omnivoice";
    renderWithProviders(<VoiceOssPanel />);
    
    const statusLines = screen.getAllByText(/última voz que sonó/i);
    expect(statusLines.length).toBeGreaterThan(0);
    const lastStatus = statusLines[statusLines.length - 1];
    expect(lastStatus.textContent?.toLowerCase()).toContain("omnivoice");
  });
});

describe("funciones puras de oído en la nube", () => {
  it("apagado() devuelve true si localStorage['starseed.oido.nube'] === '0'", async () => {
    const { apagado } = await import("@/lib/aurora/stt-oss/oido-nube");
    
    global.localStorage.setItem("starseed.oido.nube", "0");
    expect(apagado()).toBe(true);
    
    global.localStorage.setItem("starseed.oido.nube", "1");
    expect(apagado()).toBe(false);
    
    global.localStorage.removeItem("starseed.oido.nube");
    expect(apagado()).toBe(false);
  });
});