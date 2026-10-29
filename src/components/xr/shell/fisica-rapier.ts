/**
 * StarSeed XR · FÍSICA RAPIER (§3 g): gravedad, suelo y un cuerpo por `ObjetoMundo` con
 * `CuerpoFisico`, recortado a `PERFILES[nivel].fisica.cuerposMax`; paso fijo (máx. 4 por
 * fotograma), poses de dinámicos y cola de choques (XR1010U). RAPIER se INYECTA ya inicializado
 * (`await RAPIER.init()`): corre en node sin WebGL, sin red, disco ni DOM.
 */
import type * as RAPIER from "@dimforge/rapier3d-compat";
import type { NivelCalidad, Vec3 } from "@/lib/xr/tipos";
import type { MundoSpec, ObjetoMundo } from "@/lib/xr/mundo-tipos";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import { mm } from "@/lib/xr/tipos";
export type ModuloRapier = typeof import("@dimforge/rapier3d-compat");
export type Cuaternion = [number, number, number, number]; export interface PoseCuerpo { pos: Vec3; rot: Cuaternion }
/** Par de ids que empezaron a chocar (`suelo` es el suelo del mundo). */ export interface ChoqueCuerpo { a: string; b: string }
export interface MundoFisico {
    R: ModuloRapier; mundo: RAPIER.World; eventos: RAPIER.EventQueue;
    cuerpos: Map<string, RAPIER.RigidBody>; dinamicos: Set<string>; porCollider: Map<number, string>;
    colaChoques: ChoqueCuerpo[]; acumulador: number; pasoFijo: number; maxPasos: number;
}
/** Cuatro pasos por fotograma como techo: un `dt` enorme no puede encadenar una espiral. */
export const MAX_PASOS = 4;
export function cuaternionDeEuler(rot: Vec3): Cuaternion {
    const [sx, cx, sy, cy, sz, cz] = [Math.sin(rot[0] / 2), Math.cos(rot[0] / 2), Math.sin(rot[1] / 2), Math.cos(rot[1] / 2), Math.sin(rot[2] / 2), Math.cos(rot[2] / 2)];
    return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz];
}
const distancia = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Cuerpos a crear: todos los fijos y, de los móviles, los `cuerposMax` más cercanos al spawn. */
export function seleccionarCuerpos(mundo: MundoSpec, nivel: NivelCalidad): ObjetoMundo[] {
    const max = PERFILES[nivel].fisica.cuerposMax;
    const spawn: Vec3 = mundo.spawns[0]?.pos ?? [0, 0, 0];
    const conCuerpo = mundo.objetos.filter((o) => o.cuerpo !== undefined && o.oculto !== true);
    const fijos = conCuerpo.filter((o) => o.cuerpo?.tipo === "fijo");
    const moviles = conCuerpo.filter((o) => o.cuerpo?.tipo !== "fijo")
        .map((o, i) => ({ o, i, d: distancia(o.pos, spawn) }))
        .sort((p, q) => p.d - q.d || p.i - q.i).slice(0, Math.max(0, max)).map((p) => p.o);
    return [...fijos, ...moviles];
}
function colliderDe(RAPIER: ModuloRapier, o: ObjetoMundo): RAPIER.ColliderDesc | null {
    const e = o.esc.map((v) => Math.max(0.01, v)) as Vec3;
    switch (o.cuerpo?.forma) {
        case "esfera": return RAPIER.ColliderDesc.ball(Math.max(e[0], e[1], e[2]) / 2);
        case "capsula": { const r = Math.max(e[0], e[2]) / 2; return RAPIER.ColliderDesc.capsule(Math.max(0.01, e[1] / 2 - r), r); }
        case "convexa": {
            const [hx, hy, hz] = [e[0] / 2, e[1] / 2, e[2] / 2]; const p: number[] = [];
            for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) p.push(x, y, z);
            return RAPIER.ColliderDesc.convexHull(new Float32Array(p)) ?? RAPIER.ColliderDesc.cuboid(hx, hy, hz);
        }
        default: return RAPIER.ColliderDesc.cuboid(e[0] / 2, e[1] / 2, e[2] / 2);
    }
}
export function crearMundoFisico(RAPIER: ModuloRapier, mundo: MundoSpec, nivel: NivelCalidad): MundoFisico {
    const pasoFijo = 1 / PERFILES[nivel].fisica.pasosHz;
    const fisico = new RAPIER.World({ x: 0, y: mundo.fisica.gravedad, z: 0 });
    fisico.timestep = pasoFijo;
    const mf: MundoFisico = {
        R: RAPIER, mundo: fisico, eventos: new RAPIER.EventQueue(true), cuerpos: new Map(), dinamicos: new Set(),
        porCollider: new Map(), colaChoques: [], acumulador: 0, pasoFijo, maxPasos: MAX_PASOS,
    };
    const eventos = RAPIER.ActiveEvents.COLLISION_EVENTS;
    if (mundo.fisica.suelo) {
        const mitad = Math.max(1, mundo.entorno.tamano / 2);
        const suelo = fisico.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
        const col = fisico.createCollider(RAPIER.ColliderDesc.cuboid(mitad, 0.5, mitad).setFriction(0.9).setActiveEvents(eventos), suelo);
        mf.porCollider.set(col.handle, "suelo");
    }
    for (const o of seleccionarCuerpos(mundo, nivel)) {
        const cuerpo = o.cuerpo; if (!cuerpo) continue;
        const desc = cuerpo.tipo === "dinamico" ? RAPIER.RigidBodyDesc.dynamic() : cuerpo.tipo === "cinematico" ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed();
        const q = cuaternionDeEuler(o.rot);
        desc.setTranslation(o.pos[0], o.pos[1], o.pos[2]).setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] });
        const rb = fisico.createRigidBody(desc);
        const colDesc = colliderDe(RAPIER, o); if (!colDesc) continue;
        colDesc.setRestitution(cuerpo.rebote).setFriction(cuerpo.friccion).setActiveEvents(eventos);
        if (cuerpo.tipo === "dinamico") colDesc.setMass(Math.max(0.01, cuerpo.masa));
        const col = fisico.createCollider(colDesc, rb);
        mf.cuerpos.set(o.id, rb); mf.porCollider.set(col.handle, o.id);
        if (cuerpo.tipo === "dinamico") mf.dinamicos.add(o.id);
    }
    return mf;
}
/** Avanza con paso fijo y devuelve cuántos pasos dio (0…4). Acumula el resto para el siguiente. */
export function paso(mf: MundoFisico, dt: number): number {
    if (!Number.isFinite(dt) || dt <= 0) return 0;
    mf.acumulador = Math.min(mf.acumulador + dt, mf.pasoFijo * mf.maxPasos);
    let dados = 0;
    while (mf.acumulador >= mf.pasoFijo && dados < mf.maxPasos) {
        mf.mundo.step(mf.eventos);
        mf.eventos.drainCollisionEvents((h1, h2, empezó) => {
            const a = mf.porCollider.get(h1); const b = mf.porCollider.get(h2);
            if (empezó && a !== undefined && b !== undefined && a !== b) mf.colaChoques.push({ a, b });
        });
        mf.acumulador -= mf.pasoFijo; dados += 1;
    }
    return dados;
}
export function leerPoses(mf: MundoFisico): Map<string, PoseCuerpo> {
    const poses = new Map<string, PoseCuerpo>();
    for (const id of mf.dinamicos) {
        const rb = mf.cuerpos.get(id); if (!rb) continue;
        const p = rb.translation(); const q = rb.rotation();
        poses.set(id, { pos: [mm(p.x), mm(p.y), mm(p.z)], rot: [mm(q.x), mm(q.y), mm(q.z), mm(q.w)] });
    }
    return poses;
}
/** Impulso en N·s (no fuerza por fotograma: así no depende del `dt`). */
export function aplicarFuerza(mf: MundoFisico, id: string, vector: Vec3): boolean {
    const rb = mf.cuerpos.get(id);
    if (!rb || !mf.dinamicos.has(id)) return false;
    rb.applyImpulse({ x: vector[0], y: vector[1], z: vector[2] }, true);
    return true;
}
export function teletransportar(mf: MundoFisico, id: string, pos: Vec3): boolean {
    const rb = mf.cuerpos.get(id); if (!rb) return false;
    rb.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true);
    if (mf.dinamicos.has(id)) { rb.setLinvel({ x: 0, y: 0, z: 0 }, true); rb.setAngvel({ x: 0, y: 0, z: 0 }, true); }
    return true;
}
/** Vacía y devuelve los choques acumulados desde la última lectura. */
export function leerChoques(mf: MundoFisico): ChoqueCuerpo[] {
    const cola = mf.colaChoques; mf.colaChoques = []; return cola;
}