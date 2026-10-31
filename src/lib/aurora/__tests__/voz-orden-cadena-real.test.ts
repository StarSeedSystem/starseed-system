import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalityVoiceShape } from "@/lib/aurora/voice-config";

/**
 * SGO1031A — «Manda lo que suena». El router decide si VibeVoice recibe guion
 * con `resolveVoiceChoiceFrom`; lo que suena lo decide `refreshPersonalityVoicePin`
 * (engine-registry, Adenda 149). Aquí se compara la decisión del router con el
 * pin REAL de la cadena sobre la misma personalidad y el mismo override de la
 * neurona. Solo se simulan la personalidad activa, el id de la neurona y el
 * store de overrides: sin red ni disco.
 *
 * (SGO1031B) Amplía la tabla a los dos casos que faltaban: la CUENTA elegida en
 * Ajustes → Voz NUNCA fija el pin (en la cadena entra como eslabón de
 * `buildVoiceChain` con `cfg.engine`) y, sin personalidad activa, el override
 * de la clave comodín «*» tampoco manda (`neuronPersonaVoice` exige personaId).
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
  storeDelPinQueSuena,
} from "@/lib/aurora/voice-config";
import { refreshPersonalityVoicePin } from "@/lib/aurora/tts-oss/engine-registry";

/** La MISMA decisión que src/ai/astraura/router.ts (núcleo SGO1031B). */
async function motorDelRouter(): Promise<string | null> {
  const persona = estado.perfil;
  const deviceId = "neurona-1";
  // El router lee el override de la neurona aunque no haya persona (clave «*»);
  // el FILTRO de personalidad lo hace el propio `storeDelPinQueSuena`.
  const override = estado.vozNeurona ? { voz: estado.vozNeurona } : null;
  const elegido = resolveVoiceChoiceFrom(
    storeDelPinQueSuena(persona, deviceId, override),
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
  // (SGO1031B) La CUENTA nunca fija el pin: con cuenta=VibeVoice y el pin
  // por defecto (openvoice2) disponible, suena OpenVoice y el pin es openvoice2.
  ["cuenta vibevoice y nadie fija motor: el pin por defecto manda, no la cuenta", auto(), null, "openvoice2"],
  ["cuenta voxcpm y neurona en vía rápida: manda la vía, no la cuenta", auto(), { modo: "fastweb" }, "voxcpm"],
  // (SGO1031B) Sin personalidad activa la cadena real NO aplica el override de
  // la neurona (la clave comodín «*» no existe ahí): manda el pin por defecto.
  ["sin personalidad, override en la clave comodín «*»: no manda", null, { motor: "vibevoice" }, "openvoice2"],
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

describe("SGO1031B · el store del router manda lo que suena", () => {
  it("la cuenta nunca entra en el store: no existe ese ámbito", () => {
    const store = storeDelPinQueSuena(auto(), "n", { voz: { motor: "vibevoice" } });
    expect("cuenta" in store).toBe(false);
    expect(store.neurona).toEqual({ n: { motor: "vibevoice" } });
  });

  it("sin personalidad activa el override comodín «*» se descarta", () => {
    expect(storeDelPinQueSuena(null, "n", { voz: { motor: "vibevoice" } })).toEqual({});
  });

  it("con personalidad activa el override es válido aunque esté vacío el id", () => {
    expect(storeDelPinQueSuena(fija("omnivoice"), "n", null)).toEqual({
      personalidad: { aurora: { motor: "omnivoice" } },
    });
  });
});
