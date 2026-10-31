import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalityVoiceShape, VoiceConfigShape } from "@/lib/aurora/voice-config";
import type { AuroraVoiceEngine } from "@/lib/aurora/tts-oss/voice-config";

/**
 * SGO1031A — «Manda lo que suena». El router decide si VibeVoice recibe guion
 * con `resolveVoiceChoiceFrom`; lo que suena lo decide `refreshPersonalityVoicePin`
 * (engine-registry, Adenda 149). Aquí se compara la decisión del router con el
 * pin REAL de la cadena sobre la misma personalidad y el mismo override de la
 * neurona. Solo se simulan la personalidad activa, el id de la neurona y el
 * store de overrides: sin red ni disco.
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
  resolveVoicePinFrom,
} from "@/lib/aurora/voice-config";
import { refreshPersonalityVoicePin } from "@/lib/aurora/tts-oss/engine-registry";

/**
 * La MISMA decisión que src/ai/astraura/router.ts: el pin por defecto lo da
 * `refreshPersonalityVoicePin` y `resolveVoicePinFrom` solo lo adelanta cuando
 * un ámbito lo fija de verdad. La cuenta y el override sin personalidad no
 * cuentan como pin. Sin red ni disco.
 */
async function motorDelRouter(config: VoiceConfigShape | null = null): Promise<string | null> {
  const persona = estado.perfil;
  const deviceId = "neurona-1";
  const override = estado.vozNeurona ? { voz: estado.vozNeurona } : null;
  const pinPorDefecto = await refreshPersonalityVoicePin().catch(() => null);
  return resolveVoicePinFrom(
    {
      personality: persona,
      override,
      config,
      ctx: { personaId: persona?.id, deviceId },
    },
    pinPorDefecto,
  );
}

const fija = (motorVoz: string): Perfil => ({ id: "aurora", intelligence: { modo: "fija", motorVoz } });
const auto = (engine?: string): Perfil => ({
  id: "aurora",
  intelligence: { modo: "auto", motorVoz: "voxcpm" },
  voiceStyle: engine ? { engine } : null,
});
const cuenta = (engine: AuroraVoiceEngine): VoiceConfigShape => ({ engine, autoDownload: false });

const casos: Array<
  [string, Perfil | null, VozNeurona | null, string, VoiceConfigShape?]
> = [
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
  [
    "SGO1031B · cuenta vibevoice con openvoice2 disponible: suena el pin por defecto",
    auto(),
    null,
    "openvoice2",
    cuenta("vibevoice"),
  ],
  [
    "SGO1031B · cuenta bark con pin por defecto omnivoice: suena omnivoice",
    auto(),
    { modo: "local" },
    "omnivoice",
    cuenta("bark"),
  ],
  [
    "SGO1031B · personalidad vibevoice manda sobre la cuenta omnivoice",
    fija("vibevoice"),
    null,
    "vibevoice",
    cuenta("omnivoice"),
  ],
  [
    "SGO1031B · sin personalidad activa el override de la neurona no aplica",
    null,
    { motor: "vibevoice" },
    "openvoice2",
  ],
  [
    "SGO1031B · sin personalidad activa la cuenta tampoco es pin",
    null,
    null,
    "openvoice2",
    cuenta("vibevoice"),
  ],
];

describe("SGO1031A · el router decide el motor con el orden de la cadena que suena", () => {
  beforeEach(() => {
    estado.perfil = null;
    estado.vozNeurona = null;
  });

  it.each(casos)("%s", async (_nombre, perfil, vozNeurona, esperado, config) => {
    estado.perfil = perfil;
    estado.vozNeurona = vozNeurona;
    const suena = await refreshPersonalityVoicePin();
    expect(suena).toBe(esperado);
    expect(await motorDelRouter(config ?? null)).toBe(suena);
  });
});

describe("SGO1031B · resolveVoicePinFrom usa el pin que encabeza la cadena real", () => {
  it("la elección de la cuenta no es un pin: manda el pin por defecto", () => {
    expect(
      resolveVoicePinFrom({ config: cuenta("vibevoice") }, "openvoice2"),
    ).toBe("openvoice2");
  });

  it("sin personalidad activa el override neurona×personalidad no aplica", () => {
    expect(
      resolveVoicePinFrom(
        { ctx: { deviceId: "neurona-1" }, override: { voz: { motor: "vibevoice" } } },
        "openvoice2",
      ),
    ).toBe("openvoice2");
  });

  it("con personalidad activa el override sí encabeza la cadena", () => {
    expect(
      resolveVoicePinFrom(
        {
          ctx: { personaId: "aurora", deviceId: "neurona-1" },
          override: { voz: { motor: "vibevoice" } },
        },
        "openvoice2",
      ),
    ).toBe("vibevoice");
  });

  it("sin elecciones devuelve el pin por defecto y tolera null", () => {
    expect(resolveVoicePinFrom({}, "omnivoice")).toBe("omnivoice");
    expect(resolveVoicePinFrom()).toBeNull();
  });
});
