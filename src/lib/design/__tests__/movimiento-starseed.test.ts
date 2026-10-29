import { describe, it, expect } from "vitest";
import {
    CURVAS,
    DURACION_ESCENA,
    DURACION_FIRMA,
    DURACION_UI,
    PROPIEDADES_PERMITIDAS,
    alquimia,
    barridoHorizonte,
    conReduccion,
    cristalizacion,
    elementoCompartido,
    entradaCardinal,
    fundidoDesenfoque,
    opcionesReducidas,
    respiracion,
    siembra,
    type Animacion,
    type Fotograma,
    type PuntoTrinity,
} from "@/lib/design/movimiento-starseed";

const PUNTOS: PuntoTrinity[] = ["arriba", "izquierda", "derecha", "abajo"];

const DESDE: Record<PuntoTrinity, string> = { arriba: "translateY(-24px) scale(0.98)", izquierda: "translateX(-24px) scale(0.98)", derecha: "translateX(24px) scale(0.98)", abajo: "translateY(24px) scale(0.98)" };

const barrido = barridoHorizonte();
const TODAS: Array<[string, Animacion]> = [
    ["siembra", siembra()],
    ["entrada arriba", entradaCardinal("arriba")],
    ["fundido", fundidoDesenfoque()],
    ["elemento compartido", elementoCompartido()],
    ["barrido línea", barrido.linea],
    ["barrido escena", barrido.escena],
    ["respiración", respiracion()],
    ["cristalización", cristalizacion(2)],
    ["alquimia", alquimia()],
];

function claves(f: Fotograma): string[] {
    return Object.keys(f).filter((k) => k !== "offset");
}

function soloPermitidas(anim: Animacion): boolean {
    const permitidas = new Set<string>(PROPIEDADES_PERMITIDAS);
    return anim.keyframes.every((f) => claves(f).every((k) => permitidas.has(k)));
}

describe("tokens de la biblioteca", () => {
    it("usa las curvas reales del OS", () => {
        expect(CURVAS.organica).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
        expect(CURVAS.desliz).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
        expect(CURVAS.genesis).toBe("cubic-bezier(0.22, 0.9, 0.3, 1)");
    });

    it("las duraciones caen en las ventanas de interfaz, escena y firma", () => {
        expect(Object.values(DURACION_UI)).toEqual([140, 220, 240]);
        for (const ms of Object.values(DURACION_ESCENA)) {
            expect(ms).toBeGreaterThanOrEqual(600);
            expect(ms).toBeLessThanOrEqual(900);
        }
        expect(DURACION_FIRMA).toEqual({ siembra: 2400, respiracion: 5000 });
    });
});

describe("propiedades permitidas", () => {
    it("solo anima transform, opacity, filter y clipPath en todas las firmas", () => {
        expect(PROPIEDADES_PERMITIDAS).toEqual(["transform", "opacity", "filter", "clipPath"]);
        for (const [nombre, anim] of TODAS) {
            expect(soloPermitidas(anim), nombre).toBe(true);
            for (const f of anim.keyframes) expect(claves(f)).not.toContain("width");
        }
    });
});

describe("siembra", () => {
    it("brota en 2,4 s con la curva orgánica y una sola vez", () => {
        const a = siembra();
        expect(a.opciones).toMatchObject({ duration: 2400, easing: CURVAS.organica, fill: "both" });
        expect(a.opciones.iterations).toBeUndefined();
        expect(a.keyframes[0].transform).toBe("scale(0)");
        expect(a.keyframes[0].opacity).toBe(0);
        expect(a.keyframes[a.keyframes.length - 1].clipPath).toBe("none");
    });
});

describe("entrada cardinal", () => {
    for (const punto of PUNTOS) {
        it(`entra desde el borde de ${punto}`, () => {
            const a = entradaCardinal(punto);
            expect(a.opciones).toMatchObject({ duration: DURACION_ESCENA.entrada, easing: CURVAS.desliz });
            expect(a.keyframes[0]).toMatchObject({ transform: DESDE[punto], opacity: 0 });
            expect(a.keyframes[a.keyframes.length - 1].opacity).toBe(1);
        });
    }
});
describe("transiciones, firmas y reducción", () => {
    it("fundido, elemento y barrido usan sus tokens", () => {
        expect(fundidoDesenfoque().keyframes[0].filter).toBe("blur(8px)");
        expect(fundidoDesenfoque().keyframes[1].filter).toBe("blur(0)");
        expect(elementoCompartido().opciones).toMatchObject({ iterations: 2, direction: "alternate" });
        expect(barrido.linea.keyframes[1].transform).toBe("scaleX(1)");
        expect(barrido.escena.opciones.delay).toBe(300);
    });
    it("respiración, cristalización y alquimia respetan su carácter", () => {
        expect(respiracion().keyframes[1].transform).toBe("scale(1.03)");
        expect(cristalizacion(99).opciones.delay).toBe(240);
        expect(alquimia().opciones.easing).toBe(CURVAS.genesis);
        expect(alquimia().keyframes[1].filter).toContain("saturate");
    });
    it("con reducción queda un solo fotograma final, sin transform ni clipPath", () => {
        for (const [nombre, anim] of TODAS) {
            const r = conReduccion(anim, true);
            expect(r.opciones, nombre).toEqual(opcionesReducidas());
            expect(r.keyframes, nombre).toHaveLength(1);
            expect([r.keyframes[0].transform, r.keyframes[0].clipPath], nombre).toEqual([undefined, undefined]);
        }
        expect(alquimia(true).keyframes[0].filter).toContain("saturate");
    });
});
