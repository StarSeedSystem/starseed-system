/**
 * Voces NO comerciales (rescate RTINV1025Ic · rama nube/40890170554).
 *
 * Main no tomó el módulo unificado de fichas de la rama: hoy F5-TTS vive en el
 * manifiesto de la forja y XTTS-v2 en el registro de integraciones; ChatTTS no
 * tiene ficha en producto. Estas pruebas fijan lo que SÍ es contrato de main:
 * licencia honesta en cada ficha que existe y NINGUNA de las tres enganchada
 * a la cadena de sonido del OS (ni como motor, ni en el orden automático).
 */
import { describe, it, expect } from "vitest";
import { MODELOS_FUENTE } from "@/lib/voces/forja/manifiesto";
import { integrationById, isDirectlyIntegrable } from "@/lib/integrations/integration-registry";
import { AUTO_ENDPOINT_ORDER, VOICE_ENGINE_REGISTRY } from "@/lib/aurora/tts-oss/engine-registry";
import { isVoiceEngineId } from "@/lib/aurora/tts-oss/voice-config";

const NO_COMERCIALES = ["f5-tts", "xtts-v2", "chattts"] as const;

describe("voces no comerciales (F5-TTS, XTTS-v2, ChatTTS)", () => {
  it("F5-TTS: código MIT y pesos CC-BY-NC-4.0, sin español y nunca en producto", () => {
    const f = MODELOS_FUENTE.find((m) => m.id === "f5-tts");
    expect(f).toMatchObject({
      licencia: "MIT",
      licenciaPesos: "CC-BY-NC-4.0",
      estado: "descartado-para-producto",
    });
    expect(f?.idiomas).not.toMatch(/español/);
  });

  it("XTTS-v2: pesos CPML no comerciales y nunca integrable directo", () => {
    const xtts = integrationById("xtts-v2");
    expect(xtts).toBeDefined();
    expect(xtts?.license).toMatch(/CPML/);
    expect(xtts?.license).toMatch(/no comercial/);
    expect(xtts?.licenseClass).toBe("non-commercial");
    if (xtts) expect(isDirectlyIntegrable(xtts)).toBe(false);
  });

  it("ninguna de las tres es un motor de la cadena ni entra al orden automático", () => {
    for (const id of NO_COMERCIALES) {
      expect(isVoiceEngineId(id), id).toBe(false);
      expect(id in VOICE_ENGINE_REGISTRY, id).toBe(false);
      expect((AUTO_ENDPOINT_ORDER as readonly string[]).includes(id), id).toBe(false);
    }
  });

  it("ChatTTS no tiene ficha en producto: solo vive en la documentación", () => {
    expect(MODELOS_FUENTE.some((m) => m.id === "chattts")).toBe(false);
    expect(integrationById("chattts")).toBeUndefined();
  });
});
