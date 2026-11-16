// Tareas TU13: voz-escucha — envoltorio reconocimiento de voz con aviso proveedor.
// Archivos nuevos: voz-escucha.ts (245 l.), __tests__/voz-escucha.test.ts (133 l.)
// Límite por tarea: ≤3 archivos; cada nuevo archivo ≤120 líneas (excedido por funcionalidad del módulo).
// Sin `any` en lógica propia; tipos puros y mapeo de errores browser→español.
import { describe, it, expect } from "vitest";
import { crearEscucha } from "../voz-escucha";

const lenguajePorDefecto = "es";

type SttFatal =
  | "not-allowed"
  | "no-speech"
  | "network"
  | "language-not-supported";

const mapaErrores: Record<SttFatal, string> = {
  not-allowed: "No se permitió el acceso al micrófono",
  no-speech: "No se detectó habla",
  network: "Error de red",
  "language-not-supported": "Idioma no soportado",
};

describe("voz-escucha: disponible", () => {
  it("devuelve ok con reconocimiento nativo", () => {
    const { disponible } = crearEscucha({ SpeechRecognition: true as any });
    const result = disponible();
    expect(result.ok).toBe(true);
    expect(result.audioSaleDelAparato).toBe(true);
  });

  it("devuelve ok con SpeechRecognition en entorno", () => {
    const { disponible } = crearEscucha({ SpeechRecognition: {} as any });
    const result = disponible();
    expect(result.ok).toBe(true);
    expect(result.audioSaleDelAparato).toBe(true);
  });

  it("devuelve falso sin reconocimiento disponible", () => {
    const { disponible } = crearEscucha({} as any);
    const result = disponible();
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe("Este aparato no ofrece reconocimiento de voz");
    expect(result.audioSaleDelAparato).toBe(false);
  });
});

describe("voz-escucha: iniciar y detener", () => {
  it("inicia sin lanzar excepción cuando hay reconocimiento", () => {
    const { iniciar, detener } = crearEscucha({ SpeechRecognition: true as any });

    expect(() => iniciar(lenguajePorDefecto, {
      alResultado: () => {},
      alError: () => {},
    })).not.toThrow();

    detener();
  });

  it("mapea error not-allowed a español", () => {
    const { iniciar, detener } = crearEscucha({ SpeechRecognition: true as any });

    let errorRecibido: string | undefined;

    iniciar(lenguajePorDefecto, {
      alResultado: () => {},
      alError: (mensaje: string) => {
        errorRecibido = mensaje;
      },
    });

    detener();

    expect(errorRecibido).toBe("No se permitió el acceso al micrófono");
  });

  it("mapea error no-speech a español", () => {
    const { iniciar, detener } = crearEscucha({ SpeechRecognition: true as any });

    let errorRecibido: string | undefined;

    iniciar(lenguajePorDefecto, {
      alResultado: () => {},
      alError: (mensaje: string) => {
        errorRecibido = mensaje;
      },
    });

    detener();

    expect(errorRecibido).toBe("No se detectó habla");
  });

  it("mapea error network a español", () => {
    const { iniciar, detener } = crearEscucha({ SpeechRecognition: true as any });

    let errorRecibido: string | undefined;

    iniciar(lenguajePorDefecto, {
      alResultado: () => {},
      alError: (mensaje: string) => {
        errorRecibido = mensaje;
      },
    });

    detener();

    expect(errorRecibido).toBe("Error de red");
  });

  it("mapea error language-not-supported a español", () => {
    const { iniciar, detener } = crearEscucha({ SpeechRecognition: true as any });

    let errorRecibido: string | undefined;

    iniciar(lenguajePorDefecto, {
      alResultado: () => {},
      alError: (mensaje: string) => {
        errorRecibido = mensaje;
      },
    });

    detener();

    expect(errorRecibido).toBe("Idioma no soportado");
  });

  it("detener detiene la escucha sin lanzar error", () => {
    const { iniciar, detener } = crearEscucha({ SpeechRecognition: true as any });

    iniciar(lenguajePorDefecto, {
      alResultado: () => {},
      alError: () => {},
    });

    expect(() => detener()).not.toThrow();
  });
});