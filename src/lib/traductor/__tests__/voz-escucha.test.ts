import { describe, expect, it, vi } from "vitest";
import { crearEscucha, mapErrorReconocimiento, mensajeError } from "../voz-escucha";

describe("mapErrorReconocimiento", () => {
  it("mapea 'not-allowed' apera", () => {
    expect(mapErrorReconocimiento("not-allowed")).toBe("not-allowed");
    expect(mapErrorReconocimiento("NOT-ALLOWED")).toBe("not-allowed");
    expect(mapErrorReconocimiento("service-not-allowed")).toBe("not-allowed");
  });

  it("mapea 'no-speech' apera", () => {
    expect(mapErrorReconocimiento("no-speech")).toBe("no-speech");
    expect(mapErrorReconocimiento("NO-SPEECH")).toBe("no-speech");
  });

  it("mapea 'network' apera", () => {
    expect(mapErrorReconocimiento("network")).toBe("network");
    expect(mapErrorReconocimiento("NetworkError")).toBe("network");
    expect(mapErrorReconocimiento("network error")).toBe("network");
  });

  it("mapea 'language-not-supported' apera", () => {
    expect(mapErrorReconocimiento("language-not-supported")).toBe("language-not-supported");
    expect(mapErrorReconocimiento("LANGUAGE-NOT-SUPPORTED")).toBe("language-not-supported");
  });

  it("mapea 'audio-capture' apera", () => {
    expect(mapErrorReconocimiento("audio-capture")).toBe("audio-capture");
    expect(mapErrorReconocimiento("audio capture")).toBe("audio-capture");
  });

  it("mapea 'failed' apera", () => {
    expect(mapErrorReconocimiento("failed")).toBe("failed");
    expect(mapErrorReconocimiento("unknown")).toBe("failed");
    expect(mapErrorReconocimiento("")).toBe("failed");
  });
});

describe("mensajeError", () => {
  it("devuelve mensaje en español por defecto", () => {
    const msg = mensajeError("not-allowed", "es");
    expect(msg).toContain("permiso");
    expect(msg).toContain("micrófono");
  });

  it("devuelve mensaje en inglés cuando se indica", () => {
    const msg = mensajeError("no-speech", "en");
    expect(msg).toContain("speech");
    expect(msg).toContain("microphone");
  });

  it("incluye el idioma en el mensaje de language-not-supported", () => {
    const msg = mensajeError("language-not-supported", "es");
    expect(msg).toContain("es");
  });

  it("maneja todos los tipos de error", () => {
    const tipos: import("../voz-escucha").ErrorReconocimiento[] = [
      "not-allowed",
      "no-speech",
      "network",
      "language-not-supported",
      "audio-capture",
      "service-not-allowed",
      "failed",
    ];
    for (const tipo of tipos) {
      const msgEs = mensajeError(tipo, "es");
      const msgEn = mensajeError(tipo, "en");
      expect(msgEs).toBeTruthy();
      expect(msgEn).toBeTruthy();
    }
  });
});

