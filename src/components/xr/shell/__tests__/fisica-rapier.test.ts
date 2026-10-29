import { describe, expect, it } from "vitest";
import {
    aplicarFuerza, crearMundoFisico, elegirCuerpos, leerPoses, paso, teletransportar, tomarChoques,
    type Rapier,
} from "../fisica-rapier";
import type { MundoSpec, ObjetoMundo } from "@/lib/xr/mundo-tipos";
import type { Vec3 } from "@/lib/xr/tipos";

// Rapier REAL en node (build compat, WASM embebido). Se espera al máximo 3 s: si no carga,
// queda en null y `it.skipIf` salta las pruebas de motor; el recorte sigue probado (puro).
let RAPIER: Rapier | null = null;
const modulo = await import("@dimforge/rapier3d-compat").catch(() => null);
if (modulo) {
    await Promise.race([modulo.init().then(() => (RAPIER = modulo.default ?? modulo)), new Promise((r) => setTimeout(r, 3_000))]);
}

const hayRapier = () => RAPIER !== null;

function rap(): Rapier {
    if (!RAPIER) throw new Error("RAPIER no cargó");
    return RAPIER;
}

function esfera(id: string, pos: Vec3, tipo: "dinamico" | "fijo", masa = 1): ObjetoMundo {
    return {
        id, nombre: id, fuente: { tipo: "primitiva", forma: "esfera" }, pos, rot: [0, 0, 0], esc: [1, 1, 1],
        color: "#888", prioridad: 3,
        cuerpo: { tipo, forma: "esfera", masa, rebote: 0, friccion: 0.5, agarrable: false },
    };
}

function caja(id: string, pos: Vec3, esc: [number, number, number]): ObjetoMundo {
    return {
        id, nombre: id, fuente: { tipo: "primitiva", forma: "caja" }, pos, rot: [0, 0, 0], esc,
        color: "#666", prioridad: 3,
        cuerpo: { tipo: "fijo", forma: "caja", masa: 0, rebote: 0, friccion: 0.5, agarrable: false },
    };
}

export function mundoDe(objetos: ObjetoMundo[], gravedad = -9.81, suelo = true): MundoSpec {
    return {
        version: 1, tipo: "mundo-xr", nombre: "prueba", modo: "vr",
        entorno: { cielo: "estudio", terreno: "plano", tamano: 20, colorSuelo: "#333", semilla: 1, alturaMax: 50 },
        fisica: { gravedad, suelo }, interaccion: { tocar: "editor", agarrar: "editor" }, maxJugadores: 4,
        spawns: [{ id: "s0", pos: [0, 0, 0], yaw: 0 }], luces: [], objetos, portales: [], zonas: [],
        pizarras: [], pantallas: [], reglas: [],
    };
}

describe("fisica-rapier · recorte por nivel (puro)", () => {
    it("recorta a cuerposMax eligiendo los más cercanos al spawn", () => {
        const lejos = esfera("lejos", [10, 0, 0], "dinamico");
        const cercas = esfera("cercas", [0.5, 0, 0], "dinamico");
        const medias = esfera("medias", [3, 0, 0], "dinamico");
        const recorte = elegirCuerpos(mundoDe([lejos, cercas, medias]), 2);
        expect(recorte).toHaveLength(2);
        expect(recorte.some((o) => o.id === "cercas")).toBe(true);
        expect(recorte.some((o) => o.id === "lejos")).toBe(false);
    });

    it("quita los ocultos y respeta cuerposMax 0", () => {
        const oculto = { ...esfera("oculto", [0, 0, 0], "dinamico"), oculto: true };
        expect(elegirCuerpos(mundoDe([esfera("a", [0, 0, 0], "dinamico"), oculto]), 1).map((o) => o.id)).toEqual(["a"]);
        expect(elegirCuerpos(mundoDe([esfera("a", [0, 0, 0], "dinamico")]), 0)).toHaveLength(0);
    });

    it("el recorte del nivel mínimo deja sólo 20 cuerpos en el mundo creado", () => {
        if (!RAPIER) return;
        const objetos: ObjetoMundo[] = [];
        for (let i = 0; i < 30; i++) objetos.push(esfera(`o${i}`, [i * 2, 10, 0], "dinamico"));
        const wf = crearMundoFisico(rap(), mundoDe(objetos), "minima");
        expect(wf.cuerpos.size).toBe(20);
        expect(elegirCuerpos(mundoDe(objetos), 20).some((o) => o.id === "o29")).toBe(false);
    });
});

