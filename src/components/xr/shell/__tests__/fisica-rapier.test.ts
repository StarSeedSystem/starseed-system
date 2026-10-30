/** XR1010W · Pruebas de física Rapier. */
import { describe, expect, it, vi } from "vitest";
import {
    seleccionarCuerpos,
    crearMundoFisico,
    codificarPoses,
    decodificarPoses,
    interpolarPoses,
    MAX_PASOS_FOTOGRAMA,
    type ObjetoMundo,
    type PosesRecibidas,
    type Vec3,
} from "../fisica-rapier";

const falso = {} as any;
let pasos = 0;
const mundoCon = (cuerpos: ObjetoMundo[], extra: any = {}) => ({
    ...extra,
    cuerpos,
    paso: (dt: number) => { pasos++; return Math.min(Math.floor(dt * 30), MAX_PASOS_FOTOGRAMA); }
});

const cuerpo = (tipo: "dinamico" | "fijo", forma = "caja") => ({ tipo, forma });
const obj = (id: string, pos: [number, number, number], cuerpo: any) => ({ id, pos, cuerpo });

describe("fisica-rapier", () => {
    it("respeta cuerposMax y se queda con los más cercanos al spawn", () => {
        const lejos: ObjetoMundo[] = [1, 2, 3, 4, 5].map((d) => obj(`lejos-${d}`, [d * 10, 0, 0], cuerpo("dinamico")));
        const fijos: ObjetoMundo[] = [obj("suelo-a", [0, -1, 0], cuerpo("fijo", "caja")), obj("suelo-b", [1, -1, 0], cuerpo("fijo", "caja"))];
        const r = seleccionarCuerpos(mundoCon([...fijos, ...lejos]), 2);
        expect(r.recortados).toBe(3);
        expect(r.cuerpos.filter((o) => o.id.startsWith("lejos-")).map((o) => o.id)).toEqual(["lejos-1", "lejos-2"]);
        expect(r.cuerpos.filter((o) => o.cuerpo?.tipo === "fijo")).toHaveLength(2);
    });

    it("sin exceso no recorta nada", () => {
        const r = seleccionarCuerpos(mundoCon([obj("a", [0, 1, 0], cuerpo("dinamico")), obj("b", [5, 1, 0], cuerpo("fijo", "caja"))]), 20);
        expect(r.cuerpos).toHaveLength(2);
        expect(r.recortados).toBe(0);
    });

    it("avanza los pasos esperados y acota un dt enorme a 4 (no espiral)", () => {
        const m = crearMundoFisico(falso, mundoCon([], { gravedad: -9.81, suelo: false }), "minima");
        expect(m.paso(3 / 30)).toBe(3);
        pasos = 0;
        expect(m.paso(9)).toBe(MAX_PASOS_FOTOGRAMA);
        expect(pasos).toBe(MAX_PASOS_FOTOGRAMA);
    });

    it("codificar y decodificar van y vuelven, y lo basura se queda fuera", () => {
        const poses = new Map([["pelota", { pos: [1, 2, 3] as Vec3, rot: [0, 0, 0, 1] as [number, number, number, number] }]]);
        const cod = codificarPoses(poses);
        expect(cod.pelota).toEqual([1, 2, 3, 0, 0, 0, 1]);
        expect(decodificarPoses(null)).toEqual({});
        expect(decodificarPoses({ a: [1, 2, 3], b: [1, 2, 3, 0, 0, 0, 1] })).toEqual({ b: [1, 2, 3, 0, 0, 0, 1] });
        expect(decodificarPoses({ c: [1, 2, 3, 0, 0, 0, true], d: [1, 2, 3, 0, 0, 0, NaN] })).toEqual({});
    });

    it("interpolarPoses acerca al objetivo y acepta quien llega nuevo", () => {
        const actuales: PosesRecibidas = { pelota: [0, 0, 0, 0, 0, 0, 1] };
        const recibidas: PosesRecibidas = { pelota: [2, 0, 0, 0, 0, 0, 1], nuevo: [1, 1, 1, 0, 0, 0, 1] };
        const r = interpolarPoses(actuales, recibidas, 0.5);
        expect(r.pelota).toEqual([1, 0, 0, 0, 0, 0, 1]);
        expect(r.nuevo).toEqual([1, 1, 1, 0, 0, 0, 1]);
        expect(interpolarPoses(actuales, recibidas, 9).pelota).toEqual([2, 0, 0, 0, 0, 0, 1]);
    });
});
