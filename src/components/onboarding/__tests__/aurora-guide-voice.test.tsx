import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { auroraTranscript, parseVoiceCommand } from "../aurora-guide-voice";

describe("aurora-guide-voice · auroraTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-ignore
    delete window.STARSEED_AURORA;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-ignore
    delete window.STARSEED_AURORA;
  });

  it("devuelve transcript + interim cuando el puente está disponible y getState funciona", () => {
    // @ts-ignore
    window.STARSEED_AURORA = {
      getState: () => ({ transcript: "hola", interim: "mundo" }),
    };

    const result = auroraTranscript();

    // El resultado es "hola mundo" (transcript + espacio + interim)
    expect(result).toBe("hola mundo");
  });

  it("devuelve solo transcript cuando no hay interim", () => {
    // @ts-ignore
    window.STARSEED_AURORA = {
      getState: () => ({ transcript: "hola", interim: "" }),
    };

    const result = auroraTranscript();

    // Con interim vacío, devuelve "hola " (con espacio final por la concatenación)
    expect(result).toBe("hola ");
  });

  it("devuelve solo interim cuando no hay transcript", () => {
    // @ts-ignore
    window.STARSEED_AURORA = {
      getState: () => ({ transcript: "", interim: "mundo" }),
    };

    const result = auroraTranscript();

    // Con transcript vacío, devuelve " mundo" (con espacio inicial)
    expect(result).toBe(" mundo");
  });

  it("devuelve string vacío cuando el puente no existe", () => {
    // @ts-ignore
    window.STARSEED_AURORA = undefined;

    const result = auroraTranscript();

    expect(result).toBe("");
  });

  it("devuelve string vacío cuando getState no existe", () => {
    // @ts-ignore
    window.STARSEED_AURORA = {};

    const result = auroraTranscript();

    expect(result).toBe("");
  });

  it("devuelve string vacío y loguea el error cuando getState lanza", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // @ts-ignore
    window.STARSEED_AURORA = {
      getState: () => {
        throw new Error("boom");
      },
    };

    const result = auroraTranscript();

    expect(result).toBe("");
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("[aurora-guide-voice] Error en auroraTranscript:"),
      expect.any(Error)
    );
    consoleError.mockRestore();
  });
});

describe("aurora-guide-voice · parseVoiceCommand", () => {
  it("detecta 'siguiente' en el transcript", () => {
    expect(parseVoiceCommand("usuario dice siguiente")).toBe("next");
  });

  it("detecta 'continúa' con tilde", () => {
    expect(parseVoiceCommand("continúa por favor")).toBe("next");
  });

  it("detecta 'continua' sin tilde", () => {
    expect(parseVoiceCommand("continua")).toBe("next");
  });

  it("detecta 'anterior'", () => {
    expect(parseVoiceCommand("vuelve al anterior")).toBe("prev");
  });

  it("detecta 'atrás' con tilde", () => {
    expect(parseVoiceCommand("atrás")).toBe("prev");
  });

  it("detecta 'cerrar'", () => {
    expect(parseVoiceCommand("cierra la guía")).toBe("close");
  });

  it("detecta 'salir'", () => {
    expect(parseVoiceCommand("salir")).toBe("close");
  });

  it("prioriza cerrar sobre anterior sobre siguiente", () => {
    expect(parseVoiceCommand("siguiente cerrar")).toBe("close");
    expect(parseVoiceCommand("anterior cerrar")).toBe("close");
    expect(parseVoiceCommand("anterior siguiente")).toBe("prev");
  });

  it("ignora mayúsculas y tildes", () => {
    expect(parseVoiceCommand("SIGUIENTE")).toBe("next");
    expect(parseVoiceCommand("AnTeRiOr")).toBe("prev");
    expect(parseVoiceCommand("CeRrAr")).toBe("close");
  });

  it("devuelve null para transcript vacío", () => {
    expect(parseVoiceCommand("")).toBeNull();
    expect(parseVoiceCommand("   ")).toBeNull();
  });

  it("devuelve null para texto sin comandos", () => {
    expect(parseVoiceCommand("hola mundo")).toBeNull();
  });

  it("mira solo las últimas 4 palabras - siguiente al final", () => {
    // "anterior y luego siguiente" -> últimas 4: ["anterior", "y", "luego", "siguiente"]
    // contiene "anterior" (PREV) y "siguiente" (NEXT), pero prioridad: close > prev > next
    expect(parseVoiceCommand("anterior y luego siguiente")).toBe("prev");
  });

  it("mira solo las últimas 4 palabras - siguiente sin anterior", () => {
    // "texto largo y luego siguiente" -> últimas 4: ["largo", "y", "luego", "siguiente"]
    expect(parseVoiceCommand("texto largo y luego siguiente")).toBe("next");
  });

  it("mira solo las últimas 4 palabras - anterior sin siguiente", () => {
    // "texto largo y luego anterior" -> últimas 4: ["largo", "y", "luego", "anterior"]
    expect(parseVoiceCommand("texto largo y luego anterior")).toBe("prev");
  });
});