import { describe, it, expect } from "vitest";
import { decidirDespierto, avisoDespierto } from "../despierto-web";

describe("decidirDespierto", () => {
    it("sin soporte del navegador no hace nada aunque haya proceso", () => {
        expect(
            decidirDespierto({ proceso: true, visible: true, soportado: false, bloqueoActivo: false }),
        ).toBe("nada");
    });

    it("proceso largo y pestaña visible sin bloqueo: pedir", () => {
        expect(
            decidirDespierto({ proceso: true, visible: true, soportado: true, bloqueoActivo: false }),
        ).toBe("pedir");
    });

    it("con el bloqueo ya activo y todo igual: nada", () => {
        expect(
            decidirDespierto({ proceso: true, visible: true, soportado: true, bloqueoActivo: true }),
        ).toBe("nada");
    });

    it("el proceso acaba: soltar aunque la pestaña siga visible", () => {
        expect(
            decidirDespierto({ proceso: false, visible: true, soportado: true, bloqueoActivo: true }),
        ).toBe("soltar");
    });

    it("sin proceso ni bloqueo: nada", () => {
        expect(
            decidirDespierto({ proceso: false, visible: true, soportado: true, bloqueoActivo: false }),
        ).toBe("nada");
    });

    it("pestaña oculta con proceso: soltar (el navegador lo haría igual)", () => {
        expect(
            decidirDespierto({ proceso: true, visible: false, soportado: true, bloqueoActivo: true }),
        ).toBe("soltar");
    });

    it("pestaña oculta sin bloqueo todavía: nada", () => {
        expect(
            decidirDespierto({ proceso: true, visible: false, soportado: true, bloqueoActivo: false }),
        ).toBe("nada");
    });
});

describe("avisoDespierto", () => {
    it("con soporte: la pantalla se mantiene, pero la tapa cerrada duerme igual", () => {
        const t = avisoDespierto(true);
        expect(t).toContain("pantalla");
        expect(t).toContain("tapa");
        expect(t).toContain("keepalive");
    });

    it("sin soporte: honesto y apunta a la app nativa o keepalive", () => {
        const t = avisoDespierto(false);
        expect(t).toContain("navegador");
        expect(t).toContain("tapa");
        expect(t).toContain("keepalive");
    });
});
