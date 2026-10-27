import { describe, it, expect } from "vitest";
import type { Animacion, PuntoTrinity } from "@/lib/design/movimiento-starseed";
import {
    CURVAS,
    DURACIONES,
    alquimia,
    barridoDeHorizonte,
    cristalizacion,
    entradaCardinal,
    elementoCompartido,
    fundidoConDesenfoque,
    opcionesReducidas,
    respiracion,
    siembra,
} from "@/lib/design/movimiento-starseed";

/* DSN1019G — biblioteca de movimiento StarSeed: prueba de las propiedades
 * permitidas (transform, opacity, filter, clipPath) y de los valores del ADN. */

/** Reúne animaciones de la biblioteca para pasar cada cuadro por la puerta. */
const todas = (): Animacion[] => [
    entradaCardinal("zenith"),
    entradaCardinal("anchor"),
    entradaCardinal("horizonte"),
    entradaCardinal("logica"),
    fundidoConDesenfoque(),
    elementoCompartido(),
    elementoCompartido(true),
    barridoDeHorizonte().linea,
    barridoDeHorizonte().escena,
    respiracion(),
    respiracion(3500),
    respiracion(9999),
    cristalizacion(0),
    cristalizacion(3),
    cristalizacion(30),
    alquimia(),
    ...Object.values(siembra()),
];

describe("propiedades permitidas", () => {
    it("cada cuadro del vocabulario usa solo transform, opacity, filter y clipPath", () => {
        const permitidas = new Set<string>(["transform", "opacity", "filter", "clipPath", "offset"]);
        const animaciones = todas();
        expect(animaciones.length).toBeGreaterThan(15);
        for (const animacion of animaciones) {
            for (const cuadro of animacion.cuadros) {
                for (const propiedad of Object.keys(cuadro)) {
                    expect(permitidas.has(propiedad)).toBe(true);
                }
            }
        }
    });
});

describe("curvas y duraciones del ADN", () => {
    it("las curvas son las reales de tokens.css", () => {
        expect(CURVAS.organico).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
        expect(CURVAS.glide).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
        expect(CURVAS.genesis).toBe("cubic-bezier(0.22, 0.9, 0.3, 1)");
    });

    it("las duraciones de interfaz son 140/220/240 ms", () => {
        expect(DURACIONES.interfazRapida).toBe(140);
        expect(DURACIONES.interfazOrganica).toBe(220);
        expect(DURACIONES.interfazNormal).toBe(240);
    });

    it("las duraciones de escena caen en el rango 600–900 ms", () => {
        for (const duracion of [
            DURACIONES.escenaEntrada,
            DURACIONES.escenaCambio,
            DURACIONES.escenaObjetivo,
            DURACIONES.escenaHorizonte,
            DURACIONES.escenaCelebracion,
        ]) {
            expect(duracion).toBeGreaterThanOrEqual(600);
            expect(duracion).toBeLessThanOrEqual(900);
        }
    });

    it("la respiración cicla 4–6 s, 5000 ms por defecto, en bucle alterno", () => {
        expect(respiracion().opciones.duracionMs).toBe(5000);
        expect(respiracion(3500).opciones.duracionMs).toBe(4000);
        expect(respiracion(9999).opciones.duracionMs).toBe(6000);
        expect(respiracion().opciones.iteraciones).toBe(Infinity);
        expect(respiracion().opciones.direccion).toBe("alternate");
        expect(respiracion().cuadros[0].transform).toBe("scale(1)");
        expect(respiracion().cuadros[1].transform).toBe("scale(1.03)");
    });
});

describe("entrada cardinal", () => {
    const ADOBADO: Record<PuntoTrinity, string> = {
        zenith: "translateY(-24px) scale(0.98)",
        anchor: "translateY(24px) scale(0.98)",
        horizonte: "translateX(-24px) scale(0.98)",
        logica: "translateX(24px) scale(0.98)",
    };

    it("salta 24 px desde su cardinal, se asienta en offset 0.8 y fija el estado", () => {
        for (const punto of Object.keys(ADOBADO) as PuntoTrinity[]) {
            const animacion = entradaCardinal(punto);
            expect(animacion.cuadros[0].transform).toBe(ADOBADO[punto]);
            expect(animacion.cuadros[0].opacity).toBe(0);
            expect(animacion.cuadros[1].offset).toBe(0.8);
            expect(animacion.cuadros[2].transform).toBe("none");
            expect(animacion.cuadros[2].opacity).toBe(1);
            expect(animacion.opciones.duracionMs).toBe(DURACIONES.escenaEntrada);
            expect(animacion.opciones.curva).toBe(CURVAS.glide);
        }
    });
});

