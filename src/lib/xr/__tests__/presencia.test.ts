/**
 * StarSeed XR · Pruebas de presencia (nodos puros).
 */
import { describe, it, expect } from "vitest";
import { empaquetarPose, elegirAnfitrion, jugadoresVisibles, limitarFrecuencia, interpolar } from "../presencia";
import { evaluarSalida } from "../privacidad";

describe("Presencia XR", () => {
    it("empaquetarPose redondea a mm y excluye articulaciones", () => {
        const pose = empaquetarPose(
            { pos: [1.2345, 2.3456, 3.4567], rot: [1, 0, 0, 0] },
            { izq: { pos: [0.1, 0.2, 0.3], rot: [0, 1, 0, 0] } }
        );
        expect(pose.cabeza.pos).toEqual([1.235, 2.346, 3.457]);
        expect(pose.manos?.izq?.pos).toEqual([0.1, 0.2, 0.3]);
        expect(pose.cabeza).not.toHaveProperty("articulaciones");
        expect(pose.cabeza).not.toHaveProperty("mirada");
    });

    it("empaquetarPose maneja manos parcialmente ausentes", () => {
        const pose1 = empaquetarPose({ pos: [0, 0, 0], rot: [0, 0, 0, 0] }, { izq: { pos: [1, 1, 1], rot: [0, 0, 0, 0] } });
        expect(pose1.manos?.izq).toBeDefined();
        expect(pose1.manos?.der).toBeUndefined();
        
        const pose2 = empaquetarPose({ pos: [0, 0, 0], rot: [0, 0, 0, 0] }, { der: { pos: [1, 1, 1], rot: [0, 0, 0, 0] } });
        expect(pose2.manos?.der).toBeDefined();
        expect(pose2.manos?.izq).toBeUndefined();
    });

    it("limitarFrecuencia respeta 10 Hz", () => {
        const ahora = 1000;
        expect(limitarFrecuencia(900, ahora, 10)).toBe(true);
        expect(limitarFrecuencia(950, ahora, 10)).toBe(false);
        expect(limitarFrecuencia(899, ahora, 10)).toBe(true);
    });

    it("interpolar calcula valores intermedios", () => {
        expect(interpolar(0, 10, 0.5)).toBe(5);
        expect(interpolar(0, 10, 0)).toBe(0);
        expect(interpolar(0, 10, 1)).toBe(10);
        expect(interpolar(10, 20, 0.25)).toBe(12.5);
    });

    it("elegirAnfitrion es determinista", () => {
        const jugadores = [
            { id: "b", desde: 100 },
            { id: "a", desde: 50 },
        ];
        expect(elegirAnfitrion(jugadores)).toBe("a");
    });

    it("elegirAnfitrion maneja relevo cuando sale el anfitrion", () => {
        const jugadores = [
            { id: "b", desde: 100 },
            { id: "a", desde: 50 },
        ];
        expect(elegirAnfitrion(jugadores)).toBe("a");
        
        const sinAnfitrion = [{ id: "b", desde: 100 }];
        expect(elegirAnfitrion(sinAnfitrion)).toBe("b");
        
        expect(elegirAnfitrion([])).toBeNull();
    });

    it("jugadoresVisibles ordena por distancia", () => {
        const poses = [
            { id: "lejos", pos: [10, 0, 10] as [number, number, number] },
            { id: "cerca", pos: [1, 0, 1] as [number, number, number] },
        ];
        const visibles = jugadoresVisibles(poses, [0, 0, 0], 1);
        expect(visibles).toEqual(["cerca"]);
    });

    it("jugadoresVisibles respeta limite de tope", () => {
        const poses = [
            { id: "a", pos: [1, 0, 0] as [number, number, number] },
            { id: "b", pos: [2, 0, 0] as [number, number, number] },
            { id: "c", pos: [3, 0, 0] as [number, number, number] },
        ];
        const visibles = jugadoresVisibles(poses, [0, 0, 0], 2);
        expect(visibles.length).toBe(2);
        expect(visibles).toEqual(["a", "b"]);
    });

    it("evaluarSalida bloquea nube-terceros para pose-avatar", () => {
        const veredicto = evaluarSalida("pose-avatar", "nube-terceros", Date.now());
        expect(veredicto.permitido).toBe(false);
        expect(veredicto.requiere).toBe("nunca");
    });

    it("evaluarSalida permite sala-publica para pose-avatar", () => {
        const veredicto = evaluarSalida("pose-avatar", "sala-publica", Date.now());
        expect(veredicto.permitido).toBe(true);
        expect(veredicto.requiere).toBe("nada");
    });

    it("evaluarSalida permite sala-privada y sala-grupo", () => {
        const ahora = Date.now();
        expect(evaluarSalida("pose-avatar", "sala-privada", ahora).permitido).toBe(true);
        expect(evaluarSalida("pose-avatar", "sala-grupo", ahora).permitido).toBe(true);
    });

    it("debe contener timestamp", () => {
        const pose = empaquetarPose({ pos: [0,0,0], rot: [0,0,0,0] });
        const mensaje = { ...pose, timestamp: Date.now() };
        expect(mensaje).toHaveProperty("timestamp");
        expect(typeof mensaje.timestamp).toBe("number");
    });

    it("empaquetarPose no incluye articulaciones o mirada", () => {
        const pose = empaquetarPose(
            { pos: [1.5, 2.5, 3.5], rot: [0.1, 0.2, 0.3, 0.4] },
            { izq: { pos: [0, 1, 0], rot: [1, 0, 0, 0] }, der: { pos: [0, 1, 0], rot: [1, 0, 0, 0] } }
        );
        expect(pose.cabeza.pos).toBeDefined();
        expect(pose.cabeza.rot).toBeDefined();
        expect(pose.cabeza).not.toHaveProperty("articulaciones");
        expect(pose.cabeza).not.toHaveProperty("mirada");
        if (pose.manos) {
            expect(Object.keys(pose.manos)).toContain("izq");
            expect(Object.keys(pose.manos)).toContain("der");
        }
    });
});
