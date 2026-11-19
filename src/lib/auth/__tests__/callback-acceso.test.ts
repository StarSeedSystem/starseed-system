/**
 * Callback de acceso: qué se hace con el resultado de `exchangeCodeForSession`.
 * El caso que importa es el que antes se perdía en un `catch` vacío: el fallo
 * tiene que dejar un aviso legible en el registro, sin filtrar el código.
 */
import { describe, expect, it } from "vitest";
import { evaluarCallback } from "@/lib/auth/callback-acceso";

describe("evaluarCallback", () => {
    it("sin código no es un error: cae al login sin ruido en el registro", () => {
        expect(evaluarCallback(null, null)).toEqual({ exito: false, aviso: null });
        expect(evaluarCallback("", { tipo: "exito" })).toEqual({ exito: false, aviso: null });
    });

    it("intercambio bueno: entra y no anota nada", () => {
        expect(evaluarCallback("abc", { tipo: "exito" })).toEqual({ exito: true, aviso: null });
    });

    it("un rechazo de Supabase deja aviso con su mensaje", () => {
        expect(evaluarCallback("abc", { tipo: "rechazado", error: new Error("invalid request") })).toEqual({
            exito: false,
            aviso: "callback de acceso: Supabase rechazó el canje («invalid request»)",
        });
    });

    it("una excepción del cliente también deja aviso (antes se perdía en el catch vacío)", () => {
        expect(evaluarCallback("abc", { tipo: "excepcion", error: "fetch failed" })).toEqual({
            exito: false,
            aviso: "callback de acceso: excepción al canjear el código («fetch failed»)",
        });
    });

    it("si no hay mensaje, el aviso no inventa paréntesis", () => {
        expect(evaluarCallback("abc", { tipo: "rechazado", error: undefined })?.aviso).toBe(
            "callback de acceso: Supabase rechazó el canje",
        );
        expect(evaluarCallback("abc", { tipo: "rechazado", error: { status: 400 } })?.aviso).toBe(
            "callback de acceso: Supabase rechazó el canje",
        );
        expect(evaluarCallback("abc", { tipo: "rechazado", error: 42 })?.aviso).toBe(
            "callback de acceso: Supabase rechazó el canje",
        );
    });

    it("si el canje no devuelve resultado, se anota y no se entra", () => {
        expect(evaluarCallback("abc", null)).toEqual({
            exito: false,
            aviso: "callback de acceso: el canje no devolvió resultado",
        });
    });

    it("tapa los valores de code y tokens y no filtra el código de la URL", () => {
        const { aviso } = evaluarCallback(
            "CODIGO-DE-LA-URL",
            { tipo: "rechazado", error: "bad: code=abc123&access_token=zzz&refresh_token=yyy&token=xxx" },
        );
        expect(aviso).toBe(
            "callback de acceso: Supabase rechazó el canje («bad: code=***&access_token=***&refresh_token=***&token=***»)",
        );
        expect(aviso?.includes("CODIGO-DE-LA-URL")).toBe(false);
        expect(aviso?.includes("abc123")).toBe(false);
    });

    it("deja el mensaje en una sola línea y lo recorta con puntos suspensivos", () => {
        const { aviso } = evaluarCallback("abc", { tipo: "excepcion", error: "fallo\n\tinesperado   del  servidor" });
        expect(aviso).toBe("callback de acceso: excepción al canjear el código («fallo inesperado del servidor»)");

        const largo = evaluarCallback("abc", { tipo: "rechazado", error: "x".repeat(300) }).aviso as string;
        const detalle = largo.slice(largo.indexOf("«") + 1, largo.lastIndexOf("»"));
        expect(detalle).toHaveLength(160);
        expect(detalle.endsWith("…")).toBe(true);
    });
});
