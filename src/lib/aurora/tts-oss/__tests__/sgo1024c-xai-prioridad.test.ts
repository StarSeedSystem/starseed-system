/**
 * SGO1024C — xAI en la jerarquía de la cadena de voz.
 *
 * Sin red ni disco: la prioridad es una función pura sobre `localStorage`
 * (que aquí se simula). xAI entra por pin de personalidad o elección explícita,
 * nunca por AUTO, pero su sitio en la jerarquía debe quedar DELANTE de Kokoro:
 * sin estar en la lista, `applyVoiceChainPriority` lo mandaba al final y una
 * personalidad fijada a xAI acababa oyéndose con Kokoro.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyVoiceChainPriority,
  getVoiceChainPriority,
} from "@/lib/aurora/tts-oss/omnivoice-web-router";

const CLAVE_PRIORIDAD = "starseed.aurora.voice.priority.v1";

const PRIORIDAD_SIN_XAI = [
  "voice158",
  "vibevoice",
  "voicebox",
  "omnivoice",
  "openvoice2",
  "chatterbox",
  "kokoro",
  "voxcpm",
  "bark",
  "gpt-sovits",
  "kitten",
  "browser",
];

function simularAlmacen(guardado?: string): void {
  const datos = new Map<string, string>();
  if (guardado !== undefined) datos.set(CLAVE_PRIORIDAD, guardado);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => {
        datos.set(k, v);
      },
      removeItem: (k: string) => {
        datos.delete(k);
      },
      clear: () => {
        datos.clear();
      },
      key: (i: number) => [...datos.keys()][i] ?? null,
      get length() {
        return datos.size;
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("xAI en la jerarquía de motores", () => {
  it("el orden recomendado lo pone detrás de Chatterbox y DELANTE de Kokoro", () => {
    const pri = getVoiceChainPriority();
    expect(pri).toContain("xai");
    expect(pri.indexOf("xai")).toBeGreaterThan(pri.indexOf("chatterbox"));
    expect(pri.indexOf("xai")).toBeLessThan(pri.indexOf("kokoro"));
  });

  it("una personalidad fijada a xAI ya no se oye con Kokoro", () => {
    const ordenada = applyVoiceChainPriority(["kokoro", "xai"]);
    expect(ordenada).toEqual(["xai", "kokoro"]);
  });

  it("un orden guardado antes de xAI lo suma en su sitio, sin tocar el resto", () => {
    simularAlmacen(JSON.stringify(PRIORIDAD_SIN_XAI));
    const pri = getVoiceChainPriority();
    expect(pri.indexOf("xai")).toBeGreaterThan(pri.indexOf("chatterbox"));
    expect(pri.indexOf("xai")).toBeLessThan(pri.indexOf("kokoro"));
    expect(pri.filter((m) => m !== "xai")).toEqual(PRIORIDAD_SIN_XAI);
  });
});
