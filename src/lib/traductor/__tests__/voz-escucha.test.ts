import { describe, it, expect, vi } from "vitest";
import {
  configurarReconocedor,
  mapearErrorStt,
  esReconocimientoDisponible,
} from "../voz-escucha";

const MockSpeechRecognition = class {
  constructor() {
    this.continuous = true;
    this.interimResults = true;
    this.lang = "es-MX";
  }
  start() {
    this.onstart && this.onstart();
  }
  stop() {
    this.onend && this.onend();
  }
  abort() { }
};

describe("voz-escucha: esReconocimientoDisponible", () => {
  it("devuelve true cuando SpeechRecognition existe y es función", () => {
    expect(esReconocimientoDisponible(MockSpeechRecognition)).toBe(true);
  });

  it("devuelve false cuando SpeechRecognition es undefined", () => {
    expect(esReconocimientoDisponible(undefined)).toBe(false);
  });

  it("devuelve false cuando SpeechRecognition es null", () => {
    expect(esReconocimientoDisponible(null)).toBe(false);
  });

  it("devuelve false cuando SpeechRecognition es un objeto vacío", () => {
    expect(esReconocimientoDisponible({})).toBe(false);
  });
});

describe("voz-escucha: mapearErrorStt", () => {
  it("mapea not-allowed correctamente", () => {
    expect(mapearErrorStt("not-allowed")).toBe("No se concedió el permiso de micrófono");
  });

  it("mapea service-not-allowed correctamente", () => {
    expect(mapearErrorStt("service-not-allowed")).toBe("No se concedió el permiso de micrófono");
  });

  it("mapea no-speech correctamente", () => {
    expect(mapearErrorStt("no-speech")).toBe("No se detectó habla en el periodo de escucha");
  });

  it("mapea network correctamente", () => {
    expect(mapearErrorStt("network")).toBe("Error de red en el reconocimiento de voz");
  });

  it("mapea language-not-supported correctamente", () => {
    expect(mapearErrorStt("language-not-supported")).toBe("El idioma no está soportado");
  });

  it("devuelve mensaje genérico para error desconocido", () => {
    expect(mapearErrorStt("unknown-error")).toBe("Error de reconocimiento: unknown-error");
  });

  it("devuelve mensaje genérico para error vacío", () => {
    expect(mapearErrorStt("")).toBe("Error de reconocimiento: ");
  });
});

describe("voz-escucha: configurarReconocedor", () => {
  const onResultado = vi.fn();
  const onError = vi.fn();

  it("configura un reconocedor con handlers básicos", () => {
    const rec = configurarReconocedor(
      MockSpeechRecognition,
      onResultado,
      onError,
    );

    expect(rec).not.toBeNull();
    expect(rec?.continuous).toBe(true);
    expect(rec?.interimResults).toBe(true);
    expect(rec?.lang).toBe("es-MX");
  });

  it("retorna null cuando SpeechRecognition es undefined", () => {
    const onResultado = vi.fn();
    const onError = vi.fn();

    const rec = configurarReconocedor(
      undefined as SpeechRecognitionConstructor,
      onResultado,
      onError,
    );

    expect(rec).toBeNull();
    expect(onError).toHaveBeenCalledWith("No se concedió el permiso de micrófono");
  });

  it("configura onresult con resultados parciales y finales", () => {
    const onResultado = vi.fn();
    const onError = vi.fn();

    const rec = configurarReconocedor(
      MockSpeechRecognition,
      onResultado,
      onError,
    );

    // Simular evento onresult
    const event = {
      resultIndex: 0,
      results: [
        { isFinal: false, 0: { transcript: "hola " } },
        { isFinal: true, 0: { transcript: "mundo" } },
      ],
    };

    rec?.onresult(event);

    expect(onResultado).toHaveBeenCalledTimes(2);
    expect(onResultado).toHaveBeenCalledWith("hola ", false);
    expect(onResultado).toHaveBeenCalledWith("mundo", true);
  });

  it("configura onerror con not-allowed", () => {
    const onResultado = vi.fn();
    const onError = vi.fn();

    const rec = configurarReconocedor(
      MockSpeechRecognition,
      onResultado,
      onError,
    );

    const errorEvent = { error: "not-allowed" };
    rec?.onerror(errorEvent);

    expect(onError).toHaveBeenCalledWith("No se concedió el permiso de micrófono");
  });

  it("configura onerror con no-speech", () => {
    const onResultado = vi.fn();
    const onError = vi.fn();

    const rec = configurarReconocedor(
      MockSpeechRecognition,
      onResultado,
      onError,
    );

    const errorEvent = { error: "no-speech" };
    rec?.onerror(errorEvent);

    expect(onError).toHaveBeenCalledWith("No se detectó habla en el periodo de escucha");
  });

  it("configura onerror con network", () => {
    const onResultado = vi.fn();
    const onError = vi.fn();

    const rec = configurarReconocedor(
      MockSpeechRecognition,
      onResultado,
      onError,
    );

    const errorEvent = { error: "network" };
    rec?.onerror(errorEvent);

    expect(onError).toHaveBeenCalledWith("Error de red en el reconocimiento de voz");
  });

  it("configura onerror con language-not-supported", () => {
    const onResultado = vi.fn();
    const onError = vi.fn();

    const rec = configurarReconocedor(
      MockSpeechRecognition,
      onResultado,
      onError,
    );

    const errorEvent = { error: "language-not-supported" };
    rec?.onerror(errorEvent);

    expect(onError).toHaveBeenCalledWith("El idioma no está soportado");
  });
});