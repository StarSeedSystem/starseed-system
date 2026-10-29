/**
 * StarSeed XR · pruebas de la física (XR1010W). Node, sin red ni WebGL: el WASM del `compat`
 * va embebido y carga; si no carga, `skipIf` salta las reales y quedan las puras.
 */
import { describe, expect, it } from "vitest";
import { crearMundoFisico, MAX_PASOS_FOTOGRAMA, seleccionarCuerpos, type MotorRapier } from "../fisica-rapier";
import { codificarPoses, decodificarPoses, interpolarPoses, type PosesRecibidas } from "../use-fisica";
import type { CuerpoFisico, MundoSpec, ObjetoMundo } from "@/lib/xr/mundo-tipos";
import type { Vec3 } from "@/lib/xr/tipos";

let motor: MotorRapier | null = null;
try {
    motor = await import("@dimforge/rapier3d-compat");
    await motor.init();
} catch {
    motor = null;
}
const conRapier = it.skipIf(motor === null);
const cuerpo = (tipo: CuerpoFisico["tipo"], forma: CuerpoFisico["forma"] = "esfera"): CuerpoFisico =>
    ({ tipo, forma, masa: 1, rebote: 0, friccion: 0.5, agarrable: false });
const obj = (id: string, pos: Vec3, c: CuerpoFisico, esc: Vec3 = [1, 1, 1]): ObjetoMundo =>
    ({ id, nombre: id, fuente: { tipo: "primitiva", forma: "esfera" }, pos, rot: [0, 0, 0], esc, color: "#ffffff", prioridad: 1, cuerpo: c });
const mundoCon = (objetos: ObjetoMundo[], fisica: { gravedad: number; suelo: boolean } = { gravedad: -9.81, suelo: true }): MundoSpec =>
    ({
        version: 1, tipo: "mundo-xr", nombre: "prueba", modo: "ambos",
        entorno: { cielo: "estudio", terreno: "plano", tamano: 40, colorSuelo: "#1c1b2e", semilla: 1, alturaMax: 2 },
        fisica, interaccion: { tocar: "observador", agarrar: "editor" },
        maxJugadores: 4, spawns: [], luces: [], objetos, portales: [], zonas: [], pizarras: [], pantallas: [], reglas: [],
    });
/** Avanza `segundos` de simulación a 20 fotogramas por segundo. */
const simular = (m: ReturnType<typeof crearMundoFisico>, segundos: number): void => {
    for (let i = 0; i < Math.ceil(segundos * 20); i += 1) m.paso(1 / 20);
};
const real = crearMundoFisico.bind(null, motor! as MotorRapier);
describe("física con Rapier real (node)", () => {
    conRapier("una esfera dinámica cae y se detiene en el suelo", () => {
        const m = real(mundoCon([obj("pelota", [0, 3, 0], cuerpo("dinamico"))]), "media");
        simular(m, 3);
        const pose = m.leerPoses().get("pelota")!;
        expect(Math.abs(pose.pos[1] - 0.5)).toBeLessThan(0.05);
    });
    conRapier("gravedad cero: no cae", () => {
        const m = real(mundoCon([obj("flotante", [0, 3, 0], cuerpo("dinamico"))], { gravedad: 0, suelo: true }), "media");
        simular(m, 2);
        expect(m.leerPoses().get("flotante")!.pos[1]).toBeGreaterThan(2.9);
    });
    conRapier("leerPoses no incluye a los cuerpos fijos", () => {
        const m = real(mundoCon([obj("columna", [2, 1, 2], cuerpo("fijo", "caja")), obj("pelota", [0, 3, 0], cuerpo("dinamico"))]), "media");
        const ids = [...m.leerPoses().keys()];
        expect(ids).toContain("pelota");
        expect(ids).not.toContain("columna");
    });
    conRapier("al-chocar entra en la cola (esfera contra el suelo)", () => {
        const m = real(mundoCon([obj("pelota", [0, 0.6, 0], cuerpo("dinamico"))]), "media");
        let choques = m.extraerChoques();
        for (let i = 0; i < 120 && choques.length === 0; i += 1) { m.paso(1 / 30); choques = m.extraerChoques(); }
        expect(choques.some((c) => (c.a === "pelota" && c.b === "suelo") || (c.a === "suelo" && c.b === "pelota"))).toBe(true);
    });
    conRapier("teletransportar y aplicarFuerza llegan a la pose", () => {
        const m = real(mundoCon([obj("pelota", [0, 3, 0], cuerpo("dinamico"))], { gravedad: 0, suelo: false }), "media");
        m.teletransportar("pelota", [5, 5, 5]);
        expect(m.leerPoses().get("pelota")!.pos).toEqual([5, 5, 5]);
        m.aplicarFuerza("pelota", [100, 0, 0]);
        m.paso(0.1);
        expect(m.leerPoses().get("pelota")!.pos[0]).toBeGreaterThan(0.01);
    });
    conRapier("las cuatro formas crean cuerpo sin quebrar", () => {
        const formas = ["caja", "esfera", "capsula", "convexa"] as const;
        const m = real(mundoCon(formas.map((f, i) => obj(`o${i}`, [i, 2, 0], cuerpo("dinamico", f)))), "media");
        simular(m, 1);
        expect([...m.leerPoses().keys()].sort()).toEqual(["o0", "o1", "o2", "o3"]);
    });
});

describe("recorte por nivel", () => {
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
});

describe("paso fijo (motor falso) y poses por el canal (puras)", () => {
    let pasos = 0;
    const falso = {
        World: class { gravity: unknown; timestep = 0; paso = 0; constructor(g: unknown) { this.gravity = g; } step() { pasos += 1; this.paso += 1; } },
        EventQueue: class { constructor(_auto: boolean) {} drainCollisionEvents(_cb: unknown) {} },
    } as unknown as MotorRapier;
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


