/**
 * StarSeed OS · Pruebas de propiedad de elementos en salas (Ola 1025R).
 * ============================================================================
 * Pruebas unitarias puros de `propiedad-sala.ts`: reclamar, traspasar, aceptar
 * escritura, fusión conmutativa/idempotente con 200 casos de semilla fija,
 * permisos y forzar traspaso.
 */

import { describe, it, expect } from "vitest";
import {
    reclamar,
    traspasar,
    aceptarEscritura,
    fusionarPropiedades,
    puedeEscribir,
    forzarTraspaso,
    explicar,
    type Propiedades,
} from "@/lib/salas/propiedad-sala";
import type { Sala } from "@/lib/salas/sala";

describe("salas · propiedad y épocas", () => {
    it("explica los motivos de rechazo sin tecnicismos", () => {
        expect(explicar("sin-dueno")).toContain("Nadie tiene reclamada");
        expect(explicar("no-es-dueno", "Ana")).toContain("Ana");
        expect(explicar("epoca-vieja")).toContain("desactualizada");
    });

    it("reclamar elemento sin dueño y respeta dueño existente", () => {
        let p: Propiedades = {};
        p = reclamar(p, "el-1", "usuario-1");
        expect(p["el-1"]).toEqual({ dueno: "usuario-1", epoca: 1 });

        // Intentar reclamar de nuevo por otro no debe cambiarlo
        p = reclamar(p, "el-1", "usuario-2");
        expect(p["el-1"]).toEqual({ dueno: "usuario-1", epoca: 1 });
    });

    it("traspasar solo si el dueño es correcto e incrementa época", () => {
        let p: Propiedades = {
            "el-1": { dueno: "ana", epoca: 2 },
        };
        // Traspaso con dueño incorrecto no hace nada
        p = traspasar(p, "el-1", "carlos", "beatriz");
        expect(p["el-1"]).toEqual({ dueno: "ana", epoca: 2 });

        // Traspaso correcto
        p = traspasar(p, "el-1", "ana", "beatriz");
        expect(p["el-1"]).toEqual({ dueno: "beatriz", epoca: 3 });
    });

    it("aceptar escritura valida dueño y época", () => {
        const p: Propiedades = {
            "el-1": { dueno: "ana", epoca: 5 },
        };
        expect(aceptarEscritura(p, "inexistente", "ana", 5)).toEqual({ ok: false, motivo: "sin-dueno" });
        expect(aceptarEscritura(p, "el-1", "carlos", 5)).toEqual({ ok: false, motivo: "no-es-dueno" });
        expect(aceptarEscritura(p, "el-1", "ana", 4)).toEqual({ ok: false, motivo: "epoca-vieja" });
        expect(aceptarEscritura(p, "el-1", "ana", 5)).toEqual({ ok: true });
        expect(aceptarEscritura(p, "el-1", "ana", 10)).toEqual({ ok: true });
    });

    it("fusionarPropiedades es conmutativa y resuelve empates deterministamente", () => {
        const a: Propiedades = {
            "el-1": { dueno: "carlos", epoca: 3 },
            "el-2": { dueno: "beatriz", epoca: 2 },
            "el-3": { dueno: "ana", epoca: 1 },
        };
        const b: Propiedades = {
            "el-1": { dueno: "ana", epoca: 3 }, // Empate de época (3), gana alfabéticamente "ana" sobre "carlos"
            "el-2": { dueno: "beatriz", epoca: 4 }, // Gana b por época mayor (4 > 2)
            "el-4": { dueno: "daniel", epoca: 1 },
        };

        const resAB = fusionarPropiedades(a, b);
        const resBA = fusionarPropiedades(b, a);

        expect(resAB.propiedades).toEqual(resBA.propiedades);
        expect(resAB.conflictos).toContain("el-1");
        expect(resAB.propiedades["el-1"].dueno).toBe("ana");
        expect(resAB.propiedades["el-2"].epoca).toBe(4);
        expect(resAB.propiedades["el-3"]).toEqual({ dueno: "ana", epoca: 1 });
        expect(resAB.propiedades["el-4"]).toEqual({ dueno: "daniel", epoca: 1 });
    });

    it("prueba conmutatividad e idempotencia con 200 casos de semilla fija (mulberry32)", () => {
        function mulberry32(seed: number) {
            return function () {
                seed |= 0;
                seed = (seed + 0x6d2b79f5) | 0;
                let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }

        const rng = mulberry32(1337);
        const duenos = ["ana", "beatriz", "carlos", "daniel", "elena"];

        for (let i = 0; i < 200; i++) {
            const mapaA: Propiedades = {};
            const mapaB: Propiedades = {};
            const numElems = 5 + Math.floor(rng() * 10);

            for (let j = 0; j < numElems; j++) {
                const id = `elem-${j}`;
                if (rng() > 0.3) {
                    mapaA[id] = {
                        dueno: duenos[Math.floor(rng() * duenos.length)],
                        epoca: 1 + Math.floor(rng() * 10),
                    };
                }
                if (rng() > 0.3) {
                    mapaB[id] = {
                        dueno: duenos[Math.floor(rng() * duenos.length)],
                        epoca: 1 + Math.floor(rng() * 10),
                    };
                }
            }

            const res1 = fusionarPropiedades(mapaA, mapaB);
            const res2 = fusionarPropiedades(mapaB, mapaA);

            // Conmutatividad
            expect(res1.propiedades).toEqual(res2.propiedades);

            // Idempotencia: fusionar un mapa con su resultado debe dar exactamente el mismo resultado
            const resIdem = fusionarPropiedades(res1.propiedades, res1.propiedades);
            expect(resIdem.propiedades).toEqual(res1.propiedades);
        }
    });

    it("puedeEscribir combina rol de sala y propiedad", () => {
        const s: Sala = {
            id: "s-1",
            tipo: "pizarra",
            titulo: "Sala test",
            visibilidad: "privada",
            transporte: "local",
            miembros: {
                "u-dueno": "dueno",
                "u-editor": "editor",
                "u-observa": "observador",
            },
            creadaEn: 1000,
        };

        const p: Propiedades = {
            "el-libre": { dueno: "", epoca: 0 },
            "el-mio": { dueno: "u-editor", epoca: 1 },
            "el-de-otro": { dueno: "u-dueno", epoca: 1 },
        };

        // Observador no edita nada
        expect(puedeEscribir(s, "u-observa", p, "el-libre")).toBe(false);

        // Editor edita libre o lo suyo, pero no lo de otro
        expect(puedeEscribir(s, "u-editor", p, "el-libre")).toBe(true);
        expect(puedeEscribir(s, "u-editor", p, "el-mio")).toBe(true);
        expect(puedeEscribir(s, "u-editor", p, "el-de-otro")).toBe(false);
    });

    it("forzarTraspaso solo lo puede hacer el dueño de la sala", () => {
        const s: Sala = {
            id: "s-1",
            tipo: "pizarra",
            titulo: "Sala test",
            visibilidad: "privada",
            transporte: "local",
            miembros: {
                "u-sala-dueno": "dueno",
                "u-editor": "editor",
            },
            creadaEn: 1000,
        };

        const p: Propiedades = {
            "el-1": { dueno: "u-editor", epoca: 2 },
        };

        // Editor intenta forzar traspaso -> no hace nada
        let p2 = forzarTraspaso(s, "u-editor", p, "el-1", "alguien");
        expect(p2).toEqual(p);

        // Dueño de la sala fuerza traspaso -> éxito y sube época
        p2 = forzarTraspaso(s, "u-sala-dueno", p, "el-1", "nuevo-dueno");
        expect(p2["el-1"]).toEqual({ dueno: "nuevo-dueno", epoca: 3 });
    });
});