describe("fisica-rapier · motor (Rapier real)", () => {
    it.skipIf(!hayRapier())("una esfera dinámica cae y se detiene en el suelo", () => {
        const wf = crearMundoFisico(rap(), mundoDe([esfera("bola", [0, 5, 0], "dinamico")]), "media");
        for (let i = 0; i < 120; i++) paso(wf, 1 / 60); // 2 s de simulación (60 Hz en «media»)
        const y = leerPoses(wf).get("bola")?.pos[1] ?? 99;
        expect(y).toBeGreaterThan(0.2); // no atraviesa el suelo
        expect(y).toBeLessThan(1.2); // sí quedó apoyada (radio 0,5)
        for (let i = 0; i < 60; i++) paso(wf, 1 / 60); // 1 s más: ya no se mueve
        expect(Math.abs((leerPoses(wf).get("bola")?.pos[1] ?? 0) - y)).toBeLessThan(0.01);
    });

    it.skipIf(!hayRapier())("gravedad cero no hace caer la esfera", () => {
        const wf = crearMundoFisico(rap(), mundoDe([esfera("bola", [0, 5, 0], "dinamico")], 0), "media");
        for (let i = 0; i < 60; i++) paso(wf, 1 / 60);
        expect(leerPoses(wf).get("bola")?.pos[1]).toBeCloseTo(5, 3);
    });

    it.skipIf(!hayRapier())("aplicarFuerza empuja a un cuerpo dinámico (y no a uno fijo)", () => {
        const objeto = esfera("bola", [0, 1, 0], "dinamico");
        const fija = esfera("fija", [50, 1, 0], "fijo");
        const wf = crearMundoFisico(rap(), mundoDe([objeto, fija], 0, false), "media");
        paso(wf, 1 / 60);
        aplicarFuerza(wf, "bola", [10, 0, 0]);
        for (let i = 0; i < 30; i++) paso(wf, 1 / 60);
        expect(leerPoses(wf).get("bola")?.pos[0]).toBeGreaterThan(1);
        aplicarFuerza(wf, "fija", [1000, 0, 0]);
        for (let i = 0; i < 30; i++) paso(wf, 1 / 60);
        expect(leerPoses(wf).has("fija")).toBe(false); // nunca la movemos: no es dinámica
    });

    it.skipIf(!hayRapier())("teletransportar mueve el cuerpo y lo apaga", () => {
        const wf = crearMundoFisico(rap(), mundoDe([esfera("bola", [0, 5, 0], "dinamico")], 0, false), "media");
        paso(wf, 1 / 60);
        teletransportar(wf, "bola", [5, 2, 0]);
        const pose = leerPoses(wf).get("bola");
        expect(pose?.pos[0]).toBeCloseTo(5, 3);
        expect(pose?.pos[1]).toBeCloseTo(2, 3);
    });

    it.skipIf(!hayRapier())("leerPoses no incluye los cuerpos fijos", () => {
        const objetos = [esfera("fija", [0, 1, 0], "fijo"), esfera("bola", [3, 1, 0], "dinamico")];
        const wf = crearMundoFisico(rap(), mundoDe(objetos), "media");
        const poses = leerPoses(wf);
        expect(poses.has("bola")).toBe(true);
        expect(poses.has("fija")).toBe(false);
        expect(poses.size).toBe(1);
    });

    it.skipIf(!hayRapier())("el paso fijo avanza el número esperado de pasos", () => {
        const wf = crearMundoFisico(rap(), mundoDe([], 0, false), "media"); // 60 Hz
        paso(wf, 1 / 30);
        expect(wf.pasosFotograma).toBe(2);
        expect(wf.pasos).toBe(2);
        paso(wf, 1 / 120); // dt de medio paso: se guarda en el acumulador, no avanza
        expect(wf.pasosFotograma).toBe(0);
        paso(wf, 1 / 120); // el acumulador completes el paso
        expect(wf.pasosFotograma).toBe(1);
        expect(wf.pasos).toBe(3);
    });

    it.skipIf(!hayRapier())("un dt enorme se acota a 4 pasos", () => {
        const wf = crearMundoFisico(rap(), mundoDe([], 0, false), "media");
        paso(wf, 10); // una pestaña dormida o un susto del recolector de basura
        expect(wf.pasosFotograma).toBe(4);
        expect(wf.acumulador).toBeLessThan(1 / 60); // el resto se tiró: no espiral
        expect(wf.pasos).toBe(4);
    });

    it.skipIf(!hayRapier())("los choques quedan en la cola para el motor de reglas", () => {
        const objetos = [caja("caja", [0, 0, 0], [2, 2, 2]), esfera("bola", [0, 3, 0], "dinamico")];
        const wf = crearMundoFisico(rap(), mundoDe(objetos), "media");
        for (let i = 0; i < 90; i++) paso(wf, 1 / 60); // 1,5 s: la bola pisa la caja (borde y=1)
        const choques = tomarChoques(wf);
        tomarChoques(wf);
        expect(choques.some((c) => c.a === "bola" && c.b === "caja" && c.inicio)).toBe(true);
    });
});
