import { describe, expect, it, vi, afterEach } from "vitest";
import { relojUnificado, crearRelojSimple } from "@/lib/senales/reloj-unificado";

describe("SEN1126B-d1: Control de rendimiento 3D y frame rate (parte 1)", () => {
  describe("reloj unificado: evita múltiples requestAnimationFrame simultáneos", () => {
    afterEach(() => {
      relojUnificado.cancelar();
    });

    it("cuenta las peticiones de cuadro con un reloj simple", () => {
      const reloj = crearRelojSimple();
      expect(reloj.total).toBe(0);
      reloj.tick();
      reloj.tick();
      reloj.tick();
      expect(reloj.total).toBe(3);
    });

    it("el mecanismo de reloj comparte un único requestAnimationFrame entre componentes simulados", () => {
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

    it("capa-alcance registra su callback en el reloj unificado para compartir requestAnimationFrame", async () => {
      const mockRaf = vi.fn().mockReturnValue(1);
      const mockCancel = vi.fn();
      vi.stubGlobal("requestAnimationFrame", mockRaf);
      vi.stubGlobal("cancelAnimationFrame", mockCancel);

      const L: any = {
        DomUtil: {
          create: vi.fn(() => ({
            setAttribute: vi.fn(),
            style: new Proxy({} as Record<string, string>, {
              get: (t, k) => undefined as any,
              set: (t, k, v) => true,
            }),
          })),
          setPosition: vi.fn(),
        },
      };
      const mapBase = {
        getPane: vi.fn(() => null),
        createPane: vi.fn(() => ({ style: {} })),
        getSize: vi.fn(() => ({ x: 400, y: 300 })),
        containerPointToLayerPoint: vi.fn(() => ({ x: 0, y: 0 })),
        on: vi.fn(),
        off: vi.fn(),
        getZoom: vi.fn(() => 15),
      };

      const { crearCapaAlcance } = await import("../geo/capa-alcance");
      relojUnificado.reiniciar();

      const capaAlcance = crearCapaAlcance(L as any, mapBase, "test-alcance", 100);
      expect(mockRaf).toHaveBeenCalledTimes(1);

      relojUnificado.pedir();
      expect(mockRaf).toHaveBeenCalledTimes(1);

      capaAlcance.quitar();
    });
  });
});