// @vitest-environment jsdom
/**
 * SGO1024D (1024S) — El motor ACTIVO aplica la MISMA jerarquía que la cadena de
 * voz y, cuando toca VibeVoice, el router ya puede preparar su guion multi-locutor.
 *
 * Antes `resolveActiveVoiceEngine` devolvía casi siempre el pin de DEFECTO
 * (openvoice2) aunque esta neurona/persona tuviera VibeVoice configurado: el
 * guion se perdía y VibeVoice hablaba todo como Speaker 0.
 *
 * Sin red ni audio: configuraciones simuladas (cfg + localStorage vacío).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildVoiceChain,
  motorActivoDeCadena,
  pinDeVozVaPrimero,
  resolverMotorPorJerarquia,
  resolveActiveVoiceEngine,
} from "@/lib/aurora/tts-oss/engine-registry";
import type { AuroraVoiceConfig } from "@/lib/aurora/tts-oss/voice-config";

function cfg(parcial: Partial<AuroraVoiceConfig> = {}): AuroraVoiceConfig {
  return { engine: "browser", auto: true, autoDownload: false, ...parcial };
}

const CON_VIBEVOICE = cfg({
  engines: { vibevoice: { endpoint: "http://gpu.local:7860" } },
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("jerarquía de ámbitos: agente › personalidad › cerebro › neurona › cuenta", () => {
  it("gana el ámbito más específico que nombre un motor válido", () => {
    expect(
      resolverMotorPorJerarquia({
        agente: "vibevoice",
        personalidad: "voxcpm",
        cerebro: "voicebox",
        neurona: "omnivoice",
        cuenta: "openvoice2",
      }),
    ).toEqual({ motor: "vibevoice", scope: "agente" });

    expect(
      resolverMotorPorJerarquia({
        personalidad: "voxcpm",
        cerebro: "voicebox",
        neurona: "omnivoice",
        cuenta: "openvoice2",
      }),
    ).toEqual({ motor: "voxcpm", scope: "personalidad" });
  });

  it("ignora valores inválidos y, si nadie fija motor, deja el defecto", () => {
    expect(
      resolverMotorPorJerarquia({ agente: "inventado", personalidad: 42, cuenta: "browser" }),
    ).toEqual({ motor: "browser", scope: "cuenta" });
    expect(resolverMotorPorJerarquia({})).toEqual({ motor: null, scope: "defecto" });
  });

  it("el pin de DEFECTO no adelanta al AUTO; un pin explícito sí", () => {
    expect(pinDeVozVaPrimero("defecto", true)).toBe(false);
    expect(pinDeVozVaPrimero("defecto", false)).toBe(true);
    expect(pinDeVozVaPrimero("personalidad", true)).toBe(true);
    expect(pinDeVozVaPrimero("neurona", true)).toBe(true);
  });
});

describe("VibeVoice en la cadena y como motor activo", () => {
  it("con su servidor configurado, AUTO lo pone primero y el motor activo es VibeVoice", () => {
    expect(buildVoiceChain(CON_VIBEVOICE, null)[0]).toBe("vibevoice");
    expect(resolveActiveVoiceEngine(CON_VIBEVOICE)).toBe("vibevoice");
  });

  it("el pin de DEFECTO (openvoice2) ya no tapa a VibeVoice", () => {
    expect(buildVoiceChain(CON_VIBEVOICE, "openvoice2", { pinScope: "defecto" })[0]).toBe(
      "vibevoice",
    );
    // Con AUTO apagado el defecto sí manda (no se pierde la voz de fábrica).
    const sinAuto = cfg({ auto: false, engines: CON_VIBEVOICE.engines });
    expect(buildVoiceChain(sinAuto, "openvoice2", { pinScope: "defecto" })[0]).toBe("openvoice2");
  });

  it("un pin EXPLÍCITO de la personalidad sigue yendo primero", () => {
    const cadena = buildVoiceChain(CON_VIBEVOICE, "omnivoice", { pinScope: "personalidad" });
    expect(cadena[0]).toBe("omnivoice");
    expect(cadena).toContain("vibevoice");
  });

  it("sin VibeVoice configurado, el activo cae al siguiente de la cadena", () => {
    const sinVibe = cfg();
    expect(resolveActiveVoiceEngine(sinVibe)).not.toBe("vibevoice");
    expect(buildVoiceChain(sinVibe, null)).not.toContain("vibevoice");
  });
});

describe("motor activo de una cadena: solo cuenta lo que puede hablar ya", () => {
  it("salta Kokoro sin modelo descargado y el stub Kitten", () => {
    expect(motorActivoDeCadena(["kokoro", "kitten", "browser"])).toBe("browser");
    expect(motorActivoDeCadena(["kitten"])).toBe("browser");
  });

  it("Kokoro cuenta cuando no hay que descargar por sorpresa", () => {
    expect(motorActivoDeCadena(["kokoro", "omnivoice"], { autoDownload: true })).toBe("kokoro");
    expect(motorActivoDeCadena(["omnivoice", "kokoro"], { autoDownload: true })).toBe("omnivoice");
  });

  it("una cadena vacía devuelve el navegador (el suelo que nunca falla)", () => {
    expect(motorActivoDeCadena([])).toBe("browser");
  });
});
