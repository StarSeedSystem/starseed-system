/**
 * Disposición de la Trinity (XR1010J · contrato §3 a): la base de mirada no salta, el recentrado
 * solo cuando `debeRecentrar` lo pide (o lo pide la persona), la altura manual manda, las distancias
 * de las posturas son 1,8 / 1,6 / 1,2 m, los paneles miran a los ojos y los zurdos NO espejan.
 */
import { describe, expect, it } from "vitest";
import {
    disponerTrinity,
    normalDePanel,
    type DisposicionTrinity,
    type EntradaEspacio,
} from "@/lib/xr/espacio-trinity";
import { CONFORT_DEFECTO, type PreferenciasConfort } from "@/lib/xr/confort";
import type { Mano, ModoXR } from "@/lib/xr/tipos";
import { entradaDeConfort, siguienteBase, type BaseMirada } from "../use-disposicion";

const HORA = 1000;

const confort = (c: Partial<PreferenciasConfort> = {}): PreferenciasConfort => ({ ...CONFORT_DEFECTO, ...c });

const entrada = (modo: ModoXR = "vr-inmersivo", yawBase = 0, c: Partial<PreferenciasConfort> = {}, medida: number | null = 1.62, techo?: number): EntradaEspacio =>
    entradaDeConfort(confort(c), modo, yawBase, medida, techo);

const base = (p: Partial<BaseMirada> = {}): BaseMirada => ({ yawBase: 0, fueraDesde: null, ...p });

describe("siguienteBase · la base solo se mueve al recentrar", () => {
    it("sin recentrar no se recalcula: la base no cambia y no acumula tiempo fuera", () => {
        const estado = base();
        expect(siguienteBase(estado, { yaw: 0.6 }, HORA)).toEqual(estado);
        expect(siguienteBase(estado, { yaw: 0.6 }, HORA + 10_000)).toEqual(estado);
    });

    it("la base no salta cuando la cabeza gira menos del umbral (70°)", () => {
        expect(siguienteBase(base(), { yaw: (68 * Math.PI) / 180 }, HORA)).toEqual(base());
    });

    it("fuera del cono menos de 3 s tampoco recentra, pero arranca la cuenta", () => {
        expect(siguienteBase(base(), { yaw: 2 }, HORA + 2000)).toEqual({ yawBase: 0, fueraDesde: HORA + 2000 });
    });

    it("tras debeRecentrar (3 s fuera) sí recentra hacia donde mira la cabeza", () => {
        expect(siguienteBase(base({ fueraDesde: HORA }), { yaw: 2 }, HORA + 3001)).toEqual({ yawBase: 2, fueraDesde: null });
    });

    it("volver al cono limpia la cuenta de tiempo fuera", () => {
        const dentro = siguienteBase(siguienteBase(base(), { yaw: 2 }, HORA), { yaw: 0.1 }, HORA + 500);
        expect(dentro).toEqual(base());
    });

    it("la orden «recentrar» manda incluso dentro del cono", () => {
        expect(siguienteBase(base(), { yaw: 0.2 }, HORA, "recentrar")).toEqual({ yawBase: 0.2, fueraDesde: null });
    });
});

describe("entradaDeConfort · altura de ojos y confort", () => {
    it("la altura manual manda sobre la medida del visor", () => {
        expect(entrada("vr-inmersivo", 0, { alturaOjos: 1.93 }, 1.62).alturaOjos).toBe(1.93);
    });

    it("sin altura manual usa la medida, y sin medida 1,7 m", () => {
        expect(entrada("vr-inmersivo", 0, { alturaOjos: null }, 1.62).alturaOjos).toBe(1.62);
        expect(entrada("vr-inmersivo", 0, { alturaOjos: null }, null).alturaOjos).toBe(1.7);
    });

    it("pasa postura, mano, escala, modo, yaw base y techo al núcleo", () => {
        const e = entrada("ar-passthrough", 0.4, { postura: "sentado", manoDominante: "izquierda", escala: 1.2 }, null, 2.4);
        expect([e.postura, e.manoDominante, e.escala, e.modo, e.yawBase, e.techo]).toEqual(["sentado", "izquierda", 1.2, "ar-passthrough", 0.4, 2.4]);
    });
});