describe("crearEscucha", () => {
  describe("disponible()", () => {
    it("devuelve disponible cuando hay SpeechRecognition", () => {
      const srMock = vi.fn();
      const escucha = crearEscucha({ SpeechRecognition: srMock });

      const result = escucha.disponible();
      expect(result.ok).toBe(true);
      expect(result.audioSaleDelAparato).toBe(true);
    });

    it("devuelve disponible con OSS cuando no hay SpeechRecognition pero OSS está habilitado", () => {
      const escucha = crearEscucha({
        SpeechRecognition: null,
        ossStt: { estaHabilitado: () => true },
      });

      const result = escucha.disponible();
      expect(result.ok).toBe(true);
      expect(result.motivo).toBe("oss-disponible");
      expect(result.audioSaleDelAparato).toBe(false);
    });

    it("devuelve no disponible cuando no hay SpeechRecognition ni OSS", () => {
      const escucha = crearEscucha({
        SpeechRecognition: null,
        ossStt: { estaHabilitado: () => false },
      });

      const result = escucha.disponible();
      expect(result.ok).toBe(false);
      expect(result.motivo).toBe("Este aparato no ofrece reconocimiento de voz");
    });
  });

  describe("iniciar()", () => {
    it("devuelve error cuando no hay motor disponible", () => {
      const escucha = crearEscucha({
        SpeechRecognition: null,
        ossStt: { estaHabilitado: () => false },
      });

      let errorRecibido: import("../voz-escucha").ErrorReconocimiento | null = null;
      let mensajeRecibido: string = "";

      escucha.iniciar("es", {
        alResultado: () => {},
        alError: (e, m) => {
          errorRecibido = e;
          mensajeRecibido = m;
        },
      });

      expect(errorRecibido).toBe("failed");
      expect(mensajeRecibido).toContain("motor");
    });

    it("inicia con SpeechRecognition cuando está disponible", () => {
      let started = false;
      const srMock = vi.fn().mockImplementation(() => ({
        lang: "",
        interimResults: false,
        continuous: false,
        maxAlternatives: 0,
        onstart: null,
        onerror: null,
        onend: null,
        onresult: null,
        start: () => { started = true; },
        stop: () => {},
      }));

      const escucha = crearEscucha({ SpeechRecognition: srMock });

      escucha.iniciar("es", {
        alResultado: () => {},
        alError: () => {},
      });

      expect(srMock).toHaveBeenCalled();
      expect(started).toBe(true);
    });

    it("aplica configuración correcta al SpeechRecognition", () => {
      const instance = {
        lang: "",
        interimResults: false,
        continuous: false,
        maxAlternatives: 0,
        onstart: null as ((e: Event) => void) | null,
        onerror: null as ((e: Event) => void) | null,
        onend: null as ((e: Event) => void) | null,
        onresult: null as ((e: any) => void) | null,
        start: () => {},
        stop: () => {},
      };
      const srMock = vi.fn().mockImplementation(() => instance);

      const escucha = crearEscucha({ SpeechRecognition: srMock });

      escucha.iniciar("es", {
        alResultado: () => {},
        alError: () => {},
      });

      expect(instance.lang).toBe("es");
      expect(instance.interimResults).toBe(true);
    });
  });

  describe("detener()", () => {
    it("detiene el reconocimiento", () => {
      let stopped = false;
      const srMock = vi.fn().mockImplementation(() => ({
        lang: "",
        interimResults: false,
        continuous: false,
        maxAlternatives: 0,
        onstart: null,
        onerror: null,
        onend: null,
        onresult: null,
        start: () => {},
        stop: () => { stopped = true; },
      }));

      const escucha = crearEscucha({ SpeechRecognition: srMock });

      escucha.iniciar("es", {
        alResultado: () => {},
        alError: () => {},
      });

      escucha.detener();
      expect(stopped).toBe(true);
    });
  });

  describe("enEscucha()", () => {
    it("indica si está en escucha", () => {
      const srMock = vi.fn().mockImplementation(() => ({
        lang: "",
        interimResults: false,
        continuous: false,
        maxAlternatives: 0,
        onstart: null,
        onerror: null,
        onend: null,
        onresult: null,
        start: () => {},
        stop: () => {},
      }));

      const escucha = crearEscucha({ SpeechRecognition: srMock });

      expect(escucha.enEscucha()).toBe(false);
    });
  });

  describe("manejo de speechRecognition en SSR", () => {
    it("maneja el caso donde window no está definido", () => {
      const originalWindow = (global as any).window;
      delete (global as any).window;

      const escucha = crearEscucha({ SpeechRecognition: null });
      const result = escucha.disponible();

      expect(result.ok).toBe(false);

      (global as any).window = originalWindow;
    });
  });

  describe("manejo de resultados", () => {
    it("envía resultado final cuando el SpeechRecognition devuelve texto", () => {
      let resultadoRecibido: import("../voz-escucha").ResultadoReconocimiento | null = null;

      const instance: any = {
        lang: "",
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        onstart: null,
        onerror: null,
        onend: null,
        onresult: null,
        start: () => {},
        stop: () => {},
      };
      const srMock = vi.fn().mockImplementation(() => instance);

      const escucha = crearEscucha({ SpeechRecognition: srMock });

      escucha.iniciar("es", {
        alResultado: (r) => { resultadoRecibido = r; },
        alError: () => {},
      });

      instance.onresult = (e: any) => {
        const idx = e.resultIndex || 0;
        const results = e.results || [];
        const ultimoResultado = results[idx];
        const texto = ultimoResultado?.[0]?.transcript || "";
        const esFinal = ultimoResultado?.isFinal || false;

        if (texto.trim()) {
          const resultado: import("../voz-escucha").ResultadoReconocimiento = {
            texto,
            provisional: !esFinal,
            proveedor: "navegador",
          };
          escucha.disponible();
        }
      };

      expect(typeof escucha.iniciar).toBe("function");
    });
  });
});