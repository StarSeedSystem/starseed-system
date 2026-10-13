/**
 * (PDA1012) El medidor «Agentes» con los agentes de la nube de GitHub y del A1 de Oracle.
 *
 * Alex: los de la nube (nube-gh) salían con la palabra «undefined» como detalle y los del A1 de
 * Oracle no aparecían. Que digan su fase y tarea reales, y que aparezcan con su medio.
 */
import { describe, expect, it } from "vitest";

import { agentesDeRunsNube, detalleDeMedidor, faseDePasoNube } from "../medidores";

describe("agentes de la nube de GitHub", () => {
    const runs = [
        {
            run: 38100480202,
            agentes: 3,
            cola: "enjambre/colas/cola-nube-20261010-1902.json",
            minutos: 14,
            paso: "Enjambre",
            paso_desde: "2026-10-11T01:05:00Z",
            pasos_hechos: 6,
            pasos_total: 11,
            tareas: ["S1010-TU-EST1", "GN1010A", "S1010-MGR3", "OC1010A", "CNS1010A"],
        },
    ];

    it("un latido por trabajador, con el paso real del job y las tareas de su tanda", () => {
        const a = agentesDeRunsNube(runs);
        expect(a).toHaveLength(3);
        expect(a[0]).toMatchObject({ tarea: "nube/38100480202", fase: "escribiendo", paso: "Enjambre", trabajador: 1, trabajadores: 3 });
        expect(a[2].trabajador).toBe(3);
        expect(a[0].tareasDeTanda).toContain("GN1010A");
        expect(agentesDeRunsNube([{ agentes: 2 }])).toHaveLength(0); // sin run no se inventa nada
    });

    it("la fase sale del paso del job", () => {
        expect(faseDePasoNube("Enjambre")).toBe("escribiendo");
        expect(faseDePasoNube("Entregar (rama nube/<run>, nunca main)")).toBe("entregando");
        expect(faseDePasoNube("Dependencias y orquestador")).toBe("preparando");
        expect(faseDePasoNube("esperando máquina")).toBe("esperando máquina");
        expect(faseDePasoNube(undefined)).toBe("preparando");
    });

    it("el medidor nunca dice «undefined» y dice paso, trabajador y tanda", () => {
        const d = detalleDeMedidor("agentes", { latidos: agentesDeRunsNube(runs), escritores: {} });
        expect(d.filas).toHaveLength(3);
        const texto = JSON.stringify(d.filas);
        expect(texto).not.toContain("undefined");
        expect(d.filas[0].estado).toBe("escribiendo");
        expect(d.filas[0].id).toBe("nube/38100480202 · trabajador 1 de 3 · 14 min");
        expect(d.filas[0].porque).toContain("paso «Enjambre» (6 de 11 pasos hechos)");
        expect(d.filas[0].porque).toContain("su tanda: S1010-TU-EST1, GN1010A");
        expect(d.filas[0].quien).toContain("GitHub Actions");
    });

    it("un run entregando o preparando no se cuenta como «escribiendo»", () => {
        const d = detalleDeMedidor("agentes", { latidos: agentesDeRunsNube([{ ...runs[0], agentes: 1, paso: "Entregar (rama nube/<run>, nunca main)" }]) });
        expect(d.filas[0].estado).toBe("entregando");
        expect(d.resumen).toContain("1 entregando");
    });

    it("(2026-10-13) un job sin dato del paso no se cuenta como «preparando su máquina»", () => {
        expect(faseDePasoNube("sin dato del paso")).toBe("sin dato del paso");
        const d = detalleDeMedidor("agentes", { latidos: agentesDeRunsNube([{ ...runs[0], agentes: 2, paso: "sin dato del paso" }]) });
        expect(d.filas[0].estado).toBe("sin dato del paso");
        expect(d.resumen).toContain("2 trabajando sin dato del paso de GitHub");
        expect(d.resumen).not.toContain("preparando su máquina");
    });

    it("(2026-10-13) un run con atasco dice el motivo y lo que hace el director", () => {
        const atasco = { tipo: "preparacion-atascada", motivo: "lleva 30 min en «Dependencias y orquestador»", cancelar: true };
        const a = agentesDeRunsNube([{ ...runs[0], agentes: 2, paso: "Dependencias y orquestador", atasco }]);
        expect(a[0].atasco).toEqual(atasco);
        const d = detalleDeMedidor("agentes", { latidos: a });
        expect(d.filas[0].estado).toBe("atascado");
        expect(d.filas[0].porque).toContain("ATASCO: lleva 30 min");
        expect(d.filas[0].porque).toContain("el director de la nube lo cancela");
        expect(d.resumen).toContain("2 atascados (el director actúa)");
        expect(agentesDeRunsNube([{ ...runs[0], agentes: 1, atasco: { tipo: 1 } }])[0].atasco).toBeUndefined();
    });

    it("(2026-10-13) no más trabajadores que tareas en su tanda", () => {
        expect(agentesDeRunsNube([{ ...runs[0], agentes: 4, tareas: ["CB1013W"] }])).toHaveLength(1);
        expect(agentesDeRunsNube([{ ...runs[0], agentes: 4, tareas: [] }])).toHaveLength(4);
    });

    it("(2026-10-13) un paso de preparación en un job que ya pasó sus topes se cuenta como escribiendo", () => {
        const ahora = Date.parse("2026-10-13T22:44:00Z");
        const viejo = agentesDeRunsNube(
            [{ ...runs[0], agentes: 1, paso: "Run actions/setup-node@v4", job_desde: "2026-10-13T22:15:00Z" }],
            ahora,
        );
        expect(viejo[0]).toMatchObject({ fase: "escribiendo", pasoViejo: true });
        const d = detalleDeMedidor("agentes", { latidos: viejo });
        expect(d.filas[0].estado).toBe("escribiendo");
        expect(d.filas[0].porque).toContain("GitHub sigue dando «Run actions/setup-node@v4»");
        const reciente = agentesDeRunsNube(
            [{ ...runs[0], agentes: 1, paso: "Run actions/setup-node@v4", job_desde: "2026-10-13T22:40:00Z" }],
            ahora,
        );
        expect(reciente[0].fase).toBe("preparando");
        expect(reciente[0].pasoViejo).toBeUndefined();
    });

    it("un latido sin bytes medidos no escribe «undefined»", () => {
        const d = detalleDeMedidor("agentes", { latidos: [{ tarea: "X1", fase: "escribiendo", modelo: "nim/kimi", minutos: 2, donde: "nube" }] });
        expect(d.filas[0].porque).not.toContain("undefined");
        expect(d.filas[0].porque).toContain("sin bytes medidos todavía");
    });
});

