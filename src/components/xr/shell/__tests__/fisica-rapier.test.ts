import { describe, it, expect } from "vitest";
import type { MundoSpec, ObjetoMundo } from "@/lib/xr/mundo-tipos";
import type { NivelCalidad } from "@/lib/xr/tipos";
import {
    crearMundoFisico, paso, leerPoses, leerChoques, aplicarFuerza, teletransportar,
    seleccionarCuerpos, cuaternionDeEuler, type ModuloRapier, type MundoFisico,
} from "../fisica-rapier";
import { posesDeMensaje, interpolarPoses } from "../use-fisica";

let R: ModuloRapier | null = null;
const carga = (async () => { const m = await import("@dimforge/rapier3d-compat"); await m.init(); R = m; })().catch(() => undefined);
const listo = await Promise.race([carga.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 3000))]);
const hayRapier = listo && R !== null;

function objeto(id: string, pos: [number, number, number], extra: Partial<ObjetoMundo> = {}): ObjetoMundo {
    return {
        id, nombre: id, fuente: { tipo: "primitiva", forma: "esfera" }, pos, rot: [0, 0, 0], esc: [1, 1, 1], color: "#7c5cff", prioridad: 1,
        cuerpo: { tipo: "dinamico", forma: "esfera", masa: 1, rebote: 0.1, friccion: 0.8, agarrable: true }, ...extra,
    };
}

function mundo(objetos: ObjetoMundo[], gravedad = -9.81, suelo = true): MundoSpec {
    return {
        version: 1, tipo: "mundo-xr", nombre: "prueba", modo: "vr",
        entorno: { cielo: "noche", terreno: "plano", tamano: 40, colorSuelo: "#000000", semilla: 1, alturaMax: 2 },
        fisica: { gravedad, suelo }, interaccion: { tocar: "observador", agarrar: "editor" }, maxJugadores: 8,
        spawns: [{ id: "entrada", pos: [0, 0, 0], yaw: 0 }], luces: [], objetos, portales: [], zonas: [], pizarras: [], pantallas: [], reglas: [],
    };
}

const nuevo = (m: MundoSpec, nivel: NivelCalidad = "media"): MundoFisico => crearMundoFisico(R as ModuloRapier, m, nivel);

describe("fisica-rapier", () => {
    it.skipIf(!hayRapier)("una esfera dinámica cae y se detiene en el suelo", () => {
        const mf = nuevo(mundo([objeto("bola", [0, 5, 0])]));
        for (let i = 0; i < 400; i += 1) paso(mf, 1 / 60);
        const y1 = leerPoses(mf).get("bola")?.pos[1] ?? -99;
        for (let i = 0; i < 60; i += 1) paso(mf, 1 / 60);
        const y2 = leerPoses(mf).get("bola")?.pos[1] ?? -99;
        expect(y1).toBeGreaterThan(0.3);
        expect(y1).toBeLessThan(0.9);
        expect(Math.abs(y2 - y1)).toBeLessThan(0.05);
    });

    it.skipIf(!hayRapier)("con gravedad cero no cae", () => {
        const mf = nuevo(mundo([objeto("bola", [0, 5, 0])], 0));
        for (let i = 0; i < 120; i += 1) paso(mf, 1 / 60);
        expect(Math.abs((leerPoses(mf).get("bola")?.pos[1] ?? 0) - 5)).toBeLessThan(0.01);
    });

    it.skipIf(!hayRapier)("el recorte por nivel respeta cuerposMax y elige los más cercanos al spawn", () => {
        const objetos = Array.from({ length: 100 }, (_, i) => objeto(`o${i}`, [i, 1, 0]));
        const mf = nuevo(mundo(objetos), "minima");
        expect(mf.dinamicos.size).toBe(20);
        expect(leerPoses(mf).size).toBe(20);
        expect(seleccionarCuerpos(mundo(objetos), "minima").map((o) => o.id)).toEqual(objetos.slice(0, 20).map((o) => o.id));
    });

    it.skipIf(!hayRapier)("el paso fijo avanza el número esperado de pasos", () => {
        const mf = nuevo(mundo([objeto("bola", [0, 5, 0])]));
        expect(paso(mf, 1 / 30)).toBe(2);
        expect(paso(mf, 0.01)).toBe(0);
        expect(paso(mf, 0.01)).toBe(1);
    });

    it.skipIf(!hayRapier)("un dt enorme se acota a 4 pasos por fotograma", () => {
        const mf = nuevo(mundo([objeto("bola", [0, 5, 0])]));
        expect(paso(mf, 10)).toBe(4);
        expect(paso(mf, 10)).toBe(4);
    });

    it.skipIf(!hayRapier)("leerPoses no incluye cuerpos fijos", () => {
        const fijo = objeto("muro", [2, 1, 0], { cuerpo: { tipo: "fijo", forma: "caja", masa: 1, rebote: 0, friccion: 1, agarrable: false } });
        const mf = nuevo(mundo([objeto("bola", [0, 3, 0]), fijo]));
        const poses = leerPoses(mf);
        expect(poses.has("bola")).toBe(true);
        expect(poses.has("muro")).toBe(false);
    });

    it.skipIf(!hayRapier)("teletransportar mueve y aplicarFuerza impulsa", () => {
        const mf = nuevo(mundo([objeto("bola", [0, 2, 0])], 0, false));
        expect(teletransportar(mf, "bola", [3, 4, 5])).toBe(true);
        expect(leerPoses(mf).get("bola")?.pos).toEqual([3, 4, 5]);
        expect(aplicarFuerza(mf, "bola", [0, 5, 0])).toBe(true);
        for (let i = 0; i < 60; i += 1) paso(mf, 1 / 60);
        expect(leerPoses(mf).get("bola")?.pos[1] ?? 0).toBeGreaterThan(4);
    });

    it.skipIf(!hayRapier)("la cola de choques avisa del choque con el suelo", () => {
        const mf = nuevo(mundo([objeto("bola", [0, 3, 0])]));
        for (let i = 0; i < 200; i += 1) paso(mf, 1 / 60);
        const choques = leerChoques(mf);
        expect(choques.some((c) => (c.a === "bola" && c.b === "suelo") || (c.b === "bola" && c.a === "suelo"))).toBe(true);
    });

    it("cuaternionDeEuler da identidad y medio giro en Y", () => {
        expect(cuaternionDeEuler([0, 0, 0])).toEqual([0, 0, 0, 1]);
        const q = cuaternionDeEuler([0, Math.PI / 2, 0]);
        expect(q[1]).toBeCloseTo(Math.SQRT1_2, 6);
        expect(q[3]).toBeCloseTo(Math.SQRT1_2, 6);
    });

    it("posesDeMensaje descarta lo que no tiene forma exacta", () => {
        const poses = posesDeMensaje({ poses: [{ id: "a", pos: [1, 2, 3], rot: [0, 0, 0, 1] }, { id: "b", pos: [1, 2], rot: [0, 0, 0, 1] }, null] });
        expect([...poses.keys()]).toEqual(["a"]);
    });

    it("interpolarPoses avanza hacia el objetivo sin salirse del rango", () => {
        const a = new Map([["a", { pos: [0, 0, 0] as [number, number, number], rot: [0, 0, 0, 1] as [number, number, number, number] }]]);
        const b = new Map([["a", { pos: [10, 0, 0] as [number, number, number], rot: [0, 0, 0, 1] as [number, number, number, number] }]]);
        expect(interpolarPoses(a, b, 0.5).get("a")?.pos[0]).toBe(5);
        expect(interpolarPoses(a, b, 9).get("a")?.pos[0]).toBe(10);
    });
});
