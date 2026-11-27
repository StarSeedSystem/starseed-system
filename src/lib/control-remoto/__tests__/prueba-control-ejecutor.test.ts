/**
 * BAP1127I · prueba-control se acepta al instante y se termina por registro.
 *
 * Cubre solo piezas puras y costuras inyectadas: sin `node:*`, sin `vi.mock`, sin `route.ts`.
 * `{ describe, it, expect }` de vitest (globals: false).
 */

import { describe, it, expect } from "vitest";
import { ACCIONES } from "../niveles";
import { ejecutarPruebaControlCon, lineasPruebaControl, type CaminoControlPrueba } from "../ejecutores";

const HUELLA = "a".repeat(64);
const ID = "id-prueba-1127";

interface Doble extends CaminoControlPrueba {
    anotaciones: string[];
    abiertas: Array<{ destino: string; fuente: string }>;
    cerradas: string[];
    esperados: number[];
    tarea: () => (() => Promise<void>) | null;
}

function caminoDoble(cambios: Partial<CaminoControlPrueba> = {}): Doble {
    const anotaciones: string[] = [];
    const abiertas: Array<{ destino: string; fuente: string }> = [];
    const cerradas: string[] = [];
    const esperados: number[] = [];
    let tarea: (() => Promise<void>) | null = null;
    return {
        anotaciones,
        abiertas,
        cerradas,
        esperados,
        permisoEncendido: true,
        llamadaEnCurso: false,
        id: () => ID,
        abrir: async (destino, fuente) => {
            abiertas.push({ destino, fuente });
            return { ok: true, cuadros: 30, latenciaMs: 33 };
        },
        esperar: async (ms) => {
            esperados.push(ms);
        },
        cerrar: async () => {
            cerradas.push("cerrada");
        },
        anotar: (linea) => anotaciones.push(linea),
        enSegundoPlano: (t) => {
            tarea = t;
        },
        tarea: () => tarea,
        ...cambios,
    };
}

function orden() {
    return { destino: HUELLA, duracionMs: 60_000, fuente: "auto" };
}

describe("BAP1127I · vocabulario", () => {
    it("registra prueba-control con nivel controlar", () => {
        expect(ACCIONES["prueba-control"]?.nivel).toBe("controlar");
    });
});

describe("BAP1127I · rechazos antes de abrir nada", () => {
    it("duración fuera de rango se rechaza sin abrir sesión", async () => {
        const camino = caminoDoble();
        await expect(ejecutarPruebaControlCon({ ...orden(), duracionMs: 9_000 }, camino)).rejects.toThrow("duracion");
        expect(camino.abiertas).toEqual([]);
    });

    it("permiso apagado se rechaza con espera-permiso y se anota", async () => {
        const camino = caminoDoble({ permisoEncendido: false });
        await expect(ejecutarPruebaControlCon(orden(), camino)).rejects.toThrow("espera-permiso");
        expect(camino.abiertas).toEqual([]);
        expect(camino.anotaciones.some((l) => l.startsWith("prueba-control fin") && l.includes("resultado=espera-permiso"))).toBe(true);
        expect(camino.anotaciones.some((l) => l.startsWith("prueba-fin") && l.includes("motivo=espera-permiso"))).toBe(true);
    });

    it("llamada en curso se rechaza con ocupado", async () => {
        const camino = caminoDoble({ llamadaEnCurso: true });
        await expect(ejecutarPruebaControlCon(orden(), camino)).rejects.toThrow("ocupado");
        expect(camino.abiertas).toEqual([]);
    });
});

describe("BAP1127I · aceptación inmediata y fin por registro", () => {
    it("acepta al instante, abre por la costura, espera lo pedido y cierra anotando inicio y fin", async () => {
        const camino = caminoDoble();
        expect(await ejecutarPruebaControlCon(orden(), camino)).toEqual({ estado: "aceptada", id: ID });
        expect(camino.anotaciones[0]).toBe(`prueba-control inicio id=${ID} destino=aaaaaaaa dur=60 resultado=ok`);
        const tarea = camino.tarea();
        expect(tarea).not.toBeNull();
        await tarea!();
        expect(camino.abiertas).toEqual([{ destino: HUELLA, fuente: "auto" }]);
        expect(camino.esperados).toEqual([60_000]);
        expect(camino.anotaciones).toContain(`prueba-control fin id=${ID} destino=aaaaaaaa dur=60 resultado=ok`);
        expect(camino.anotaciones).toContain(`prueba-fin id=${ID} resultado=ok motivo=ok destino=aaaaaaaa dur=60 cuadros=30 latencia=33 informe=990`);
        expect(camino.cerradas).toEqual(["cerrada"]);
    });
});
