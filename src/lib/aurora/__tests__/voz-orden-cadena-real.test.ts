import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalityVoiceShape } from "@/lib/aurora/voice-config";

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
  resolveVoiceChoiceFrom,
  voiceChoiceFromOverride,
  voiceChoiceFromPersonality,
} from "@/lib/aurora/voice-config";
import { refreshPersonalityVoicePin } from "@/lib/aurora/tts-oss/engine-registry";

/** La MISMA decisión que src/ai/astraura/router.ts (sin la cuenta: navegador). */
async function motorDelRouter(): Promise<string | null> {
  const persona = estado.perfil;
  const deviceId = "neurona-1";
  const override = estado.vozNeurona ? { voz: estado.vozNeurona } : null;
  const elegido = resolveVoiceChoiceFrom(
    {
      personalidad: persona?.id ? { [persona.id]: { motor: voiceChoiceFromPersonality(persona) } } : undefined,
      neurona: { [deviceId]: { motor: voiceChoiceFromOverride(override) } },
      cuenta: { motor: null },
    },
    { personaId: persona?.id, deviceId },
  );
  return elegido?.motor ?? (await refreshPersonalityVoicePin().catch(() => null));
}

const fija = (motorVoz: string): Perfil => ({ id: "aurora", intelligence: { modo: "fija", motorVoz } });
const auto = (engine?: string): Perfil => ({
  id: "aurora",
  intelligence: { modo: "auto", motorVoz: "voxcpm" },
  voiceStyle: engine ? { engine } : null,
});

const casos: Array<[string, Perfil, VozNeurona | null, string]> = [
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
});
