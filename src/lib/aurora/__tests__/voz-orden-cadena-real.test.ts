import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalityVoiceShape } from "@/lib/aurora/voice-config";

/**
 * SGO1031A → SGO1031B — «Manda lo que suena». El router de Astraura decide el
 * pin de voz con la capa pura `voicePinForRouter`; lo que suena lo decide la
 * cadena real (`refreshPersonalityVoicePin` → `buildVoiceChain`, Adenda 149).
 * Aquí se compara la decisión del router con el pin REAL sobre la misma
 * personalidad, el mismo override de la neurona y la misma cuenta. Solo se
 * simulan la personalidad activa, el id de la neurona y el store de overrides:
 * sin red ni disco. (SGO1031B) Divergencias nuevas: la CUENTA no encabeza el
 * pin (la cadena pone el pin por defecto delante de `cfg.engine`) y SIN
 * personalidad el override de la neurona no existe (antes se leía con «*»).
 */
type Perfil = PersonalityVoiceShape & { id: string };
type VozNeurona = { motor?: string; modo?: "cloud" | "local" | "fastweb" };

const estado = vi.hoisted(() => ({
  perfil: null as (PersonalityVoiceShape & { id: string }) | null,
  vozNeurona: null as { motor?: string; modo?: "cloud" | "local" | "fastweb" } | null,
}));

vi.mock("@/lib/aurora/personalities", () => ({ getActivePersonality: () => estado.perfil }));
vi.mock("@/lib/neurons/neurons", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/neurons/neurons")>()),
  thisDeviceId: () => "neurona-1",
}));
vi.mock("@/lib/astraura/neuron-persona-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/astraura/neuron-persona-store")>()),
  getOverrides: () => (estado.vozNeurona ? { voz: estado.vozNeurona } : {}),
}));

import {
  activeEngineFromChain,
  voicePinForRouter,
  type VoiceHierarchySources,
} from "@/lib/aurora/voice-config";
import type { AuroraVoiceConfig, AuroraVoiceEngine } from "@/lib/aurora/tts-oss/voice-config";
import {
  buildVoiceChain,
  refreshPersonalityVoicePin,
} from "@/lib/aurora/tts-oss/engine-registry";

/** La MISMA decisión que src/ai/astraura/router.ts (SGO1031B). */
async function motorDelRouter(): Promise<AuroraVoiceEngine | null> {
  const persona = estado.perfil;
  const pinCadena = await refreshPersonalityVoicePin().catch(() => null);
  const fuentes: VoiceHierarchySources = {
    ctx: { personaId: persona?.id ?? null, deviceId: "neurona-1" },
    personality: persona,
    // Override CRUDO a propósito: la capa pura debe descartarlo sin personalidad
    // activa, igual que la cadena real (el router solo lo lee con persona).
    override: estado.vozNeurona ? { voz: estado.vozNeurona } : null,
  };
  return voicePinForRouter(fuentes, pinCadena);
}

const fija = (motorVoz: string): Perfil => ({ id: "aurora", intelligence: { modo: "fija", motorVoz } });
const auto = (engine?: string): Perfil => ({
  id: "aurora",
  intelligence: { modo: "auto", motorVoz: "voxcpm" },
  voiceStyle: engine ? { engine } : null,
});

const casos: Array<[string, Perfil | null, VozNeurona | null, string]> = [
  ["personalidad omnivoice, neurona vibevoice", fija("omnivoice"), { motor: "vibevoice" }, "vibevoice"],
  ["personalidad vibevoice, neurona omnivoice", fija("vibevoice"), { motor: "omnivoice" }, "omnivoice"],
  ["solo la personalidad (motorVoz)", fija("vibevoice"), null, "vibevoice"],
  [
    "solo la personalidad (porSentido.voz)",
    { id: "aurora", intelligence: { modo: "fija", porSentido: { voz: { fuente: "voice158" } } } },
    null,
    "voice158",
  ],
  ["voiceStyle en modo auto, neurona vibevoice", auto("omnivoice"), { motor: "vibevoice" }, "vibevoice"],
  ["voiceStyle en modo auto, sin neurona", auto("bark"), null, "bark"],
  ["motor desconocido en la neurona: hereda de la personalidad", fija("vibevoice"), { motor: "nope" }, "vibevoice"],
  ["la neurona solo fija la vía local: pin por defecto local", auto(), { modo: "local" }, "omnivoice"],
  ["nadie elige: pin por defecto de la neurona", auto(), null, "openvoice2"],
  // (SGO1031B) la cuenta no encabeza: la cadena pone el pin por defecto delante de cfg.engine
  ["cuenta vibevoice, nadie fija motor: la cuenta no manda", auto(), null, "openvoice2"],
  ["cuenta vibevoice, personalidad fija omnivoice: manda la personalidad", fija("omnivoice"), null, "omnivoice"],
  // (SGO1031B) sin personalidad el override de la neurona no existe (antes «*»)
  ["sin personalidad: override de motor ignorado", null, { motor: "vibevoice" }, "openvoice2"],
  ["sin personalidad: override con vía local ignorado", null, { modo: "local" }, "openvoice2"],
  ["sin personalidad y sin override: pin por defecto", null, null, "openvoice2"],
];

describe("SGO1031A · el router decide el motor con el orden de la cadena que suena", () => {
  beforeEach(() => {
    estado.perfil = null;
    estado.vozNeurona = null;
  });

  it.each(casos)("%s", async (_nombre, perfil, vozNeurona, esperado) => {
    estado.perfil = perfil;
    estado.vozNeurona = vozNeurona;
    const suena = await refreshPersonalityVoicePin();
    expect(suena).toBe(esperado);
    expect(await motorDelRouter()).toBe(suena);
  });

  it("cuenta=vibevoice: lo que suena es el pin por defecto, no la cuenta", async () => {
    estado.perfil = auto(); // ningún ámbito fija motor
    const cfg: Pick<AuroraVoiceConfig, "engine" | "auto" | "autoDownload"> = {
      engine: "vibevoice",
      auto: true,
      autoDownload: false,
    };
    const suena = await refreshPersonalityVoicePin();
    expect(suena).toBe("openvoice2");
    const pinRouter = await motorDelRouter();
    expect(pinRouter).toBe(suena);
    // Con ese pin la cadena no arranca por VibeVoice (la cuenta va detrás):
    // el router no prepara su guion multi-locutor — igual que la cadena real.
    expect(activeEngineFromChain(buildVoiceChain(cfg, pinRouter), cfg)).toBe(suena);
  });
});