describe("transiciones.html", () => {
    it("el fundido con desenfoque va de blur(8px) a blur(0px) con la opacidad", () => {
        const animacion = fundidoConDesenfoque();
        expect(animacion.cuadros[0].filter).toBe("blur(8px)");
        expect(animacion.cuadros[0].opacity).toBe(0);
        expect(animacion.cuadros[1].filter).toBe("blur(0px)");
        expect(animacion.cuadros[1].opacity).toBe(1);
        expect(animacion.opciones.duracionMs).toBe(600);
        expect(animacion.opciones.curva).toBe(CURVAS.organico);
    });

    it("el elemento compartido crece con transform y sin tocar anchos ni altos", () => {
        const animacion = elementoCompartido();
        expect(animacion.cuadros[0].transform).toBe("scale(1)");
        expect(animacion.cuadros[1].transform).toBe("scale(2.6, 3.2)");
        expect(animacion.opciones.duracionMs).toBe(640);
        expect(animacion.opciones.curva).toBe(CURVAS.glide);
        const vuelta = elementoCompartido(true);
        expect(vuelta.opciones.direccion).toBe("alternate");
        expect(vuelta.opciones.iteraciones).toBe(2);
    });

    it("el barrido cruza con scaleX y revela la escena con clip-path 300 ms después", () => {
        const barrido = barridoDeHorizonte();
        expect(barrido.linea.cuadros[0].transform).toBe("scaleX(0)");
        expect(barrido.linea.cuadros[1].transform).toBe("scaleX(1)");
        expect(barrido.linea.opciones.duracionMs).toBe(700);
        expect(barrido.escena.cuadros[0].clipPath).toBe("inset(0 100% 0 0)");
        expect(barrido.escena.cuadros[1].clipPath).toBe("inset(0 0 0 0)");
        expect(barrido.escena.opciones.duracionMs).toBe(700);
        expect(barrido.escena.opciones.retardoMs).toBe(300);
        expect(barrido.escena.opciones.curva).toBe(CURVAS.glide);
    });
});

describe("cristalizacion", () => {
    it("es determinista por índice y se escala con retardo y tope", () => {
        expect(cristalizacion(2).cuadros[0].transform).toBe(cristalizacion(8).cuadros[0].transform);
        const animacion = cristalizacion(3, 6);
        expect(animacion.cuadros[1].transform).toBe("none");
        expect(animacion.opciones.duracionMs).toBe(600);
        expect(animacion.opciones.retardoMs).toBe(180);
        expect(cristalizacion(30).opciones.retardoMs).toBe(360);
    });
});

describe("alquimia", () => {
    it("despierta la saturación y asienta la escala en 900 ms", () => {
        const animacion = alquimia();
        expect(animacion.cuadros[0].filter).toBe("grayscale(100%)");
        expect(animacion.cuadros[0].opacity).toBe(0.75);
        expect(animacion.cuadros[1].filter).toBe("grayscale(0%)");
        expect(animacion.cuadros[1].opacity).toBe(1);
        expect(animacion.opciones.duracionMs).toBe(900);
        expect(animacion.opciones.curva).toBe(CURVAS.organico);
    });
});

describe("siembra", () => {
    const pasos = siembra();

    it("tiene los seis pasos con los tiempos exactos del ejemplo", () => {
        expect(pasos.punto.opciones.duracionMs).toBe(400);
        expect(pasos.punto.cuadros[1].transform).toBe("scale(1.4)");
        expect(pasos.punto.cuadros[2].opacity).toBe(0);
        expect(pasos.vesicaIzq.opciones.retardoMs).toBe(350);
        expect(pasos.vesicaIzq.cuadros[0].transform).toContain("translateX(40px)");
        expect(pasos.vesicaDer.cuadros[0].transform).toContain("translateX(-40px)");
        expect(pasos.vesicaIzq.opciones.duracionMs).toBe(700);
        expect(pasos.vesicaDer.opciones.retardoMs).toBe(350);
        expect(pasos.ojo.opciones.retardoMs).toBe(1050);
        expect(pasos.ojo.cuadros[0].transform).toBe("scaleY(0)");
        expect(pasos.pupila.opciones.retardoMs).toBe(1250);
        expect(pasos.diamante.opciones.retardoMs).toBe(1500);
        expect(pasos.diamante.opciones.duracionMs).toBe(800);
    });

    it("el conjunto cierra a los 2,3 s, listo para respirar con respiracion()", () => {
        expect(pasos.diamante.opciones.retardoMs + pasos.diamante.opciones.duracionMs).toBe(2300);
    });
});

describe("opcionesReducidas", () => {
    it("aplasta cualquier opción a duración 0, sin retardo y una repetición", () => {
        const reducida = opcionesReducidas(respiracion().opciones);
        expect(reducida.duracionMs).toBe(0);
        expect(reducida.retardoMs).toBe(0);
        expect(reducida.iteraciones).toBe(1);
    });

    it("conserva la curva y el relleno de la animación original", () => {
        const original = siembra().vesicaIzq.opciones;
        const reducida = opcionesReducidas(original);
        expect(reducida.curva).toBe(original.curva);
        expect(reducida.relleno).toBe(original.relleno);
    });
});
