// @vitest-environment jsdom
/**
 * VOZ1105B — El RESTO del mensaje tras un corte a mitad (contrato
 * `architecture/voz-estable-1105.md` §3/§4).
 *
 * Antes: si un eslabón devolvía «started» (empezó y se cortó), el router
 * cerraba el turno y el resto del mensaje NO se decía. Ahora: los eslabones
 * troceados informan cuántos trozos llegaron a sonar y el router hace decir el
 * RESTO con el siguiente eslabón; sin informe de progreso, comportamiento
 * intacto.
 *
 * Eslabones SIMULADOS con `vi.mock` de neural-tts (la síntesis real es red);
 * la cadena, la config y la función pura `restoTrasCorte` son las reales.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const simulados = vi.hoisted(() => ({
  hablados: [] as Array<{ motor: string; texto: string }>,
  /** Plan de trozos que «trocea» voice158 en la simulación. */
  plan: [] as string[],
  /** Trozos de voice158 que llegan a sonar antes del corte. */
  de: 2,
  /** ¿El corte se INFORMA con progreso o se pierde (comportamiento viejo)? */
  informa: true,
}));

vi.mock("@/lib/aurora/tts-oss/neural-tts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/aurora/tts-oss/neural-tts")>();
  return {
    ...real,
    // Salud: solo voice158 tiene servidor (el resto declina sin eslabón).
    pingNeuralEngine: vi.fn(async (motor: string) =>
      motor === "voice158" ? "ok" : "unreachable"),
    neuralSpeak: vi.fn(
      async (
        motor: string,
        texto: string,
        o: {
          onStart?: () => void;
          onEnd?: () => void;
          onError?: (m: string) => void;
          onProgreso?: (p: { sonados: number; total: number; trozos: readonly string[] }) => void;
        } = {},
      ) => {
        simulados.hablados.push({ motor, texto });
        if (motor === "voice158") {
          // Empezó a sonar (informando su progreso) y se CORTÓ a mitad.
          o.onStart?.();
          if (simulados.informa) {
            o.onProgreso?.({ sonados: simulados.de, total: simulados.plan.length, trozos: simulados.plan });
          }
          return null;
        }
        if (motor === "omnivoice") {
          // Segundo eslabón: habla el texto que le llega y termina completo.
          o.onStart?.();
          o.onEnd?.();
          return {} as HTMLAudioElement;
        }
        o.onError?.(`${motor}: sin audio`);
        return null;
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
  const real = await importOriginal<
    typeof import("@/lib/aurora/tts-oss/omnivoice-web-router")
  >();
  return {
    ...real,
    refreshWebVoiceDiscovery: async () => undefined,
    hasWebVoiceDiscoveredThisSession: () => true,
  };
});

import { restoTrasCorte, speakWithConfiguredEngine } from "@/lib/aurora/tts-oss/speak-router";
import { setEngineSettings } from "@/lib/aurora/tts-oss/voice-config";

const TEXTO = "Hola. Esta es una prueba larga de la cadena de voz de Aurora.";

describe("restoTrasCorte (pura)", () => {
  it("devuelve los trozos aún sin sonar", () => {
    expect(restoTrasCorte(["A.", "B.", "C.", "D.", "E."], 2)).toBe("C. D. E.");
  });
  it("sin resto real devuelve null", () => {
    expect(restoTrasCorte([], 0)).toBe(null);
    expect(restoTrasCorte(["A.", "B."], 0)).toBe(null);
    expect(restoTrasCorte(["A.", "B."], 2)).toBe(null);
    expect(restoTrasCorte(["A."], -1)).toBe(null);
    expect(restoTrasCorte(["a", "b"], Number.NaN)).toBe(null);
    expect(restoTrasCorte([" ", "  "], 1)).toBe(null);
  });
});

describe("corte a mitad → el RESTO con el siguiente eslabón", () => {
  beforeEach(() => {
    window.localStorage.clear();
    simulados.hablados.length = 0;
    simulados.plan = ["Hola.", "Esta es una prueba larga.", "De la cadena.", "De voz.", "De Aurora."];
    simulados.de = 2;
    simulados.informa = true;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red en pruebas"); }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("voice158 suena 2 de 5 trozos y se corta → omnivoice dice los 3 restantes", async () => {
    setEngineSettings("voice158", { endpoint: "http://127.0.0.1:8000" });
    expect(await speakWithConfiguredEngine(TEXTO)).toBe(true);
    expect(simulados.hablados.map((h) => h.motor)).toEqual(["voice158", "omnivoice"]);
    expect(simulados.hablados[1]?.texto).toBe(
      simulados.plan.slice(2).join(" "),
    );
  });
  it("corte SIN informe de progreso → el turno se cierra como hasta hoy", async () => {
    setEngineSettings("voice158", { endpoint: "http://127.0.0.1:8000" });
    simulados.informa = false;
    expect(await speakWithConfiguredEngine(TEXTO)).toBe(true);
    expect(simulados.hablados.map((h) => h.motor)).toEqual(["voice158"]);
  });
});
