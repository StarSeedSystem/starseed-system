/**
 * El generador de los sueños sobre el enrutador económico · Ola 1025U · U4. El enrutador va inyectado: lo que se
 * prueba es lo que ESTE módulo exige de él (sin pago, sin plantillas, sin mezclar lo personal de la cuenta).
 */
import { describe, expect, it, vi } from "vitest";
import type { PeticionIA } from "../ejecutor";
import { MOTIVO_MODO_MANUAL, MOTIVO_SIN_IA, crearGeneradorRouter, type ModuloRouter } from "../generador-router";

type Ruta = { ok?: boolean; local?: boolean; free?: boolean; sourceLabel?: string };

function peticion(over: Partial<PeticionIA> = {}): PeticionIA {
  return {
    mensajes: [{ role: "system", content: "s" }, { role: "user", content: "u" }],
    agenteId: "personalidad:luna",
    maxTokens: 160,
    temperature: 0.85,
    permitirPago: false,
    signal: new AbortController().signal,
    ...over,
  };
}

function montar(o: {
  modo?: "auto" | "manual";
  pagoConfigurado?: boolean;
  respuesta?: { text: string; route?: Ruta };
  candidato?: { source: { id: string; tier: string }; model: { id: string } } | null;
  falla?: Error;
} = {}) {
  const astrauraChat = vi.fn(async (_req: Record<string, unknown>) => {
    if (o.falla) throw o.falla;
    return (o.respuesta ?? { text: "Imagino un puente.", route: { ok: true, local: false, free: true, sourceLabel: "BitNet 1.58 local" } }) as never;
  });
  const rankCandidates = vi.fn((_perfil: unknown, _avail: unknown, _prefs: Record<string, unknown>) => (o.candidato === null ? [] : [o.candidato ?? { source: { id: "astraura-158-local", tier: "free" }, model: { id: "bitnet" } }]) as never);
  const router = {
    astrauraChat,
    getIntelligenceSettings: () => ({ mode: o.modo ?? "auto", allowConfiguredPaid: o.pagoConfigurado ?? false }) as never,
    classifyTask: vi.fn(() => ({ kind: "creative" }) as never),
    rankCandidates,
  } as unknown as ModuloRouter;
  const disponibilidad = vi.fn(async () => [{ ready: true, source: { id: "openai", tier: "paid" }, userConfig: { clave: "x" } }] as never);
  const generar = crearGeneradorRouter({ cargarRouter: async () => router, disponibilidad });
  return { generar, astrauraChat, rankCandidates, disponibilidad };
}

describe("generador del enrutador económico", () => {
  it("una respuesta real gratuita sale como turno, con su fuente", async () => {
    const m = montar();
    const r = await m.generar(peticion());
    expect(r).toEqual({ ok: true, texto: "Imagino un puente.", fuente: "BitNet 1.58 local", gratis: true });
  });

  it("llama al enrutador con el id del agente, creativo, acotado y SIN la personalidad ni el contexto personal de la cuenta", async () => {
    const m = montar();
    await m.generar(peticion());
    expect(m.astrauraChat).toHaveBeenCalledTimes(1);
    expect(m.astrauraChat.mock.calls[0][0]).toMatchObject({ agentId: "personalidad:luna", maxTokens: 160, taskHint: "creative", soloAgente: true });
    expect(m.astrauraChat.mock.calls[0][0]).not.toHaveProperty("forceSource");
  });

  it("el modo «manual» de Inteligencia no se usa: los sueños son del enrutador económico y no llaman a nadie", async () => {
    const m = montar({ modo: "manual" });
    expect(await m.generar(peticion())).toEqual({ ok: false, motivo: MOTIVO_MODO_MANUAL });
    expect(m.astrauraChat).not.toHaveBeenCalled();
  });

  it("la plantilla local del enrutador («ninguna fuente respondió») NO es IA y se rechaza", async () => {
    const m = montar({ respuesta: { text: "Aurora (respuesta local): ahora mismo no puedo…", route: { ok: true, local: true, free: true } } });
    expect(await m.generar(peticion())).toEqual({ ok: false, motivo: MOTIVO_SIN_IA });
  });

  it("sin ruta, con ruta fallida o con texto vacío, es «sin IA»", async () => {
    expect(await montar({ respuesta: { text: "algo" } }).generar(peticion())).toEqual({ ok: false, motivo: MOTIVO_SIN_IA });
    expect(await montar({ respuesta: { text: "algo", route: { ok: false, local: false, free: true } } }).generar(peticion())).toEqual({ ok: false, motivo: MOTIVO_SIN_IA });
    expect(await montar({ respuesta: { text: "   ", route: { ok: true, local: false, free: true } } }).generar(peticion())).toEqual({ ok: false, motivo: MOTIVO_SIN_IA });
  });

  it("si el enrutador lanza, se devuelve el motivo y no se rompe nada", async () => {
    const r = await montar({ falla: new Error("429") }).generar(peticion());
    expect(r).toEqual({ ok: false, motivo: "La IA falló: 429" });
  });

  it("si no se puede ni cargar el enrutador, lo dice", async () => {
    const generar = crearGeneradorRouter({ cargarRouter: async () => { throw new Error("chunk"); } });
    expect(await generar(peticion())).toEqual({ ok: false, motivo: "No se pudo cargar el enrutador de IA." });
  });
});

