/**
 * Pruebas del modelo puro de la Oficina 3D del Mando (Ola 272 · 2026-09-07).
 * Cubre: seres por modelo con rol correcto, salas con ocupantes y actividad
 * en (0,1], la fusión del genoma (la xp nunca baja y se ganan rasgos al subir
 * de nivel) y el determinismo del ADN.
 */

import { describe, expect, it } from "vitest";

import { derivarAdn } from "@/lib/astraura/genesis-dna";
import type { LatidoTarea } from "@/lib/mando/tipos";
import type { RamaTarea } from "@/lib/mando/ramificacion";
import type { Rama158 } from "@/lib/mando/agentes-158";
import {
    experienciaDe,
    fusionarGenoma,
    nivelDe,
    nombreModelo,
    seresDelMando,
    type FuentesOficina,
    type GenomaSer,
} from "@/lib/mando/oficina";

const AHORA = Date.parse("2026-09-07T12:00:00Z");

function latido(par: Partial<LatidoTarea>): LatidoTarea {
    return {
        tarea: "T1",
        cola: "cola-x",
        fase: "escribiendo",
        modelo: "",
        minutos: 12,
        quietoSegundos: 0,
        donde: "mac",
        ...par,
    };
}

function rama(par: Partial<RamaTarea>): RamaTarea {
    return {
        id: "T1",
        ola: "272",
        cola: "cola-x",
        titulo: "Tarea",
        dependencias: [],
        nivel: 0,
        estado: "pendiente",
        donde: null,
        medio: null,
        modelo: "",
        proveedor: "",
        revisor: "",
        sha: "",
        nota: "",
        segundos: 0,
        modelosFallidos: [],
        pasos: [],
        eventos: [],
        vivo: null,
        alcance: null,
        revision: null,
        aprobacion: null,
        ...par,
    } as RamaTarea;
}

/** Rama 1.58 con un agente de aprendizaje activo y un proceso encendido. */
function rama158(): Rama158 {
    return {
        t: new Date(AHORA).toISOString(),
        backend: "vivo",
        bitnet: { dormido: false, cedidoHastaS: null, vivo: true, puerto: 9090, ultimoUsoInteractivoHaceS: 5 },
        corpus: null,
        agentes: [
            {
                id: "curador",
                nombre: "Curador",
                rol: "curador del corpus",
                intervaloS: 3600,
                activo: true,
                ultimoInicio: null,
                ultimoFin: new Date(AHORA - 60000).toISOString(), // dentro del intervalo
                ultimoResultado: "corpus saneado",
                ejecuciones: 4,
                errores: 1,
                proximo: null,
            },
        ],
        procesos: [{ id: "imaginacion", nombre: "Imaginación", activo: true, ultimo: new Date(AHORA - 3600_000).toISOString(), detalle: null }],
        personalidades: [{ id: "preset-aurora", nombre: "Aurora", turnos: 7, ultimo: null, activa: true, origen: "os" }],
    };
}

function fuentes(): FuentesOficina {
    return {
        latidos: [
            latido({ tarea: "H2", modelo: "nim/kimi-k3", minutos: 12 }),
            latido({ tarea: "H3", modelo: "xkiro/qwen3.7-plus:free", fase: "revision", minutos: 3 }),
        ],
        ramas: [rama({ id: "G1", estado: "commit", modelo: "nim/kimi-k3" })],
        progreso: { G2: { estado: "commit", modelo: "nim/kimi-k3" } },
        rama158: rama158(),
    };
}

