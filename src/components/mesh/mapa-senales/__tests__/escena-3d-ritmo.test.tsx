import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearCapaParches } from "../geo/capa-parches";
import type { LeafletNS } from "@/lib/map/leaflet-loader";

type Oyente = () => void;

function montar(oculta: boolean) {
  const cuadros: Array<() => void> = [];
  const oyentes: Oyente[] = [];
  const doc = {
    hidden: oculta,
    addEventListener: (_: string, f: Oyente) => { oyentes.push(f); },
    removeEventListener: (_: string, f: Oyente) => { const i = oyentes.indexOf(f); if (i >= 0) oyentes.splice(i, 1); },
  };
  const raf = vi.fn((f: () => void) => { cuadros.push(f); return cuadros.length; });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const canvas = { setAttribute: vi.fn(), style: {}, remove: vi.fn(), getContext: () => null, width: 0, height: 0 };
  const pane = { style: {}, remove: vi.fn() };
  const manejadores: Oyente[] = [];
  const map = {
    getPane: () => pane,
    createPane: () => pane,
    on: (_: string, f: Oyente) => { manejadores.push(f); },
    off: vi.fn(),
    getSize: () => ({ x: 10, y: 10 }),
    containerPointToLayerPoint: () => ({ x: 0, y: 0 }),
  };
  const L = { DomUtil: { create: () => canvas, setPosition: vi.fn() } } as unknown as LeafletNS;
  return { raf, cuadros, doc, oyentes, manejadores, map, L };
}

describe("capa-parches · ritmo de cuadros", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("varios movimientos del mapa seguidos piden un solo cuadro", () => {
    const m = montar(false);
    crearCapaParches(m.L, m.map, "t", 1);
    expect(m.raf).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 50; i++) m.manejadores.forEach((f) => f());
    expect(m.raf).toHaveBeenCalledTimes(1);
    m.cuadros.shift()?.();
    m.manejadores.forEach((f) => f());
    expect(m.raf).toHaveBeenCalledTimes(2);
  });

  it("con la página oculta no pide ningún cuadro; al volver pinta una vez", () => {
    const m = montar(true);
    const capa = crearCapaParches(m.L, m.map, "t", 1);
    m.manejadores.forEach((f) => f());
    capa.poner([]);
    vi.advanceTimersByTime(5000);
    expect(m.raf).not.toHaveBeenCalled();
    m.doc.hidden = false;
    m.oyentes.forEach((f) => f());
    expect(m.raf).toHaveBeenCalledTimes(1);
  });

  it("quitar suelta el oyente de visibilidad", () => {
    const m = montar(false);
    const capa = crearCapaParches(m.L, m.map, "t", 1);
    expect(m.oyentes.length).toBe(1);
    capa.quitar();
    expect(m.oyentes.length).toBe(0);
  });
});
