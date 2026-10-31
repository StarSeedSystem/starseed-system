import { describe, it, expect } from "vitest";
import {
  activeEngineFromChain,
  resolveVoiceChoice,
  resolveVoiceChoiceFrom,
  voiceChoiceFromConfig,
  voiceChoiceFromOverride,
  voiceChoiceFromPersonality,
  type PersonalityVoiceShape,
  type VoiceConfigShape,
  type VoiceHierarchyContext,
  type VoiceHierarchyStore,
} from "@/lib/aurora/voice-config";
import { buildVoiceChain } from "@/lib/aurora/tts-oss/engine-registry";
import {
  DEFAULT_VOICE_CONFIG,
  type AuroraVoiceConfig,
  type AuroraVoiceEngine,
} from "@/lib/aurora/tts-oss/voice-config";

/**
 * SGO1024D — La jerarquía de voz (agente > neurona > personalidad > cerebro >
 * cuenta; SGO1031A: el mismo orden que la cadena que suena) se resuelve sobre
 * configuraciones simuladas, sin red ni disco.
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
  it("orden de la cadena real: agente > neurona > personalidad > cerebro > cuenta", () => {
    const store = almacenCompleto();
    expect(resolveVoiceChoiceFrom(store, CTX)).toEqual({
      motor: "vibevoice",
      provenance: "agente",
      scopeId: "ag-1",
    });

    delete store.agente;
    expect(resolveVoiceChoiceFrom(store, CTX)).toEqual({
      motor: "omnivoice",
      provenance: "neurona",
      scopeId: "neurona-1",
    });

    delete store.neurona;
    expect(resolveVoiceChoiceFrom(store, CTX)).toEqual({
      motor: "voice158",
      provenance: "personalidad",
      scopeId: "aurora",
    });

    delete store.personalidad;
    expect(resolveVoiceChoiceFrom(store, CTX)?.provenance).toBe("cerebro");

    delete store.cerebro;
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

describe("resolveVoiceChoice · fuentes crudas del turno", () => {
  it("deriva el pin de cada ámbito: la neurona gana a la personalidad, como en la cadena real", () => {
    expect(
      resolveVoiceChoice({
        ctx: { personaId: "aurora", deviceId: "neurona-1" },
        personality: { intelligence: { modo: "fija", motorVoz: "vibevoice" } },
        override: { voz: { motor: "omnivoice" } },
        config: { engine: "bark", autoDownload: false },
      }),
    ).toEqual({ motor: "omnivoice", provenance: "neurona", scopeId: "neurona-1" });
  });

  it("la personalidad entra si la neurona no fija motor", () => {
    expect(
      resolveVoiceChoice({
        ctx: { personaId: "aurora", deviceId: "neurona-1" },
        personality: { intelligence: { modo: "fija", motorVoz: "vibevoice" } },
        override: { voz: {} },
        config: { engine: "bark", autoDownload: false },
      }),
    ).toEqual({ motor: "vibevoice", provenance: "personalidad", scopeId: "aurora" });
  });

  it("el override de la neurona entra si la personalidad no fija motor", () => {
    expect(
      resolveVoiceChoice({
        ctx: { deviceId: "neurona-1" },
        override: { voz: { motor: "omnivoice" } },
        config: { engine: "bark", autoDownload: false },
      }),
    ).toEqual({ motor: "omnivoice", provenance: "neurona", scopeId: "neurona-1" });
  });

  it("la cuenta cierra la jerarquía cuando nadie más elige", () => {
    expect(resolveVoiceChoice({ config: { engine: "voxcpm", autoDownload: false } })).toEqual({
      motor: "voxcpm",
      provenance: "cuenta",
    });
    expect(
      resolveVoiceChoice({ config: { engine: "browser", autoDownload: false } }),
    ).toBeNull();
  });

  it("lo ya guardado en el store manda sobre lo derivado del mismo ámbito", () => {
    const ctx = { personaId: "aurora", deviceId: "neurona-1" };
    const personality: PersonalityVoiceShape = { intelligence: { modo: "fija", motorVoz: "vibevoice" } };
    expect(
      resolveVoiceChoice({ ctx, store: { personalidad: { aurora: { motor: "voice158" } } }, personality }),
    ).toEqual({ motor: "voice158", provenance: "personalidad", scopeId: "aurora" });
    expect(
      resolveVoiceChoice({
        ctx,
        store: { neurona: { "neurona-1": { motor: "voxcpm" } } },
        personality,
        override: { voz: { motor: "omnivoice" } },
      }),
    ).toEqual({ motor: "voxcpm", provenance: "neurona", scopeId: "neurona-1" });
  });

  it("tolera espacios y mayúsculas de valores guardados a mano", () => {
    expect(
      resolveVoiceChoice({ ctx: { agentId: "ag-1" }, store: { agente: { "ag-1": { motor: " VibeVoice " } } } }),
    ).toEqual({ motor: "vibevoice", provenance: "agente", scopeId: "ag-1" });
    expect(
      resolveVoiceChoice({ ctx: { deviceId: "n" }, override: { voz: { motor: "VIBEVOICE" } } }),
    ).toEqual({ motor: "vibevoice", provenance: "neurona", scopeId: "n" });
  });

  it("sin fuentes ni fuentes inválidas devuelve null sin lanzar", () => {
    expect(resolveVoiceChoice()).toBeNull();
    expect(
      resolveVoiceChoice({
        ctx: { personaId: "aurora" },
        personality: null,
        override: { voz: { motor: 42 } } as unknown as { voz?: { motor?: string } },
        config: null,
      }),
    ).toBeNull();
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

/**
 * SGO1024D-d3 — ¿Prepara el router el guion multi-locutor de VibeVoice?
 * Se recorre la MISMA decisión que src/ai/astraura/router.ts: el store por
 * ámbitos con los motores derivados (o null) → pin → cadena REAL
 * (`buildVoiceChain`) → `activeEngineFromChain` === "vibevoice".
 * Configs simuladas pasadas a mano: sin red ni disco.
 */
