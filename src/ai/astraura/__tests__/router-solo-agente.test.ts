// @vitest-environment jsdom
/**
 * `soloAgente` en el enrutador (Ola 1025U · U4): el turno lo habla un agente con su propio prompt y el resultado se
 * comparte con otros agentes, así que no se le mezcla nada de la cuenta: ni la personalidad activa, ni el contexto
 * personal, ni el contexto de Aurora (OS, pantalla, voz, habilidades). Sin la bandera todo sigue exactamente igual.
 * Se prueba por el camino del modo «manual», que entrega al chat clásico el MISMO `messages` ya compuesto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ chat: vi.fn() }));

vi.mock("@/ai/client/chat", async (original) => ({ ...(await original<typeof import("@/ai/client/chat")>()), chat: m.chat }));
vi.mock("@/lib/aurora/personalities", async (original) => ({
  ...(await original<typeof import("@/lib/aurora/personalities")>()),
  resolvePersonalityForContext: () => ({ id: "p-cuenta", name: "PERSONA-DE-LA-CUENTA" }),
  compilePersonalityPrompt: () => "PERSONALIDAD-ACTIVA-DE-LA-CUENTA",
}));
vi.mock("../user-context", async (original) => ({
  ...(await original<typeof import("../user-context")>()),
  getUserContextSettings: () => ({ enabled: true, defaultLevel: "breve" }),
  buildUserContext: async () => "CONTEXTO-PERSONAL-DE-LA-CUENTA",
}));
vi.mock("../skills", async (original) => ({
  ...(await original<typeof import("../skills")>()),
  skillsSystemPrompt: () => "HABILIDADES-DE-AURORA",
}));
vi.mock("@/lib/integrations/aurora-tools", async (original) => ({
  ...(await original<typeof import("@/lib/integrations/aurora-tools")>()),
  describeVoiceStateForPrompt: async () => "ESTADO-DE-VOZ-DE-AURORA",
}));

import { astrauraChat, saveIntelligenceSettings } from "../router";

const PROPIO = "Eres «Luna», una IA (bot) del Mundo de los avatares.";
const peticion = (extra: Record<string, unknown> = {}) => ({
  messages: [
    { role: "system" as const, content: PROPIO },
    { role: "user" as const, content: "Es tu turno, Luna." },
  ],
  agentId: "personalidad:luna",
  ...extra,
});

function sistemaEnviado(): string {
  const llamada = m.chat.mock.calls[m.chat.mock.calls.length - 1][0] as { messages: Array<{ role: string; content: string }> };
  return llamada.messages.filter((x) => x.role === "system").map((x) => x.content).join("\n");
}

beforeEach(() => {
  window.localStorage.clear();
  saveIntelligenceSettings({ mode: "manual" });
  m.chat.mockReset();
  m.chat.mockResolvedValue({ text: "ok" });
});
afterEach(() => window.localStorage.clear());

describe("astrauraChat con soloAgente", () => {
  it("sin la bandera, la petición lleva la personalidad, el contexto personal y el contexto de Aurora (comportamiento de siempre)", async () => {
    await astrauraChat(peticion());
    const sistema = sistemaEnviado();
    expect(sistema).toContain(PROPIO);
    expect(sistema).toContain("PERSONALIDAD-ACTIVA-DE-LA-CUENTA");
    expect(sistema).toContain("CONTEXTO-PERSONAL-DE-LA-CUENTA");
    expect(sistema).toContain("HABILIDADES-DE-AURORA");
    expect(sistema).toContain("ESTADO-DE-VOZ-DE-AURORA");
    expect(sistema).toContain("CONTEXTO DEL SISTEMA (Aurora)");
  });

  it("con soloAgente el prompt del agente llega solo: nada de la cuenta ni de Aurora", async () => {
    await astrauraChat(peticion({ soloAgente: true }));
    const sistema = sistemaEnviado();
    expect(sistema).toBe(PROPIO);
    for (const marca of [
      "PERSONALIDAD-ACTIVA-DE-LA-CUENTA", "PERSONA-DE-LA-CUENTA", "CONTEXTO-PERSONAL-DE-LA-CUENTA",
      "HABILIDADES-DE-AURORA", "ESTADO-DE-VOZ-DE-AURORA", "CONTEXTO DEL SISTEMA (Aurora)", "en nombre del usuario",
    ]) {
      expect(sistema).not.toContain(marca);
    }
  });

  it("soloAgente: false equivale a no ponerlo", async () => {
    await astrauraChat(peticion({ soloAgente: false }));
    expect(sistemaEnviado()).toContain("CONTEXTO-PERSONAL-DE-LA-CUENTA");
  });
});
