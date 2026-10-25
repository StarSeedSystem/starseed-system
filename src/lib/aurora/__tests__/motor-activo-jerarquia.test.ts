// @vitest-environment jsdom
/**
 * SGO1024D — La jerarquía de voz decide el motor activo.
 *
 * `resolveActiveVoiceEngine` devolvía casi siempre el pin de fábrica
 * «openvoice2»: tapaba la elección de agente/personalidad/cerebro/neurona/cuenta
 * y por eso el router nunca preparaba el guion multi-locutor de VibeVoice.
 * Aquí se prueban la jerarquía pura y la resolución con configuraciones
 * simuladas, sin red ni audio.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  resolverMotorVozPorJerarquia,
  resolveActiveVoiceEngine,
  type CapasMotorVoz,
} from "@/lib/aurora/tts-oss/engine-registry";
import {
  DEFAULT_VOICE_CONFIG,
  type AuroraVoiceConfig,
  type AuroraVoiceEngine,
} from "@/lib/aurora/tts-oss/voice-config";

const VIBEVOICE = "http://gpu.local:7860";
const VOXCPM = "http://vox.local:8000";

function config(
  engines: AuroraVoiceConfig["engines"] = {},
  engine: AuroraVoiceEngine = "browser",
): AuroraVoiceConfig {
  return { ...DEFAULT_VOICE_CONFIG, engine, auto: true, engines };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("jerarquía pura: agente › personalidad › cerebro › neurona › cuenta", () => {
  it("la capa más específica gana y se declara su procedencia", () => {
    const capas: CapasMotorVoz = {
      agente: "vibevoice",
      personalidad: "voxcpm",
      cerebro: "voicebox",
      neurona: "omnivoice",
      cuenta: "openvoice2",
    };
    expect(resolverMotorVozPorJerarquia(capas)).toEqual({ motor: "vibevoice", ambito: "agente" });
    expect(resolverMotorVozPorJerarquia({ ...capas, agente: null })).toEqual({ motor: "voxcpm", ambito: "personalidad" });
    expect(resolverMotorVozPorJerarquia({ ...capas, agente: null, personalidad: null })).toEqual({ motor: "voicebox", ambito: "cerebro" });
    expect(resolverMotorVozPorJerarquia({ ...capas, agente: null, personalidad: null, cerebro: null })).toEqual({ motor: "omnivoice", ambito: "neurona" });
    expect(resolverMotorVozPorJerarquia({ ...capas, agente: null, personalidad: null, cerebro: null, neurona: null })).toEqual({ motor: "openvoice2", ambito: "cuenta" });
  });

  it("salta un motor no disponible y sigue bajando por la jerarquía", () => {
    const r = resolverMotorVozPorJerarquia(
      { agente: "voxcpm", personalidad: "vibevoice" },
      (motor) => motor !== "voxcpm",
    );
    expect(r).toEqual({ motor: "vibevoice", ambito: "personalidad" });
  });

  it("ids inválidos, el navegador y las capas vacías no cuentan como pin", () => {
    const r = resolverMotorVozPorJerarquia({
      agente: "inventado",
      personalidad: "browser",
      cerebro: "",
      neurona: null,
    });
    expect(r).toEqual({ motor: "browser", ambito: "defecto" });
  });
});

describe("resolveActiveVoiceEngine con configuraciones simuladas", () => {
  it("sin pin explícito, VibeVoice configurado resuelve VibeVoice (no openvoice2)", () => {
    const cfg = config({ vibevoice: { endpoint: VIBEVOICE } });
    expect(resolveActiveVoiceEngine(cfg)).toBe("vibevoice");
  });

  it("un pin de agente gana a la personalidad y a la cuenta", () => {
    const cfg = config({ vibevoice: { endpoint: VIBEVOICE }, voxcpm: { endpoint: VOXCPM } });
    expect(resolveActiveVoiceEngine(cfg, { agente: "voxcpm", personalidad: "vibevoice" })).toBe("voxcpm");
  });

  it("un pin a un motor sin endpoint se salta y resuelve el siguiente disponible", () => {
    const cfg = config({ vibevoice: { endpoint: VIBEVOICE } });
    expect(resolveActiveVoiceEngine(cfg, { agente: "voxcpm" })).toBe("vibevoice");
  });

  it("la elección explícita de la cuenta sigue decidiendo cuando no hay capas más específicas", () => {
    const cfg = config({ voxcpm: { endpoint: VOXCPM } }, "voxcpm");
    expect(resolveActiveVoiceEngine(cfg)).toBe("voxcpm");
  });

  it("sin ningún motor configurado cae a OmniVoice antes que al navegador", () => {
    // OpenVoice aún "sin historial" se promociona la primera vez (ascenso
    // dinámico de la cadena AUTO): aquí lo damos por apartado para comprobar
    // el orden clásico de cero configuración (OmniVoice híbrido).
    window.localStorage.setItem(
      "starseed.aurora.openvoice.health.v1",
      JSON.stringify({ openvoice2: { badUntil: Date.now() + 60_000 } }),
    );
    expect(resolveActiveVoiceEngine(config())).toBe("omnivoice");
  });
});
