// @vitest-environment jsdom
/**
 * CON1010 (2026-10-10): con el aparato en ritmo de ahorro, los sondeos de fondo se espacian solos
 * (×2, ×4) y uno marcado `esencial` no. Sin esto, el único freno era la pausa total del día.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const g = vi.hoisted(() => ({ factor: 1 }));

vi.mock("@/lib/consumo/lider-pestana", () => ({ esLider: () => true, alCambiarLider: () => () => undefined }));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => false }));
vi.mock("@/lib/consumo/guardian", () => ({ factorRitmoConsumo: () => g.factor }));

const MIN = 60_000;

beforeEach(() => {
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.useFakeTimers();
    vi.resetModules();
    g.factor = 1;
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

async function vueltasEn(minutos: number, esencial = false): Promise<number> {
    const { crearBucle } = await import("@/lib/network/bucle-fondo");
    let n = 0;
    const b = crearBucle({ nombre: `prueba-${Math.random()}`, intervaloMs: MIN, esencial, tarea: async () => void n++ });
    b.iniciar();
    await vi.advanceTimersByTimeAsync(minutos * MIN + 10);
    b.detener();
    return n;
}

describe("bucles de fondo con ritmo de ahorro", () => {
    test("ritmo normal: una vuelta por intervalo", async () => {
        expect(await vueltasEn(20)).toBe(21);
    });

    test("ahorro ×4: la cuarta parte de vueltas", async () => {
        g.factor = 4;
        expect(await vueltasEn(20)).toBe(6);
    });

    test("un bucle esencial no se espacia", async () => {
        g.factor = 4;
        expect(await vueltasEn(20, true)).toBe(21);
    });
});
