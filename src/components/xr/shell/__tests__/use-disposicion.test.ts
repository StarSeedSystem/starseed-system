import { describe, it, expect } from "vitest";
import { siguienteBase, alturaOjosEfectiva } from "../use-disposicion";
import {
    debeRecentrar,
    disponerTrinity,
    normalDePanel,
    type NodoEspacial,
} from "../../../../lib/xr/espacio-trinity";
import type { Vec3 } from "../../../../lib/xr/tipos";
import { aGrados, aRadianes } from "../../../../lib/xr/tipos";

const T0 = 1000;
const baseInicial: { yawBase: number; fueraDesde: number | null } = { yawBase: 0, fueraDesde: null };

const punto = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const resta = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const modulo = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** Coseno del ángulo entre la normal del panel y la dirección hacia los ojos. */
function cosHaciaOjos(n: NodoEspacial, ojos: Vec3): number {
    const normal = normalDePanel(n.rotacion);
    const hacia = resta(ojos, n.posicion);
    const cos = punto(normal, hacia) / (modulo(normal) * modulo(hacia));
    return Math.min(1, Math.max(-1, cos));
}

/** siguienteBase recentra exactamente cuando `debeRecentrar` de lo núcleo lo pide. */
function debeCoincidir(): boolean {
    const estado = { yawBase: 0, fueraDesde: T0 };
    const d = siguienteBase(estado, { yaw: aRadianes(80) }, T0 + 3.5);
    return d.yawBase === aRadianes(80) && d.fueraDesde === null && debeRecentrar(aRadianes(80), 0, 3.5);
}

describe("XR1010J · ríg de la Trinity", () => {
    it("sin motivo para recentrar, siguienteBase devuelve el MISMO estado (no recalcula)", () => {
        const estado = { yawBase: 0.2, fueraDesde: null };
        expect(siguienteBase(estado, { yaw: 0.2 + aRadianes(30) }, T0 + 0.1)).toBe(estado);
    });

    it("mirar lejos arranca el cronómetro y NO recentra antes de los 3 s (la base no salta a lo tonto)", () => {
        const despues = siguienteBase(baseInicial, { yaw: aRadianes(95) }, T0);
        expect(despues.yawBase).toBe(0);
        expect(despues.fueraDesde).toBe(T0);
        expect(siguienteBase(despues, { yaw: aRadianes(95) }, T0 + 2.9).yawBase).toBe(0);
        expect(despues.fueraDesde).toBe(T0);
        expect(siguienteBase(despues, { yaw: aRadianes(60) }, T0 + 2.9).fueraDesde).toBeNull();
    });

    it("tras debeRecentrar sí recentra: la base pasa al yaw de la cabeza y se limpia el cronómetro", () => {
        expect(debeCoincidir()).toBe(true);
    });

    it("«recentrar» del menú o la voz «recentra» centra de inmediato, incluso con la cabeza cerca", () => {
        const despues = siguienteBase({ yawBase: 0, fueraDesde: null }, { yaw: 0.3 }, T0 + 0.2, "recentrar");
        expect(despues.yawBase).toBeCloseTo(0.3, 9);
        expect(despues.fueraDesde).toBeNull();
    });

    it("cambiar de postura mueve los nodos: las distancias son 1,8 / 1,6 / 1,2 m", () => {
        const zenith = (postura: "de-pie" | "sentado" | "una-mano") =>
            disponerTrinity({ alturaOjos: 1.6, postura, manoDominante: "derecha", modo: "vr-inmersivo" }).nodos.zenith.distancia;
        expect(zenith("de-pie")).toBe(1.8);
        expect(zenith("sentado")).toBe(1.6);
        expect(zenith("una-mano")).toBe(1.2);
    });

    it("los paneles cardinales miran a los ojos, incluso con la base girada", () => {
        const d = disponerTrinity({ alturaOjos: 1.7, postura: "sentado", manoDominante: "derecha", modo: "vr-inmersivo", yawBase: 0.4 });
        const ojos: Vec3 = [0, 1.7, 0];
        for (const id of ["zenith", "horizon", "logic"] as const) {
            expect(d.nodos[id].visible).toBe(true);
            expect(aGrados(Math.acos(cosHaciaOjos(d.nodos[id], ojos)))).toBeLessThanOrEqual(2);
        }
        // El dock (Anchor) mira al pecho con el 85 % de la elevación, no a los ojos: le damos margen.
        expect(aGrados(Math.acos(cosHaciaOjos(d.nodos.anchor, ojos)))).toBeLessThanOrEqual(9);
    });

    it("un zurdo NO espeja los cardinales: Horizon sigue al oeste y Logic al este, iguales para ambos", () => {
        const dePie = (mano: "izquierda" | "derecha") =>
            disponerTrinity({ alturaOjos: 1.6, postura: "de-pie", manoDominante: mano, modo: "vr-inmersivo" });
        const diestro = dePie("derecha");
        const zurdo = dePie("izquierda");
        expect(zurdo.nodos.horizon.azimutDeg).toBe(diestro.nodos.horizon.azimutDeg);
        expect(zurdo.nodos.horizon.azimutDeg).toBeLessThan(0);
        expect(zurdo.nodos.logic.azimutDeg).toBeGreaterThan(0);
        expect(zurdo.nodos.horizon.posicion).toEqual(diestro.nodos.horizon.posicion);
    });

    it("la altura de ojos manual manda sobre la medida del visor", () => {
        expect(alturaOjosEfectiva(2, 1.3)).toBe(2);
        expect(alturaOjosEfectiva(null, 1.3)).toBe(1.3);
        expect(alturaOjosEfectiva(null)).toBe(1.6);
        const conManual = disponerTrinity({ alturaOjos: alturaOjosEfectiva(2.0, 1.3), postura: "de-pie", manoDominante: "derecha", modo: "vr-inmersivo" });
        expect(conManual.nodos.zenith.posicion).toEqual(disponerTrinity({ alturaOjos: 2.0, postura: "de-pie", manoDominante: "derecha", modo: "vr-inmersivo" }).nodos.zenith.posicion);
    });

    it("en AR el cristal tiene opacidad mínima mayor (0,82) que en VR (0,6)", () => {
        const entrada = { alturaOjos: 1.6, postura: "de-pie", manoDominante: "derecha" } as const;
        expect(disponerTrinity({ ...entrada, modo: "ar-passthrough" }).opacidadMinima).toBe(0.82);
        expect(disponerTrinity({ ...entrada, modo: "vr-inmersivo" }).opacidadMinima).toBe(0.6);
    });
});
