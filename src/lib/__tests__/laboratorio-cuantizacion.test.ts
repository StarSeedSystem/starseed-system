import { describe, expect, it } from "vitest";

import type { Capacidades } from "../aurora/voz-starseed/capacidades";
import {
    MEDIOS,
    PRECISIONES,
    estimarMemoria,
    planPorHardware,
} from "../laboratorio/cuantizacion";
import type { Medio } from "../laboratorio/cuantizacion";

/** Capacidades base (las más pobres): cada prueba solo toca lo que le importa. */
const base: Capacidades = {
    memoriaGB: null,
    nucleos: null,
    webgpu: false,
    wasmSimd: false,
    movil: false,
    daemonLocal: false,
};

const potente: Capacidades = { ...base, daemonLocal: true, memoriaGB: 16 };
const modesto: Capacidades = { ...base, webgpu: true, memoriaGB: 4 };
const movil: Capacidades = { ...base, movil: true, memoriaGB: 2 };

const parametros: Partial<Record<Medio, number>> = {
    texto: 3,
    voz: 1,
    imagen: 2,
};

describe("planPorHardware", () => {
    it("siempre cubre los diez medios", () => {
        for (const c of [potente, modesto, movil, base]) {
            const plan = planPorHardware(c);
            expect(MEDIOS).toHaveLength(10);
            for (const m of MEDIOS) {
                expect(plan[m], `medio ${m}`).toBeDefined();
                expect(PRECISIONES[plan[m].precision]).toBeDefined();
                expect(typeof plan[m].nivel).toBe("string");
                expect(plan[m].motivo.length).toBeGreaterThan(0);
            }
        }
    });

    it("un equipo modesto no elige fp16 en ningún medio", () => {
        const plan = planPorHardware(modesto);
        for (const m of MEDIOS) {
            expect(plan[m].precision).not.toBe("fp16");
        }
    });

    it("un equipo potente usa la ternaria local en texto y voz", () => {
        const plan = planPorHardware(potente);
        expect(plan.texto.precision).toBe("ternaria-158");
        expect(plan.voz.precision).toBe("ternaria-158");
        expect(plan.voz.nivel).toBe("estudio");
    });

    it("un móvil deriva a la nube todo lo que no es imprescindible", () => {
        const plan = planPorHardware(movil);
        expect(plan.texto.nivel).toBe("nube");
        expect(plan.interaccion.nivel).toBe("minima");
        expect(plan.permisos.nivel).toBe("minima");
    });
});

describe("estimarMemoria", () => {
    it("la ternaria ocupa mucha menos memoria que fp16", () => {
        const ternaria = estimarMemoria(planPorHardware(potente), parametros);
        const planFp16 = planPorHardware(potente);
        for (const m of MEDIOS) planFp16[m] = { ...planFp16[m], precision: "fp16" };
        const fp16 = estimarMemoria(planFp16, parametros);
        expect(ternaria.totalMB).toBeLessThan(fp16.totalMB / 3);
        // La relación teórica de bits por peso lo confirma (1,58 vs 16).
        expect(PRECISIONES["ternaria-158"].memoriaRelativa).toBeLessThan(
            PRECISIONES.fp16.memoriaRelativa / 10,
        );
    });

    it("crece con el número de parámetros", () => {
        const plan = planPorHardware(modesto);
        const pocos = estimarMemoria(plan, { texto: 1 });
        const muchos = estimarMemoria(plan, { texto: 7 });
        const nulos = estimarMemoria(plan, {});
        expect(pocos.totalMB).toBeGreaterThan(nulos.totalMB);
        expect(muchos.totalMB).toBeGreaterThan(pocos.totalMB);
        expect(muchos.porMedio.texto).toBeGreaterThan(pocos.porMedio.texto);
    });

    it("sin parámetros, todo estima 0 MB", () => {
        const r = estimarMemoria(planPorHardware(modesto), {});
        expect(r.totalMB).toBe(0);
        for (const m of MEDIOS) expect(r.porMedio[m]).toBe(0);
    });
});
