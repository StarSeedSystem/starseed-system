/**
 * XR1010J · parte pura de la disposición de la Trinity (`use-disposicion.ts`): la base no salta por
 * un giro menor al umbral, se recentra a los ~3 s fuera, el contenido NO se recalcula sin recentrar,
 * las distancias por postura (1,8 / 1,6 / 1,2 m), los paneles miran a los ojos, el dock al pecho
 * (muelle al 85 %), un zurdo no espeja Horizon y Logic, la altura de ojos manual manda y el modo y
 * la escala se pasan al núcleo (opacidad y anclaje por modo). Pruebas de node: sin red, sin WebGL.
 */
import { describe, expect, it } from "vitest";
import { normalDePanel } from "@/lib/xr/espacio-trinity";
import {
    alturaOjosEfectiva,
    calculaDisposicion,
    igualDisposicion,
    siguienteBase,
    type EntradasDisposicion,
    type EstadoBase,
} from "../use-disposicion";
const entradas = (cambios: Partial<EntradasDisposicion> = {}): EntradasDisposicion => ({
    yawBase: 0, postura: "de-pie", manoDominante: "derecha", modo: "vr-inmersivo", escala: 1, alturaOjos: 1.6, ...cambios,
});
const estado = (yawBase = 0, fueraDesde: number | null = null): EstadoBase => ({ yawBase, fueraDesde });
// `siguienteBase`: recentrar solo a los ~3 s fuera del umbral de 70°.
describe("siguienteBase", () => {
    it("un giro de 30° (< umbral de 70°) no mueve la base ni marca fueraDesde", () => {
        expect(siguienteBase(estado(0), { yaw: Math.PI / 6 }, 100)).toEqual(estado(0));
        expect(siguienteBase(estado(2.5), { yaw: 2.5 + 1.2 }, 100)).toEqual(estado(2.5));
    });

    it("un yaw no finito (cámara sin leer aún) mantiene el estado tal cual", () => {
        expect(siguienteBase(estado(0.3, 97), { yaw: Number.NaN }, 100)).toEqual(estado(0.3, 97));
    });

    it("pasando el umbral marca fueraDesde UNA vez y aún no recentra (menos de 3 s fuera)", () => {
        const a = siguienteBase(estado(0), { yaw: 2 }, 100.5);
        expect(a.fueraDesde).toBe(100.5);
        expect(a.yawBase).toBe(0);
        const b = siguienteBase(a, { yaw: 2.1 }, 102.5);
        expect(b).toEqual(estado(0, 100.5));
    });

    it("tras debeRecentrar (≥ 3 s fuera) sí recalcula: la base gira a la cabeza y el contenido cambia", () => {
        const a = siguienteBase(estado(0, 100.5), { yaw: 2.2 }, 104);
        expect(a).toEqual(estado(2.2, null));
        expect(igualDisposicion(entradas({ yawBase: 2.2 }), entradas())).toBe(false);
    });

    it("sin girar fuera, muchos ticks seguidos NO recalculan la disposición", () => {
        const camino = [0.9, -0.9, 1.2, 0.4, -1.2] as const;
        let prev: EstadoBase = estado(0);
        for (const yaw of camino) {
            const sig = siguienteBase(prev, { yaw }, 100);
            expect(igualDisposicion(entradas({ yawBase: sig.yawBase }), entradas({ yawBase: prev.yawBase }))).toBe(true);
            prev = sig;
        }
        expect(prev).toEqual(estado(0, null));
    });

    it("el orden reciente manda siempre: la base apunta donde mira la cabeza", () => {
        expect(siguienteBase(estado(0, 80), { yaw: 1.5 }, 90, "recentrar")).toEqual(estado(1.5, null));
    });

    it("la orden «recentrar» manda también dentro del cono (sin orden ahí no movería nada)", () => {
        expect(siguienteBase(estado(0), { yaw: 0.2 }, 100)).toEqual(estado(0));
        expect(siguienteBase(estado(0), { yaw: 0.2 }, 100, "recentrar")).toEqual(estado(0.2));
    });

    it("volver al cono limpia la cuenta de tiempo fuera", () => {
        const fuera = siguienteBase(estado(0), { yaw: 2 }, 100);
        expect(fuera).toEqual(estado(0, 100));
        expect(siguienteBase(fuera, { yaw: 0.1 }, 100 + 500)).toEqual(estado(0));
    });
});

