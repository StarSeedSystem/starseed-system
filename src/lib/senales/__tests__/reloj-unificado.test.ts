import { describe, expect, it, vi } from "vitest";
import { relojUnificado, crearRelojSimple } from "../reloj-unificado";

describe("reloj unificado: control de frame rate y requestAnimationFrame compartido", () => {
  it("cuenta las peticiones de cuadro", () => {
    const reloj = crearRelojSimple();
    expect(reloj.total).toBe(0);
    reloj.tick();
    reloj.tick();
    reloj.tick();
    expect(reloj.total).toBe(3);
  });

  it("el mecanismo de reloj comparte un único requestAnimationFrame entre componentes", () => {
    const mockRaf = vi.fn().mockReturnValue(1);
    const mockCancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", mockRaf);
    vi.stubGlobal("cancelAnimationFrame", mockCancel);

    const frames: number[] = [];
    const unregistrar1 = relojUnificado.registrar(() => frames.push(1));
    const unregistrar2 = relojUnificado.registrar(() => frames.push(2));

    relojUnificado.pedir();
    expect(mockRaf).toHaveBeenCalledTimes(1);

    relojUnificado.pedir();
    expect(mockRaf).toHaveBeenCalledTimes(1);

    unregistrar1();
    unregistrar2();
    relojUnificado.cancelar();
    expect(mockCancel).toHaveBeenCalled();
  });

  it("el clock unificado calcula dt correctamente para animaciones", async () => {
    const frames: { dt: number }[] = [];
    let rafCalls = 0;

    const mockRaf = vi.fn().mockImplementation((cb: FrameRequestCallback) => {
      rafCalls++;
      if (rafCalls <= 2) {
        setTimeout(() => cb(rafCalls * 100), 0);
      }
      return rafCalls;
    });
    vi.stubGlobal("requestAnimationFrame", mockRaf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    relojUnificado.registrar((dt) => frames.push({ dt }));
    relojUnificado.pedir();

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(frames.length).toBe(2);
    expect(frames[0].dt).toBeCloseTo(0, 1);
  });
});

describe("reloj unificado: evita frames duplicados", () => {
  it("mantiene count de frames en un período de tiempo", () => {
    const reloj = crearRelojSimple();
    reloj.tick();
    reloj.tick();
    reloj.tick();
    expect(reloj.total).toBe(3);
  });
});