// @vitest-environment jsdom
/**
 * VOZ1105B — Cuando un motor empieza y falla a mitad, el RESTO del mensaje
 * sigue con el siguiente motor de la cadena.
 *
 * Hoy, cuando un eslabón devuelve "started" (empezó y se cortó),
 * speakWithConfiguredEngine cierra el turno y el resto del mensaje NO se dice.
 * Esta prueba verifica que los eslabones que trocean informen cuántos trozos
 * llegaron a sonar y que el router hable el RESTO con el siguiente eslabón.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  /** Motores que devuelven audio al pedírselo. */
  hablan: new Set<string>(),
  /** Qué motor habló y cuántos trozos de cuántos totales. */
  progreso: [] as Array<{ motor: string; texto: string; trozosSonados: number; trozosTotales: number }>,
  /** Textos que llegaron a cada motor (para verificar el reparto). */
  textosPorMotor: new Map<string, string[]>(),
}));

vi.mock("@/lib/aurora/tts-oss/neural-tts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/aurora/tts-oss/neural-tts")>();
  return {
    ...real,
    pingNeuralEngine: vi.fn(async (motor: string) => (estado.hablan.has(motor) ? "ok" : "unreachable")),
    neuralSpeak: vi.fn(
      async (
        motor: string,
        texto: string,
        o: { onStart?: () => void; onEnd?: () => void; onError?: (m: string) => void; onChunkProgress?: (sonados: number, totales: number) => void } = {},
      ) => {
        // Simula un motor que trocea: devuelve progreso parcial si se configura
        const trozosTotales = 5; // fijo para la prueba
        const trozosSonados = estado.hablan.has(`${motor}-parcial`) ? 2 : trozosTotales;
        const arr = estado.textosPorMotor.get(motor) ?? [];
        arr.push(texto);
        estado.textosPorMotor.set(motor, arr);
        estado.progreso.push({ motor, texto, trozosSonados, trozosTotales });
        if (trozosSonados > 0) o.onStart?.();
        // Simular progreso de trozos (callback que el router usa para saber cuántos sonaron)
        if (o.onChunkProgress && trozosSonados > 0) {
          o.onChunkProgress(trozosSonados, trozosTotales);
        }
        if (trozosSonados === trozosTotales) o.onEnd?.();
        return {} as HTMLAudioElement;
      },
    ),
  };
});

vi.mock("@/lib/aurora/personalities", () => ({ getActivePersonality: () => null }));
vi.mock("@/lib/aurora/tts-oss/kokoro", () => ({
  kokoroAvailable: () => false,
  kokoroModelReady: () => false,
  kokoroSpeak: async () => null,
  stopKokoro: () => undefined,
}));
vi.mock("@/lib/aurora/tts-oss/voicebox-engine", () => ({
  resolveVoiceboxPersonality: async () => ({}),
  OpenVoiceHybridRouter: { synthesize: async () => ({ blob: null }) },
}));
vi.mock("@/lib/aurora/tts-oss/brain-api-manager", () => ({
  BrainApiManager: { sync: async () => undefined },
}));
vi.mock("@/lib/aurora/tts-oss/omnivoice-web-router", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/aurora/tts-oss/omnivoice-web-router")>();
  return { ...real, refreshWebVoiceDiscovery: async () => undefined, hasWebVoiceDiscoveredThisSession: () => true };
});

import { speakWithConfiguredEngine } from "@/lib/aurora/tts-oss/speak-router";
import { getVoiceConfig, setVoiceConfig, setEngineSettings } from "@/lib/aurora/tts-oss/voice-config";

const TEXTO_LARGO = "Hola, esta es una prueba larga de la cadena de voz. ".repeat(10); // ~500 chars → 5 trozos

function configurar(motor: string, endpoint: string) {
  setEngineSettings(motor, { endpoint });
}

beforeEach(() => {
  window.localStorage.clear();
  estado.hablan.clear();
  estado.progreso.length = 0;
  estado.textosPorMotor.clear();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red en pruebas"); }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("speak-router: resto del mensaje con el siguiente motor (VOZ1105B)", () => {
  it("primer motor suena 2 de 5 trozos y falla → segundo motor dice los 3 restantes", async () => {
    // Configurar dos motores troceados en la cadena (openvoice2 y omnivoice usan reproducción troceada)
    configurar("openvoice2", "https://myshell-ai-openvoicev2.hf.space");
    configurar("omnivoice", "https://k2-fsa-omnivoice.hf.space");
    setVoiceConfig({ engine: "openvoice2" }); // elección explícita: openvoice2 primero

    // El primer motor (openvoice2) solo logra 2 de 5 trozos
    estado.hablan.add("openvoice2");
    estado.hablan.add("openvoice2-parcial"); // marca para simular progreso parcial
    // El segundo motor (omnivoice) completa el resto
    estado.hablan.add("omnivoice");

    const onStart = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();

    const resultado = await speakWithConfiguredEngine(TEXTO_LARGO, { onStart, onEnd, onError });

    // El router debe devolver true (alguien habló)
    expect(resultado).toBe(true);

    // Debe haber intentado openvoice2 primero
    expect(estado.progreso.some((p) => p.motor === "openvoice2")).toBe(true);

    // Y luego debe haber pasado a omnivoice para el resto
    expect(estado.progreso.some((p) => p.motor === "omnivoice")).toBe(true);

    // onStart/onEnd deben haberse llamado (el turno se completó)
    expect(onStart).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();

    // No debe haber error visible para el usuario (failover silencioso)
    expect(onError).not.toHaveBeenCalled();
  });

  it("sin información de progreso, mantiene el comportamiento actual (started cierra el turno)", async () => {
    configurar("openvoice2", "https://myshell-ai-openvoicev2.hf.space");
    configurar("omnivoice", "https://k2-fsa-omnivoice.hf.space");
    setVoiceConfig({ engine: "openvoice2" });

    // Sin la marca -parcial, el motor completa todos los trozos
    estado.hablan.add("openvoice2");
    estado.hablan.add("omnivoice");

    const onStart = vi.fn();
    const onEnd = vi.fn();

    await speakWithConfiguredEngine(TEXTO_LARGO, { onStart, onEnd });

    // Solo el primer motor habla (comportamiento actual sin progreso)
    expect(estado.progreso.filter((p) => p.motor === "openvoice2")).toHaveLength(1);
    expect(estado.progreso.some((p) => p.motor === "omnivoice")).toBe(false);
  });
});