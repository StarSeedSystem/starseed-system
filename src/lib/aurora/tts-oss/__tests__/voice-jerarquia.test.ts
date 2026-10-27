/**
 * Voz1024D · Tests del resolutor de jerarquía de pines del motor de voz.
 * Función pura: entrada → salida, sin red, sin disco, sin storage.
 */
import { describe, it, expect } from "vitest";
import {
  resolveVoiceEngineFromHierarchy,
  type VoiceEngineHierarchyPins,
} from "@/lib/aurora/tts-oss/voice-config";

describe("resolveVoiceEngineFromHierarchy", () => {
  it("vacio → null (el llamador cae al navegador)", () => {
    const pins: VoiceEngineHierarchyPins = {};
    expect(resolveVoiceEngineFromHierarchy(pins)).toBeNull();
  });

  it("el pin del agente manda sobre personalidad, cerebro, neurona y cuenta", () => {
    expect(
      resolveVoiceEngineFromHierarchy({
        agente: "voxcpm",
        personalidad: "vibevoice",
        cerebro: "bark",
        neurona: "omnivoice",
        cuenta: "openvoice2",
      }),
    ).toBe("voxcpm");
  });

  it("sin agente, la personalidad gana", () => {
    expect(
      resolveVoiceEngineFromHierarchy({ personalidad: "vibevoice", cuenta: "openvoice2" }),
    ).toBe("vibevoice");
  });

  it("sin agente ni personalidad, el cerebro sigue", () => {
    expect(resolveVoiceEngineFromHierarchy({ cerebro: "voicebox", cuenta: "openvoice2" })).toBe(
      "voicebox",
    );
  });

  it("solo neurona → la neurona decide", () => {
    expect(resolveVoiceEngineFromHierarchy({ neurona: "omnivoice", cuenta: "openvoice2" })).toBe(
      "omnivoice",
    );
  });

  it("pin de browser se salta (el suelo es del llamador), y baja el nivel", () => {
    expect(
      resolveVoiceEngineFromHierarchy({ agente: "browser", personalidad: "vibevoice" }),
    ).toBe("vibevoice");
    expect(resolveVoiceEngineFromHierarchy({ cuenta: "browser" })).toBeNull();
  });

  it("valores basura o desconocidos se validan y se descartan", () => {
    expect(
      resolveVoiceEngineFromHierarchy({
        agente: "motor-inexistente",
        personalidad: 42,
        cerebro: "  ",
        neurona: "vibevoice",
      }),
    ).toBe("vibevoice");
  });

  it("objetos raros o lanzamientos: nunca explota y devuelve null", () => {
    const roto = { agente: undefined, personalidad: null, cerebro: [], neurona: {} };
    expect(resolveVoiceEngineFromHierarchy(roto)).toBeNull();
    expect(resolveVoiceEngineFromHierarchy({} as VoiceEngineHierarchyPins)).toBeNull();
  });
});
