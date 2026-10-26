import { describe, it, expect, vi } from "vitest";
import {
  crearDetectorPulsacion,
  RETARDO_PULSACION_MS,
  TOLERANCIA_MOVIMIENTO_PX,
  type Punto,
  type TipoPuntero,
} from "../pulsacion-larga";

/** Detector con temporizadores falsos y los avisos registrados. */
function montar(extra: { retardoMs?: number; tolerancia?: number } = {}) {
  vi.useFakeTimers();
  const activar = vi.fn<(k: string, p: Punto, t: TipoPuntero) => void>();
  const arrastrar = vi.fn<(k: string, p: Punto, t: TipoPuntero) => void>();
  const d = crearDetectorPulsacion<string>({ alActivar: activar, alEmpezarArrastre: arrastrar, ...extra });
  return { d, activar, arrastrar };
}

describe("pulsación larga · tiempos y umbrales de Alex", () => {
  it("los valores pedidos: 450 ms y 8 px", () => {
    expect(RETARDO_PULSACION_MS).toBe(450);
    expect(TOLERANCIA_MOVIMIENTO_PX).toBe(8);
  });

  it("a los 449 ms todavía no es pulsación; a los 450 ms sí", () => {
    const { d, activar } = montar();
    d.comenzar("mensajes", { x: 100, y: 20 }, "touch");
    vi.advanceTimersByTime(449);
    expect(activar).not.toHaveBeenCalled();
    expect(d.fase()).toBe("esperando");
    vi.advanceTimersByTime(1);
    expect(activar).toHaveBeenCalledTimes(1);
    expect(activar).toHaveBeenCalledWith("mensajes", { x: 100, y: 20 }, "touch");
    expect(d.fase()).toBe("activa");
    vi.useRealTimers();
  });

  it("funciona igual con ratón, dedo y lápiz", () => {
    for (const tipo of ["mouse", "touch", "pen"] as const) {
      const { d, activar } = montar();
      d.comenzar("hub", { x: 0, y: 0 }, tipo);
      vi.advanceTimersByTime(450);
      expect(activar).toHaveBeenCalledWith("hub", { x: 0, y: 0 }, tipo);
      expect(d.tipo()).toBe(tipo);
      d.cancelar();
    }
    vi.useRealTimers();
  });

  it("moverse EXACTAMENTE 8 px no cancela; más de 8 px sí", () => {
    const a = montar();
    a.d.comenzar("a", { x: 0, y: 0 }, "touch");
    expect(a.d.mover({ x: 8, y: 0 })).toMatchObject({ fase: "esperando", cancelada: false });
    vi.advanceTimersByTime(450);
    expect(a.activar).toHaveBeenCalledTimes(1);

    const b = montar();
    b.d.comenzar("b", { x: 0, y: 0 }, "touch");
    const r = b.d.mover({ x: 8.5, y: 0 });
    expect(r).toMatchObject({ fase: "inactivo", cancelada: true });
    vi.advanceTimersByTime(1000);
    expect(b.activar).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("la tolerancia se mide en distancia, no por eje (6 px + 6 px = 8,5 px cancela)", () => {
    const { d, activar } = montar();
    d.comenzar("a", { x: 0, y: 0 }, "pen");
    expect(d.mover({ x: 6, y: 6 }).cancelada).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(activar).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("si se aleja y vuelve antes de tiempo ya estaba cancelada: no se rearma sola", () => {
    const { d, activar } = montar();
    d.comenzar("a", { x: 0, y: 0 }, "touch");
    d.mover({ x: 30, y: 0 });
    d.mover({ x: 0, y: 0 });
    vi.advanceTimersByTime(1000);
    expect(activar).not.toHaveBeenCalled();
    expect(d.fase()).toBe("inactivo");
    vi.useRealTimers();
  });
});

describe("pulsación larga · lo que pasa al soltar", () => {
  it("soltar antes de tiempo es un toque (el clic normal sigue su curso)", () => {
    const { d, activar } = montar();
    d.comenzar("a", { x: 0, y: 0 }, "mouse");
    vi.advanceTimersByTime(200);
    expect(d.terminar()).toBe("toque");
    vi.advanceTimersByTime(1000);
    expect(activar).not.toHaveBeenCalled();
    expect(d.fase()).toBe("inactivo");
    vi.useRealTimers();
  });

  it("soltar tras el tiempo sin arrastrar es una pulsación (abre el menú)", () => {
    const { d, arrastrar } = montar();
    d.comenzar("a", { x: 0, y: 0 }, "touch");
    vi.advanceTimersByTime(450);
    d.mover({ x: 3, y: 2 }); // temblor dentro de la tolerancia
    expect(d.terminar()).toBe("pulsacion");
    expect(arrastrar).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("tras el tiempo, moverse más de 8 px es ARRASTRE y avisa una sola vez", () => {
    const { d, arrastrar } = montar();
    d.comenzar("a", { x: 50, y: 0 }, "touch");
    vi.advanceTimersByTime(450);
    const r1 = d.mover({ x: 70, y: 0 });
    expect(r1).toMatchObject({ fase: "arrastrando", empezoArrastre: true });
    const r2 = d.mover({ x: 90, y: 0 });
    expect(r2).toMatchObject({ fase: "arrastrando", empezoArrastre: false });
    expect(arrastrar).toHaveBeenCalledTimes(1);
    expect(arrastrar).toHaveBeenCalledWith("a", { x: 70, y: 0 }, "touch");
    expect(d.terminar()).toBe("arrastre");
    vi.useRealTimers();
  });

  it("cancelar() anula todo sin resultado y permite empezar de nuevo", () => {
    const { d, activar } = montar();
    d.comenzar("a", { x: 0, y: 0 }, "touch");
    d.cancelar();
    vi.advanceTimersByTime(1000);
    expect(activar).not.toHaveBeenCalled();
    expect(d.terminar()).toBe("cancelado");
    expect(d.comenzar("b", { x: 0, y: 0 }, "touch")).toBe(true);
    vi.useRealTimers();
  });

  it("no admite un segundo puntero mientras hay un gesto en curso", () => {
    const { d } = montar();
    expect(d.comenzar("a", { x: 0, y: 0 }, "touch")).toBe(true);
    expect(d.comenzar("b", { x: 0, y: 0 }, "touch")).toBe(false);
    expect(d.clave()).toBe("a");
    d.cancelar();
    vi.useRealTimers();
  });
});

describe("pulsación larga · inyección de temporizadores y parámetros", () => {
  it("usa los temporizadores inyectados (para probar sin esperar)", () => {
    const tareas: Array<() => void> = [];
    const anular = vi.fn();
    const activar = vi.fn();
    const d = crearDetectorPulsacion<string>({
      alActivar: activar,
      programar: (fn) => { tareas.push(fn); return tareas.length; },
      anular,
    });
    d.comenzar("a", { x: 0, y: 0 }, "mouse");
    expect(tareas).toHaveLength(1);
    tareas[0]();
    expect(activar).toHaveBeenCalledTimes(1);
    d.terminar();
  });

  it("el retardo y la tolerancia se pueden cambiar", () => {
    const { d, activar } = montar({ retardoMs: 100, tolerancia: 20 });
    d.comenzar("a", { x: 0, y: 0 }, "touch");
    expect(d.mover({ x: 15, y: 0 }).cancelada).toBe(false);
    vi.advanceTimersByTime(100);
    expect(activar).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