describe("disponerTrinity · la colocación que el rig pinta", () => {
    it("cambiar de postura mueve los nodos y las distancias son 1,8 / 1,6 / 1,2 m", () => {
        const pie = disponerTrinity(entrada("vr-inmersivo", 0, { postura: "de-pie" }));
        const silla = disponerTrinity(entrada("vr-inmersivo", 0, { postura: "sentado" }));
        expect(pie.nodos.zenith.distancia).toBe(1.8);
        expect(silla.nodos.zenith.distancia).toBe(1.6);
        expect(disponerTrinity(entrada("vr-inmersivo", 0, { postura: "una-mano" })).nodos.zenith.distancia).toBe(1.2);
        expect(pie.nodos.horizon.posicion).not.toEqual(silla.nodos.horizon.posicion);
    });

    it("los paneles miran a los ojos: la normal del panel apunta al origen de los ojos", () => {
        const ojos: [number, number, number] = [0, 1.62, 0];
        const d = disponerTrinity(entrada("vr-inmersivo", 0.3));
        for (const id of ["zenith", "horizon", "logic"] as const) {
            const n = d.nodos[id];
            const hacia = [ojos[0] - n.posicion[0], ojos[1] - n.posicion[1], ojos[2] - n.posicion[2]];
            const mod = Math.hypot(hacia[0], hacia[1], hacia[2]);
            const m = normalDePanel(n.rotacion);
            expect(Math.abs((m[0] * hacia[0] + m[1] * hacia[1] + m[2] * hacia[2]) / mod)).toBeGreaterThan(0.999);
        }
        // El dock (Anchor) mira al pecho, un punto entre los ojos y el suelo (muelle: −41° · 85 %).
        const a = d.nodos.anchor;
        const h = [ojos[0] - a.posicion[0], ojos[1] - a.posicion[1], ojos[2] - a.posicion[2]];
        expect(Math.abs(normalDePanel(a.rotacion).reduce((s, x, i) => s + x * h[i], 0) / Math.hypot(...h))).toBeGreaterThan(0.99);
    });

    it("un zurdo NO espeja Horizon (oeste) y Logic (este): solo cambia el menú de la muñeca", () => {
        const diestro = disponerTrinity(entrada("vr-inmersivo", 0, { manoDominante: "derecha" }));
        const zurdo = disponerTrinity(entrada("vr-inmersivo", 0, { manoDominante: "izquierda" }));
        expect(zurdo.nodos.horizon.azimutDeg).toBe(diestro.nodos.horizon.azimutDeg);
        expect(zurdo.nodos.horizon.azimutDeg).toBeLessThan(0);
        expect(zurdo.nodos.logic.azimutDeg).toBeGreaterThan(0);
        expect([zurdo.nodos.horizon.posicion, zurdo.mano, diestro.mano]).toEqual([diestro.nodos.horizon.posicion, "derecha", "izquierda"]);
        // `disposicion.mano` es la mano del menú de muñeca: la NO dominante.
    });

    it("en AR la opacidad mínima sube a 0,82 y el anclaje es el mundo; en VR queda 0,6", () => {
        const ar = disponerTrinity(entrada("ar-passthrough"));
        const vr = disponerTrinity(entrada("vr-inmersivo"));
        expect([ar.opacidadMinima, ar.nodos.zenith.anclaje, vr.opacidadMinima]).toEqual([0.82, "mundo", 0.6]);
    });

    it("en postura una-mano Logic comparte panel con Horizon (agrupado y oculto)", () => {
        const d = disponerTrinity(entrada("vr-inmersivo", 0, { postura: "una-mano" }));
        expect(d.nodos.logic.visible).toBe(false);
        expect(d.nodos.logic.agrupadoCon).toBe("horizon");
        expect([d.nodos.horizon.azimutDeg, d.nodos.horizon.visible]).toEqual([d.nodos.logic.azimutDeg, true]);
    });
});