describe("sin pago sin permiso", () => {
  it("con una fuente de pago conectada y la ficha sin permiso, se fija la mejor que NO sea de pago", async () => {
    const m = montar({ pagoConfigurado: true });
    const r = await m.generar(peticion({ permitirPago: false }));
    expect(r.ok).toBe(true);
    expect(m.rankCandidates).toHaveBeenCalledTimes(1);
    expect(m.rankCandidates.mock.calls[0][2]).toMatchObject({ allowConfiguredPaid: false });
    expect(m.astrauraChat.mock.calls[0][0]).toMatchObject({ forceSource: { sourceId: "astraura-158-local", modelId: "bitnet" } });
  });

  it("si solo quedan fuentes de pago, no se llama a nadie", async () => {
    const m = montar({ pagoConfigurado: true, candidato: null });
    expect(await m.generar(peticion())).toEqual({ ok: false, motivo: MOTIVO_SIN_IA });
    expect(m.astrauraChat).not.toHaveBeenCalled();
  });

  it("si no se puede saber qué hay conectado, no se arriesga el gasto", async () => {
    const router = {
      astrauraChat: vi.fn(),
      getIntelligenceSettings: () => ({ mode: "auto", allowConfiguredPaid: true }) as never,
      classifyTask: vi.fn(),
      rankCandidates: vi.fn(),
    } as unknown as ModuloRouter;
    const generar = crearGeneradorRouter({ cargarRouter: async () => router, disponibilidad: async () => { throw new Error("sin red"); } });
    const r = await generar(peticion());
    expect(r.ok).toBe(false);
    expect(router.astrauraChat).not.toHaveBeenCalled();
  });

  it("si aun así la ruta resultara de pago y la ficha no lo permite, el turno se descarta", async () => {
    const m = montar({ respuesta: { text: "texto", route: { ok: true, local: false, free: false, sourceLabel: "OpenAI" } } });
    const r = await m.generar(peticion({ permitirPago: false }));
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/pago/i) });
  });

  it("con permiso de la ficha no se fija nada ni se pregunta qué hay conectado", async () => {
    const m = montar({ pagoConfigurado: true, respuesta: { text: "texto", route: { ok: true, local: false, free: false, sourceLabel: "OpenAI" } } });
    const r = await m.generar(peticion({ permitirPago: true }));
    expect(r).toEqual({ ok: true, texto: "texto", fuente: "OpenAI", gratis: false });
    expect(m.disponibilidad).not.toHaveBeenCalled();
    expect(m.astrauraChat.mock.calls[0][0]).not.toHaveProperty("forceSource");
  });
});
