import { describe, expect, it, vi } from "vitest";
import { cuandoEsSeguroTraducir, entornoDelNavegador } from "../hidratacion";

describe("cuandoEsSeguroTraducir", () => {
    it("resuelve inmediatamente si ya está complete y hay reposo", async () => {
        let resueltoReposo = false;
        const entorno = {
            readyState: () => "complete",
            alCargar: (f: () => void) => { f(); return () => {}; },
            esperarReposo: (f: () => void) => { resueltoReposo = true; f(); return () => {}; },
        };
        await cuandoEsSeguroTraducir(entorno, 1500);
        expect(resueltoReposo).toBe(true);
    });

    it("espera al evento load si no está complete", async () => {
        let cargado = false;
        const entorno = {
            readyState: () => "interactive",
            alCargar: (f: () => void) => {
                setTimeout(() => { cargado = true; f(); }, 10);
                return () => {};
            },
            esperarReposo: (f: () => void) => { f(); return () => {}; },
        };
        await cuandoEsSeguroTraducir(entorno, 1500);
        expect(cargado).toBe(true);
    });

    it("resuelve por tope aunque nunca llegue load", async () => {
        let resuelto = false;
        const entorno = {
            readyState: () => "loading",
            alCargar: (f: () => void) => { return () => {}; },
            esperarReposo: (f: () => void) => { return () => {}; },
        };
        await cuandoEsSeguroTraducir(entorno, 50);
        // Si llegamos aquí, el tope funcionó (no se bloqueó indefinidamente)
        expect(true).toBe(true);
    });

    it("solo resuelve una vez aunque disparen los dos caminos", async () => {
        let resoluciones = 0;
        const entorno = {
            readyState: () => "complete",
            alCargar: (f: () => void) => { f(); return () => {}; },
            esperarReposo: (f: () => void) => {
                setTimeout(() => { resoluciones++; f(); }, 5);
                return () => {};
            },
        };
        await cuandoEsSeguroTraducir(entorno, 1500);
        expect(resoluciones).toBe(1);
    });

    it("quita la escucha de load al resolver", async () => {
        let desconectado = false;
        const entorno = {
            readyState: () => "interactive",
            alCargar: (f: () => void) => {
                return () => { desconectado = true; };
            },
            esperarReposo: (f: () => void) => { f(); return () => {}; },
        };
        await cuandoEsSeguroTraducir(entorno, 1500);
        expect(desconectado).toBe(true);
    });

    it("quita la escucha de reposo al resolver", async () => {
        let desconectadoReposo = false;
        const entorno = {
            readyState: () => "complete",
            alCargar: (f: () => void) => { return () => {}; },
            esperarReposo: (f: () => void) => {
                setTimeout(f, 0);
                return () => { desconectadoReposo = true; };
            },
        };
        await cuandoEsSeguroTraducir(entorno, 1500);
        expect(desconectadoReposo).toBe(true);
    });
});

describe("entornoDelNavegador", () => {
    it("construye el entorno con readyState, load y requestIdleCallback/setTimeout", () => {
        const win = {
            document: { readyState: "complete" },
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            requestIdleCallback: vi.fn((cb) => { cb({ timeRemaining: () => 50 }); return 1; }),
        } as unknown as Window;

        const entorno = entornoDelNavegador(win);
        expect(typeof entorno.readyState).toBe("function");
        expect(typeof entorno.alCargar).toBe("function");
        expect(typeof entorno.esperarReposo).toBe("function");
        expect(entorno.readyState()).toBe("complete");
    });

    it("usa setTimeout como fallback si no hay requestIdleCallback", () => {
        const win = {
            document: { readyState: "loading" },
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            setTimeout: vi.fn((cb) => { cb(); return 1; }),
            clearTimeout: vi.fn(),
        } as unknown as Window;

        const entorno = entornoDelNavegador(win);
        let ejecutado = false;
        const limpiar = entorno.esperarReposo(() => { ejecutado = true; }, 50);
        expect(ejecutado).toBe(true); // setTimeout callback executes synchronously in fake
        limpiar();
    });
});