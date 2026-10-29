import { describe, it, expect } from "vitest";
import {
    CURVA_STARSEED,
    DURACION_STARSEED,
    PROPIEDADES_PERMITIDAS,
    entradaCardinal,
    movimientoReducido,
    movimientoStarseed,
    opcionesReducidas,
    propiedadesDe,
    soloPropiedadesPermitidas,
    type NombreMovimiento,
    type PuntoTrinity,
} from "@/lib/design/movimiento-starseed";

const NOMBRES: NombreMovimiento[] = ["siembra", "entrada-cardinal", "fundido-desenfoque", "elemento-compartido",
    "barrido-horizonte", "respiracion", "cristalizacion", "alquimia"];
const ESCENA: NombreMovimiento[] = NOMBRES.filter((n) => n !== "respiracion");
const PUNTOS: PuntoTrinity[] = ["guia", "creacion", "control", "raiz"];
const CURVAS = Object.values(CURVA_STARSEED);
const PERMITIDAS: readonly string[] = PROPIEDADES_PERMITIDAS;

describe("movimientoStarseed — los ocho gestos de la casa", () => {
    for (const nombre of NOMBRES) {
        it(`${nombre} tiene fotogramas y opciones válidas`, () => {
            const m = movimientoStarseed(nombre);
            expect(m.nombre).toBe(nombre);
            expect(m.fotogramas.length).toBeGreaterThanOrEqual(2);
            expect(CURVAS).toContain(m.opciones.easing);
            expect(m.opciones.fill).toBe("both");
            expect(m.opciones.duration).toBeGreaterThan(0);
        });

        it(`${nombre} solo anima propiedades permitidas`, () => {
            const m = movimientoStarseed(nombre);
            expect(soloPropiedadesPermitidas(m.fotogramas)).toBe(true);
            for (const propiedad of propiedadesDe(m.fotogramas)) {
                expect(PERMITIDAS).toContain(propiedad);
            }
        });
    }

    it("respeta las duraciones de interfaz y de escena", () => {
        expect([DURACION_STARSEED.rapida, DURACION_STARSEED.organica, DURACION_STARSEED.normal]).toEqual([140, 220, 240]);
        for (const nombre of ESCENA) {
            const ms = movimientoStarseed(nombre).opciones.duration;
            expect(ms).toBeGreaterThanOrEqual(600);
            expect(ms).toBeLessThanOrEqual(900);
        }
        const respiracion = movimientoStarseed("respiracion").opciones.duration;
        expect(respiracion).toBeGreaterThanOrEqual(4000);
        expect(respiracion).toBeLessThanOrEqual(6000);
    });

    it("la siembra brota, la respiración escala 1,03 y la alquimia usa filtro", () => {
        expect(movimientoStarseed("siembra").fotogramas[0].transform).toBe("scale(0)");
        expect(movimientoStarseed("respiracion").fotogramas[1].transform).toBe("scale(1.03)");
        expect(movimientoStarseed("alquimia").fotogramas[0].filter).toContain("grayscale(1)");
        expect(movimientoStarseed("barrido-horizonte").fotogramas[0].clipPath).toBe("inset(0 100% 0 0)");
    });
});

describe("entradaCardinal — un recorrido por punto de la Trinity", () => {
    const DESDE: Record<PuntoTrinity, string> = {
        guia: "translateY(-24px)", creacion: "translateX(-24px)", control: "translateX(24px)", raiz: "translateY(24px)",
    };

    for (const punto of PUNTOS) {
        it(`entra desde ${punto} y se asienta centrada`, () => {
            const m = entradaCardinal(punto);
            expect(m.nombre).toBe("entrada-cardinal");
            expect(m.fotogramas[0].transform?.startsWith(DESDE[punto])).toBe(true);
            expect(m.fotogramas[0].opacity).toBe(0);
            const ultimo = m.fotogramas[m.fotogramas.length - 1];
            expect(ultimo.transform).toBe("none");
            expect(ultimo.opacity).toBe(1);
            expect(soloPropiedadesPermitidas(m.fotogramas)).toBe(true);
        });
    }

});

describe("movimiento reducido — misma identidad, sin desplazamiento", () => {
    for (const nombre of NOMBRES) {
        it(`${nombre} queda en fundido de 1 ms`, () => {
            const m = movimientoReducido(nombre);
            expect(m.nombre).toBe(nombre);
            expect(m.opciones.duration).toBe(1);
            expect(m.opciones.delay).toBe(0);
            expect(m.opciones.iterations).toBe(1);
            expect(m.opciones.direction).toBe("normal");
            expect(propiedadesDe(m.fotogramas)).toEqual(["opacity"]);
            expect(soloPropiedadesPermitidas(m.fotogramas)).toBe(true);
        });
    }

    it("opcionesReducidas() funciona sola y conserva la curva", () => {
        const opciones = opcionesReducidas();
        expect(opciones.duration).toBe(1);
        expect(opciones.delay).toBe(0);
        expect(CURVAS).toContain(opciones.easing);
        expect(opcionesReducidas({ duration: 900, easing: CURVA_STARSEED.desliz, fill: "none" }).easing).toBe(CURVA_STARSEED.desliz);
    });
});

describe("pureza y determinismo", () => {
    it("devuelve copias: mutar el resultado no cambia el original", () => {
        const primero = movimientoStarseed("cristalizacion");
        primero.fotogramas[0].opacity = 0.5;
        primero.opciones.duration = 1;
        expect(movimientoStarseed("cristalizacion").fotogramas[0].opacity).toBe(0);
        expect(movimientoStarseed("cristalizacion").opciones.duration).toBe(DURACION_STARSEED.cristalizacion);
    });

    it("propiedadesDe ignora offset y no muta los fotogramas", () => {
        const m = movimientoStarseed("siembra");
        expect(propiedadesDe(m.fotogramas)).toEqual(["transform", "opacity"]);
        expect(m.fotogramas[1].offset).toBe(0.6);
    });
});
