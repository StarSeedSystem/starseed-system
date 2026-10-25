import { describe, it, expect } from "vitest";
import {
    PROPIEDADES_ANIMABLES,
    CURVAS,
    DURACION_INTERFAZ,
    DURACION_ESCENA,
    SIEMBRA,
    entradaCardinal,
    fundidoDesenfoque,
    elementoCompartido,
    barridoHorizonte,
    respiracion,
    cristalizacion,
    alquimia,
    opcionesReducidas,
    fotogramasReducidos,
    animacionReducida,
    type AnimacionStarseed,
    type PuntoTrinity,
} from "@/lib/design/movimiento-starseed";

const PUNTOS: PuntoTrinity[] = ["zenith", "horizonte", "logica", "ancla"];
const TODAS: AnimacionStarseed[] = [
    ...Object.values(SIEMBRA),
    ...PUNTOS.map(entradaCardinal),
    fundidoDesenfoque,
    elementoCompartido,
    barridoHorizonte.linea,
    barridoHorizonte.escena,
    respiracion,
    cristalizacion,
    alquimia,
];
describe("propiedades animables", () => {
    it("solo anima transform, opacity, filter y clipPath", () => {
        const permitidas = new Set<string>(PROPIEDADES_ANIMABLES);
        const extras = new Set(["offset", "easing"]);
        for (const animacion of TODAS) {
            for (const fotograma of animacion.fotogramas) {
                for (const clave of Object.keys(fotograma)) {
                    expect(permitidas.has(clave) || extras.has(clave), `${animacion.nombre}: ${clave}`).toBe(true);
                }
            }
        }
    });
    it("no usa hexadecimales sueltos ni dimensiones animadas", () => {
        for (const animacion of TODAS) {
            const serializado = JSON.stringify(animacion.fotogramas);
            expect(serializado).not.toMatch(/#[0-9a-f]{3,8}/i);
            expect(serializado).not.toMatch(/"(width|height|margin|padding)"/);
        }
    });
});
describe("entrada cardinal", () => {
    it("entra desde el perímetro de su punto de la Trinity", () => {
        expect(entradaCardinal("zenith").fotogramas[0].transform).toContain("translateY(-24px)");
        expect(entradaCardinal("horizonte").fotogramas[0].transform).toContain("translateX(24px)");
        expect(entradaCardinal("logica").fotogramas[0].transform).toContain("translateX(-24px)");
        expect(entradaCardinal("ancla").fotogramas[0].transform).toContain("translateY(24px)");
    });
    it("usa la curva de deslizamiento y la duración de escena", () => {
        for (const punto of PUNTOS) {
            const animacion = entradaCardinal(punto);
            expect(animacion.fotogramas[0].opacity).toBe(0);
            expect(animacion.fotogramas.at(-1)).toEqual({ transform: "none", opacity: 1 });
            expect(animacion.opciones).toMatchObject({ duration: DURACION_ESCENA.entrada, easing: CURVAS.deslizamiento, fill: "both" });
        }
    });
});
describe("curvas y duraciones", () => {
    it("expone las tres curvas reales del OS", () => {
        expect(CURVAS).toEqual({
            organica: "cubic-bezier(0.22, 1, 0.36, 1)",
            deslizamiento: "cubic-bezier(0.16, 1, 0.3, 1)",
            genesis: "cubic-bezier(0.22, 0.9, 0.3, 1)",
        });
    });
    it("usa 140, 220 y 240 ms en interfaz y 600–900 ms en escena", () => {
        expect(DURACION_INTERFAZ).toEqual({ rapida: 140, organica: 220, normal: 240 });
        const escenas = [DURACION_ESCENA.fundido, DURACION_ESCENA.compartido, DURACION_ESCENA.barrido, DURACION_ESCENA.entrada, DURACION_ESCENA.alquimia, DURACION_ESCENA.cristalizacion];
        for (const duracion of escenas) {
            expect(duracion).toBeGreaterThanOrEqual(600);
            expect(duracion).toBeLessThanOrEqual(900);
        }
    });
});
describe("siembra y respiración", () => {
    it("encadena punto, vesica, ojo y diamante con sus retardos", () => {
        expect(SIEMBRA.punto.opciones.duration).toBe(400);
        expect(SIEMBRA.vesica.opciones.delay).toBe(350);
        expect(SIEMBRA.ojo.opciones.delay).toBe(1050);
        expect(SIEMBRA.diamante.opciones.delay).toBe(1500);
        expect(SIEMBRA.diamante.fotogramas.at(-1)).toEqual({ clipPath: "inset(0 0 0 0)" });
    });
    it("respira en bucle alterno con curva orgánica", () => {
        expect(respiracion.opciones).toMatchObject({ duration: 5000, easing: CURVAS.organica, direction: "alternate", iterations: Infinity });
        expect(respiracion.fotogramas.at(-1)).toEqual({ transform: "scale(1.03)" });
    });
});
describe("movimiento reducido", () => {
    it("acorta las opciones y quita cascada, bucles y dirección", () => {
        const reducidas = opcionesReducidas(entradaCardinal("ancla").opciones);
        expect(reducidas).toMatchObject({ duration: 140, easing: CURVAS.organica, delay: 0, iterations: 1, direction: "normal" });
    });
    it("deja solo opacidad y recorte, sin transformaciones ni desenfoque", () => {
        const fotogramas = fotogramasReducidos(cristalizacion.fotogramas);
        for (const fotograma of fotogramas) {
            expect(fotograma.transform).toBeUndefined();
            expect(fotograma.filter).toBeUndefined();
        }
        expect(fotogramasReducidos(elementoCompartido.fotogramas)).toEqual([{ opacity: 1 }]);
    });
    it("devuelve una animación completa lista para element.animate", () => {
        const reducida = animacionReducida(respiracion);
        expect(reducida.nombre).toBe(respiracion.nombre);
        expect(reducida.opciones.iterations).toBe(1);
        expect(reducida.fotogramas).toEqual([{ opacity: 1 }]);
    });
});
