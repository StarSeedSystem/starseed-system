import { describe, expect, it } from "vitest";
import { estadoCreditoClaude, resumenCreditoClaude, type ConfigCreditoClaude } from "../credito-claude";

const AHORA = Date.parse("2026-09-27T12:00:00Z");
const BASE: ConfigCreditoClaude = {
    total_usd: 250,
    restante_usd: 250,
    vence: "2026-11-05T01:59:00-06:00",
    declarado_en: "2026-09-27T05:30:00Z",
    semanal: { todos: 15, fable: 0, reinicio: "sábado 4:00 a.m." },
};

describe("estadoCreditoClaude", () => {
    it("calcula días hasta el vencimiento y el ritmo ideal", () => {
        const e = estadoCreditoClaude(BASE, AHORA);
        expect(e.dias).toBe(39);
        expect(e.ritmoIdeal).toBeCloseTo(250 / 39, 5);
        expect(e.tono).toBe("ok");
        expect(e.avisos).toEqual([]);
    });

    it("avisa de usarlo cuando falta poco y queda más de la mitad", () => {
        const e = estadoCreditoClaude(BASE, Date.parse("2026-10-28T12:00:00Z"));
        expect(e.dias).toBe(8);
        expect(e.avisos.join(" ")).toMatch(/Úsalo o se pierde/);
        expect(e.tono).toBe("aviso");
    });

    it("peligro cuando vence en 3 días o menos, o ya venció", () => {
        expect(estadoCreditoClaude(BASE, Date.parse("2026-11-03T12:00:00Z")).tono).toBe("peligro");
        const vencido = estadoCreditoClaude(BASE, Date.parse("2026-11-06T12:00:00Z"));
        expect(vencido.dias).toBe(0);
        expect(vencido.avisos.join(" ")).toMatch(/Vencido/);
    });

    it("cuida el crédito bajo el 25 % y marca peligro bajo el 10 % o agotado", () => {
        expect(estadoCreditoClaude({ ...BASE, restante_usd: 50 }, AHORA).tono).toBe("aviso");
        expect(estadoCreditoClaude({ ...BASE, restante_usd: 20 }, AHORA).tono).toBe("peligro");
        expect(estadoCreditoClaude({ ...BASE, restante_usd: 0 }, AHORA).avisos.join(" ")).toMatch(/Agotado/);
    });

    it("pide actualizar una declaración vieja y avisa de sesiones demasiado largas", () => {
        const e = estadoCreditoClaude(
            {
                ...BASE,
                declarado_en: "2026-09-20T00:00:00Z",
                sesiones: [{ sesion: "c6c3fe09abc", t: "2026-09-27", modelo: "claude-opus-5-5", salida: 1, cacheLectura: 754_000_000, cacheEscritura: 0 }],
            },
            AHORA,
        );
        expect(e.avisos.some((a) => a.includes("actualízalo"))).toBe(true);
        expect(e.avisos.some((a) => a.includes("754 M"))).toBe(true);
    });

    it("tolera una configuración rota sin lanzar", () => {
        const e = estadoCreditoClaude({ total_usd: NaN, restante_usd: NaN, vence: "x", declarado_en: "y" } as ConfigCreditoClaude, AHORA);
        expect(e.dias).toBe(0);
        expect(e.avisos.length).toBeGreaterThan(0);
    });
});

describe("resumenCreditoClaude", () => {
    it("dice saldo, vencimiento, ritmo y cuándo se declaró", () => {
        const r = resumenCreditoClaude(estadoCreditoClaude(BASE, AHORA));
        expect(r).toMatch(/^\$250 de \$250 · vence en 39 días/);
        expect(r).toMatch(/ritmo ideal ≤ \$6\.41\/día/);
        expect(r).toMatch(/declarado hoy$/);
    });
});
