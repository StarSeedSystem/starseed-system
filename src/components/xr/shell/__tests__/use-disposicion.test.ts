/**
 * Disposición de la Trinity (rescate de XR1010J · contrato §3 a): pruebas que main aún no
 * cubría —distancias exactas por postura, el dock mirando al pecho, la opacidad exacta en
 * AR, el panel compartido de una mano y los umbrales del recentrado—. Solo funciones puras
 * de `src/lib/xr/espacio-trinity.ts`.
 */
import { describe, expect, it } from "vitest";
import { debeRecentrar, disponerTrinity, normalDePanel, type EntradaEspacio } from "@/lib/xr/espacio-trinity";
import type { NodoTrinity } from "@/lib/xr/tipos";

const E: EntradaEspacio = { alturaOjos: 1.62, postura: "de-pie", manoDominante: "derecha", modo: "vr-inmersivo" };

const cosenoHacia = (posicion: readonly [number, number, number], normal: readonly [number, number, number], ojos: readonly [number, number, number]): number => {
    const hacia = [ojos[0] - posicion[0], ojos[1] - posicion[1], ojos[2] - posicion[2]];
    const modulo = Math.hypot(...hacia);
    return Math.abs((normal[0] * hacia[0] + normal[1] * hacia[1] + normal[2] * hacia[2]) / modulo);
};

describe("posturas y distancias", () => {
    it("de pie, sentado y a una mano colocan la Trinity a 1,8 / 1,6 / 1,2 m", () => {
        const pie = disponerTrinity({ ...E, postura: "de-pie" });
        const silla = disponerTrinity({ ...E, postura: "sentado" });
        const mano = disponerTrinity({ ...E, postura: "una-mano" });
        expect([pie.nodos.zenith.distancia, silla.nodos.zenith.distancia, mano.nodos.zenith.distancia]).toEqual([1.8, 1.6, 1.2]);
        expect(pie.nodos.horizon.posicion).not.toEqual(silla.nodos.horizon.posicion);
    });
});

describe("orientación de los paneles", () => {
    it("los paneles miran a los ojos y el dock mira al pecho, también con yaw base", () => {
        const ojos = [0, E.alturaOjos, 0] as const;
        const d = disponerTrinity({ ...E, yawBase: 0.3 });
        for (const id of ["zenith", "horizon", "logic"] as NodoTrinity[]) {
            const n = d.nodos[id];
            expect(cosenoHacia(n.posicion, normalDePanel(n.rotacion), ojos)).toBeGreaterThan(0.999);
        }
        const a = d.nodos.anchor;
        expect(cosenoHacia(a.posicion, normalDePanel(a.rotacion), ojos)).toBeGreaterThan(0.99);
    });

    it("el yaw base gira el rig alrededor de la persona sin cambiar las distancias", () => {
        const sin = disponerTrinity({ ...E, yawBase: 0 });
        const con = disponerTrinity({ ...E, yawBase: Math.PI / 2 });
        expect(con.nodos.zenith.distancia).toBe(sin.nodos.zenith.distancia);
        expect(con.nodos.horizon.posicion).not.toEqual(sin.nodos.horizon.posicion);
    });
});

describe("modo y opacidad", () => {
    it("en AR la opacidad mínima es 0,82 y el anclaje es el mundo; en VR queda en 0,6", () => {
        const ar = disponerTrinity({ ...E, modo: "ar-passthrough" });
        const vr = disponerTrinity({ ...E, modo: "vr-inmersivo" });
        expect([ar.opacidadMinima, ar.nodos.zenith.anclaje, vr.opacidadMinima]).toEqual([0.82, "mundo", 0.6]);
    });
});

describe("postura de una mano", () => {
    it("Logic comparte panel con Horizon: mismo azimut, agrupado y oculto", () => {
        const d = disponerTrinity({ ...E, postura: "una-mano" });
        expect(d.nodos.logic.visible).toBe(false);
        expect(d.nodos.logic.agrupadoCon).toBe("horizon");
        expect([d.nodos.horizon.azimutDeg, d.nodos.horizon.visible]).toEqual([d.nodos.logic.azimutDeg, true]);
    });
});

describe("umbrales del recentrado", () => {
    it("68° no recentra: el cono es de 70°", () => {
        expect(debeRecentrar((68 * Math.PI) / 180, 0, 10)).toBe(false);
    });

    it("fuera del cono hacen falta 3 s: a los 2 s no, a los 3,001 s sí", () => {
        expect(debeRecentrar(2, 0, 2)).toBe(false);
        expect(debeRecentrar(2, 0, 3.001)).toBe(true);
    });
});
