import { describe, expect, it } from "vitest";
import { sanearInforme } from "../informe";

const TAB = "aaaa0002-0000-4000-8000-000000000003";

describe("sanearInforme (BAN1115D)", () => {
    it("deja pasar solo la forma estricta y pone la hora el servidor", () => {
        const r = sanearInforme(
            { v: 1, t: 1, llave: true, objetivo: TAB.toUpperCase(), codigo: "ABCD-1234", sesion: { estado: "aceptada", motivo: null, t: 5000 }, armada: { con: TAB, hasta: 9e12, restantes: 40 }, extra: "no" },
            2_000_000,
        );
        expect(r).toEqual({ t: 2000, llave: true, objetivo: TAB, codigo: "ABCD-1234", sesion: { estado: "aceptada", motivo: null, t: 5 }, armada: { con: TAB, hasta: 9e12, restantes: 40 } });
    });
    it("lo raro se descarta: texto libre, ids mal formados, versión distinta", () => {
        expect(sanearInforme({ v: 2 }, 1)).toBeNull();
        expect(sanearInforme(null, 1)).toBeNull();
        const r = sanearInforme({ v: 1, llave: "si", objetivo: "x", codigo: "<script>", sesion: { estado: "mal", motivo: "A B" }, armada: { con: "x", hasta: 1, restantes: 1 } }, 1000);
        expect(r).toEqual({ t: 1, llave: null, objetivo: null, codigo: null, sesion: null, armada: null });
    });
    it("el motivo de la sesión solo es una palabra corta", () => {
        const r = sanearInforme({ v: 1, sesion: { estado: "rechazada", motivo: "no-aceptada", t: 1 } }, 1000) as { sesion: { motivo: string } };
        expect(r.sesion.motivo).toBe("no-aceptada");
        const q = sanearInforme({ v: 1, sesion: { estado: "rechazada", motivo: "con espacios y texto" } }, 1000) as { sesion: { motivo: unknown } };
        expect(q.sesion.motivo).toBeNull();
    });
});
