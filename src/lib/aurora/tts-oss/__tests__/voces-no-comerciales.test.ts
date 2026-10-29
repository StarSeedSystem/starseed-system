/**
 * Rescate de pruebas (rama nube 40890170554 · RTINV1025Ic).
 * ============================================================================
 * La rama probaba una API propia (fichaNoComercial/habilita/contextos) que main
 * nunca implementó: el mismo propósito vive hoy en otros módulos — las fichas
 * de la Forja (`MODELOS_FUENTE`) y el registro curado de integraciones
 * (`INTEGRATIONS`). Estos casos adaptados fijan HOY lo que la rama pedía:
 * licencias exactas y voces no comerciales fuera de los motores del OS.
 */
import { describe, expect, it } from "vitest";

import { MODELOS_FUENTE, modelosUsablesEnProducto } from "@/lib/voces/forja/manifiesto";
import { integrationById } from "@/lib/integrations/integration-registry";
import {
  AUTO_ENDPOINT_ORDER,
  VOICE_ENGINE_REGISTRY,
} from "@/lib/aurora/tts-oss/engine-registry";
import { isNeuralEngine, isVoiceEngineId } from "@/lib/aurora/tts-oss/voice-config";

const NO_COMERCIALES = ["f5-tts", "xtts-v2", "chattts"] as const;

describe("las voces no comerciales quedan fuera del producto y de los motores", () => {
  it("F5-TTS lleva código MIT y pesos CC-BY-NC-4.0, y está descartado para producto", () => {
    const f5 = MODELOS_FUENTE.find((m) => m.id === "f5-tts");
    expect(f5).toMatchObject({
      licencia: "MIT",
      licenciaPesos: "CC-BY-NC-4.0",
      estado: "descartado-para-producto",
      verificado: false,
    });
    expect(modelosUsablesEnProducto().map((m) => m.id)).not.toContain("f5-tts");
  });

  it("XTTS-v2 está clasificado no comercial y con el aviso a la vista", () => {
    const xtts = integrationById("xtts-v2");
    expect(xtts).toMatchObject({ licenseClass: "non-commercial" });
    expect(xtts?.license).toMatch(/no comercial/i);
    expect(xtts?.caveat ?? "").toMatch(/no comercial/i);
  });

  it("no son motores del OS ni entran en la cadena AUTO", () => {
    for (const id of NO_COMERCIALES) {
      expect(Object.keys(VOICE_ENGINE_REGISTRY), id).not.toContain(id);
      expect(AUTO_ENDPOINT_ORDER as readonly string[], id).not.toContain(id);
      expect(isNeuralEngine(id), id).toBe(false);
      expect(isVoiceEngineId(id), id).toBe(false);
    }
  });
});
