/**
 * Pruebas del detector PURO de interrupción por voz (Ola 1015V, tarea N).
 * Solo funciones puras: muestras sintéticas de energía, sin micro, sin red,
 * sin procesos ni temporizadores reales.
 */
import { describe, expect, it } from "vitest";

import {
    decidirInterrupcion,
    estadoNuevo,
    type MuestraVoz,
    type OpcionesInterrupcion,
} from "@/lib/aurora/interrumpir-por-voz";

/** Energía de una voz humana cercana, en dBFS. */
const VOZ = -12;
/** Silencio de fondo. */
const SAL = -70;
/** Umbral por defecto del contrato. */
const UMBRAL = -34;

function tramo(desde: number, hasta: number, db: number, paso = 16): MuestraVoz[] {
    const sal: MuestraVoz[] = [];
    for (let ms = desde; ms < hasta; ms += paso) sal.push({ ms, db });
    return sal;
}

/** Alimenta el detector con lotes de 11 muestras hasta que corta (o agota). */
function primerCorte(
    muestras: MuestraVoz[],
    opciones?: Partial<OpcionesInterrupcion>
): { interrumpir: boolean; estado: ReturnType<typeof estadoNuevo> } {
    const opts: OpcionesInterrupcion = { umbralDb: UMBRAL, ...opciones };
    let estado = estadoNuevo();
    let v = { interrumpir: false, estado };
    for (let i = 0; i < muestras.length; i += 11) {
        v = decidirInterrupcion(muestras.slice(i, i + 11), estado, opts);
        estado = v.estado;
        if (v.interrumpir) break;
    }
    return v;
}

describe("detector de interrupción por voz", () => {
    it("habla > 250 ms → corta una sola vez y nunca se repite", () => {
        const v = primerCorte(tramo(0, 2000, VOZ));
        expect(v.interrumpir).toBe(true);
        expect(v.estado.fuego).toBe(true);
        const continuar = decidirInterrupcion(
            tramo(v.estado.ultMs ?? 0, 3000, VOZ),
            v.estado,
            { umbralDb: UMBRAL }
        );
        expect(continuar.interrumpir).toBe(false);
    });

    it("silencio sostenido nunca corta", () => {
        const v = primerCorte(tramo(0, 5000, SAL));
        expect(v.interrumpir).toBe(false);
        expect(v.estado.rachaMs).toBe(0);
    });

    it("menos de 250 ms de voz no alcanza el mínimo", () => {
        expect(primerCorte(tramo(0, 240, VOZ)).interrumpir).toBe(false);
    });

    it("histéresis: picos cortos separados por silencios no llegan a 250 ms", () => {
        const picos: MuestraVoz[] = [];
        for (let c = 0; c < 6; c++) {
            picos.push(...tramo(c * 200, c * 200 + 100, VOZ));
            picos.push(...tramo(c * 200 + 100, (c + 1) * 200, SAL));
        }
        expect(primerCorte(picos).interrumpir).toBe(false);
    });

    it("el estado viaja entre lotes: la racha continúa y el corte se compone", () => {
        let estado = estadoNuevo();
        estado = decidirInterrupcion(tramo(0, 128, VOZ), estado, { umbralDb: UMBRAL }).estado;
        expect(estado.rachaMs).toBe(112);
        estado = decidirInterrupcion(tramo(128, 400, VOZ), estado, { umbralDb: UMBRAL }).estado;
        expect(estado.fuego).toBe(true);
    });

    it("ventana de eco: el residuo del principio no empuja la racha", () => {
        const eco = { umbralDb: UMBRAL, ventanaEcoMs: 1200 };
        // Voz constante 0…1300 ms: sin la ventana cortaría a los ~256 ms; con
        // ella, dentro de la ventana no suma y a 1300 no ha acumulado 250.
        expect(primerCorte(tramo(0, 1300, VOZ), eco).interrumpir).toBe(false);
        // Continuando hasta 2000 ms, corta solo después de salir de la ventana.
        const v = primerCorte(tramo(0, 2000, VOZ), eco);
        expect(v.interrumpir).toBe(true);
        expect(v.estado.ultMs ?? 0).toBeGreaterThan(1200);
    });

    it("por defecto son 250 ms y −34 dB, y las opciones se configuran", () => {
        // Con el mínimo por defecto, 200 ms no basta…
        expect(primerCorte(tramo(0, 200, VOZ)).interrumpir).toBe(false);
        // …y sí con «minimoMs: 200» pedido por quien llama (muestra en 200 ms).
        expect(primerCorte(tramo(0, 216, VOZ), { minimoMs: 200 }).interrumpir).toBe(true);
        // Una voz floja (−50 dB) queda bajo el umbral por defecto, pero cuenta
        // si el umbral se baja a −55 dB.
        expect(primerCorte(tramo(0, 800, -50)).interrumpir).toBe(false);
        expect(primerCorte(tramo(0, 800, -50), { umbralDb: -55 }).interrumpir).toBe(true);
    });
});
