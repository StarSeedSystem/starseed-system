// @vitest-environment jsdom
/**
 * VOZ1024B — La voz 1.58-bit (voice158) y VibeVoice, alcanzables en la cadena.
 *
 * Antes se descartaban en silencio: `isNeuralEngine` no los conocía (runLink
 * los rechazaba), `sanitizeEngines` tiraba su endpoint al guardar, la elección
 * explícita volvía a «navegador» y la jerarquía los mandaba detrás de Kokoro.
 *
 * Sin red ni audio: los motores se simulan (salud y síntesis inyectadas por
 * `vi.mock`); la config de voz, el registro y la jerarquía son los reales.
 *
 * (SGO1024C) Además: xAI no entra por AUTO pero su pin nunca queda detrás de
 * Kokoro, y VibeVoice usa TAL CUAL la ruta explícita de su endpoint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motores = vi.hoisted(() => ({
  /** Servidores que responden a la salud (ping). */
  vivos: new Set<string>(),
  /** Motores que devuelven audio al pedírselo. */
  hablan: new Set<string>(),
  pings: [] as string[],
  hablados: [] as Array<{ motor: string; texto: string }>,
}));

vi.mock("@/lib/aurora/tts-oss/neural-tts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/aurora/tts-oss/neural-tts")>();
  return {
    ...real,
    pingNeuralEngine: vi.fn(async (motor: string) => {
      motores.pings.push(motor);
      return motores.vivos.has(motor) ? "ok" : "unreachable";
    }),
    neuralSpeak: vi.fn(
      async (
        motor: string,
        texto: string,
        o: { onStart?: () => void; onEnd?: () => void; onError?: (m: string) => void } = {},
      ) => {
        motores.hablados.push({ motor, texto });
        if (!motores.hablan.has(motor)) {
          o.onError?.(`${motor}: sin audio`);
          return null;
        }
        o.onStart?.();
        o.onEnd?.();
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
  // Sin descubrimiento de Spaces (sería red): la jerarquía sí es la real.
  return { ...real, refreshWebVoiceDiscovery: async () => undefined, hasWebVoiceDiscoveredThisSession: () => true };
});

import { motorQueSono, speakWithConfiguredEngine } from "@/lib/aurora/tts-oss/speak-router";
import { AUTO_ENDPOINT_ORDER, buildVoiceChain, listVoiceEngines } from "@/lib/aurora/tts-oss/engine-registry";
import {
  applyVoiceChainPriority,
  completarPrioridad,
  getVoiceChainPriority,
} from "@/lib/aurora/tts-oss/omnivoice-web-router";
import {
  NEURAL_VOICE_ENGINES,
  getEngineSettings,
  getVoiceConfig,
  isNeuralEngine,
  isVoiceEngineId,
  setEngineSettings,
  setVoiceConfig,
} from "@/lib/aurora/tts-oss/voice-config";

const TEXTO = "Hola, esta es una prueba de la cadena de voz.";
const GUION = "Speaker 0: Hola, soy Aurora.\nSpeaker 1: Y yo soy Astra.";

function conServidor(motor: "voice158" | "vibevoice", endpoint: string): void {
  setEngineSettings(motor, { endpoint });
}

beforeEach(() => {
  window.localStorage.clear();
  motores.vivos.clear();
  motores.hablan.clear();
  motores.pings.length = 0;
  motores.hablados.length = 0;
  // Red cortada: si algo se escapa de los simulados, falla en alto.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red en pruebas"); }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("config de voz: ya no se descartan", () => {
  it("son motores por endpoint, elegibles y fijables", () => {
    for (const m of ["voice158", "vibevoice"]) {
      expect(isNeuralEngine(m)).toBe(true);
      expect(isVoiceEngineId(m)).toBe(true);
      expect(NEURAL_VOICE_ENGINES).toContain(m);
    }
  });

  it("su endpoint sobrevive al guardado y la elección explícita no vuelve a «navegador»", () => {
    conServidor("voice158", "http://127.0.0.1:8000");
    conServidor("vibevoice", "http://gpu.local:7860");
    expect(getEngineSettings("voice158").endpoint).toBe("http://127.0.0.1:8000");
    expect(getEngineSettings("vibevoice").endpoint).toBe("http://gpu.local:7860");
    setVoiceConfig({ engine: "vibevoice" });
    expect(getVoiceConfig().engine).toBe("vibevoice");
  });

  it("la UI ya no los da por no soportados: sin servidor pide endpoint, con él queda configurado", () => {
    const fila = (m: string) => listVoiceEngines().find((r) => r.meta.id === m)?.availability;
    expect(fila("voice158")).toBe("needs-endpoint");
    expect(fila("vibevoice")).toBe("needs-endpoint");
    conServidor("voice158", "http://127.0.0.1:8000");
    expect(fila("voice158")).toBe("configured");
  });
});

describe("su sitio en la cadena respeta el registro", () => {
  it("la jerarquía los pone en el orden de AUTO_ENDPOINT_ORDER y delante de Kokoro", () => {
    const pri = getVoiceChainPriority();
    for (const nuevo of ["voice158", "vibevoice"] as const) {
      expect(pri.indexOf(nuevo)).toBeGreaterThanOrEqual(0);
      expect(pri.indexOf(nuevo)).toBeLessThan(pri.indexOf("kokoro"));
      for (const otro of AUTO_ENDPOINT_ORDER) {
        if (otro === nuevo || !pri.includes(otro)) continue;
        const enRegistro = AUTO_ENDPOINT_ORDER.indexOf(nuevo) < AUTO_ENDPOINT_ORDER.indexOf(otro);
        expect(pri.indexOf(nuevo) < pri.indexOf(otro), `${nuevo} frente a ${otro}`).toBe(enRegistro);
      }
    }
  });

  it("con servidor configurado entran en AUTO y la jerarquía no los manda al final", () => {
    conServidor("voice158", "http://127.0.0.1:8000");
    conServidor("vibevoice", "http://gpu.local:7860");
    const cadena = buildVoiceChain(getVoiceConfig(), null);
    expect(cadena.slice(0, 2)).toEqual(["voice158", "vibevoice"]);
    const ordenada = applyVoiceChainPriority(cadena);
    expect(ordenada.slice(0, 2)).toEqual(["voice158", "vibevoice"]);
    expect(ordenada.indexOf("vibevoice")).toBeLessThan(ordenada.indexOf("omnivoice"));
    expect(ordenada.indexOf("vibevoice")).toBeLessThan(ordenada.indexOf("kokoro"));
  });

  it("un orden guardado de antes conserva lo de la persona y los suma en su sitio", () => {
    const viejo = ["omnivoice", "openvoice2", "chatterbox", "kokoro", "voicebox", "voxcpm", "bark", "gpt-sovits", "kitten", "browser"];
    const nuevo = completarPrioridad(viejo);
    expect(nuevo.slice(0, 2)).toEqual(["voice158", "vibevoice"]);
    expect(nuevo.slice(2)).toEqual(viejo);
  });

  it("xAI no entra nunca por AUTO, y fijado por una personalidad va delante de Kokoro", () => {
    const auto = buildVoiceChain(getVoiceConfig(), null);
    expect(auto).not.toContain("xai");
    const fijada = buildVoiceChain(getVoiceConfig(), "xai");
    expect(fijada[0]).toBe("xai");
    const ordenada = applyVoiceChainPriority(fijada);
    expect(ordenada.indexOf("xai")).toBeLessThan(ordenada.indexOf("kokoro"));
  });

  it("un orden guardado sin xAI no se reescribe, pero el orden efectivo lo sube delante de Kokoro", () => {
    const viejo = ["voice158", "vibevoice", "voicebox", "omnivoice", "openvoice2", "chatterbox", "kokoro", "voxcpm", "bark", "gpt-sovits", "kitten", "browser"];
    window.localStorage.setItem("starseed.aurora.voice.priority.v1", JSON.stringify(viejo));
    expect(completarPrioridad(viejo)).not.toContain("xai");
    const efectivo = getVoiceChainPriority();
    expect(efectivo.filter((m) => m !== "xai")).toEqual(viejo);
    expect(efectivo.indexOf("xai")).toBeLessThan(efectivo.indexOf("kokoro"));
  });
});

describe("speak-router: los intenta en su sitio cuando su servidor responde", () => {
  it("voz 1.58-bit viva → habla ella primero, por delante de OmniVoice", async () => {
    conServidor("voice158", "http://127.0.0.1:8000");
    motores.vivos.add("voice158");
    motores.hablan.add("voice158").add("omnivoice");
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();
    expect(await speakWithConfiguredEngine(TEXTO, { onStart, onEnd, onError })).toBe(true);
    expect(motores.hablados.map((h) => h.motor)).toEqual(["voice158"]);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(motorQueSono()).toBe("voice158");
  });

  it("servidor apagado → se salta sin pedirle audio ni error visible, y el siguiente cubre el turno", async () => {
    conServidor("voice158", "http://127.0.0.1:8000");
    conServidor("vibevoice", "http://gpu.local:7860");
    motores.hablan.add("voice158").add("vibevoice").add("omnivoice");
    const onStart = vi.fn();
    const onError = vi.fn();
    expect(await speakWithConfiguredEngine(TEXTO, { onStart, onError })).toBe(true);
    expect(motores.pings.slice(0, 2)).toEqual(["voice158", "vibevoice"]);
    expect(motores.hablados.map((h) => h.motor)).toEqual(["omnivoice"]);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(motorQueSono()).toBe("omnivoice");
  });

  it("VibeVoice vivo tras una voz 1.58-bit apagada → habla él con el guion multi-locutor", async () => {
    conServidor("voice158", "http://127.0.0.1:8000");
    conServidor("vibevoice", "http://gpu.local:7860");
    motores.vivos.add("vibevoice");
    motores.hablan.add("vibevoice").add("omnivoice");
    expect(await speakWithConfiguredEngine(TEXTO, { multiSpeakerScript: GUION })).toBe(true);
    expect(motores.hablados).toEqual([{ motor: "vibevoice", texto: GUION }]);
  });

  it("vivo pero sin audio → pasa al siguiente en la misma frase (el turno no se pierde)", async () => {
    conServidor("vibevoice", "http://gpu.local:7860");
    motores.vivos.add("vibevoice");
    motores.hablan.add("omnivoice");
    expect(await speakWithConfiguredEngine(TEXTO)).toBe(true);
    expect(motores.hablados.map((h) => h.motor)).toEqual(["vibevoice", "omnivoice"]);
  });

  it("elegido a mano y vivo → habla aunque la persona no tenga más servidores", async () => {
    setVoiceConfig({ engine: "vibevoice" });
    conServidor("vibevoice", "http://gpu.local:7860");
    motores.vivos.add("vibevoice");
    motores.hablan.add("vibevoice");
    expect(await speakWithConfiguredEngine(TEXTO)).toBe(true);
    expect(motores.hablados[0]?.motor).toBe("vibevoice");
  });
});

describe("rutas dedicadas: hablan con el servidor cuya salud se comprobó", () => {
  type Real = typeof import("@/lib/aurora/tts-oss/neural-tts");
  const real = () => vi.importActual<Real>("@/lib/aurora/tts-oss/neural-tts");

  beforeEach(() => {
    vi.stubGlobal(
      "Audio",
      class {
        onended: (() => void) | null = null;
        constructor(public src: string) {}
        play() { return Promise.resolve(); }
      },
    );
    URL.createObjectURL = vi.fn(() => "blob:prueba");
  });

  it("usa el endpoint de Ajustes → Voz (antes iba siempre al backend de la neurona)", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, blob: async () => ({ size: 4 }), text: async () => "" };
    }));
    const { neuralSpeak } = await real();
    const onStart = vi.fn();
    const audio = await neuralSpeak("voice158", TEXTO, {
      settings: { endpoint: "https://mi-tunel.example" },
      onStart,
    });
    expect(audio).not.toBeNull();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(await neuralSpeak("voice158", TEXTO, { settings: { endpoint: "http://10.0.0.5:9000/voz/tts" } })).not.toBeNull();
    expect(urls).toEqual(["https://mi-tunel.example/api/voice/synthesize", "http://10.0.0.5:9000/voz/tts"]);
  });

  it("VibeVoice respeta la ruta explícita del endpoint (no le añade la suya)", async () => {
    const urls: string[] = [];
    vi.stubGlobal("Audio", class {
      onended: (() => void) | null = null;
      constructor(public src: string) {}
      play() { this.onended?.(); return Promise.resolve(); }
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return {
        ok: true,
        status: 200,
        headers: { get: () => "audio/wav" },
        arrayBuffer: async () => new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00]),
      };
    }));
    const { neuralSpeak } = await real();
    conServidor("vibevoice", "http://gpu.local:7860/vibe");
    expect(await neuralSpeak("vibevoice", TEXTO)).not.toBeNull();
    conServidor("vibevoice", "http://127.0.0.1:5195");
    expect(await neuralSpeak("vibevoice", TEXTO)).not.toBeNull();
    expect(urls).toEqual([
      "http://gpu.local:7860/vibe",
      "http://127.0.0.1:5195/api/vibevoice/synthesize",
    ]);
  });

  it("un backend colgado no se queda con el turno: se corta a su presupuesto", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_ok, falla) => {
        init?.signal?.addEventListener("abort", () => falla(new Error("abortado")));
      })));
    const { neuralSpeak, ENGINE_TIMEOUT_MS } = await real();
    const onError = vi.fn();
    const p = neuralSpeak("voice158", TEXTO, { settings: { endpoint: "http://127.0.0.1:8000" }, onError });
    await vi.advanceTimersByTimeAsync(ENGINE_TIMEOUT_MS.voice158);
    expect(await p).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
