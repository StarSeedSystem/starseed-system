/**
 * Pruebas del interruptor "Oído en la nube" y línea de estado de oído/voz (VOZ1105E).
 * Render + interruptor + estado: sin GPU, sin red, sin disco; localStorage inyectado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { VoiceOssPanel } from "../voice-oss-panel";
import { CLAVE_APAGADO } from "@/lib/aurora/stt-oss/oido-nube";
import { AppearanceProvider } from "@/context/appearance-context";

// Mock de localStorage controlado
const createMockStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    get length() { return store.size; },
    key: vi.fn((i: number) => Array.from(store.keys())[i] ?? null),
  };
};

// Mock de motorQueSono
vi.mock("@/lib/aurora/tts-oss/speak-router", () => ({
  motorQueSono: vi.fn(() => null),
}));

// Mock de oidoNubeListoYa
vi.mock("@/lib/aurora/stt-oss/oido-nube", () => ({
  CLAVE_APAGADO: "starseed.oido.nube",
  oidoNubeListoYa: vi.fn(() => false),
}));

import { motorQueSono } from "@/lib/aurora/tts-oss/speak-router";
import { oidoNubeListoYa } from "@/lib/aurora/stt-oss/oido-nube";

describe("VoiceOssPanel · Oído en la nube y estado", () => {
  let mockStorage: ReturnType<typeof createMockStorage>;
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    vi.useFakeTimers();
    mockStorage = createMockStorage();
    global.localStorage = mockStorage as unknown as Storage;
    localStorage.clear();
    cleanup();
    vi.clearAllMocks();
    // Default mocks
    (motorQueSono as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (oidoNubeListoYa as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    global.localStorage = originalLocalStorage;
    cleanup();
  });

  const renderPanel = () => render(<AppearanceProvider><VoiceOssPanel /></AppearanceProvider>);

  it("renderiza el interruptor 'Oído en la nube' y está ENCENDIDO por defecto", () => {
    renderPanel();
    const toggle = screen.getByRole("switch", { name: /oído en la nube/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toBeChecked();
    // localStorage NO tiene la clave (default encendido)
    expect(localStorage.getItem(CLAVE_APAGADO)).toBeNull();
  });

  it("apagar el interruptor guarda '0' en localStorage y el switch se desmarca", () => {
    renderPanel();
    const toggle = screen.getByRole("switch", { name: /oído en la nube/i });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(localStorage.getItem(CLAVE_APAGADO)).toBe("0");
  });

  it("encender el interruptor borra la clave (o pone '1') y el switch se marca", () => {
    localStorage.setItem(CLAVE_APAGADO, "0");
    renderPanel();
    const toggle = screen.getByRole("switch", { name: /oído en la nube/i });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    // La clave se borra o se pone a "1" (encendido = no hay clave o "1")
    const valor = localStorage.getItem(CLAVE_APAGADO);
    expect(valor === null || valor === "1").toBe(true);
  });

  it("muestra línea honesta: 'El audio de cada tramo se manda a transcribir y no se guarda'", () => {
    renderPanel();
    expect(screen.getByText(/el audio de cada tramo se manda a transcribir y no se guarda/i)).toBeInTheDocument();
  });

  it("muestra línea de estado: qué oído usa este dispositivo", () => {
    renderPanel();
    // Debe mostrar qué oído está activo (navegador, nube, etc.)
    expect(screen.getByText(/oído activo/i)).toBeInTheDocument();
  });

  it("muestra línea de estado: qué voz habló la última vez (motorQueSono)", () => {
    (motorQueSono as ReturnType<typeof vi.fn>).mockReturnValue("kokoro");

    renderPanel();
    // Buscar el contenedor "Estado actual" (el div padre) y verificar que contiene "Última voz: kokoro"
    const estadoHeader = screen.getByText(/estado actual/i);
    const estadoContainer = estadoHeader.parentElement?.parentElement; // div.rounded-xl
    expect(estadoContainer).toBeInTheDocument();
    expect(estadoContainer?.textContent).toContain("Última voz");
    expect(estadoContainer?.textContent).toContain("kokoro");
  });

  it("si no ha habido voz previa, la línea de estado lo indica honestamente", () => {
    (motorQueSono as ReturnType<typeof vi.fn>).mockReturnValue(null);

    renderPanel();
    expect(screen.getByText(/aún no ha habido voz/i)).toBeInTheDocument();
  });

  it("el interruptor reacciona a cambios en localStorage desde otra pestaña (evento storage)", () => {
    const { rerender } = renderPanel();
    let toggle = screen.getByRole("switch", { name: /oído en la nube/i });
    expect(toggle).toBeChecked();

    // Simular cambio en otra pestaña
    fireEvent(window, new StorageEvent("storage", { key: CLAVE_APAGADO, newValue: "0" }));
    toggle = screen.getByRole("switch", { name: /oído en la nube/i });
    expect(toggle).not.toBeChecked();
  });
});