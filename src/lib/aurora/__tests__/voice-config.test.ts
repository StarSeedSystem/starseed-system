import { describe, it, expect } from "vitest";
import {
  activeEngineFromChain,
  resolveVoiceChoiceFrom,
  voiceChoiceFromConfig,
  voiceChoiceFromOverride,
  voiceChoiceFromPersonality,
  type VoiceHierarchyContext,
  type VoiceHierarchyStore,
} from "@/lib/aurora/voice-config";

/**
 * SGO1024D-d1 · Parte 1 — La jerarquía de voz (agente > personalidad >
 * cerebro > neurona > cuenta) se resuelve sobre configuraciones simuladas,
 * sin red ni disco. Antes el router leía el pin cacheado y casi siempre veía
 * openvoice2, así que VibeVoice no recibía su guion multi-locutor.
 */
const CTX: VoiceHierarchyContext = {
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
    cuenta: { motor: "openvoice2" },
  };
}

describe("resolveVoiceChoiceFrom · precedencia de ámbitos", () => {
  it("gana el ámbito más específico y va bajando al quitar cada nivel", () => {
    const store = almacenCompleto();
    expect(resolveVoiceChoiceFrom(store, CTX)).toEqual({
      motor: "vibevoice", provenance: "agente", scopeId: "ag-1",
    });
    delete store.agente;
    expect(resolveVoiceChoiceFrom(store, CTX)).toEqual({
      motor: "voice158", provenance: "personalidad", scopeId: "aurora",
    });
    delete store.personalidad;
    expect(resolveVoiceChoiceFrom(store, CTX)?.provenance).toBe("cerebro");
    delete store.cerebro;
    expect(resolveVoiceChoiceFrom(store, CTX)?.provenance).toBe("neurona");
    delete store.neurona;
    expect(resolveVoiceChoiceFrom(store, CTX)).toEqual({
      motor: "openvoice2", provenance: "cuenta",
    });
  });

  it("un motor que no existe se ignora y la elección cae al siguiente ámbito", () => {
    const store: VoiceHierarchyStore = {
      agente: { "ag-1": { motor: "motor-inventado" } },
      personalidad: { aurora: { motor: "voxcpm" } },
    };
    expect(resolveVoiceChoiceFrom(store, CTX)).toEqual({
      motor: "voxcpm", provenance: "personalidad", scopeId: "aurora",
    });
  });

  it("sin elección de motor en ningún ámbito devuelve null (cadena AUTO)", () => {
    expect(resolveVoiceChoiceFrom({}, CTX)).toBeNull();
  });

  it("sin id de contexto, un ámbito por mapa no decide nada", () => {
    expect(resolveVoiceChoiceFrom(almacenCompleto(), {})).toEqual({
      motor: "openvoice2", provenance: "cuenta",
    });
  });

  it("motor null explícito hereda del siguiente ámbito", () => {
    const store: VoiceHierarchyStore = {
      agente: { "ag-1": { motor: null } },
      neurona: { "neurona-1": { motor: "bark" } },
    };
    expect(resolveVoiceChoiceFrom(store, CTX)?.provenance).toBe("neurona");
  });
});

describe("voiceChoiceFromPersonality · misma regla que refreshPersonalityVoicePin", () => {
  it("modo fija: primero motorVoz, luego porSentido.voz.fuente", () => {
    expect(voiceChoiceFromPersonality({ intelligence: { modo: "fija", motorVoz: "vibevoice" } })).toBe("vibevoice");
    expect(
      voiceChoiceFromPersonality({ intelligence: { modo: "fija", porSentido: { voz: { fuente: "bark" } } } }),
    ).toBe("bark");
  });

  it("modo fija sin pin duro: el MOTOR PREFERIDO sigue contando (Adenda 80, cualquier modo)", () => {
    expect(
      voiceChoiceFromPersonality({ intelligence: { modo: "fija" }, voiceStyle: { engine: "voice158" } }),
    ).toBe("voice158");
  });

  it("modo no fija: solo vale voiceStyle.engine (motorVoz se ignora)", () => {
    expect(voiceChoiceFromPersonality({ intelligence: { modo: "auto", motorVoz: "bark" } })).toBeNull();
    expect(voiceChoiceFromPersonality({ voiceStyle: { engine: "omnivoice" } })).toBe("omnivoice");
  });

  it("perfiles vacíos o con motor inválido → null", () => {
    expect(voiceChoiceFromPersonality(null)).toBeNull();
    expect(voiceChoiceFromPersonality({ voiceStyle: { engine: "nada" } })).toBeNull();
  });
});

describe("voiceChoiceFromOverride · motor fijado por la neurona (A149)", () => {
  it("devuelve el motor de la neurona si es válido; si no, null", () => {
    expect(voiceChoiceFromOverride({ voz: { motor: "voice158" } })).toBe("voice158");
    expect(voiceChoiceFromOverride({ voz: { motor: "pifia" } })).toBeNull();
    expect(voiceChoiceFromOverride(null)).toBeNull();
  });
});

describe("voiceChoiceFromConfig · elección de la cuenta", () => {
  it("el navegador no fija nada; un motor válido sí; config ausente null", () => {
    expect(voiceChoiceFromConfig({ engine: "browser", autoDownload: false })).toBeNull();
    expect(voiceChoiceFromConfig({ engine: "voxcpm", autoDownload: false })).toBe("voxcpm");
    expect(voiceChoiceFromConfig(null)).toBeNull();
  });
});

describe("activeEngineFromChain · mismo filtro que resolveActiveVoiceEngine", () => {
  it("devuelve el primer eslabón que puede hablar", () => {
    expect(activeEngineFromChain(["vibevoice", "kokoro"], { autoDownload: false })).toBe("vibevoice");
  });

  it("kokoro sin autoDownload se salta; con autorización cuenta", () => {
    expect(activeEngineFromChain(["kokoro", "omnivoice"], { autoDownload: false })).toBe("omnivoice");
    expect(activeEngineFromChain(["kokoro", "omnivoice"], { autoDownload: true })).toBe("kokoro");
  });

  it("kitten (stub) siempre se salta; cadena vacía cae al navegador", () => {
    expect(activeEngineFromChain(["kitten"], { autoDownload: true })).toBe("browser");
    expect(activeEngineFromChain([], null)).toBe("browser");
  });
});
