import { describe, it, expect } from "vitest";
import { candidateUrls } from "@/lib/aurora/tts-oss/neural-tts";

/**
 * (VOZ1024C) Costura PURA de las URLs por las que POSTea el cliente neural:
 * si el endpoint configurado ya trae una ruta explícita, se usa TAL CUAL; si es
 * solo origen, se prueban las rutas típicas del motor. El caso que motivó el
 * fix: `neuralSpeakVibeVoice` construía su URL a mano y AÑADÍA siempre
 * /api/vibevoice/synthesize aunque el endpoint ya trajera otra ruta.
 */
describe("candidateUrls — rutas de POST por motor", () => {
  it("VibeVoice con endpoint solo origen empieza por /api/vibevoice/synthesize", () => {
    const urls = candidateUrls("vibevoice", "http://127.0.0.1:5195");
    expect(urls[0]).toBe("http://127.0.0.1:5195/api/vibevoice/synthesize");
  });

  it("VibeVoice respeta la ruta explícita del endpoint (no añade la suya)", () => {
    expect(candidateUrls("vibevoice", "http://127.0.0.1:5195/vibe")).toEqual([
      "http://127.0.0.1:5195/vibe",
    ]);
  });

  it("la regla es del cliente genérico: cualquier motor con ruta explícita la mantiene", () => {
    expect(candidateUrls("voice158", "http://127.0.0.1:8000/mivoz")).toEqual([
      "http://127.0.0.1:8000/mivoz",
    ]);
  });

  it("sin ruta explícita, VoxCPM prueba primero la API OpenAI-compatible", () => {
    const urls = candidateUrls("voxcpm", "http://neurona:8808");
    expect(urls[0]).toBe("http://neurona:8808/v1/audio/speech");
  });
});