describe("seresDelMando", () => {
    it("sitúa a cada modelo con su rol: escritor en el enjambre, revisor puro en revisión", () => {
        const { seres, ocupantes } = seresDelMando(fuentes(), AHORA);
        const kimi = seres.find((s) => s.id === "nim/kimi-k3");
        const qwen = seres.find((s) => s.id === "xkiro/qwen3.7-plus:free");
        expect(kimi?.rol).toBe("escritor");
        expect(qwen?.rol).toBe("revisor");
        expect(ocupantes.find((o) => o.serId === "nim/kimi-k3")?.salaId).toBe("enjambre");
        expect(ocupantes.find((o) => o.serId === "xkiro/qwen3.7-plus:free")?.salaId).toBe("revision");
    });

    it("nombra los modelos legibles y sin sufijo :free", () => {
        expect(nombreModelo("nim/moonshotai/kimi-k3")).toBe("Kimi K3");
        expect(nombreModelo("xkiro/qwen3.7-plus:free")).toBe("Qwen3 7 Plus");
    });

    it("incluye a los seres 1.58: agente, personalidad, proceso y núcleo BitNet", () => {
        const { seres } = seresDelMando(fuentes(), AHORA);
        const ids = seres.map((s) => s.id);
        expect(ids).toContain("agente158:curador");
        expect(ids).toContain("personalidad:preset-aurora");
        expect(ids).toContain("proceso:imaginacion");
        expect(ids).toContain("bitnet:nucleo");
    });

    it("cada sala tiene actividad en [0,1] y una sala vacía marca 0 (no NaN)", () => {
        const { salas, ocupantes } = seresDelMando(fuentes(), AHORA);
        for (const sala of salas) {
            expect(sala.actividad).toBeGreaterThanOrEqual(0);
            expect(sala.actividad).toBeLessThanOrEqual(1);
        }
        const enjambre = salas.find((s) => s.id === "enjambre");
        expect(ocupantes.some((o) => o.salaId === "enjambre")).toBe(true);
        expect(enjambre!.actividad).toBeGreaterThan(0);
        const espera = salas.find((s) => s.id === "espera");
        expect(espera!.actividad).toBe(0);
    });

    it("sin fuentes vivas la oficina queda quieta pero coherente", () => {
        const { seres, salas } = seresDelMando({ latidos: [], progreso: {}, rama158: null }, AHORA);
        expect(seres).toHaveLength(0);
        for (const sala of salas) expect(sala.actividad).toBe(0);
    });
});

describe("experienciaDe y nivelDe", () => {
    it("el nivel es la raíz cuadrada de la xp y nunca es negativo", () => {
        expect(nivelDe(0)).toBe(0);
        expect(nivelDe(9)).toBe(3);
        expect(nivelDe(-5)).toBe(0);
    });

    it("escritor: 10 xp por commit + 1 por tarea en curso", () => {
        const xp = experienciaDe("escritor", "nim/kimi-k3", fuentes(), AHORA);
        expect(xp).toBe(10 * 2 + 1); // commits G1 (rama) + G2 (progreso), latido H2
    });

    it("agente158: 5 por ejecución menos 2 por error, con suelo en 0", () => {
        expect(experienciaDe("agente158", "agente158:curador", fuentes(), AHORA)).toBe(5 * 4 - 2 * 1);
    });
});

describe("fusionarGenoma", () => {
    const base: GenomaSer = {
        id: "nim/kimi-k3",
        tipo: "escritor",
        nombre: "Kimi K3",
        rol: "escritor",
        xp: 16,
        nivel: 4,
        generacion: 1,
        primeraVez: "2026-09-01T00:00:00.000Z",
        ultimaVez: "2026-09-01T00:00:00.000Z",
        rasgos: ["constante"],
    };

    it("sin genoma previo concede los rasgos del nivel alcanzado", () => {
        const nuevo = fusionarGenoma(null, { ...base, rasgos: [] }, "2026-09-07T12:00:00.000Z");
        expect(nuevo.rasgos).toContain("constante");
        expect(nuevo.rasgos.length).toBe(4); // nivel 4 → 4 rasgos de escritor
        expect(nuevo.primeraVez).toBe(base.primeraVez);
    });

    it("la xp y el nivel nunca bajan aunque el cálculo nuevo sea menor", () => {
        const fusion = fusionarGenoma(base, { ...base, xp: 1, nivel: 1, rasgos: [] });
        expect(fusion.xp).toBe(16);
        expect(fusion.nivel).toBe(4);
        expect(fusion.primeraVez).toBe(base.primeraVez);
    });

    it("al subir de nivel se ganan rasgos nuevos sin perder los anteriores", () => {
        const fusion = fusionarGenoma(base, { ...base, xp: 25, nivel: 5, rasgos: [] });
        expect(fusion.nivel).toBe(5);
        expect(fusion.rasgos).toEqual(
            expect.arrayContaining(["constante", "preciso", "veloz", "arquitecto", "incansable"]),
        );
    });
});

describe("ADN determinista", () => {
    it("el mismo ser deriva siempre el mismo ADN", () => {
        const entrada = {
            id: "nim/kimi-k3",
            nombre: "Kimi K3",
            colorPersonalidad: "#39FF14",
            arquetipo: "escritor",
            generacion: 0,
            experiencia: 21,
        };
        expect(derivarAdn(entrada)).toEqual(derivarAdn(entrada));
    });

    it("los genomas calculados llevan la xp coherente con las fuentes", () => {
        const { genomas } = seresDelMando(fuentes(), AHORA);
        const kimi = genomas.find((g) => g.id === "nim/kimi-k3");
        expect(kimi?.xp).toBe(21);
        expect(kimi?.nivel).toBe(nivelDe(21));
    });
});