interface FuentesDelRouter {
  personality?: PersonalityVoiceShape | null;
  override?: { voz?: { motor?: string } } | null;
  config?: VoiceConfigShape | null;
}

const TURNO: VoiceHierarchyContext = { personaId: "aurora", deviceId: "neurona-1", agentId: "ag-1", brainId: "cerebro-1" };
const FIJA_VIBEVOICE: PersonalityVoiceShape = { intelligence: { modo: "fija", motorVoz: "vibevoice" } };

/** Config de voz simulada; por defecto VibeVoice tiene servidor. */
function cfgVoz(conVibeVoice = true, extra: Partial<AuroraVoiceConfig> = {}): AuroraVoiceConfig {
  return {
    ...DEFAULT_VOICE_CONFIG,
    engines: conVibeVoice ? { vibevoice: { endpoint: "http://gpu.local:7860" } } : {},
    ...extra,
  };
}

/** El store tal como lo arma el router: un hueco por ámbito, con motor o null. */
function storeDelRouter(f: FuentesDelRouter, ctx: VoiceHierarchyContext = TURNO): VoiceHierarchyStore {
  return {
    personalidad: ctx.personaId ? { [ctx.personaId]: { motor: voiceChoiceFromPersonality(f.personality) } } : undefined,
    neurona: ctx.deviceId ? { [ctx.deviceId]: { motor: voiceChoiceFromOverride(f.override) } } : undefined,
    cuenta: { motor: voiceChoiceFromConfig(f.config) },
  };
}

/** Pin que el router pasa a la cadena (el de la neurona si nadie fija motor). */
function pinDelRouter(f: FuentesDelRouter, pinNeurona: AuroraVoiceEngine | null = "openvoice2"): AuroraVoiceEngine | null {
  return resolveVoiceChoiceFrom(storeDelRouter(f), TURNO)?.motor ?? pinNeurona;
}

function preparaGuion(cfg: AuroraVoiceConfig, pin: AuroraVoiceEngine | null): boolean {
  return activeEngineFromChain(buildVoiceChain(cfg, pin), cfg) === "vibevoice";
}

