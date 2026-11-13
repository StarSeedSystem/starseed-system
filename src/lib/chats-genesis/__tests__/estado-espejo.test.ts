import { describe, expect, it } from "vitest";
import { estadoEspejo, VIVO_MAX_MS } from "../estado-espejo";
import { estadoEspejo as desdeCliente } from "../puerta-chats";

const T = "2026-11-13T10:00:00.000Z";
const BASE = Date.parse(T);

describe("estadoEspejo · «en vivo» solo con un latido de 90 s o menos", () => {
    it("a los 90 000 ms justos todavía es vivo", () => {
        expect(VIVO_MAX_MS).toBe(90_000);
        expect(estadoEspejo({ t: T }, BASE + 90_000)).toEqual({ vivo: true, haceMs: 90_000 });
    });

    it("a los 90 001 ms ya no lo es", () => {
        expect(estadoEspejo({ t: T }, BASE + 90_001)).toEqual({ vivo: false, haceMs: 90_001 });
    });

    it("recién llegado es vivo con 0 ms", () => {
        expect(estadoEspejo({ t: T }, BASE)).toEqual({ vivo: true, haceMs: 0 });
    });

    it("sin latido o con una hora ilegible no hay nada vivo que decir", () => {
        expect(estadoEspejo(null, BASE)).toEqual({ vivo: false, haceMs: null });
        expect(estadoEspejo({ t: "ayer" }, BASE)).toEqual({ vivo: false, haceMs: null });
        expect(estadoEspejo({ t: T }, Number.NaN)).toEqual({ vivo: false, haceMs: null });
    });

    it("un latido con hora en el futuro (relojes desfasados) cuenta como de ahora", () => {
        expect(estadoEspejo({ t: T }, BASE - 5_000)).toEqual({ vivo: true, haceMs: 0 });
    });

    it("el cliente exporta la misma función (§7.2)", () => {
        expect(desdeCliente).toBe(estadoEspejo);
    });
});
