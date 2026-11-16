/**
 * Callback de acceso: qué se hace con el código y cómo se cuenta el fallo — PURO.
 * El catch del canje ya no es vacío: distingue «no vino código», «Supabase lo rechazó» y
 * «la llamada lanzó» (red/cuota), y deja un detalle para el log sin filtrar el código.
 */
import { describe, expect, it } from "vitest";
import { LARGO_MAX_DETALLE, resolverCallback } from "../resultado-callback";

const ORIGEN = "https://os.starseed.invalid";
const CODIGO = "abc123-secreto-del-flujo";

describe("resolverCallback", () => {
    it("con el canje bien, vuelve a `next`", () => {
        const r = resolverCallback({
            origen: ORIGEN,
            next: "/llamada/42?t=x",
            codigo: CODIGO,
            error: null,
            excepcion: null,
        });
        expect(r).toEqual({ destino: `${ORIGEN}/llamada/42?t=x`, motivo: "ok", errorParaLog: null });
    });

    it("sin `code` (alguien abrió el callback a mano) vuelve al acceso sin ruido en el log", () => {
        const r = resolverCallback({ origen: ORIGEN, next: "/escritorios", codigo: null, error: null });
        expect(r.destino).toBe(`${ORIGEN}/login?error=auth-callback`);
        expect(r.motivo).toBe("sin-codigo");
        expect(r.errorParaLog).toBeNull();
    });

    it("si Supabase rechaza el código, avisa al acceso y lo cuenta", () => {
        const r = resolverCallback({
            origen: ORIGEN,
            next: "/escritorios",
            codigo: CODIGO,
            error: { message: "invalid flow state" },
            excepcion: null,
        });
        expect(r.motivo).toBe("codigo-rechazado");
        expect(r.destino).toBe(`${ORIGEN}/login?error=auth-callback`);
        expect(r.errorParaLog).toContain("invalid flow state");
    });

    it("si la llamada lanza (red o cuota), el catch lo cuenta como fallo de red", () => {
        const r = resolverCallback({
            origen: ORIGEN,
            next: "/escritorios",
            codigo: CODIGO,
            error: null,
            excepcion: new Error("fetch failed"),
        });
        expect(r.motivo).toBe("fallo-red");
        expect(r.destino).toBe(`${ORIGEN}/login?error=auth-callback`);
        expect(r.errorParaLog).toContain("fetch failed");
    });

    it("una excepción que no es Error tampoco se pierde", () => {
        const r = resolverCallback({ origen: ORIGEN, next: "/", codigo: CODIGO, error: null, excepcion: "boom" });
        expect(r.motivo).toBe("fallo-red");
        expect(r.errorParaLog).toContain("boom");
        expect(resolverCallback({ origen: ORIGEN, next: "/", codigo: CODIGO, excepcion: 42 }).errorParaLog).toContain(
            "desconocido",
        );
    });

    it("el detalle se aplana y se recorta, y el código nunca aparece en el log", () => {
        const r = resolverCallback({
            origen: ORIGEN,
            next: "/",
            codigo: CODIGO,
            error: { message: `línea uno\nlínea dos ${"x".repeat(500)}` },
        });
        expect(r.errorParaLog).not.toContain("\n");
        expect(r.errorParaLog).toContain("línea uno línea dos");
        expect(r.errorParaLog).not.toContain(CODIGO);
        const detalle = r.errorParaLog?.split(": ").slice(1).join(": ") ?? "";
        expect(detalle.length).toBeLessThanOrEqual(LARGO_MAX_DETALLE);
    });
});
