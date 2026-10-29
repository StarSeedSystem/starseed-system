/** Pruebas de la propiedad por épocas (INF1025J); fusión con 200 casos de semilla fija. */
import { describe, it, expect } from "vitest";
import { aceptarEscritura, explicar, forzarTraspaso, fusionarPropiedades, puedeEscribir, reclamar, traspasar, type Propiedades } from "../salas/propiedad-sala";
import type { Sala } from "../salas/sala";

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const DUENOS = ["ana", "bruno", "carla", "dani"];
function mapa(rnd: () => number): Propiedades {
    const p: Propiedades = {};
    const n = Math.floor(rnd() * 7);
    for (let i = 0; i < n; i += 1) {
        p[`pieza-${Math.floor(rnd() * 6)}`] = {
            dueno: DUENOS[Math.floor(rnd() * DUENOS.length)], epoca: 1 + Math.floor(rnd() * 5),
        };
    }
    return p;
}
function sala(cambios: Partial<Sala> = {}): Sala {
    return {
        id: "sala", tipo: "pizarra", titulo: "Sala", visibilidad: "privada", transporte: "local",
        miembros: { "u-dueno": "dueno", "u-editor": "editor", "u-mira": "observador" },
        creadaEn: 1, ...cambios,
    };
}
describe("fusionarPropiedades · 200 casos de semilla fija", () => {
    it("es conmutativa e idempotente en todos ellos", () => {
        const rnd = mulberry32(1025);
        for (let caso = 0; caso < 200; caso += 1) {
            const a = mapa(rnd), b = mapa(rnd);
            const ab = fusionarPropiedades(a, b), ba = fusionarPropiedades(b, a);
            expect(ab.propiedades).toEqual(ba.propiedades);
            expect(ab.conflictos).toEqual(ba.conflictos);
            expect(fusionarPropiedades(a, a)).toEqual({ propiedades: a, conflictos: [] });
        }
    });
});
describe("aceptarEscritura", () => {
    it("acepta la época vigente del dueño y rechaza una vieja", () => {
        const p: Propiedades = { pieza: { dueno: "ana", epoca: 2 } };
        expect(aceptarEscritura(p, "pieza", "ana", 2)).toEqual({ ok: true });
        expect(aceptarEscritura(p, "pieza", "ana", 1)).toEqual({ ok: false, motivo: "epoca-vieja" });
        expect(aceptarEscritura(p, "pieza", "bruno", 2)).toEqual({ ok: false, motivo: "no-es-dueno" });
        expect(aceptarEscritura(p, "otra", "ana", 1)).toEqual({ ok: false, motivo: "sin-dueno" });
    });
});
describe("reclamar y traspasar", () => {
    it("reclama solo lo que no tiene dueño, sin mutar el mapa original", () => {
        const p: Propiedades = {};
        const q = reclamar(p, "pieza", "ana");
        expect(p).toEqual({});
        expect(q.pieza).toEqual({ dueno: "ana", epoca: 1 });
        expect(reclamar(q, "pieza", "bruno")).toEqual(q);
    });
    it("solo el dueño actual cede la pieza y la época sube en uno", () => {
        const p: Propiedades = { pieza: { dueno: "ana", epoca: 1 } };
        expect(traspasar(p, "pieza", "bruno", "carla")).toEqual(p);
        const q = traspasar(p, "pieza", "ana", "bruno");
        expect(q.pieza).toEqual({ dueno: "bruno", epoca: 2 });
        expect(p.pieza).toEqual({ dueno: "ana", epoca: 1 });
    });
});
describe("fusionarPropiedades · empate y época mayor", () => {
    it("gana la época mayor venga de donde venga", () => {
        const vieja: Propiedades = { x: { dueno: "ana", epoca: 1 } };
        const nueva: Propiedades = { x: { dueno: "bruno", epoca: 4 } };
        expect(fusionarPropiedades(vieja, nueva).propiedades.x).toEqual({ dueno: "bruno", epoca: 4 });
        expect(fusionarPropiedades(nueva, vieja).propiedades.x).toEqual({ dueno: "bruno", epoca: 4 });
    });
    it("en empate elige el dueño menor en ambos órdenes y lo marca como conflicto", () => {
        const a: Propiedades = { pieza: { dueno: "bruno", epoca: 3 } };
        const b: Propiedades = { pieza: { dueno: "ana", epoca: 3 } };
        const ab = fusionarPropiedades(a, b), ba = fusionarPropiedades(b, a);
        expect(ab.propiedades.pieza).toEqual({ dueno: "ana", epoca: 3 });
        expect(ab.propiedades).toEqual(ba.propiedades);
        expect(ab.conflictos).toEqual(["pieza"]);
        expect(ba.conflictos).toEqual(["pieza"]);
    });
});
describe("puedeEscribir", () => {
    it("un editor escribe lo suyo o lo libre, nunca lo ajeno; quien mira no escribe", () => {
        const s = sala();
        const p: Propiedades = { "de-ana": { dueno: "ana", epoca: 1 } };
        expect(puedeEscribir(s, "u-editor", p, "libre")).toBe(true);
        expect(puedeEscribir(s, "u-editor", p, "de-ana")).toBe(false);
        expect(puedeEscribir(s, "u-mira", p, "libre")).toBe(false);
        const suyo: Propiedades = { "de-editor": { dueno: "u-editor", epoca: 1 } };
        expect(puedeEscribir(s, "u-editor", suyo, "de-editor")).toBe(true);
    });
});
describe("forzarTraspaso", () => {
    it("solo quien manda en la sala puede forzarlo, y queda el registro", () => {
        const s = sala(), p: Propiedades = { pieza: { dueno: "bruno", epoca: 2 } };
        expect(forzarTraspaso(s, "u-editor", p, "pieza", "ana")).toEqual({ ok: false, motivo: "no-es-dueno-sala" });
        const r = forzarTraspaso(s, "u-dueno", p, "pieza", "ana");
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error("esperaba un traspaso forzado");
        expect(r.propiedades.pieza).toEqual({ dueno: "ana", epoca: 3 });
        expect(r.registro).toEqual({ id: "pieza", por: "u-dueno", para: "ana", epoca: 3 });
        expect(p.pieza).toEqual({ dueno: "bruno", epoca: 2 });
    });
});
describe("explicar · sin tecnicismos", () => {
    it("habla de piezas y personas, no de épocas, identificadores ni errores", () => {
        const prohibidas = ["epoca", "época", "epoch", "timestamp", "uuid", "null", "undefined", "error", "id "];
        const frases = [explicar("sin-dueno"), explicar("no-es-dueno", "Ana"), explicar("epoca-vieja")];
        for (const frase of frases) {
            expect(frase.length).toBeGreaterThan(10);
            for (const palabra of prohibidas) expect(frase.toLowerCase()).not.toContain(palabra);
        }
        expect(explicar("no-es-dueno", "Ana")).toContain("Ana");
    });
});
