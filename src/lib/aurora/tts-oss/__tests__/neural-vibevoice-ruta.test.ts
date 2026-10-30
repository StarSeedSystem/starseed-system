// @vitest-environment jsdom
/**
 * VOZ1024C · parte 2 — VibeVoice respeta la ruta explícita de su endpoint.
 *
 * Antes `neuralSpeakVibeVoice` añadia SIEMPRE `/api/vibevoice/synthesize`: con
 * un endpoint tipo `http://gpu.local:7860/api/vibevoice/synthesize` la síntesis
 * iba a `.../api/vibevoice/synthesize/api/vibevoice/synthesize` (404 seguro).
 *
 * Sin red ni audio: el servidor VibeVoice se simula con `fetch` inyectado y un
 * `<audio>` falso; la lógica bajo prueba es la real de `neural-tts.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { neuralSpeak } from "@/lib/aurora/tts-oss/neural-tts";
import { setEngineSettings } from "@/lib/aurora/tts-oss/voice-config";

const TEXTO = "Hola, esta es una prueba de VibeVoice.";
const GUION = "Speaker 0: Hola, soy Aurora.\nSpeaker 1: Y yo soy Astra.";

/** Servidor simulado: registra cada URL posteada y responde WAV. */
const peticiones: string[] = [];
let cuerpos: Array<Record<string, unknown>> = [];

/** Respuesta fake con 4 primeros bytes "RIFF" (looksLikeAudio = true). */
function respuestaWav(): unknown {
  const riff = new Uint8Array([0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0]);
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "audio/wav" : null) },
    arrayBuffer: async () => riff.buffer,
    text: async () => "",
  };
}

function encenderVibeVoice(endpoint: string): void {
  setEngineSettings("vibevoice", { endpoint });
}

beforeEach(() => {
  window.localStorage.clear();
  peticiones.length = 0;
  cuerpos = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      peticiones.push(url);
      try { cuerpos.push(JSON.parse(init?.body ?? "{}")); } catch { cuerpos.push({}); }
      return respuestaWav();
    }),
  );
  class AudioFalso {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public src: string) {}
    play() {
      return Promise.resolve().then(() => { this.onended?.(); });
    }
  }
  vi.stubGlobal("Audio", AudioFalso);
  // jsdom no trae blob-URLs: se añaden como métodos estáticos (mantienen intactas
  // clases como `new URL(...)` que `normalizeEndpoint` necesita).
  URL.createObjectURL = vi.fn(() => "blob:prueba");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("neuralSpeakVibeVoice: la ruta del endpoint se respeta", () => {
  it("endpoint solo origen → POST a {base}/api/vibevoice/synthesize (ruta primaria del registro)", async () => {
    encenderVibeVoice("http://gpu.local:7860");
    const audio = await neuralSpeak("vibevoice", TEXTO);
    expect(audio).not.toBeNull();
    expect(peticiones).toEqual(["http://gpu.local:7860/api/vibevoice/synthesize"]);
  });

  it("endpoint con ruta explícita → POST TAL CUAL (no se le añade ninguna ruta)", async () => {
    encenderVibeVoice("http://gpu.local:7860/api/vibevoice/synthesize");
    const audio = await neuralSpeak("vibevoice", TEXTO);
    expect(audio).not.toBeNull();
    expect(peticiones).toEqual(["http://gpu.local:7860/api/vibevoice/synthesize"]);
  });

  it("el túnel del usuario con SU propia ruta concreta también se usa tal cual", async () => {
    // La barra final la normaliza el módulo (normalizeEndpoint) — igual que con
    // endpoints solo origen; lo importante: no se añade NINGUNA ruta de registro.
    encenderVibeVoice("https://mi-tunel.example/vibe/hablar/");
    const audio = await neuralSpeak("vibevoice", TEXTO);
    expect(audio).not.toBeNull();
    expect(peticiones).toEqual(["https://mi-tunel.example/vibe/hablar"]);
  });

  it("el cuerpo sigue siendo {script SIN DOBLE RUTA}: frase suelta etiquetada como Speaker 0", async () => {
    encenderVibeVoice("http://gpu.local:7860");
    await neuralSpeak("vibevoice", TEXTO);
    expect(cuerpos).toEqual([{ script: `Speaker 0: ${TEXTO}` }]);
  });

  it("el guion multi-locutor viaja SIN tocar", async () => {
    encenderVibeVoice("http://gpu.local:7860/api/vibevoice/synthesize");
    await neuralSpeak("vibevoice", GUION);
    expect(cuerpos).toEqual([{ script: GUION }]);
  });
});