describe("router · VibeVoice recibe su guion multi-locutor (cadena real)", () => {
  it("el fallo original: con el pin cacheado openvoice2 no había guion; con la jerarquía, sí", () => {
    const cfg = cfgVoz();
    expect(preparaGuion(cfg, "openvoice2")).toBe(false);
    const pin = pinDelRouter({ personality: FIJA_VIBEVOICE });
    expect(pin).toBe("vibevoice");
    expect(buildVoiceChain(cfg, pin)[0]).toBe("vibevoice");
    expect(preparaGuion(cfg, pin)).toBe(true);
  });

  it("el motor de la neurona y el de la cuenta también llevan el guion a VibeVoice", () => {
    const cfg = cfgVoz();
    const sinPin: PersonalityVoiceShape = { intelligence: { modo: "auto" } };
    expect(preparaGuion(cfg, pinDelRouter({ personality: sinPin, override: { voz: { motor: "vibevoice" } } }))).toBe(true);
    expect(preparaGuion(cfg, pinDelRouter({ personality: sinPin, config: { engine: "vibevoice", autoDownload: false } }))).toBe(true);
  });

  it("VibeVoice fijado sin servidor: la cadena lo salta y no se promete guion", () => {
    const cfg = cfgVoz(false);
    const pin = pinDelRouter({ personality: FIJA_VIBEVOICE });
    expect(buildVoiceChain(cfg, pin)).not.toContain("vibevoice");
    expect(preparaGuion(cfg, pin)).toBe(false);
  });

  it("si la jerarquía elige otro motor, VibeVoice no recibe guion aunque tenga servidor", () => {
    const fijaOmni: PersonalityVoiceShape = { intelligence: { modo: "fija", motorVoz: "omnivoice" } };
    expect(preparaGuion(cfgVoz(), pinDelRouter({ personality: fijaOmni }))).toBe(false);
  });

  it("SGO1031A · personalidad omnivoice y neurona vibevoice: suena VibeVoice y el router manda el guion", () => {
    const fuentes: FuentesDelRouter = {
      personality: { intelligence: { modo: "fija", motorVoz: "omnivoice" } },
      override: { voz: { motor: "vibevoice" } },
    };
    expect(resolveVoiceChoice({ ctx: TURNO, ...fuentes })).toEqual({
      motor: "vibevoice",
      provenance: "neurona",
      scopeId: "neurona-1",
    });
    const pin = pinDelRouter(fuentes);
    expect(pin).toBe("vibevoice");
    expect(buildVoiceChain(cfgVoz(), pin)[0]).toBe("vibevoice");
    expect(preparaGuion(cfgVoz(), pin)).toBe(true);
  });

  it("SGO1031A · al revés (personalidad vibevoice, neurona omnivoice): suena OmniVoice y no hay guion", () => {
    const pin = pinDelRouter({
      personality: FIJA_VIBEVOICE,
      override: { voz: { motor: "omnivoice" } },
    });
    expect(pin).toBe("omnivoice");
    expect(preparaGuion(cfgVoz(), pin)).toBe(false);
  });

  it("sin elección en ningún ámbito el router conserva el pin de la neurona", () => {
    const nadie: FuentesDelRouter = { personality: { intelligence: { modo: "auto" } }, override: null, config: { engine: "browser", autoDownload: false } };
    expect(resolveVoiceChoiceFrom(storeDelRouter(nadie), TURNO)).toBeNull();
    expect(pinDelRouter(nadie, "omnivoice")).toBe("omnivoice");
    expect(pinDelRouter(nadie, null)).toBeNull();
  });
});

describe("router · su store decide igual que resolveVoiceChoice", () => {
  const casos: Array<[string, FuentesDelRouter, VoiceHierarchyContext]> = [
    ["todos los ámbitos", { personality: FIJA_VIBEVOICE, override: { voz: { motor: "omnivoice" } }, config: { engine: "bark", autoDownload: false } }, TURNO],
    ["personalidad omnivoice, neurona vibevoice", { personality: { intelligence: { modo: "fija", motorVoz: "omnivoice" } }, override: { voz: { motor: "vibevoice" } } }, TURNO],
    ["solo voiceStyle", { personality: { intelligence: { modo: "auto" }, voiceStyle: { engine: "omnivoice" } } }, TURNO],
    ["solo la neurona", { override: { voz: { motor: " VibeVoice " } } }, TURNO],
    ["solo la cuenta", { config: { engine: "voxcpm", autoDownload: false } }, TURNO],
    ["cuenta en navegador", { config: { engine: "browser", autoDownload: false } }, TURNO],
    ["nada", {}, TURNO],
    ["sin personalidad ni neurona en el turno", { personality: FIJA_VIBEVOICE, override: { voz: { motor: "omnivoice" } } }, {}],
  ];

  it.each(casos)("%s", (_nombre, f, ctx) => {
    expect(resolveVoiceChoiceFrom(storeDelRouter(f, ctx), ctx)).toEqual(resolveVoiceChoice({ ctx, ...f }));
  });
});
