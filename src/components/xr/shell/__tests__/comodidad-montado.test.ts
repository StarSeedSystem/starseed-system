/**
 * StarSeed XR · pruebas del enlace `comodidad-montado` (XR1010F): los bits puros sin WebGL.
 */
import { describe, it, expect } from "vitest";
import { ctxComodidad, salidaDe } from "../comodidad-montado";

/** Un almacén de mentira que cuenta cuántas veces se cerró la sesión y puede fallar. */
function almacenFalso(falla = false): { getState(): { session?: { end(): Promise<void> } | null } | null; cierres: () => number } {
    let cierres = 0;
    return {
        cierres: () => cierres,
        getState: () => ({
            session: falla ? undefined : {
                async end() { cierres += 1; },
            },
        }),
    };
}

describe("Comodidad montada (enlace con la escena)", () => {
    it("la acción «salir» cierra la sesión del almacén una vez", async () => {
        const a = almacenFalso();
        await salidaDe(a)();
        expect(a.cierres()).toBe(1);
    });

    it("sin sesión abierta «salir» no peta", async () => {
        const a = almacenFalso();
        a.getState = () => ({ session: null });
        await expect(salidaDe(a)()).resolves.toBeUndefined();
    });

    it("una sesión que falla al cerrarse no se propaga: la persona no queda atrapada", async () => {
        const a = almacenFalso();
        a.getState = () => ({ session: { end: () => Promise.reject(new Error("ya cerrada")) } });
        await expect(salidaDe(a)()).resolves.toBeUndefined();
    });

    it("el contexto provisional da las 11 acciones y «salir» es el real", async () => {
        const a = almacenFalso();
        const ctx = ctxComodidad(salidaDe(a));
        expect(Object.keys(ctx).sort()).toEqual(
            ["abrirDock", "abrirMenuMano", "agarrar", "atras", "girar", "hablar", "recentrar", "salir", "seleccionar", "teletransporte"],
        );
        expect(typeof ctx.salir).toBe("function");
        await ctx.salir();
        expect(a.cierres()).toBe(1);
        // Lo que queda pendiente de XR1010AS no hace nada aún, pero no explota:
        expect(() => ctx.girar(1)).not.toThrow();
        expect(() => ctx.recentrar()).not.toThrow();
    });
});
