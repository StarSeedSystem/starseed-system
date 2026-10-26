// @vitest-environment jsdom
/**
 * `soloGratis` en el enrutador (Ola 1026P · P3 · petición a la Protomolécula): una consulta que puede dispararla un agente
 * o un clic repetido nunca gasta dinero, aunque la cuenta tenga una fuente de pago configurada y aunque el modo sea
 * «manual» (que respeta el proveedor activo, quizá de pago). Sin la bandera todo sigue exactamente igual.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ chat: vi.fn(), avail: [] as unknown[] }));

vi.mock("@/ai/client/chat", async (original) => ({ ...(await original<typeof import("@/ai/client/chat")>()), chat: m.chat }));
vi.mock("../availability", async (original) => ({
  ...(await original<typeof import("../availability")>()),
  detectAvailabilitySafe: async () => m.avail,
}));

import { astrauraChat, saveIntelligenceSettings } from "../router";
import { findSource } from "../free-catalog";

const MENSAJES = [{ role: "user" as const, content: "hola" }];
const pagada = () => ({ source: findSource("anthropic-paid")!, ready: true, userConfig: { id: "anthropic", enabled: true, baseUrl: "https://api.anthropic.com" } });

beforeEach(() => {
  window.localStorage.clear();
  m.chat.mockReset();
  m.chat.mockResolvedValue({ text: "respuesta del proveedor activo" });
  m.avail = [pagada()];
});
afterEach(() => window.localStorage.clear());

describe("astrauraChat con soloGratis", () => {
  it("modo manual sin la bandera: va directo al proveedor activo (comportamiento de siempre)", async () => {
    saveIntelligenceSettings({ mode: "manual" });
    const r = await astrauraChat({ messages: MENSAJES });
    expect(m.chat).toHaveBeenCalledTimes(1);
    expect(r.text).toBe("respuesta del proveedor activo");
  });

  it("modo manual CON la bandera: el proveedor activo (quizá de pago) no se usa; manda el ranking gratuito", async () => {
    saveIntelligenceSettings({ mode: "manual" });
    const r = await astrauraChat({ messages: MENSAJES, soloGratis: true });
    expect(m.chat).not.toHaveBeenCalled();
    // sin ninguna fuente gratuita lista, la respuesta es la plantilla local honesta, marcada como tal
    expect(r.route?.local).toBe(true);
  });

  it("modo automático CON la bandera: una fuente de pago ya configurada ni se intenta", async () => {
    saveIntelligenceSettings({ mode: "auto" });
    const r = await astrauraChat({ messages: MENSAJES, soloGratis: true });
    expect(m.chat).not.toHaveBeenCalled();
    expect(String(r.text)).not.toContain("Anthropic");
    expect(r.route?.local).toBe(true);
  });

  it("modo automático SIN la bandera: la fuente de pago configurada sí entra en la cadena (se intenta)", async () => {
    saveIntelligenceSettings({ mode: "auto" });
    const r = await astrauraChat({ messages: MENSAJES });
    // la plantilla honesta cuenta lo que se probó: aquí, la fuente de pago (falla por falta de clave, sin red)
    expect(String(r.text)).toContain("Anthropic");
  });

  it("con una fuente gratuita lista, la bandera la deja pasar", async () => {
    saveIntelligenceSettings({ mode: "auto" });
    const libre = findSource("llm7-free") ?? findSource("openrouter-free")!;
    m.avail = [pagada(), { source: libre, ready: true }];
    const r = await astrauraChat({ messages: MENSAJES, soloGratis: true });
    expect(m.chat).toHaveBeenCalled();
    expect(r.route?.free).not.toBe(false);
    expect(r.route?.tier).not.toBe("paid");
  });
});
