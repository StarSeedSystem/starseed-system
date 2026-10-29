import { describe, it, expect } from "vitest";
import {
    alquimia, barridoHorizonte, CURVAS, cristalizacion, DURACION_INTERFAZ, elementoCompartido,
    entradaCardinal, fundidoDesenfoque, opcionesReducidas, respiracion, siembra, type Animacion, type PuntoTrinity,
} from "@/lib/design/movimiento-starseed";

const PUNTOS: PuntoTrinity[] = ["zenith", "horizon", "logic", "anchor"];
const CURVAS_REALES = new Set<string>(Object.values(CURVAS));

/** Todas las animaciones de la biblioteca, en plano, para comprobarlas en bloque. */
function todas(): Animacion[] {
    const s = siembra(), b = barridoHorizonte();
    return [
        s.brote, s.apertura, s.mirar, s.trazado,
        ...PUNTOS.map(entradaCardinal),
        fundidoDesenfoque(), elementoCompartido(), b.linea, b.escenaB,
        cristalizacion(), alquimia(), respiracion(),
    ];
}

describe("reglas de marca — todas las animaciones", () => {
    it("solo animan transform, opacity, filter y clip-path", () => {
        const permitidas = new Set(["transform", "opacity", "filter", "clipPath", "offset"]);
        for (const a of todas()) {
            expect(a.keyframes.length).toBeGreaterThan(0);
            for (const kf of a.keyframes) for (const k of Object.keys(kf)) expect(permitidas.has(k)).toBe(true);
        }
    });

    it("todas usan una de las tres curvas reales del OS", () => {
        for (const a of todas()) expect(CURVAS_REALES.has(a.curva)).toBe(true);
    });

    it("las de escena duran 600–900 ms; la alquimia queda en los 240 ms de interfaz", () => {
        expect(alquimia()).toMatchObject({ duracionMs: DURACION_INTERFAZ.normal, curva: CURVAS.genesis });
        for (const m of todas()) {
            if (m.duracionMs >= 4000) continue; // la respiración, ciclo propio de 4–6 s
            if (m.curva === CURVAS.genesis) continue; // la alquimia, interfaz
            expect(m.duracionMs).toBeGreaterThanOrEqual(600);
            expect(m.duracionMs).toBeLessThanOrEqual(900);
        }
    });

    it("la respiración va de escala 1 a 1,03 con ciclo de 4–6 s, ida y vuelta", () => {
        const a = respiracion();
        expect(a.duracionMs).toBeGreaterThanOrEqual(4000);
        expect(a.duracionMs).toBeLessThanOrEqual(6000);
        expect(a.keyframes[0].transform).toBe("scale(1)");
        expect(a.keyframes[1].transform).toBe("scale(1.03)");
        expect(a.direccion).toBe("alternate");
    });
});

describe("entrada cardinal — por punto de la Trinity", () => {
    const DESDE: Record<PuntoTrinity, string> = {
        zenith: "translateY(-24px)",
        horizon: "translateX(-24px)",
        logic: "translateX(24px)",
        anchor: "translateY(24px)",
    };

    for (const punto of PUNTOS) {
        it(`${punto} entra desde su perímetro con sobrepaso y reposa en «none»`, () => {
            const a = entradaCardinal(punto);
            expect(a.keyframes[0].transform).toContain(DESDE[punto]);
            expect(a.keyframes[0].opacity).toBe(0);
            expect(a.keyframes[a.keyframes.length - 1]).toEqual({ transform: "none", opacity: 1 });
            expect(a.duracionMs).toBeGreaterThanOrEqual(600);
            expect(a.duracionMs).toBeLessThanOrEqual(900);
            expect(a.curva).toBe(CURVAS.glide);
        });
    }

    it("los cuatro puntos difieren en su arranque y la función es determinista", () => {
        const arranques = new Set(PUNTOS.map((p) => entradaCardinal(p).keyframes[0].transform));
        expect(arranques.size).toBe(4);
        expect(entradaCardinal("zenith")).toEqual(entradaCardinal("zenith"));
    });
});

describe("siembra y barrido — puesta en escena", () => {
    it("la siembra se escalona: brote → apertura → mirar → trazado", () => {
        const s = siembra();
        expect([s.brote.delayMs, s.apertura.delayMs, s.mirar.delayMs, s.trazado.delayMs]).toEqual([undefined, 350, 1050, 1500]);
    });

    it("el trazado del diamante revela con clip-path y dura menos de una escena larga", () => {
        const trazado = siembra().trazado;
        expect([trazado.keyframes[0].clipPath, trazado.keyframes[1].clipPath])
            .toEqual(["inset(0 100% 0 0)", "inset(0 0 0 0)"]);
        expect(trazado.duracionMs).toBeLessThanOrEqual(900);
    });

    it("el barrido de horizonte cruza la línea y descubre la escena con retardo", () => {
        const b = barridoHorizonte();
        expect(b.linea.duracionMs).toBe(b.escenaB.duracionMs);
        expect(b.escenaB.delayMs).toBe(300);
        expect(b.escenaB.relleno).toBe("both");
        expect(b.linea.keyframes[1].transform).toBe("scaleX(1)");
    });
});

describe("opcionesReducidas — movimiento reducido", () => {
    it("toda animación queda a 1 ms, sin retardo y a una sola pasada", () => {
        for (const a of todas()) {
            const r = opcionesReducidas(a);
            expect(r.duracionMs).toBe(1);
            expect(r.delayMs).toBe(0);
            expect(r.iteraciones).toBe(1);
            expect(r.keyframes).toEqual(a.keyframes);
            expect(r.curva).toBe(a.curva);
        }
    });

    it("no muta la animación original", () => {
        const original = respiracion();
        opcionesReducidas(original);
        expect(original.duracionMs).toBe(5000);
    });
});
