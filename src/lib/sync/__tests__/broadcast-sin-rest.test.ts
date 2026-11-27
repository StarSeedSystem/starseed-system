// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
    BROADCAST_COLA_MAX,
    cambiosNuevosParaBroadcast,
    encolarAcotado,
    fusionarPayloadsBroadcast,
} from "../realtime-sync";

describe("cambiosNuevosParaBroadcast", () => {
    it("omite lo que ya se envió con el mismo valor", () => {
        const ultimos = new Map([["a", JSON.stringify({ x: 1 })]]);
        const r = cambiosNuevosParaBroadcast({ a: { x: 1 }, b: 2 }, ultimos);
        expect(r).toEqual({ b: 2 });
    });
    it("deja pasar un valor cambiado", () => {
        const ultimos = new Map([["a", "1"]]);
        expect(cambiosNuevosParaBroadcast({ a: 2 }, ultimos)).toEqual({ a: 2 });
    });
});

describe("fusionarPayloadsBroadcast", () => {
    it("sin previo devuelve el nuevo", () => {
        const p = { deviceId: "d", changes: { a: 1 }, at: 1 };
        expect(fusionarPayloadsBroadcast(null, p)).toBe(p);
    });
    it("gana el valor más nuevo y la marca mayor", () => {
        const r = fusionarPayloadsBroadcast(
            { deviceId: "d", changes: { a: 1, b: 1 }, at: 1, meta: { a: 5, b: 5 } },
            { deviceId: "d", changes: { a: 2 }, at: 2, meta: { a: 3 } },
        );
        expect(r.changes).toEqual({ a: 2, b: 1 });
        expect(r.meta).toEqual({ a: 5, b: 5 });
        expect(r.at).toBe(2);
    });
});

describe("encolarAcotado", () => {
    it("descarta lo más viejo al llenarse", () => {
        let cola: number[] = [];
        for (let i = 0; i < BROADCAST_COLA_MAX + 5; i++) cola = encolarAcotado(cola, i);
        expect(cola).toHaveLength(BROADCAST_COLA_MAX);
        expect(cola[0]).toBe(5);
    });
});
