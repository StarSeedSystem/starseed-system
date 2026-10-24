import { describe, it, expect } from "vitest";
import {
  activeEngineFromChain,
  resolveVoiceChoiceFrom,
  voiceChoiceFromConfig,
  voiceChoiceFromOverride,
  voiceChoiceFromPersonality,
  type VoiceHierarchyStore,
} from "@/lib/aurora/voice-config";

/**
 * SGO1024D — La jerarquía de voz (agente > personalidad > cerebro > neurona >
 * cuenta) se resuelve sobre configuraciones simuladas, sin red ni disco.
 * Antes el router leía el pin cacheado y casi siempre veía openvoice2, así que
 * VibeVoice no recibía su guion multi-locutor.
 */
const CTX = {
  agentId: "ag-1",
  personaId: "aurora",
  brainId: "cerebro-1",
  deviceId: "neurona-1",
};

function almacenCompleto(): VoiceHierarchyStore {
  return {
    agente: { "ag-1": { motor: "vibevoice" } },
    personalidad: { aurora: { motor: "voice158" } },
    cerebro: { "cerebro-1": { motor: "voxcpm" } },
    neurona: { "neurona-1": { motor: "omnivoice" } },
    cuenta: { motor: "bark" },
  };
}

describe("resolveVoiceChoiceFrom · precedencia de ámbitos", () => {
  it("gana el ámbito más específico: agente > personalidad > cerebro > neurona > cuenta", () => {
    const store = almacenCompleto();
    expect(resolveVoiceChoiceFrom(store, CTX)).toEqual({
      motor: "vibevoice",
      provenance: "agente",
      scopeId: "ag-1",
    });

    delete store.agente;
    expect(resolveVoiceChoiceFrom(store, CTX)).toEqual({
      motor: "voice158",
      provenance: "personalidad",
      scopeId: "aurora",
    });

    delete store.personalidad;
    expect(resolveVoiceChoiceFrom(store, CTX)?.provenance).toBe("cerebro");

    delete store.cerebro;
    expect(resolveVoiceChoiceFrom(store, CTX)?.provenance).toBe("neurona");

    delete store.neurona;
    expect(resolveVoiceChoiceFrom(store, CTX)).toEqual({
      motor: "bark",
      provenance: "cuenta",
    });
  });

  it("un motor desconocido no fija nada: hereda del ámbito siguiente", () => {
    const store: VoiceHierarchyStore = {
      agente: { "ag-1": { motor: "motor-inventado" } },
      personalidad: { aurora: { motor: "vibevoice" } },
    };
    expect(resolveVoiceChoiceFrom(store, CTX)).toEqual({
      motor: "vibevoice",
      provenance: "personalidad",
      scopeId: "aurora",
    });
  });

  it("sin elecciones devuelve null para que mande la cadena AUTO", () => {
    expect(resolveVoiceChoiceFrom({}, CTX)).toBeNull();
    expect(resolveVoiceChoiceFrom({ agente: {} }, CTX)).toBeNull();
  });

  it("sin id del contexto no aplica ese ámbito", () => {
    const store: VoiceHierarchyStore = { personalidad: { aurora: { motor: "vibevoice" } } };
    expect(resolveVoiceChoiceFrom(store, {})).toBeNull();
    expect(resolveVoiceChoiceFrom(store, { personaId: "hermione" })).toBeNull();
  });
});

describe("voiceChoiceFromPersonality", () => {
  it("motorVoz solo manda en modo «fija»", () => {
    expect(
      voiceChoiceFromPersonality({
        intelligence: { modo: "fija", motorVoz: "vibevoice" },
      }),
    ).toBe("vibevoice");
    expect(
      voiceChoiceFromPersonality({
        intelligence: { modo: "auto", motorVoz: "vibevoice" },
      }),
    ).toBeNull();
  });

  it("porSentido.voz.fuente (modo fija) y voiceStyle.engine (cualquier modo)", () => {
    expect(
      voiceChoiceFromPersonality({
        intelligence: { modo: "fija", porSentido: { voz: { fuente: "voice158" } } },
      }),
    ).toBe("voice158");
    expect(
      voiceChoiceFromPersonality({
        intelligence: { modo: "auto" },
        voiceStyle: { engine: "omnivoice" },
      }),
    ).toBe("omnivoice");
  });
});

describe("voiceChoiceFromOverride y voiceChoiceFromConfig", () => {
  it("lee el override de la neurona y descarta motores desconocidos", () => {
    expect(voiceChoiceFromOverride({ voz: { motor: "vibevoice" } })).toBe("vibevoice");
    expect(voiceChoiceFromOverride({ voz: { motor: "nope" } })).toBeNull();
    expect(voiceChoiceFromOverride(null)).toBeNull();
  });

  it("la cuenta elige motor, salvo «navegador» (que no fija nada)", () => {
    expect(voiceChoiceFromConfig({ engine: "vibevoice", autoDownload: false })).toBe("vibevoice");
    expect(voiceChoiceFromConfig({ engine: "browser", autoDownload: false })).toBeNull();
  });
});

describe("activeEngineFromChain · qué motor hablaría de verdad", () => {
  it("resuelve VibeVoice cuando encabeza la cadena", () => {
    expect(activeEngineFromChain(["vibevoice", "omnivoice"], { autoDownload: false })).toBe("vibevoice");
  });

  it("Kokoro solo cuenta con el modelo listo o descarga autorizada", () => {
    expect(activeEngineFromChain(["kokoro"], { autoDownload: false })).toBe("browser");
    expect(activeEngineFromChain(["kokoro"], { autoDownload: true })).toBe("kokoro");
  });

  it("Kitten (stub) se salta y la cadena vacía cae al navegador", () => {
    expect(activeEngineFromChain(["kitten", "omnivoice"], { autoDownload: false })).toBe("omnivoice");
    expect(activeEngineFromChain([])).toBe("browser");
  });
});
