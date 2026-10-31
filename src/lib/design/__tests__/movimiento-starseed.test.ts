import { describe, it, expect } from "vitest";
import {
    CURVAS_STARSEED,
    DURACIONES_STARSEED,
    PROPIEDADES_PERMITIDAS,
    keyframesDe,
    opcionesDe,
    opcionesReducidas,
    recetaMovimiento,
    type PuntoTrinity,
    type TipoMovimiento,
} from "@/lib/design/movimiento-starseed";

const TIPOS: TipoMovimiento[] = [
    "siembra", "entrada-cardinal", "fundido-desenfoque", "elemento-compartido",
    "barrido-horizonte", "respiracion", "cristalizacion", "alquimia",
];
const PUNTOS: PuntoTrinity[] = ["zenit", "izquierda", "derecha", "raiz"];
const ESCENAS: TipoMovimiento[] = [
    "entrada-cardinal", "fundido-desenfoque", "elemento-compartido",
    "barrido-horizonte", "cristalizacion", "alquimia",
];
const CURVAS = Object.values(CURVAS_STARSEED);
const PERMITIDAS = new Set<string>(["offset", ...PROPIEDADES_PERMITIDAS]);

describe("propiedades permitidas", () => {
    it("solo transform, opacity, filter y clipPath en todas las recetas", () => {
        for (const tipo of TIPOS) {
            for (const punto of PUNTOS) {
                for (const frame of keyframesDe(tipo, punto)) {
                    for (const clave of Object.keys(frame)) {
                        expect(PERMITIDAS.has(clave)).toBe(true);
                    }
                }
            }
        }
    });
    it("la versión reducida solo funde opacidad, sin desplazamiento", () => {
        for (const tipo of TIPOS) {
            const receta = recetaMovimiento(tipo, { reducido: true });
            expect(receta.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
        }
    });
});

describe("curvas y duraciones reales", () => {
    it("usa las tres curvas del ADN y las duraciones 140/220/240", () => {
        expect(CURVAS).toEqual(["cubic-bezier(0.22, 1, 0.36, 1)", "cubic-bezier(0.16, 1, 0.3, 1)", "cubic-bezier(0.22, 0.9, 0.3, 1)"]);
        expect([DURACIONES_STARSEED.rapida, DURACIONES_STARSEED.organica, DURACIONES_STARSEED.normal]).toEqual([140, 220, 240]);
        for (const tipo of TIPOS) expect(CURVAS).toContain(opcionesDe(tipo).easing);
    });
    it("las escenas duran 600–900 ms; siembra y respiración tienen su tiempo", () => {
        for (const tipo of ESCENAS) {
            const d = opcionesDe(tipo).duration;
            expect(d).toBeGreaterThanOrEqual(600);
            expect(d).toBeLessThanOrEqual(900);
        }
        expect(opcionesDe("siembra").duration).toBe(2400);
        expect(opcionesDe("respiracion").duration).toBe(4800);
    });
});

describe("entrada cardinal por punto de la Trinity", () => {
    it("cada punto entra desde su borde con 24 px y las cuatro son distintas", () => {
        expect(keyframesDe("entrada-cardinal", "zenit")[0].transform).toContain("translateY(-24px)");
        expect(keyframesDe("entrada-cardinal", "raiz")[0].transform).toContain("translateY(24px)");
        expect(keyframesDe("entrada-cardinal", "izquierda")[0].transform).toContain("translateX(-24px)");
        expect(keyframesDe("entrada-cardinal", "derecha")[0].transform).toContain("translateX(24px)");
        expect(new Set(PUNTOS.map((p) => keyframesDe("entrada-cardinal", p)[0].transform)).size).toBe(4);
        const frames = keyframesDe("entrada-cardinal", "raiz");
        expect(frames[1].offset).toBe(0.8);
        expect(frames[2].transform).toBe("none");
    });
});

describe("comportamiento de las recetas", () => {
    it("siembra, fundido, compartido y barrido copian sus ejemplos", () => {
        const siembra = keyframesDe("siembra");
        expect(siembra[0]).toMatchObject({ transform: "scale(0)", opacity: 0 });
        expect(siembra[siembra.length - 1]).toMatchObject({ transform: "scale(1)", opacity: 1 });
        const fundido = keyframesDe("fundido-desenfoque");
        expect([fundido[0].filter, fundido[1].filter]).toEqual(["blur(8px)", "blur(0)"]);
        const compartido = recetaMovimiento("elemento-compartido");
        expect([compartido.opciones.direction, compartido.opciones.iterations]).toEqual(["alternate", 2]);
        expect(compartido.keyframes[1].transform).toContain("scale(2.6, 3.2)");
        const barrido = recetaMovimiento("barrido-horizonte");
        expect(barrido.opciones.delay).toBe(300);
        expect([barrido.keyframes[0].clipPath, barrido.keyframes[1].clipPath]).toEqual(["inset(0 100% 0 0)", "inset(0 0 0 0)"]);
    });
    it("respiración, cristalización y alquimia respetan sus límites", () => {
        const respira = keyframesDe("respiracion");
        expect([respira[0].transform, respira[1].transform]).toEqual(["scale(1)", "scale(1.03)"]);
        expect(recetaMovimiento("respiracion").opciones.iterations).toBe(Infinity);
        expect(keyframesDe("cristalizacion")[0].filter).toContain("blur");
        expect(keyframesDe("alquimia")[0].filter).toContain("grayscale");
        expect(keyframesDe("alquimia")[2].filter).toContain("grayscale(0)");
    });
});

describe("movimiento reducido y copias", () => {
    it("opcionesReducidas deja 1 ms, sin retardo ni bucle", () => {
        const o = opcionesReducidas({ duration: 720, easing: CURVAS_STARSEED.desliz, delay: 300, iterations: Infinity, direction: "alternate" });
        expect(o).toEqual({ duration: 1, easing: CURVAS_STARSEED.desliz, delay: 0, iterations: 1, direction: "normal" });
    });
    it("la receta reducida conserva la curva y el retardo se suma sin mutar la tabla", () => {
        const r = recetaMovimiento("entrada-cardinal", { punto: "zenit", reducido: true });
        expect([r.opciones.easing, r.opciones.duration, r.opciones.delay]).toEqual([CURVAS_STARSEED.desliz, 1, 0]);
        expect(recetaMovimiento("barrido-horizonte", { retardoMs: 40 }).opciones.delay).toBe(340);
        expect(recetaMovimiento("barrido-horizonte").opciones.delay).toBe(300);
    });
    it("dos llamadas devuelven recetas independientes", () => {
        const a = recetaMovimiento("siembra");
        const b = recetaMovimiento("siembra");
        a.keyframes[0].opacity = 0.5;
        expect(b.keyframes[0].opacity).toBe(0);
    });
});
