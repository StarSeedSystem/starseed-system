import { describe, expect, it } from "vitest";
import * as RAPIER from "@dimforge/rapier3d-compat";
import { aplicarFuerza, crearMundoFisico, leerChoques, leerPoses, liberarMundo, paso, teletransportar, type Rapier } from "../fisica-rapier";
import type { CuerpoFisico, MundoSpec, ObjetoMundo } from "@/lib/xr/mundo-tipos";
import type { Vec3 } from "@/lib/xr/tipos";
let cargado = false;
try { await RAPIER.init(); cargado = true; } catch { cargado = false; }
const CERO: Vec3 = [0, 0, 0];
function objeto(id: string, pos: Vec3, cuerpo: Partial<CuerpoFisico> = {}): ObjetoMundo {
    return {
        id, nombre: id, fuente: { tipo: "primitiva", forma: "esfera" }, pos, rot: CERO, esc: [1, 1, 1], color: "#ffffff",
        cuerpo: { tipo: "dinamico", forma: "esfera", masa: 1, rebote: 0, friccion: 0.6, agarrable: false, ...cuerpo }, prioridad: 1,
    };
}
function mundo(o: { gravedad?: number; suelo?: boolean; objetos?: ObjetoMundo[]; spawn?: Vec3 } = {}): MundoSpec {
    return {
        version: 1, tipo: "mundo-xr", nombre: "Prueba", modo: "ambos",
        entorno: { cielo: "nebulosa", terreno: "plano", tamano: 40, colorSuelo: "#1c1b2e", semilla: 1, alturaMax: 2 },
        fisica: { gravedad: o.gravedad ?? -9.81, suelo: o.suelo ?? true }, interaccion: { tocar: "observador", agarrar: "editor" },
        maxJugadores: 8, spawns: [{ id: "entrada", pos: o.spawn ?? CERO, yaw: 0 }], luces: [], objetos: o.objetos ?? [],
        portales: [], zonas: [], pizarras: [], pantallas: [], reglas: [],
    };
}
function rapierFalso(): Rapier {
    const d = () => { const o: Record<string, unknown> = {}; for (const k of ["setTranslation", "setRotation", "setMass", "setRestitution", "setFriction", "setActiveEvents"]) o[k] = () => o; return o; };
    let h = 0;
    const cuerpo = () => ({ translation: () => ({ x: 0, y: 0, z: 0 }), rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }), setTranslation() {}, applyImpulse() {} });
    return {
        World: class { timestep = 0; createRigidBody() { return cuerpo(); } createCollider() { return { handle: h++ }; } step() {} free() {} },
        EventQueue: class { drainCollisionEvents() {} free() {} },
        RigidBodyDesc: { dynamic: d, fixed: d, kinematicPositionBased: d },
        ColliderDesc: { ball: d, cuboid: d, capsule: d, convexHull: d }, ActiveEvents: { COLLISION_EVENTS: 1 },
    } as unknown as Rapier;
}
describe("física Rapier", () => {
    it.skipIf(!cargado)("una esfera dinámica cae y se detiene en el suelo", () => {
        const mf = crearMundoFisico(RAPIER, mundo({ objetos: [objeto("bola", [0, 5, 0])] }), "minima");
        for (let i = 0; i < 360; i += 1) paso(mf, 1 / 60);
        const y = leerPoses(mf).get("bola")?.pos[1] ?? -1;
        expect(y).toBeGreaterThan(0.35); expect(y).toBeLessThan(0.65);
        liberarMundo(mf);
    });
    it.skipIf(!cargado)("gravedad cero no cae", () => {
        const mf = crearMundoFisico(RAPIER, mundo({ gravedad: 0, suelo: false, objetos: [objeto("bola", [0, 5, 0])] }), "minima");
        for (let i = 0; i < 120; i += 1) paso(mf, 1 / 60);
        expect(leerPoses(mf).get("bola")?.pos[1]).toBeCloseTo(5, 1);
        liberarMundo(mf);
    });
    it.skipIf(!cargado)("el recorte por nivel respeta cuerposMax", () => {
        const objetos = Array.from({ length: 30 }, (_, i) => objeto(`o${i}`, [i, 0, 0]));
        const mf = crearMundoFisico(RAPIER, mundo({ objetos }), "minima");
        expect(mf.cuerpos.size).toBe(20); expect(mf.dinamicos.size).toBe(20);
        liberarMundo(mf);
    });
    it.skipIf(!cargado)("se queda con los cuerpos más cercanos al spawn", () => {
        const objetos = Array.from({ length: 30 }, (_, i) => objeto(`o${i}`, [i, 0, 0]));
        const mf = crearMundoFisico(RAPIER, mundo({ objetos, spawn: CERO }), "minima");
        expect(mf.cuerpos.has("o0")).toBe(true); expect(mf.cuerpos.has("o19")).toBe(true);
        expect(mf.cuerpos.has("o20")).toBe(false); expect(mf.cuerpos.has("o29")).toBe(false);
        liberarMundo(mf);
    });
    it("sin exceso no recorta ningún cuerpo", () => {
        const objetos = [
            objeto("fijo", [0, 1, 0], { tipo: "fijo", forma: "caja" }),
            objeto("movil", [5, 1, 0]),
        ];
        const mf = crearMundoFisico(rapierFalso(), mundo({ objetos }), "minima");
        expect(mf.cuerpos.size).toBe(2);
        expect(mf.cuerpos.has("fijo")).toBe(true);
        expect(mf.cuerpos.has("movil")).toBe(true);
        expect(mf.dinamicos.size).toBe(1);
    });
    it.skipIf(!cargado)("el paso fijo avanza el número esperado de pasos", () => {
        const mf = crearMundoFisico(RAPIER, mundo({ suelo: false, objetos: [objeto("bola", [0, 5, 0])] }), "minima");
        expect(mf.pasosHz).toBe(30); expect(paso(mf, 0.1)).toBe(3);
        liberarMundo(mf);
    });
    it.skipIf(!cargado)("un dt enorme se acota a 4 pasos", () => {
        const mf = crearMundoFisico(RAPIER, mundo({ objetos: [objeto("bola", [0, 5, 0])] }), "minima");
        expect(paso(mf, 10)).toBe(4); expect(mf.pasos).toBe(4);
        liberarMundo(mf);
    });
    it.skipIf(!cargado)("leerPoses no incluye fijos", () => {
        const objetos = [objeto("fijo", CERO, { tipo: "fijo", forma: "caja" }), objeto("movil", [0, 2, 0])];
        const poses = leerPoses(crearMundoFisico(RAPIER, mundo({ objetos }), "minima"));
        expect(poses.has("movil")).toBe(true); expect(poses.has("fijo")).toBe(false);
    });
    it.skipIf(!cargado)("teletransportar mueve el cuerpo y aplicarFuerza solo a dinámicos", () => {
        const objetos = [objeto("fijo", CERO, { tipo: "fijo", forma: "caja" }), objeto("bola", [0, 5, 0])];
        const mf = crearMundoFisico(RAPIER, mundo({ gravedad: 0, suelo: false, objetos }), "minima");
        expect(teletransportar(mf, "bola", [1, 2, 3])).toBe(true);
        expect(leerPoses(mf).get("bola")?.pos).toEqual([1, 2, 3]);
        expect(aplicarFuerza(mf, "fijo", [0, 1, 0])).toBe(false);
        expect(aplicarFuerza(mf, "bola", [0, 10, 0])).toBe(true);
        for (let i = 0; i < 30; i += 1) paso(mf, 1 / 60);
        expect(leerPoses(mf).get("bola")?.pos[1]).toBeGreaterThan(2);
        liberarMundo(mf);
    });
    it.skipIf(!cargado)("los choques entre objetos quedan en la cola de reglas", () => {
        const objetos = [objeto("suelo-fijo", CERO, { tipo: "fijo", forma: "caja" }), objeto("bola", [0, 3, 0])];
        const mf = crearMundoFisico(RAPIER, mundo({ objetos }), "minima");
        let chocaron = false;
        for (let i = 0; i < 120 && !chocaron; i += 1) {
            paso(mf, 1 / 60);
            chocaron = leerChoques(mf).some((c) => (c.a === "bola" && c.b === "suelo-fijo") || (c.a === "suelo-fijo" && c.b === "bola"));
        }
        expect(chocaron).toBe(true);
        liberarMundo(mf);
    });
    it.skipIf(cargado)("con RAPIER falso el recorte también respeta cuerposMax", () => {
        const objetos = Array.from({ length: 30 }, (_, i) => objeto(`o${i}`, [i, 0, 0]));
        expect(crearMundoFisico(rapierFalso(), mundo({ objetos }), "minima").cuerpos.size).toBe(20);
    });
});
