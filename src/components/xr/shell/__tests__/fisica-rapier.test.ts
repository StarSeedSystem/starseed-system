import { describe, it, expect } from "vitest";
import { cuaternionDeEuler, posesDeMensaje, interpolarPoses } from "@/lib/xr/fisica-rapier";

describe("cuaternionDeEuler", () => {
    it("da identidad y medio giro en Y", () => {
        expect(cuaternionDeEuler([0, 0, 0])).toEqual([0, 0, 0, 1]);
        const q = cuaternionDeEuler([0, Math.PI / 2, 0]);
        expect(q[1]).toBeCloseTo(Math.SQRT1_2, 6);
        expect(q[3]).toBeCloseTo(Math.SQRT1_2, 6);
    });
});

describe("posesDeMensaje", () => {
    it("descarta lo que no tiene forma exacta", () => {
        const poses = posesDeMensaje({ poses: [{ id: "a", pos: [1, 2, 3], rot: [0, 0, 0, 1] }, { id: "b", pos: [1, 2], rot: [0, 0, 0, 1] }, null] });
        expect([...poses.keys()]).toEqual(["a"]);
    });
});

describe("interpolarPoses", () => {
    it("avanza hacia el objetivo sin salirse del rango", () => {
        const a = new Map([[ "a", { pos: [0, 0, 0] as [number, number, number], rot: [0, 0, 0, 1] as [number, number, number, number] }]]);
        const b = new Map([[ "a", { pos: [10, 0, 0] as [number, number, number], rot: [0, 0, 0, 1] as [number, number, number, number] }]]);
        expect(interpolarPoses(a, b, 0.5).get("a")?.pos[0]).toBe(5);
        expect(interpolarPoses(a, b, 9).get("a")?.pos[0]).toBe(10);
    });
});