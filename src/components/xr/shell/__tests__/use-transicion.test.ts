/**
 * Transiciones del visor (XR1010I): `muestra` arranca en t0, respeta el retardo del hermano,
 * el movimiento reducido solo desvanece y nunca se superan los topes de confort del contrato.
 */
import { describe, expect, it } from "vitest";
import {
    DURACION_TOTAL_MAX_MS,
    MAX_DESPLAZAMIENTO_M,
    MAX_VELOCIDAD_MS,
    desplazamientoMax,
    evaluar,
    planTransicion,
    retardoDeHermano,
    type EstiloTransicion,
    type EventoTransicion,
} from "@/lib/xr/transiciones";
import { crearAnimacion, escalaDistancia, estiloDeNivel, muestra } from "../use-transicion";

const EVENTOS: EventoTransicion[] = [
    "entrada", "foco", "desfoco", "despliegue", "pliegue", "cambio-capa", "salida", "confirmar",
];
const ESTILOS: EstiloTransicion[] = ["minimas", "normales", "ricas"];

describe("muestra · estado visual en el tiempo", () => {
    it("en t=0 coincide con evaluar(plan, 0)", () => {
        const plan = planTransicion("entrada", "normales");
        expect(muestra(crearAnimacion(plan, 1000), 1000).estado).toEqual(evaluar(plan, 0));
    });

    it("en la mitad coincide con evaluar(plan, ms/2)", () => {
        const plan = planTransicion("despliegue", "normales");
        const mitad = plan.ms / 2;
        expect(muestra(crearAnimacion(plan, 0), mitad).estado).toEqual(evaluar(plan, mitad));
    });

    it("termina justo al pasar ms", () => {
        const plan = planTransicion("despliegue", "normales");
        const anim = crearAnimacion(plan, 7);
        expect(muestra(anim, 7 + plan.ms - 1).terminada).toBe(false);
        const fin = muestra(anim, 7 + plan.ms);
        expect(fin.terminada).toBe(true);
        expect(fin.estado).toEqual(evaluar(plan, plan.ms));
    });

    it("antes del retardo del hermano sigue en el estado desde", () => {
        const plan = planTransicion("entrada", "normales");
        const retardo = retardoDeHermano(plan, 5, 10);
        expect(retardo).toBeGreaterThan(0);
        const anim = crearAnimacion(plan, 0, { hermano: { i: 5, n: 10 } });
        expect(muestra(anim, retardo - 1).estado).toEqual(plan.desde);
        expect(muestra(anim, retardo - 1).terminada).toBe(false);
        expect(muestra(anim, retardo).estado).toEqual(evaluar(plan, 0));
        expect(muestra(anim, retardo + plan.ms).terminada).toBe(true);
    });
});

describe("confort · reglas duras en todos los eventos y estilos", () => {
    it("movimiento reducido: solo opacidad y ≤ 120 ms", () => {
        for (const evento of EVENTOS) {
            const plan = planTransicion(evento, "ricas", { movimientoReducido: true });
            expect(plan.ms).toBeLessThanOrEqual(120);
            expect(plan.escalonMs).toBe(0);
            const fin = muestra(crearAnimacion(plan, 0), plan.ms).estado;
            expect(fin.pos).toEqual([0, 0, 0]);
            expect(fin.esc).toBe(1);
        }
        const entrada = planTransicion("entrada", "ricas", { movimientoReducido: true });
        expect(muestra(crearAnimacion(entrada, 0), 0).estado.opacidad).toBe(0);
        expect(muestra(crearAnimacion(entrada, 0), entrada.ms).estado.opacidad).toBe(1);
    });

    it("el último de 40 hermanos acaba ≤ 700 ms", () => {
        for (const estilo of ESTILOS) for (const evento of EVENTOS) {
            const plan = planTransicion(evento, estilo);
            expect(retardoDeHermano(plan, 39, 40) + plan.ms).toBeLessThanOrEqual(DURACION_TOTAL_MAX_MS);
        }
    });

    it("nunca pasa de 25 cm ni de 1,5 m/s", () => {
        for (const estilo of ESTILOS) for (const evento of EVENTOS) {
            const plan = planTransicion(evento, estilo);
            expect(desplazamientoMax(plan)).toBeLessThanOrEqual(MAX_DESPLAZAMIENTO_M + 1e-9);
            const fin = muestra(crearAnimacion(plan, 0), plan.ms).estado;
            const d = Math.hypot(fin.pos[0] - plan.desde.pos[0], fin.pos[1] - plan.desde.pos[1], fin.pos[2] - plan.desde.pos[2]);
            expect((d / plan.ms) * 1000).toBeLessThanOrEqual(MAX_VELOCIDAD_MS + 1e-9);
        }
    });
});

describe("re-lanzar y escala por distancia", () => {
    it("una nueva animación parte del valor actual (foco sin saltar)", () => {
        const primera = planTransicion("entrada", "normales");
        const actual = muestra(crearAnimacion(primera, 1000), 1000 + Math.round(primera.ms / 2)).estado;
        const plan = planTransicion("foco", "normales");
        const anim = crearAnimacion(plan, 2000, { desde: actual });
        expect(muestra(anim, 2000).estado).toEqual(actual);
        expect(muestra(anim, 2000 + plan.ms).estado.pos).toEqual(plan.hasta.pos);
    });

    it("escalaDistancia = distancia/1,8 acotada a [0,25; 1]", () => {
        expect(escalaDistancia(1.8)).toBe(1);
        expect(escalaDistancia(9)).toBe(1);
        expect(escalaDistancia(0.45)).toBe(0.25);
        expect(escalaDistancia(0)).toBe(0.25);
        expect(escalaDistancia(0.9)).toBeCloseTo(0.5, 10);
        expect(escalaDistancia(Number.NaN)).toBe(1);
    });

    it("el estilo sale del perfil de calidad", () => {
        expect(estiloDeNivel("minima")).toBe("minimas");
        expect(estiloDeNivel("baja")).toBe("normales");
        expect(estiloDeNivel("media")).toBe("normales");
        expect(estiloDeNivel("alta")).toBe("ricas");
        expect(estiloDeNivel("maxima")).toBe("ricas");
    });
});
