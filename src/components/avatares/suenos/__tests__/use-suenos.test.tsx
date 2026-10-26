/**
 * El hook de los sueños · Ola 1025U · U4. Sueños automáticos (apagados de fábrica, solo desde un encuentro NUEVO entre dos
 * que ya se conocen, solo con el mundo en marcha y con sus topes), y qué pasa con un sueño al cambiar de escenario.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearAgenteMundoRef, type AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import type { EstadoMundo, HabitanteMundo } from "@/lib/avatares/mundo/simulacion";
import { guardarSuenos, guardarUso, leerSuenos } from "@/lib/avatares/suenos/almacen-suenos";
import type { GeneradorIA, RespuestaIA } from "@/lib/avatares/suenos/ejecutor";
import { TOPES_SUENO, registrarInicio, usoVacio } from "@/lib/avatares/suenos/sueno";
import { useSuenos, type OpcionesSuenos } from "../use-suenos";

const luna = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "luna", nombre: "Luna", dueno: { tipo: "perfil", id: "p1" } });
const sol = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "sol", nombre: "Sol", dueno: { tipo: "perfil", id: "p1" } });
const AGENTES: AgenteMundoRef[] = [luna, sol];

function habitante(a: AgenteMundoRef, vinculos: Record<string, number> = {}): HabitanteMundo {
  return { id: a.id, personalidadId: a.idOrigen, nombre: a.nombre, posicion: [0, 0, 0], energia: 1, humor: "calma", ocupacion: "conversar", obras: 0, vinculos, zonaId: null };
}

function mundo(tick: number, encuentros: Array<{ tick: number; tema: string }> = [], vinculo = 0.4): EstadoMundo {
  return {
    tick,
    habitantes: [habitante(luna, { [sol.id]: vinculo }), habitante(sol, { [luna.id]: vinculo })],
    creaciones: [],
    encuentros: encuentros.map((e) => ({ a: luna.id, b: sol.id, tick: e.tick, tema: e.tema })),
  };
}

function iaConPuerta() {
  const pendientes: Array<(x: RespuestaIA) => void> = [];
  const generar: GeneradorIA = (p) =>
    new Promise<RespuestaIA>((resolver) => {
      pendientes.push(resolver);
      p.signal.addEventListener("abort", () => resolver({ ok: false, motivo: "Cancelado." }));
    });
  return { generar, soltar: (t: string) => pendientes.shift()?.({ ok: true, texto: t, gratis: true }), cuantas: () => pendientes.length };
}

function montar(inicial: Partial<OpcionesSuenos>) {
  const base: OpcionesSuenos = { escenarioId: "esc-1", agentes: AGENTES, estado: null, activo: true, ...inicial };
  return renderHook((p: OpcionesSuenos) => useSuenos(p), { initialProps: base });
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("sueños automáticos", () => {
  it("apagados de fábrica: un encuentro entre dos que se conocen no despierta nada", async () => {
    const ia = iaConPuerta();
    const h = montar({ generar: ia.generar, estado: mundo(5) });
    expect(h.result.current.automaticos).toBe(false);
    h.rerender({ escenarioId: "esc-1", agentes: AGENTES, activo: true, generar: ia.generar, estado: mundo(8, [{ tick: 8, tema: "hablaron del mar" }]) });
    await act(async () => undefined);
    expect(h.result.current.enCurso).toBeNull();
    expect(ia.cuantas()).toBe(0);
  });

  it("encendidos: un encuentro NUEVO con vínculo suficiente despierta un sueño con el tema del encuentro", async () => {
    guardarSuenos("esc-1", { automaticos: true, suenos: [] });
    const ia = iaConPuerta();
    const props = { escenarioId: "esc-1", agentes: AGENTES, activo: true, generar: ia.generar };
    const h = montar({ ...props, estado: mundo(5) });
    expect(h.result.current.automaticos).toBe(true);
    h.rerender({ ...props, estado: mundo(8, [{ tick: 8, tema: "hablaron del mar" }]) });
    await waitFor(() => expect(h.result.current.enCurso).not.toBeNull());
    expect(h.result.current.enCurso).toMatchObject({ tema: "hablaron del mar", origen: "encuentro", tipo: "colectivo" });
    expect(h.result.current.topes.automaticosEstaHora).toBe(1);
    await waitFor(() => expect(ia.cuantas()).toBe(1));
  });

  it("los encuentros que ya estaban al encender el mundo no cuentan, solo los que llegan después", async () => {
    guardarSuenos("esc-1", { automaticos: true, suenos: [] });
    const ia = iaConPuerta();
    const props = { escenarioId: "esc-1", agentes: AGENTES, activo: true, generar: ia.generar };
    const h = montar({ ...props, estado: mundo(5, [{ tick: 3, tema: "algo de antes" }]) });
    h.rerender({ ...props, estado: mundo(6, [{ tick: 3, tema: "algo de antes" }]) });
    await act(async () => undefined);
    expect(h.result.current.enCurso).toBeNull();
    h.rerender({ ...props, estado: mundo(9, [{ tick: 3, tema: "algo de antes" }, { tick: 9, tema: "algo nuevo" }]) });
    await waitFor(() => expect(h.result.current.enCurso?.tema).toBe("algo nuevo"));
  });

  it("con el mundo en pausa (o la pestaña oculta) no nace ninguno", async () => {
    guardarSuenos("esc-1", { automaticos: true, suenos: [] });
    const ia = iaConPuerta();
    const props = { escenarioId: "esc-1", agentes: AGENTES, generar: ia.generar };
    const h = montar({ ...props, activo: false, estado: mundo(5) });
    h.rerender({ ...props, activo: false, estado: mundo(8, [{ tick: 8, tema: "x" }]) });
    await act(async () => undefined);
    expect(h.result.current.enCurso).toBeNull();
  });

  it("sin vínculo suficiente entre ellos no sueñan juntos", async () => {
    guardarSuenos("esc-1", { automaticos: true, suenos: [] });
    const ia = iaConPuerta();
    const props = { escenarioId: "esc-1", agentes: AGENTES, activo: true, generar: ia.generar };
    const h = montar({ ...props, estado: mundo(5, [], 0.1) });
    h.rerender({ ...props, estado: mundo(8, [{ tick: 8, tema: "x" }], 0.1) });
    await act(async () => undefined);
    expect(h.result.current.enCurso).toBeNull();
  });

  it("el tope de automáticos de la hora los frena y lo dice", async () => {
    guardarSuenos("esc-1", { automaticos: true, suenos: [] });
    const ahora = Date.now();
    let uso = usoVacio();
    for (let i = 0; i < TOPES_SUENO.automaticosPorHora; i++) uso = registrarInicio(uso, [], true, ahora - 1000 * (i + 1));
    guardarUso(uso, ahora);
    const ia = iaConPuerta();
    const props = { escenarioId: "esc-1", agentes: AGENTES, activo: true, generar: ia.generar };
    const h = montar({ ...props, estado: mundo(5) });
    h.rerender({ ...props, estado: mundo(8, [{ tick: 8, tema: "x" }]) });
    await waitFor(() => expect(h.result.current.aviso).toMatch(/Sueño automático omitido: Ya hubo 2 sueños automáticos/));
    expect(h.result.current.enCurso).toBeNull();
    expect(ia.cuantas()).toBe(0);
    act(() => h.result.current.limpiarAviso());
    expect(h.result.current.aviso).toBeNull();
  });
});

describe("iniciar", () => {
  it("solo hay un sueño a la vez", async () => {
    const ia = iaConPuerta();
    const h = montar({ generar: ia.generar, estado: null });
    let primero: ReturnType<typeof h.result.current.iniciar> | undefined;
    let segundo: ReturnType<typeof h.result.current.iniciar> | undefined;
    act(() => {
      primero = h.result.current.iniciar([luna], "el mar");
    });
    act(() => {
      segundo = h.result.current.iniciar([sol], "el cielo");
    });
    expect(primero?.ok).toBe(true);
    expect(segundo).toEqual({ ok: false, motivo: expect.stringMatching(/Ya hay un sueño en curso/) });
    act(() => h.result.current.cancelar());
    await waitFor(() => expect(h.result.current.enCurso).toBeNull());
  });

  it("sin tema o sin agentes dice qué falta y no empieza", () => {
    const h = montar({ generar: iaConPuerta().generar, estado: null });
    expect(h.result.current.iniciar([], "x")).toEqual({ ok: false, motivo: expect.stringMatching(/al menos un agente/i) });
    expect(h.result.current.iniciar([luna], " ")).toEqual({ ok: false, motivo: expect.stringMatching(/tema/i) });
    expect(h.result.current.enCurso).toBeNull();
  });
});

describe("cambiar de escenario o cerrar el mundo", () => {
  it("cancela el sueño que corre y lo deja guardado como cancelado en SU escenario", async () => {
    const ia = iaConPuerta();
    const props = { agentes: AGENTES, activo: true, generar: ia.generar, estado: null };
    const h = montar({ ...props, escenarioId: "esc-1" });
    act(() => {
      h.result.current.iniciar([luna, sol], "el mar");
    });
    await waitFor(() => expect(ia.cuantas()).toBe(1));
    h.rerender({ ...props, escenarioId: "esc-2" });
    expect(h.result.current.enCurso).toBeNull();
    expect(h.result.current.suenos).toEqual([]);
    await waitFor(() => expect(leerSuenos("esc-1").suenos[0]?.estado).toBe("cancelado"));
    expect(leerSuenos("esc-2").suenos).toEqual([]);
  });

  it("al desmontar también se corta y queda guardado", async () => {
    const ia = iaConPuerta();
    const h = montar({ generar: ia.generar, estado: null });
    act(() => {
      h.result.current.iniciar([luna], "el mar");
    });
    await waitFor(() => expect(ia.cuantas()).toBe(1));
    h.unmount();
    await waitFor(() => expect(leerSuenos("esc-1").suenos[0]?.estado).toBe("cancelado"));
  });

  it("un sueño que se quedó «en curso» en el disco (se cerró la pestaña) aparece «interrumpido»", () => {
    const ia = iaConPuerta();
    const h = montar({ generar: ia.generar, estado: null });
    act(() => {
      h.result.current.iniciar([luna], "el mar");
    });
    // El disco guarda el que corre como «en curso»; al leerlo desde otra pestaña ya no corre.
    expect(leerSuenos("esc-1").suenos[0]?.estado).toBe("interrumpido");
    act(() => h.result.current.cancelar());
  });

  it("lo completo llega a la crónica una sola vez", async () => {
    const alCrearObras = vi.fn();
    const generar: GeneradorIA = async () => ({ ok: true, texto: "Imagino algo.", gratis: true });
    const h = montar({ generar, alCrearObras, estado: null });
    act(() => {
      h.result.current.iniciar([luna], "el mar");
    });
    await waitFor(() => expect(h.result.current.suenos[0]?.estado).toBe("completo"));
    expect(alCrearObras).toHaveBeenCalledTimes(1);
    expect(h.result.current.topes.suenosEstaHora).toBe(1);
  });
});
