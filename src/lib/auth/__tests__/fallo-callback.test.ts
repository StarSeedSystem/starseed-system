/** El callback de acceso ya no se traga el fallo: motivo para /login y detalle para el registro. */
import { describe, expect, it } from "vitest";
import { describirFalloCallback } from "../fallo-callback";

describe("describirFalloCallback", () => {
    it("sin código: enlace incompleto, nunca un código que canjear", () => {
        expect(describirFalloCallback({})).toEqual({ motivo: "auth-sin-codigo", detalle: "" });
        expect(describirFalloCallback({ code: "   " })).toEqual({ motivo: "auth-sin-codigo", detalle: "" });
        const conError = describirFalloCallback({ error: { message: "invalid request" } });
        expect(conError.motivo).toBe("auth-sin-codigo");
        expect(conError.detalle).toBe("invalid request");
    });

    it("con código y error de Supabase: el código no vale y se guarda el porqué", () => {
        const fallo = describirFalloCallback({
            code: "code-de-un-solo-uso",
            error: { message: "invalid flow state", code: "bad_code_verifier", status: 400 },
        });
        expect(fallo.motivo).toBe("auth-codigo-rechazado");
        expect(fallo.detalle).toBe("invalid flow state · bad_code_verifier · estado 400");
    });

    it("con código y una excepción: el intercambio se cayó por el camino", () => {
        const fallo = describirFalloCallback({
            code: "abc",
            excepcion: new TypeError("fetch failed"),
        });
        expect(fallo).toEqual({ motivo: "auth-callback", detalle: "TypeError: fetch failed" });
        expect(describirFalloCallback({ code: "abc", excepcion: "sin conexión" })).toEqual({
            motivo: "auth-callback",
            detalle: "sin conexión",
        });
        expect(describirFalloCallback({ code: "abc", excepcion: 42 })).toEqual({
            motivo: "auth-callback",
            detalle: "excepción sin mensaje",
        });
    });

    it("con código, sin error ni excepción: cae al motivo genérico", () => {
        expect(describirFalloCallback({ code: "abc" })).toEqual({ motivo: "auth-callback", detalle: "" });
        expect(describirFalloCallback({ code: "abc", excepcion: null })).toEqual({
            motivo: "auth-callback",
            detalle: "",
        });
    });

    it("el detalle nunca repite el código de acceso", () => {
        const secreto = "6f1c2a9e-secreto-de-sesion";
        const fallo = describirFalloCallback({
            code: secreto,
            error: { message: "invalid request", status: 403 },
        });
        expect(fallo.detalle).not.toContain(secreto);
    });

    it("si llegan error y excepción, manda el error de Supabase", () => {
        const fallo = describirFalloCallback({
            code: "abc",
            error: { message: "invalid request" },
            excepcion: new Error("no debería verse"),
        });
        expect(fallo.motivo).toBe("auth-codigo-rechazado");
        expect(fallo.detalle).toBe("invalid request");
    });
});
