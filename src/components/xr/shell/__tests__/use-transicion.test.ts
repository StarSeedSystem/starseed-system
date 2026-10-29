/**
 * XR1010I · parte pura de `use-transicion.ts` (contrato §3 b). Sin React, sin three, sin WebGL:
 * `muestra` es `evaluar` descontando el retardo del hermano y las reglas de confort se cumplen.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-three/fiber", () => ({ useFrame: () => undefined }));

import { crearAnimacion, escalaPorDistancia, muestra, partirDe } from "../use-transicion";
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
} from "../../../../lib/xr/transiciones";

const EVENTOS: EventoTransicion[] = ["entrada", "foco", "desfoco", "despliegue", "pliegue", "cambio-capa", "salida", "confirmar"];
const ESTILOS: EstiloTransicion[] = ["minimas", "normales", "ricas"];

describe("muestra", () => {
    it("en t=0 coincide con evaluar en el origen", () => {
        const plan = planTransicion("entrada", "normales");
        const anim = crearAnimacion(plan, 1000);
        expect(muestra(anim, 1000).estado).toEqual(evaluar(plan, 0));
    });

    it("en la mitad coincide con evaluar a mitad", () => {
        const plan = planTransicion("despliegue", "normales");
        const anim = crearAnimacion(plan, 0);
        expect(muestra(anim, plan.ms / 2).estado).toEqual(evaluar(plan, plan.ms / 2));
    });

    it("al final coincide con evaluar(ms) y ya está terminada", () => {
        const plan = planTransicion("foco", "ricas");
        const anim = crearAnimacion(plan, 500);
        const fin = muestra(anim, 500 + plan.ms);
        expect(fin.estado).toEqual(evaluar(plan, plan.ms));
        expect(fin.terminada).toBe(true);
    });

    it("antes de ms no está terminada", () => {
        const plan = planTransicion("salida", "normales");
        const anim = crearAnimacion(plan, 0);
        expect(muestra(anim, plan.ms - 1).terminada).toBe(false);
    });

    it("el retardo del hermano impide empezar antes de su turno", () => {
        const plan = planTransicion("entrada", "normales");
        const retardo = retardoDeHermano(plan, 3, 6);
        expect(retardo).toBeGreaterThan(0);
        const anim = crearAnimacion(plan, 2000, retardo);
        expect(muestra(anim, 2000 + retardo - 1).estado).toEqual(evaluar(plan, 0));
        expect(muestra(anim, 2000 + retardo + plan.ms / 2).estado).toEqual(evaluar(plan, plan.ms / 2));
    });

    it("termina pasado el retardo más la duración", () => {
        const plan = planTransicion("pliegue", "normales");
        const retardo = retardoDeHermano(plan, 2, 5);
        const anim = crearAnimacion(plan, 100, retardo);
        expect(muestra(anim, 100 + retardo + plan.ms + 1).terminada).toBe(true);
    });

    it("una animación nueva parte del valor actual, sin saltar", () => {
        const plan = planTransicion("cambio-capa", "normales");
        const actual = evaluar(plan, plan.ms / 3);
        const nueva = partirDe(planTransicion("desfoco", "normales"), actual);
        expect(muestra(crearAnimacion(nueva, 0), 0).estado).toEqual(actual);
    });

    it("crearAnimacion nunca admite un retardo negativo", () => {
        const plan = planTransicion("entrada", "normales");
        expect(crearAnimacion(plan, 0, -50).retardo).toBe(0);
    });
});

describe("confort", () => {
    it("movimiento reducido: sólo opacidad, sin desplazamiento ni escala, y ≤ 120 ms", () => {
        for (const evento of EVENTOS) {
            const plan = planTransicion(evento, "ricas", { movimientoReducido: true });
            expect(plan.ms).toBeLessThanOrEqual(120);
            expect(plan.desde.pos).toEqual([0, 0, 0]);
            expect(plan.hasta.pos).toEqual([0, 0, 0]);
            expect(plan.desde.esc).toBe(1);
            expect(plan.hasta.esc).toBe(1);
            const medio = evaluar(plan, plan.ms / 2);
            expect(medio.pos).toEqual([0, 0, 0]);
            expect(medio.esc).toBe(1);
        }
    });

    it("el último de 40 hermanos acaba dentro de 700 ms en todos los eventos y estilos", () => {
        for (const evento of EVENTOS) for (const estilo of ESTILOS) {
            const plan = planTransicion(evento, estilo);
            expect(retardoDeHermano(plan, 39, 40) + plan.ms).toBeLessThanOrEqual(DURACION_TOTAL_MAX_MS);
        }
    });

    it("ningún evento ni estilo supera 25 cm ni 1,5 m/s", () => {
        for (const evento of EVENTOS) for (const estilo of ESTILOS) {
            const plan = planTransicion(evento, estilo);
            expect(desplazamientoMax(plan)).toBeLessThanOrEqual(MAX_DESPLAZAMIENTO_M + 1e-9);
            expect(desplazamientoMax(plan) / (plan.ms / 1000)).toBeLessThanOrEqual(MAX_VELOCIDAD_MS + 1e-9);
        }
    });

    it("escalaDistancia: paneles más cerca se mueven menos y queda en [0,25; 1]", () => {
        expect(escalaPorDistancia(0.45)).toBeCloseTo(0.25, 5);
        expect(escalaPorDistancia(1.8)).toBeCloseTo(1, 5);
        expect(escalaPorDistancia(10)).toBe(1);
        expect(escalaPorDistancia(undefined)).toBe(1);
    });
});
