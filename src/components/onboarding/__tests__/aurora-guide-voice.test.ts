import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { auroraTranscript, parseVoiceCommand } from "../aurora-guide-voice";

describe("aurora-guide-voice · funciones puras", () => {
  describe("parseVoiceCommand", () => {
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

    it("prioriza cerrar sobre anterior y siguiente", () => {
      expect(parseVoiceCommand("cerrar siguiente")).toBe("close");
      expect(parseVoiceCommand("anterior cerrar")).toBe("close");
    });

    it("devuelve null para texto sin comando", () => {
      expect(parseVoiceCommand("hola mundo")).toBeNull();
      expect(parseVoiceCommand("")).toBeNull();
      expect(parseVoiceCommand("   ")).toBeNull();
    });

    it("mira solo las últimas 4 palabras (cola del transcript)", () => {
      expect(parseVoiceCommand("hola cómo estás siguiente")).toBe("next");
      // "anterior" está al principio, fuera de las últimas 4 palabras (slice(-4))
      expect(parseVoiceCommand("anterior uno dos tres cuatro cinco")).toBeNull();
    });
  });

  describe("auroraTranscript", () => {
    const originalWindow = global.window;

    beforeEach(() => {
      global.window = { ...originalWindow } as Window & typeof globalThis;
    });

    afterEach(() => {
      global.window = originalWindow;
      vi.restoreAllMocks();
    });

    it("devuelve espacio si no hay window (comportamiento actual fail-open)", () => {
      // @ts-expect-error testing without window
      global.window = undefined;
      expect(auroraTranscript()).toBe(" ");
    });

    it("devuelve espacio si no hay STARSEED_AURORA", () => {
      global.window = {} as unknown as Window & typeof globalThis;
      expect(auroraTranscript()).toBe(" ");
    });

    it("devuelve espacio si STARSEED_AURORA no tiene getState", () => {
      global.window = { STARSEED_AURORA: {} } as unknown as Window & typeof globalThis;
      expect(auroraTranscript()).toBe(" ");
    });

    it("devuelve transcript + interim cuando getState existe (sin espacio final extra)", () => {
      global.window = {
        STARSEED_AURORA: {
          getState: () => ({ transcript: "hola", interim: "mundo" }),
        },
      } as unknown as Window & typeof globalThis;
      expect(auroraTranscript()).toBe("hola mundo");
    });

    it("maneja transcript o interim undefined (devuelve espacio si hay transcript)", () => {
      global.window = {
        STARSEED_AURORA: {
          getState: () => ({ transcript: "hola" }),
        },
      } as unknown as Window & typeof globalThis;
      expect(auroraTranscript()).toBe("hola ");
    });

    it("no lanza si getState tira error (fail-open -> string vacío por catch silencioso)", () => {
      global.window = {
        STARSEED_AURORA: {
          getState: () => { throw new Error("bridge error"); },
        },
      } as unknown as Window & typeof globalThis;
      expect(auroraTranscript()).toBe("");
    });
  });
});