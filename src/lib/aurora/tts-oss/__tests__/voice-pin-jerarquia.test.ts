import { describe, it, expect } from "vitest";

import {
  sanitizeVoicePinStore,
  resolveVoiceEnginePin,
  type VoicePinStore,
} from "@/lib/aurora/tts-oss/voice-config";

const CTX = {
  deviceId: "dispo-1",
  personaId: "hermione",
  agentId: "agente-7",
  brainId: "cerebro-2",
};

describe("sanitizeVoicePinStore", () => {
  it("descarta los valores que no son motor y al navegador (no es pin)", () => {
    const limpio = sanitizeVoicePinStore({
      cuenta: "openvoice2",
      porAgente: { "agente-7": "vibevoice", otro: "basura", browser: "browser" },
    });
    expect(limpio.cuenta).toBe("openvoice2");
    expect(limpio.porAgente).toEqual({ "agente-7": "vibevoice" });
  });

  it("con basura total devuelve un store vacío sin lanzar", () => {
    expect(sanitizeVoicePinStore("nada")).toEqual({});
    expect(sanitizeVoicePinStore({ portidos: 12, porNeurona: "x" })).toEqual({});
  });
});

describe("resolveVoiceEnginePin — jerarquía con configuraciones simuladas", () => {
  it("sin nada fijado devuelve el defecto con su procedencia", () => {
    expect(resolveVoiceEnginePin(undefined, CTX, "openvoice2")).toEqual({
      engine: "openvoice2",
      provenance: "defecto",
    });
  });

  it("la cuenta vence sobre el defecto y la neurona sobre la cuenta", () => {
    const cuenta: VoicePinStore = { cuenta: "openvoice2" };
    expect(resolveVoiceEnginePin(cuenta, CTX, "omnivoice")).toEqual({
      engine: "openvoice2",
      provenance: "cuenta",
    });
    const conNeurona: VoicePinStore = {
      ...cuenta,
      porNeurona: { "dispo-1": "chatterbox", "dispo-2": "bark" },
    };
    expect(resolveVoiceEnginePin(conNeurona, CTX, "omnivoice")).toEqual({
      engine: "chatterbox",
      provenance: "neurona",
      scopeId: "dispo-1",
    });
    // La neurona de OTRO dispositivo no decide aquí.
    expect(resolveVoiceEnginePin(conNeurona, { ...CTX, deviceId: "dispo-9" }, "omnivoice").engine).toBe("openvoice2");
  });

  it("cerebro vence a neurona; personalidad a cerebro; agente a personalidad", () => {
    const store: VoicePinStore = {
      cuenta: "openvoice2",
      porNeurona: { "dispo-1": "bark" },
      porCerebro: { "cerebro-2": "gpt-sovits" },
      porPersonalidad: { hermione: "kokoro" },
      porAgente: { "agente-7": "voicebox" },
    };
    expect(resolveVoiceEnginePin(store, { ...CTX }, "omnivoice").engine).toBe("voicebox");
    expect(resolveVoiceEnginePin(store, { ...CTX, agentId: null }, "omnivoice").engine).toBe("kokoro");
    expect(resolveVoiceEnginePin(store, { ...CTX, agentId: null, personaId: null }, "omnivoice").engine).toBe("gpt-sovits");
  });

  it("el pin neurona×personalidad (A149) gana a todos", () => {
    const store: VoicePinStore = {
      porAgente: { "agente-7": "voxcpm" },
      porPersonalidad: { hermione: "kokoro" },
      porNeuronaPersona: { "dispo-1": {
        hermione: "vibevoice",
        aurora: "bark",
      } },
    };
    const res = resolveVoiceEnginePin(store, CTX, "openvoice2");
    expect(res).toEqual({ engine: "vibevoice", provenance: "neurona-personalidad", scopeId: "hermione" });
    // La misma neurona con OTRA personalidad usa SU par (el mapa lo trae).
    const otra = resolveVoiceEnginePin(store, { ...CTX, personaId: "aurora" }, "openvoice2");
    expect(otra).toEqual({ engine: "bark", provenance: "neurona-personalidad", scopeId: "aurora" });
    // Otra neurona con la misma personalidad tampoco.
    expect(resolveVoiceEnginePin(store, { ...CTX, deviceId: "dispo-2" }, "openvoice2").engine).toBe("voxcpm");
  });

  it("los valores inválidos se heredan: el siguiente ámbito decide", () => {
    const store = {
      porPersonalidad: { hermione: "motor-inexistente" },
      porCerebro: { "cerebro-2": "voicebox" },
    } as VoicePinStore;
    expect(resolveVoiceEnginePin(store, { ...CTX, agentId: null }, "omnivoice")).toEqual({
      engine: "voicebox",
      provenance: "cerebro",
      scopeId: "cerebro-2",
    });
  });
});
