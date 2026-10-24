/**
 * VOZ1024B — voice158 y vibevoice alcanzan la cadena de voz.
 * ============================================================================
 * Hallado por VZR1011B: los dos motores no contarían como neurales (`isNeuralEngine`),
 * `runLink` los rechazaba en silencio aunque AUTO los pusiera primero, y
 * `completarPrioridad` mandaba a todo motor fuera de DEFAULT_CHAIN_PRIORITY
 * detrás de Kokoro.
 *
 * MOTORES SIMULADOS: sin red ni audio. La regla del relevo (salud → intentar o
 * pasar al siguiente sin error) es pura y se prueba por su OUTCOME, no por un
 * fetch real: `inventa158PorSalud + base158De + isNeuralEngine`. La cadena se
 * simula con `buildVoiceChain` + `applyVoiceChainPriority` (localStorage nulo
 * en Node ⇒ prioridad por defecto, determinista).
 */
import { describe, expect, it } from "vitest";
import {
  VOZ158_BASE_FALLBACK,
  base158De,
  intenta158PorSalud,
  type EstadoSalud158,
} from "@/lib/aurora/tts-oss/speak-router";
import {
  applyVoiceChainPriority,
  completarPrioridad,
} from "@/lib/aurora/tts-oss/omnivoice-web-router";
import { buildVoiceChain } from "@/lib/aurora/tts-oss/engine-registry";
import {
  getVoiceConfig,
  isNeuralEngine,
  isVoiceEngineId,
  type AuroraVoiceConfig,
} from "@/lib/aurora/tts-oss/voice-config";

// ── Motores simulados de la prueba ───────────────────────────────────────────

/** Servidores simulados: el backend 1.58 de la neurona y el GPU de vibevoice. */
const BASE_158_NEURONA = "http://127.0.0.1:8000";
const BASE_VIBE = "http://192.168.1.40:4446";

function cfgConMotores158(): AuroraVoiceConfig {
  const base = getVoiceConfig();
  return {
    ...base,
    engine: "browser",
    auto: true,
    engines: {
      ...base.engines,
      voice158: { endpoint: BASE_158_NEURONA },
      vibevoice: { endpoint: BASE_VIBE },
    },
  };
}

describe("isNeuralEngine los cuenta", () => {
  it("voice158 y vibevoice son motores por endpoint de verdad", () => {
    expect(isNeuralEngine("voice158")).toBe(true);
    expect(isNeuralEngine("vibevoice")).toBe(true);
    expect(isVoiceEngineId("voice158")).toBe(true);
    expect(isVoiceEngineId("vibevoice")).toBe(true);
  });

  it("el resto no cambia: kokoro/kitten no son de endpoint, browser tampoco", () => {
    expect(isNeuralEngine("kokoro")).toBe(false);
    expect(isNeuralEngine("kitten")).toBe(false);
    expect(isNeuralEngine("browser")).toBe(false);
    expect(isNeuralEngine("voxcpm")).toBe(true);
  });
});

describe("regla del relevo por salud (pura, sin red)", () => {
  it("salud ok → se atiene («intentar»); cualquier otra cosa → siguiente eslabón", () => {
    expect(intenta158PorSalud("ok")).toBe(true);
    expect(intenta158PorSalud("unreachable")).toBe(false);
    expect(intenta158PorSalud("no-endpoint")).toBe(false);
    const todos: EstadoSalud158[] = ["ok", "unreachable", "no-endpoint"];
    expect(todos.filter(intenta158PorSalud)).toEqual(["ok"]);
  });

  it("base de health158: la de la neurona (limpia) o el local por defecto", () => {
    expect(base158De("http://192.168.1.4:9000/")).toBe("http://192.168.1.4:9000");
    expect(base158De("  http://10.0.0.2:8000  ")).toBe("http://10.0.0.2:8000");
    expect(base158De(null)).toBe(VOZ158_BASE_FALLBACK);
    expect(base158De(undefined)).toBe(VOZ158_BASE_FALLBACK);
    expect(base158De("   ")).toBe(VOZ158_BASE_FALLBACK);
    expect(VOZ158_BASE_FALLBACK).toBe(BASE_158_NEURONA);
  });
});