describe("agentes del A1 de Oracle", () => {
    it("aparecen con su medio, aunque la Mac lleve la misma tarea", () => {
        const d = detalleDeMedidor("agentes", {
            latidos: [
                { tarea: "OC1010Bb", fase: "tests", modelo: "openrouter/inkling:free", minutos: 1, donde: "mac" },
                {
                    tarea: "OC1010Bb",
                    fase: "escribiendo",
                    modelo: "nvidia/nemotron-3-super-120b-a12b",
                    minutos: 2,
                    donde: "oracle",
                    proveedor: "nim",
                    bytesLog: 281_637,
                    quietoSegundos: 40,
                    latidoHaceS: 540,
                },
            ],
            escritores: {},
        });
        expect(d.filas).toHaveLength(2);
        const a1 = d.filas.find((f) => f.id.includes("A1 de Oracle"));
        expect(a1).toBeDefined();
        expect(a1?.id).toBe("OC1010Bb · A1 de Oracle · nemotron-3-super-120b-a12b · 2 min");
        expect(a1?.estado).toBe("escribiendo");
        expect(a1?.quien).toContain("A1 de Oracle");
        expect(a1?.porque).toContain("275 KB escritos");
        expect(a1?.porque).not.toContain("escritos escritos");
        expect(a1?.porque).toContain("último latido hace 9 min");
        expect(a1?.ficha?.find((x) => x.etiqueta === "Entorno")?.valor).toContain("A1 de Oracle");
    });
});
