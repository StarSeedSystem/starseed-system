import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { auroraTranscript, parseVoiceCommand } from "../aurora-guide-voice";

interface StarSeedAuroraBridge {
  getState?: () => {
    transcript?: string;
    interim?: string;
    enabled?: boolean;
    speaking?: boolean;
    listening?: boolean;
  } | null;
}

declare global {
  interface Window {
    STARSEED_AURORA?: StarSeedAuroraBridge;
  }
}

describe("aurora-guide-voice · funciones puras", () => {
  const originalWindow = global.window;

  beforeEach(() => {
    global.window = {
      ...originalWindow,
      STARSEED_AURORA: undefined,
      speechSynthesis: { cancel: vi.fn() },
    } as unknown as Window & typeof globalThis;
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.restoreAllMocks();
  });

  describe("auroraTranscript", () => {
    it("devuelve transcript + interim cuando el puente está disponible", () => {
      global.window.STARSEED_AURORA = {
        getState: () => ({ transcript: "hola", interim: " mundo" }),
      };

      const result = auroraTranscript();
      expect(result).toBe("hola  mundo");
    });

    it("devuelve solo transcript cuando no hay interim (sin espacio extra)", () => {
      global.window.STARSEED_AURORA = {
        getState: () => ({ transcript: "siguiente", interim: "" }),
      };

      const result = auroraTranscript();
      expect(result).toBe("siguiente");
    });

    it("devuelve cadena vacía cuando no hay puente", () => {
      global.window.STARSEED_AURORA = undefined;

      const result = auroraTranscript();
      expect(result).toBe("");
    });

    it("devuelve cadena vacía cuando getState devuelve null", () => {
      global.window.STARSEED_AURORA = {
        getState: () => null,
      };

      const result = auroraTranscript();
      expect(result).toBe("");
    });

    it("devuelve cadena vacía y no lanza cuando getState lanza", () => {
      global.window.STARSEED_AURORA = {
        getState: () => {
          throw new Error("fallo interno");
        },
      };

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = auroraTranscript();

      expect(result).toBe("");
      expect(consoleSpy).toHaveBeenCalledWith(
        "[aurora-guide-voice] error leyendo transcript:",
        "fallo interno"
      );
      consoleSpy.mockRestore();
    });
  });

  describe("parseVoiceCommand", () => {
    it("detecta 'siguiente' en el transcript", () => {
      expect(parseVoiceCommand("usuario dice siguiente")).toBe("next");
      expect(parseVoiceCommand("continúa por favor")).toBe("next");
      expect(parseVoiceCommand("avanza al siguiente")).toBe("next");
    });

    it("detecta 'anterior' en el transcript", () => {
      expect(parseVoiceCommand("vuelve al anterior")).toBe("prev");
      expect(parseVoiceCommand("atrás un paso")).toBe("prev");
    });

    it("detecta 'cerrar' en el transcript", () => {
      expect(parseVoiceCommand("cerrar la guía")).toBe("close");
      expect(parseVoiceCommand("salir ahora")).toBe("close");
      expect(parseVoiceCommand("termina")).toBe("close");
    });

    it("prioriza cerrar sobre anterior y siguiente", () => {
      expect(parseVoiceCommand("siguiente cerrar")).toBe("close");
      expect(parseVoiceCommand("anterior cerrar")).toBe("close");
    });

    it("prioriza anterior sobre siguiente", () => {
      expect(parseVoiceCommand("anterior siguiente")).toBe("prev");
    });

    it("ignora mayúsculas y tildes", () => {
      expect(parseVoiceCommand("SIGUIENTE")).toBe("next");
      expect(parseVoiceCommand("CONTINÚA")).toBe("next");
      expect(parseVoiceCommand("CIERRA")).toBe("close");
    });

    it("devuelve null para transcript vacío", () => {
      expect(parseVoiceCommand("")).toBeNull();
      expect(parseVoiceCommand("   ")).toBeNull();
    });

    it("devuelve null para texto sin comandos", () => {
      expect(parseVoiceCommand("hola mundo")).toBeNull();
      expect(parseVoiceCommand("qué tiempo hace")).toBeNull();
    });
  });
});