describe("postura y nodos del núcleo vía calculaDisposicion", () => {
    it("cambiar de postura mueve los nodos y las distancias son 1,8 / 1,6 / 1,2 m", () => {
        const distancias = (["de-pie", "sentado", "una-mano"] as const).map(
            (p) => calculaDisposicion(entradas({ postura: p })).nodos.zenith.distancia,
        );
        expect(distancias).toEqual([1.8, 1.6, 1.2]);
        const pie = calculaDisposicion(entradas()).nodos.zenith.posicion;
        const silla = calculaDisposicion(entradas({ postura: "sentado" })).nodos.zenith.posicion;
        expect(silla).not.toEqual(pie);
    });

    it("en una mano, Horizon y Logic comparten panel (pestañas: agrupadoCon)", () => {
        const d = calculaDisposicion(entradas({ postura: "una-mano" }));
        expect(d.nodos.logic.agrupadoCon).toBe("horizon");
        expect(d.nodos.logic.visible).toBe(false);
        expect(d.nodos.horizon.visible).toBe(true);
    });

    it("los tres paneles cardinales miran al origen de los ojos (normalDePanel → ojos)", () => {
        const d = calculaDisposicion(entradas({ yawBase: 0.7, alturaOjos: 1.7, postura: "de-pie" }));
        const ojos = [0, 1.7, 0] as const;
        for (const id of ["zenith", "horizon", "logic"] as const) {
            const n = d.nodos[id];
            const aOjos = [ojos[0] - n.posicion[0], ojos[1] - n.posicion[1], ojos[2] - n.posicion[2]] as const;
            const modulo = Math.hypot(aOjos[0], aOjos[1], aOjos[2]);
            const mi = [aOjos[0] / modulo, aOjos[1] / modulo, aOjos[2] / modulo];
            const normal = normalDePanel(n.rotacion);
            expect(mi[0] * normal[0] + mi[1] * normal[1] + mi[2] * normal[2]).toBeGreaterThan(0.99);
        }
    });

    it("el dock (Anchor) mira al pecho: hacia arriba y a la persona, pero menos cabeceo que los ojos (muelle al 85 %)", () => {
        const d = calculaDisposicion(entradas({ alturaOjos: 1.62 }));
        const a = d.nodos.anchor;
        const hacia = [0 - a.posicion[0], 1.62 - a.posicion[1], 0 - a.posicion[2]] as const;
        const modulo = Math.hypot(hacia[0], hacia[1], hacia[2]);
        const m = normalDePanel(a.rotacion);
        const cos = Math.abs((m[0] * hacia[0] + m[1] * hacia[1] + m[2] * hacia[2]) / modulo);
        expect(cos).toBeGreaterThan(0.99);
        expect(cos).toBeLessThan(0.999);
        expect(Math.atan2(m[1], Math.hypot(m[0], m[2]))).toBeLessThan(Math.atan2(hacia[1], Math.abs(hacia[2])));
    });

    it("un usuario zurdo NO espeja la Trinity: Horizon sigue al oeste y Logic al este", () => {
        const der = calculaDisposicion(entradas());
        const izq = calculaDisposicion(entradas({ manoDominante: "izquierda" }));
        for (const id of ["horizon", "logic"] as const) {
            expect(izq.nodos[id].azimutDeg).toBeCloseTo(der.nodos[id].azimutDeg, 6);
            expect(Math.sign(izq.nodos[id].posicion[0])).toBe(Math.sign(der.nodos[id].posicion[0]));
        }
        expect(izq.nodos.horizon.posicion[0]).toBeLessThan(0);
        expect(izq.nodos.logic.posicion[0]).toBeGreaterThan(0);
    });
});

describe("alturaOjosEfectiva", () => {
    it("la altura manual manda; si no hay, la medida del visor; sin ninguna, 1,6 m", () => {
        expect(alturaOjosEfectiva(1.9, 1.4)).toBe(1.9);
        expect(alturaOjosEfectiva(null, 1.4)).toBe(1.4);
        expect(alturaOjosEfectiva(null, undefined)).toBe(1.6);
        expect(alturaOjosEfectiva(null, null)).toBe(1.6);
        expect(alturaOjosEfectiva(null, Number.NaN)).toBe(1.6);
        expect(alturaOjosEfectiva(Number.NaN, 1.4)).toBe(1.4);
    });

    it("la altura elegida entra en la disposición (Zenith sube con una persona más alta)", () => {
        const corto = calculaDisposicion(entradas({ alturaOjos: 0.9 }));
        const alto = calculaDisposicion(entradas({ alturaOjos: 2.0 }));
        expect(alto.nodos.zenith.posicion[1]).toBeGreaterThan(corto.nodos.zenith.posicion[1]);
    });
});

describe("modo y escala entran al núcleo vía calculaDisposicion", () => {
    it("en AR la opacidad mínima sube a 0,82 y el anclaje es el mundo; en VR queda 0,6 sobre el cuerpo", () => {
        const ar = calculaDisposicion(entradas({ modo: "ar-passthrough" }));
        const vr = calculaDisposicion(entradas());
        expect([ar.opacidadMinima, ar.nodos.zenith.anclaje, vr.opacidadMinima, vr.nodos.zenith.anclaje]).toEqual([0.82, "mundo", 0.6, "cuerpo"]);
    });

    it("la escala entra al núcleo: más escala, paneles más grandes (accesibilidad)", () => {
        const grande = calculaDisposicion(entradas({ escala: 1.2 }));
        expect(grande.nodos.zenith.ancho).toBeGreaterThan(calculaDisposicion(entradas()).nodos.zenith.ancho);
    });
});
