/** Tests para la sincronía del nombre de la neurona (NEU1126A): fusión por fecha, prefs viejos, aviso tras confirmar, dos campos con varios aparatos. */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { combinarCapacidades, __testReadPrefs as readPrefs, __testWritePrefs as writePrefs, NEURON_PREFS_KEY, _detenerLatidoParaPruebas } from "@/lib/neurons/neurons";
import { aparatosDe, entradaViva, neuronasParaElegir } from "@/lib/neurons/aparatos-de-neurona";

const originalLocalStorage = global.localStorage;
const originalWindow = global.window;
const originalEventListener = global.window.addEventListener;
const originalRemoveEventListener = global.window.removeEventListener;

function setupMockStorage() {
  const mockStorage: Storage & { store: Record<string, string> } = {
    store: {},
    getItem(key: string) { return this.store[key] ?? null; },
    setItem(key: string, value: string) { this.store[key] = value; },
    removeItem(key: string) { delete this.store[key]; },
    clear() { this.store = {}; },
    key: () => null,
    length: 0,
  };
  global.localStorage = mockStorage;
  (global.window as any) = {
    ...global.window,
    localStorage: mockStorage,
    navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0" },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  return mockStorage;
}

const originalDateNow = Date.now;

function setupMockDate(fixedTime: number) {
  vi.useFakeTimers();
  vi.setSystemTime(fixedTime);
}

beforeEach(() => {
  setupMockStorage();
  setupMockDate(1700000000000);
  _detenerLatidoParaPruebas();
});

afterEach(() => {
  vi.useRealTimers();
  global.localStorage = originalLocalStorage;
  (global.window as any) = originalWindow;
  global.window.addEventListener = originalEventListener;
  global.window.removeEventListener = originalRemoveEventListener;
  cleanup();
});

describe("NEU1126A: fusión de nombre por timestamp (combinarCapacidades)", () => {
  it("gana el nombre remoto cuando su nombreTs es más reciente", () => {
    const remotas: any = { capabilities: { nombreTs: 2000, name: "Neurona Remota" } };
    const locales: any = { nombreTs: 1000, name: "Neurona Local" };
    const resultado = combinarCapacidades(remotas, locales, 3000);
    expect(resultado.name).toBe("Neurona Remota");
    expect(resultado.nombreTs).toBe(2000);
  });

  it("gana el nombre local cuando su nombreTs es más reciente", () => {
    const remotas: any = { capabilities: { nombreTs: 1000, name: "Neurona Remota" } };
    const locales: any = { nombreTs: 2000, name: "Neurona Local" };
    const resultado = combinarCapacidades(remotas, locales, 3000);
    expect(resultado.name).toBe("Neurona Local");
    expect(resultado.nombreTs).toBe(2000);
  });

  it("empate en timestamp: gana el local (comportamiento legacy)", () => {
    const remotas: any = { capabilities: { nombreTs: 1500, name: "Neurona Remota" } };
    const locales: any = { nombreTs: 1500, name: "Neurona Local" };
    const resultado = combinarCapacidades(remotas, locales, 3000);
    expect(resultado.name).toBe("Neurona Local");
    expect(resultado.nombreTs).toBe(1500);
  });

  it("sin timestamps: gana el remoto (se propaga desde la base inicial)", () => {
    const remotas: any = { capabilities: { name: "Neurona Remota" } };
    const locales: any = { name: "Neurona Local" };
    const resultado = combinarCapacidades(remotas, locales, 3000);
    expect(resultado.name).toBe("Neurona Remota");
  });
});

describe("NEU1126A: reconciliación de prefs.names al leer (listNeurons)", () => {
  it("prefs.names se descarta cuando la cuenta tiene nombre más nuevo (nombreTs remoto > local)", () => {
    const ahora = Date.now();
    writePrefs({
      permissions: {},
      names: { "neurona-1": "Nombre Local Viejo" },
      settings: {},
    });
    const stored = JSON.parse(global.localStorage.getItem(NEURON_PREFS_KEY) || "{}");
    stored.nombreTs = { "neurona-1": ahora - 10000 };
    global.localStorage.setItem(NEURON_PREFS_KEY, JSON.stringify(stored));

    const prefs = readPrefs();
    const nombreLocalTs = (prefs as any).nombreTs?.["neurona-1"] ?? 0;
    expect(nombreLocalTs).toBe(ahora - 10000);
    expect((prefs as any).nombreTs?.["neurona-1"]).toBeGreaterThan(0);
  });

  it("prefs.names se mantiene mientras está pendiente de subir (sin confirmación remota)", () => {
    const timestamp = Date.now();
    writePrefs({
      permissions: {},
      names: { "neurona-1": "Nombre Pendiente" },
      settings: {},
      nombreTs: { "neurona-1": timestamp } as any,
    });

    const prefs = readPrefs();
    expect(prefs.names["neurona-1"]).toBe("Nombre Pendiente");
    expect((prefs as any).nombreTs?.["neurona-1"]).toBe(timestamp);
  });
});

describe("NEU1126A: dos campos cuando hay varios aparatos (aparatos-de-neurona)", () => {
  it("aparatosDe devuelve los aparatos vinculados de una neurona", () => {
    const ahora = Date.now();
    const caps = {
      aparatos: {
        "aparato-1": entradaViva({ nombre: "Teléfono", medio: "android", equipo: "Pixel 8" }, ahora - 1000),
        "aparato-2": entradaViva({ nombre: "Tableta", medio: "android", equipo: "Pixel Tablet" }, ahora),
      },
    };
    const aparatos = aparatosDe(caps);
    expect(aparatos.length).toBe(2);
    expect(aparatos[0].nombre).toBe("Tableta");
    expect(aparatos[1].nombre).toBe("Teléfono");
  });

  it("variosAparatos es true cuando hay más de un aparato vinculado", () => {
    const agora = Date.now();
    const filas: any[] = [
      {
        id: "neurona-1",
        name: "Mi Neurona",
        capabilities: {
          aparatos: {
            "aparato-1": { n: "Teléfono", ts: agora - 1000, medio: "android", equipo: "Pixel 8" },
            "aparato-2": { n: "Tableta", ts: agora, medio: "android", equipo: "Pixel Tablet" },
          },
        },
      },
    ];
    const resultado = neuronasParaElegir(filas, "neurona-1");
    expect(resultado[0].variosAparatos).toBe(true);
    expect(resultado[0].aparatos.length).toBe(2);
  });

  it("variosAparatos es false cuando hay un solo aparato vinculado", () => {
    const agora = Date.now();
    const filas: any[] = [
      {
        id: "neurona-1",
        name: "Mi Neurona",
        capabilities: {
          aparatos: {
            "aparato-1": { n: "Teléfono", ts: agora, medio: "android", equipo: "Pixel 8" },
          },
        },
      },
    ];
    const resultado = neuronasParaElegir(filas, "neurona-1");
    expect(resultado[0].variosAparatos).toBe(false);
    expect(resultado[0].aparatos.length).toBe(1);
  });

  it("aparatosDe ignora lápidas (fuera >= ts)", () => {
    const agora = Date.now();
    const caps = {
      aparatos: {
        "aparato-1": { n: "Teléfono", ts: agora - 1000, fuera: agora - 500, medio: "android", equipo: "Pixel 8" },
        "aparato-2": entradaViva({ nombre: "Tableta", medio: "android", equipo: "Pixel Tablet" }, agora),
      },
    };
    const aparatos = aparatosDe(caps);
    expect(aparatos.length).toBe(1);
    expect(aparatos[0].nombre).toBe("Tableta");
  });
});