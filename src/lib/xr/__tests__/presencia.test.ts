import { describe, expect, it } from "vitest";
import {
    empaquetarPose,
    desempaquetarPose,
    limitarFrecuencia,
    interpolar,
    elegirAnfitrion,
    jugadoresVisibles,
    type CuaternionXR,
    type PoseCabezaManosXR,
} from "../presencia";
import { evaluarSalida } from "../privacidad";
import type { Vec3 } from "../tipos";

const Q: CuaternionXR = [0, 0, 0, 1];
const cabeza = { pos: [1.23456, 0.0004, -1.23456] as Vec3, rot: Q };
const manos = { izq: { pos: [0.1234, 1.5, 0.5] as Vec3, rot: Q } };

const pose = (p: Vec3, q: CuaternionXR = Q): PoseCabezaManosXR => ({ cabeza: { p, q }, izquierda: null, derecha: null });

describe("empaquetarPose · pose-avatar", () => {
    it("sólo lleva cabeza y manos: ni articulaciones ni mirada", () => {
        const msg = empaquetarPose(cabeza, manos);
        expect(Object.keys(msg).sort()).toEqual(["cabeza", "derecha", "izquierda"]);
        expect(JSON.stringify(msg)).not.toMatch(/articulaciones|mirada/);
    });

    it("redondea las posiciones a milímetro", () => {
        const msg = empaquetarPose(cabeza, manos);
        expect(msg.cabeza.p).toEqual([1.235, 0, -1.235]);
        expect(msg.izquierda?.p).toEqual([0.123, 1.5, 0.5]);
    });

    it("una mano que no se ha visto viaja como null", () => {
        const msg = empaquetarPose(cabeza, manos);
        expect(msg.izquierda).not.toBeNull();
        expect(msg.derecha).toBeNull();
        expect(empaquetarPose(cabeza)).toEqual({ cabeza: msg.cabeza, izquierda: null, derecha: null });
    });

    it("desempaquetar recupera el mensaje y descarta basura", () => {
        const msg = empaquetarPose(cabeza, manos);
        expect(desempaquetarPose({ de: "ana", ...msg })).toEqual(msg);
        expect(desempaquetarPose({ cabeza: { p: [0, 0] } })).toBeNull();
        expect(desempaquetarPose("pose")).toBeNull();
    });
});

describe("limitarFrecuencia · 10 Hz", () => {
    it("no deja enviar antes de 100 ms y sí a partir de 100 ms", () => {
        expect(limitarFrecuencia(1000, 1099)).toBe(false);
        expect(limitarFrecuencia(1000, 1100)).toBe(true);
        expect(limitarFrecuencia(1000, 1250)).toBe(true);
    });

    it("respeta un máximo distinto de Hz", () => {
        expect(limitarFrecuencia(1000, 1199, 5)).toBe(false);
        expect(limitarFrecuencia(1000, 1200, 5)).toBe(true);
        expect(limitarFrecuencia(Number.NEGATIVE_INFINITY, 0)).toBe(true);
    });
});

describe("interpolar · llegada a 10 Hz", () => {
    it("a mitad de camino da el punto medio", () => {
        const r = interpolar(pose([0, 0, 0]), pose([2, 4, 6]), 0.5);
        expect(r.cabeza.p).toEqual([1, 2, 3]);
        expect(r.cabeza.q).toEqual(Q);
    });

    it("acota t fuera de 0…1", () => {
        const prev = pose([0, 0, 0]);
        const sig = pose([10, 10, 10]);
        expect(interpolar(prev, sig, -3).cabeza.p).toEqual([0, 0, 0]);
        expect(interpolar(prev, sig, 4).cabeza.p).toEqual([10, 10, 10]);
    });

    it("no inventa una mano que la última pose no trae", () => {
        const prev = { ...pose([0, 0, 0]), izquierda: { p: [1, 2, 3] as Vec3, q: Q } };
        expect(interpolar(prev, pose([0, 0, 0]), 0.5).izquierda).toBeNull();
    });
});

describe("elegirAnfitrion · determinista y con relevo", () => {
    it("elige el menor id sin importar el orden de la lista", () => {
        const lista = [{ id: "zoe", desde: 1 }, { id: "ana", desde: 9 }, { id: "luis", desde: 4 }];
        expect(elegirAnfitrion(lista)?.id).toBe("ana");
        expect(elegirAnfitrion([...lista].reverse())?.id).toBe("ana");
    });

    it("si se va el anfitrión, toma el relevo el siguiente", () => {
        expect(elegirAnfitrion([{ id: "luis", desde: 4 }, { id: "zoe", desde: 1 }])?.id).toBe("luis");
        expect(elegirAnfitrion([])).toBeNull();
        expect(elegirAnfitrion([{ id: "", desde: 1 }])).toBeNull();
    });
});

describe("jugadoresVisibles · los más cercanos", () => {
    it("ordena por distancia y recorta al tope", () => {
        const poses = [
            { id: "lejos", pos: [10, 0, 0] as Vec3 },
            { id: "cerca", pos: [1, 0, 0] as Vec3 },
            { id: "medio", pos: [4, 0, 0] as Vec3 },
        ];
        expect(jugadoresVisibles(poses, [0, 0, 0], 2).map((p) => p.id)).toEqual(["cerca", "medio"]);
        expect(poses.map((p) => p.id)).toEqual(["lejos", "cerca", "medio"]);
    });

    it("con tope cero no devuelve a nadie", () => {
        expect(jugadoresVisibles([{ id: "ana", pos: [1, 0, 0] }], [0, 0, 0], 0)).toEqual([]);
    });
});

describe("privacidad de la pose", () => {
    it("a una sala pública sí; a la nube de terceros no", () => {
        const ahora = 1_000_000;
        expect(evaluarSalida("pose-avatar", "sala-publica", ahora).permitido).toBe(true);
        expect(evaluarSalida("pose-avatar", "nube-terceros", ahora).permitido).toBe(false);
    });
});
