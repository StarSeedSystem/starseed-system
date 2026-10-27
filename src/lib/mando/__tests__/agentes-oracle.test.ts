/**
 * (2026-10-27, CAP1026O) Los trabajadores del A1 de Oracle en el medidor «Agentes».
 *
 * MEDIDO el 26-10: el A1 tenía su orquestador vivo con 3 trabajadores y Genesis no contaba ninguno (sus
 * latidos solo podían llegar por el bus de la Mac). Ahora salen del ciclo del nodo, con la verdad: no se
 * sabe qué tarea lleva cada trabajador, y un nodo que no late o un orquestador parado no cuentan.
 */
import { describe, expect, it } from "vitest";

import { agentesDelA1, colaDelA1, DONDE_ORACLE, LATIDO_ORACLE_MAX_MS } from "../agentes-oracle";
import { detalleDeMedidor } from "../medidores";

const AHORA = Date.UTC(2026, 9, 27, 4, 0, 0);
const s = (minutosAntes: number) => (AHORA - minutosAntes * 60_000) / 1000; // el nodo escribe segundos

const estado = (nodo: Record<string, unknown>) => ({
    nodo: {
        vivo: true,
        latido: s(10),
        fase: "cola",
        fase_desde: s(50),
        cola: "cola-nube-20261026-2007-2.json",
        orquestador: { vivo: true, cola: "cola-nube-20261026-2007-2.json", trabajadores: 3 },
        ...nodo,
    },
});
const TANDA = ["DSN1019G", "FSH1018L", "AV1011H", "COL1012H", "RTXR1010AKb", "RTTIP1013Bb"];

describe("agentes del A1 de Oracle", () => {
    it("un agente por trabajador, con su tanda, sus minutos y el latido", () => {
        const ag = agentesDelA1(estado({}), TANDA, AHORA);
        expect(ag).toHaveLength(3);
        expect(ag.map((a) => a.trabajador)).toEqual([1, 2, 3]);
        expect(ag[0]).toMatchObject({
            tarea: "a1/cola-nube-20261026-2007-2",
            donde: DONDE_ORACLE,
            trabajadores: 3,
            minutos: 50,
            latidoHaceS: 600,
            tareasDeTanda: TANDA,
        });
        expect(colaDelA1(estado({}))).toBe("cola-nube-20261026-2007-2.json");
    });

    it("nunca más trabajadores que tareas tiene su cola; sin cola en esta neurona, los que dice el nodo", () => {
        expect(agentesDelA1(estado({}), ["A"], AHORA)).toHaveLength(1);
        expect(agentesDelA1(estado({}), [], AHORA)).toHaveLength(3);
    });

    it("no cuenta un nodo que no late, que no está vivo o con el orquestador parado", () => {
        expect(agentesDelA1(estado({ latido: (AHORA - LATIDO_ORACLE_MAX_MS - 60_000) / 1000 }), TANDA, AHORA)).toEqual([]);
        expect(agentesDelA1(estado({ vivo: false }), TANDA, AHORA)).toEqual([]);
        expect(agentesDelA1(estado({ fase: "guardian", orquestador: { vivo: false, cola: null, trabajadores: 3 } }), TANDA, AHORA)).toEqual([]);
        expect(agentesDelA1(estado({ orquestador: { vivo: true, trabajadores: 0 } }), TANDA, AHORA)).toEqual([]);
        for (const raro of [null, undefined, {}, { nodo: "x" }, { nodo: { vivo: true, latido: "nunca" } }, []]) {
            expect(agentesDelA1(raro, TANDA, AHORA)).toEqual([]);
        }
    });

    it("en el medidor dicen que son del A1 y que no se sabe qué tarea lleva cada uno", () => {
        const d = detalleDeMedidor("agentes", { latidos: agentesDelA1(estado({}), TANDA, AHORA), escritores: {}, progreso: {} });
        expect(d.filas).toHaveLength(3);
        expect(new Set(d.filas.map((f) => f.id)).size).toBe(3);
        for (const f of d.filas) {
            expect(f.estado).toBe("trabajando en el A1");
            expect(f.porque).toContain("A1 de Oracle");
            expect(f.porque).toContain("qué tarea lleva cada trabajador lo dice su rama al entregar");
            expect(f.porque).not.toContain("freno de consumo");
        }
        expect(d.resumen).toContain("3 en el A1 de Oracle");
        expect(JSON.stringify(d.filas)).not.toContain("undefined");
    });
});
