import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { auroraTranscript, auroraBridge, parseVoiceCommand } from "../aurora-guide-voice";

describe("aurora-guide-voice · auroraTranscript", () => {
  const originalWindow = global.window;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    global.window = { ...originalWindow } as Window & typeof globalThis;
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  it("devuelve transcript + interim cuando el puente y getState existen", () => {
    global.window = {
      ...originalWindow,
      STARSEED_AURORA: {
        getState: () => ({ transcript: "hola mundo", interim: "..." }),
      },
    } as unknown as Window & typeof globalThis;

    const resultado = auroraTranscript();
    expect(resultado).toBe("hola mundo ...");
  });

  it("devuelve solo transcript cuando no hay interim", () => {
    global.window = {
      ...originalWindow,
      STARSEED_AURORA: {
        getState: () => ({ transcript: "siguiente", interim: "" }),
      },
    } as unknown as Window & typeof globalThis;

    const resultado = auroraTranscript();
    expect(resultado).toBe("siguiente");
  });

  it("devuelve cadena vacía cuando no hay puente", () => {
    global.window = { ...originalWindow } as unknown as Window & typeof globalThis;

    const resultado = auroraTranscript();
    expect(resultado).toBe("");
  });

  it("devuelve cadena vacía cuando getState devuelve null", () => {
    global.window = {
      ...originalWindow,
      STARSEED_AURORA: {
        getState: () => null,
      },
    } as unknown as Window & typeof globalThis;

    const resultado = auroraTranscript();
    expect(resultado).toBe("");
  });

  it("registra advertencia y devuelve cadena vacía cuando getState lanza error", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    global.window = {
      ...originalWindow,
      STARSEED_AURORA: {
        getState: () => {
          throw new Error("getState falló");
        },
      },
    } as unknown as Window & typeof globalThis;

    const resultado = auroraTranscript();
    expect(resultado).toBe("");
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("[aurora-guide-voice]"),
      expect.any(Error)
    );
    consoleWarn.mockRestore();
  });

  it("devuelve cadena vacía cuando transcript e interim están vacíos", () => {
    global.window = {
      ...originalWindow,
      STARSEED_AURORA: {
        getState: () => ({ transcript: "", interim: "" }),
      },
    } as unknown as Window & typeof globalThis;

    const resultado = auroraTranscript();
    expect(resultado).toBe("");
  });
});

describe("aurora-guide-voice · parseVoiceCommand", () => {
  it("detecta comando siguiente", () => {
    expect(parseVoiceCommand("siguiente")).toBe("next");
    expect(parseVoiceCommand("continúa")).toBe("next");
    expect(parseVoiceCommand("avanza")).toBe("next");
    expect(parseVoiceCommand("next")).toBe("next");
  });

  it("detecta comando anterior", () => {
    expect(parseVoiceCommand("anterior")).toBe("prev");
    expect(parseVoiceCommand("atrás")).toBe("prev");
    expect(parseVoiceCommand("vuelve")).toBe("prev");
    expect(parseVoiceCommand("back")).toBe("prev");
  });

  it("detecta comando cerrar", () => {
    expect(parseVoiceCommand("cerrar")).toBe("close");
    expect(parseVoiceCommand("salir")).toBe("close");
    expect(parseVoiceCommand("terminar")).toBe("close");
    expect(parseVoiceCommand("listo")).toBe("close");
  });

  it("devuelve null para texto sin comandos", () => {
    expect(parseVoiceCommand("hola mundo")).toBeNull();
    expect(parseVoiceCommand("")).toBeNull();
    expect(parseVoiceCommand("   ")).toBeNull();
  });

  it("ignora mayúsculas y tildes", () => {
    expect(parseVoiceCommand("SIGUIENTE")).toBe("next");
    expect(parseVoiceCommand("Continúa")).toBe("next");
    expect(parseVoiceCommand("ATRÁS")).toBe("prev");
  });

  it("prioriza cerrar sobre anterior y siguiente", () => {
    expect(parseVoiceCommand("cierra y siguiente")).toBe("close");
    expect(parseVoiceCommand("anterior y cerrar")).toBe("close");
  });

  it("mira solo las últimas 4 palabras", () => {
    expect(parseVoiceCommand("hola mundo siguiente")).toBe("next");
    expect(parseVoiceCommand("siguiente hola mundo algo mas")).toBeNull();
  });
});