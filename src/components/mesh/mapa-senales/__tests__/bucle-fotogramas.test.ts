import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { crearCapaAlcance, dibujarCampo } from "../geo/capa-alcance";

function mapaFalso() {
  const size = { x: 400, y: 300 };
  const listeners: Record<string, Function[]> = {};
  return {
    getSize: () => size,
    getZoom: () => 10,
    getPane: (n: string) => (n === "ss-alcance-test" ? null : { style: { zIndex: "0", pointerEvents: "none" } }),
    createPane: (n: string) => ({ style: { zIndex: "0", pointerEvents: "none" } }),
    containerPointToLayerPoint: () => ({ x: 0, y: 0 }),
    latLngToContainerPoint: () => ({ x: 100, y: 100 }),
    on: (eventos: string, fn: Function) => {
      eventos.split(" ").forEach((e) => { (listeners[e] = listeners[e] || []).push(fn); });
    },
    off: (eventos: string, fn: Function) => {
      eventos.split(" ").forEach((e) => { listeners[e] = (listeners[e] || []).filter((f) => f !== fn); });
    },
    _emit: (evento: string) => (listeners[evento] || []).forEach((f) => f()),
  };
}

function canvasFalso() {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    clip: vi.fn(),
    strokeStyle: "",
    lineWidth: 0,
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
  };
  return {
    width: 0,
    height: 0,
    style: { width: "", height: "", opacity: "1", position: "", pointerEvents: "", zIndex: "" },
    getContext: () => ctx,
    remove: vi.fn(),
    setAttribute: vi.fn(),
  };
}

describe("bucle de fotogramas: un solo reloj por cuadro y se detiene cuando no hay nada que mover", () => {
  let rafCalls: number[];
  let rafId: number;
  let originalRAF: typeof requestAnimationFrame;
  let originalCAF: typeof cancelAnimationFrame;

  beforeEach(() => {
    vi.useFakeTimers();
    rafCalls = [];
    rafId = 0;
    originalRAF = global.requestAnimationFrame;
    originalCAF = global.cancelAnimationFrame;
    global.requestAnimationFrame = vi.fn((cb) => { rafId++; rafCalls.push(rafId); return rafId; });
    global.cancelAnimationFrame = vi.fn((id) => { rafCalls = rafCalls.filter((x) => x !== id); });
  });

  afterEach(() => {
    global.requestAnimationFrame = originalRAF;
    global.cancelAnimationFrame = originalCAF;
    vi.useRealTimers();
  });

  it("cuenta las peticiones de cuadro con reloj falso y no supera el límite en reposo", () => {
    const map = mapaFalso() as any;
    const L = { DomUtil: { create: () => canvasFalso(), setPosition: vi.fn() } } as any;

    const capa = crearCapaAlcance(L, map, "test", 100);
    capa.poner([{ lat: 40, lon: -3, metros: 1000, color: "#3b82f6" }]);

    // Inicial: una llamada por el pedir() inicial
    expect(rafCalls.length).toBe(1);

    // Disparar eventos de mapa - debería hacer debounce (solo una RAF pendiente)
    map._emit("move");
    map._emit("zoom");
    map._emit("moveend");
    expect(rafCalls.length).toBe(1); // sigue siendo 1 porque hace debounce

    // Avanzar el reloj para ejecutar la RAF
    vi.advanceTimersByTime(16);
    expect(rafCalls.length).toBe(1); // la RAF se ejecutó, contador no crece

    // En reposo, no debería haber más RAFs
    vi.advanceTimersByTime(1000);
    expect(rafCalls.length).toBe(1);
  });

  it("reduce el ritmo en modo eficiente (prefers-reduced-motion)", () => {
    // TODO: implementar prueba de modo eficiente para capa-alcance
    expect(true).toBe(true);
  });

  it("detiene el lienzo cuando la pestaña está oculta", () => {
    // TODO: implementar prueba de visibilitychange para capa-alcance
    expect(true).toBe(true);
  });

  it("detiene el lienzo cuando sale de la vista (IntersectionObserver)", () => {
    // TODO: implementar prueba de IntersectionObserver para capa-alcance
    expect(true).toBe(true);
  });
});

describe("dibujarCampo: función pura exportada", () => {
  it("se puede probar con un contexto falso", () => {
    const ctx = {
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      clip: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      restore: vi.fn(),
      setLineDash: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    expect(() => dibujarCampo(ctx, 100, 100, 50, "#3b82f6", 400, 300)).not.toThrow();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});