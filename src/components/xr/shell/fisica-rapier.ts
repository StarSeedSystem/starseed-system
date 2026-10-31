/* StarSeed XR · FÍSICA CON RAPIER (XR1010W · contrato §3 g). Rapier DIRECTO (compat), inyectado ya inicializado
   para probar en node sin red ni visor. Recorta al tope del nivel, avanza a paso fijo y deja los choques en cola. */
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import type { NivelCalidad, Vec3 } from "@/lib/xr/tipos";
import type { CuerpoFisico, MundoSpec, ObjetoMundo } from "@/lib/xr/mundo-tipos";
import type { ColliderDesc, EventQueue, RigidBody, World } from "@dimforge/rapier3d-compat";
export type Rapier = typeof import("@dimforge/rapier3d-compat");
export interface PoseCuerpo { pos: Vec3; rot: [number, number, number, number] }
export interface ChoqueCuerpos { a: string; b: string }
export const PASOS_MAX_FOTOGRAMA = 4;
const EPS = 1e-6;
export interface MundoFisico {
    mundo: World; eventos: EventQueue; cuerpos: Map<string, RigidBody>; dinamicos: Set<string>;
    idsPorCollider: Map<number, string>; choques: ChoqueCuerpos[];
    pasosHz: number; dtFijo: number; acumulador: number; pasos: number;
}
function cuaternion(rot: Vec3): [number, number, number, number] {
    const [x, y, z] = rot, cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
    return [sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz];
}
const distanciaAlSpawn = (o: ObjetoMundo, s: Vec3): number => (o.pos[0] - s[0]) ** 2 + (o.pos[1] - s[1]) ** 2 + (o.pos[2] - s[2]) ** 2;
function formaDe(RAPIER: Rapier, c: CuerpoFisico, esc: Vec3): ColliderDesc {
    const [sx, sy, sz] = esc.map((v) => Math.max(0.01, Math.abs(v))) as Vec3;
    if (c.forma === "esfera") return RAPIER.ColliderDesc.ball(Math.max(sx, sy, sz) / 2);
    if (c.forma === "capsula") return RAPIER.ColliderDesc.capsule(Math.max(0.01, sy / 2 - Math.max(sx, sz) / 2), Math.max(sx, sz) / 2);
    if (c.forma === "convexa") {
        const puntos: number[] = [];
        for (const x of [-sx / 2, sx / 2]) for (const y of [-sy / 2, sy / 2]) for (const z of [-sz / 2, sz / 2]) puntos.push(x, y, z);
        return RAPIER.ColliderDesc.convexHull(new Float32Array(puntos)) ?? RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2);
    }
    return RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2);
}
function descCuerpo(RAPIER: Rapier, c: CuerpoFisico, o: ObjetoMundo) {
    const desc = c.tipo === "dinamico" ? RAPIER.RigidBodyDesc.dynamic() : c.tipo === "cinematico" ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed();
    const [x, y, z, w] = cuaternion(o.rot);
    return desc.setTranslation(o.pos[0], o.pos[1], o.pos[2]).setRotation({ x, y, z, w });
}
export function crearMundoFisico(RAPIER: Rapier, mundo: MundoSpec, nivel: NivelCalidad): MundoFisico {
    const perfil = PERFILES[nivel];
    const fisico = new RAPIER.World({ x: 0, y: mundo.fisica.gravedad, z: 0 });
    const eventos = new RAPIER.EventQueue(true), dtFijo = 1 / perfil.fisica.pasosHz;
    fisico.timestep = dtFijo;
    const mf: MundoFisico = {
        mundo: fisico, eventos, cuerpos: new Map(), dinamicos: new Set(), idsPorCollider: new Map(),
        choques: [], pasosHz: perfil.fisica.pasosHz, dtFijo, acumulador: 0, pasos: 0,
    };
    if (mundo.fisica.suelo) {
        const suelo = fisico.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
        fisico.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setFriction(1), suelo);
    }
    const spawn = mundo.spawns[0]?.pos ?? ([0, 0, 0] as Vec3), candidatos = mundo.objetos.filter((o) => o.cuerpo && o.oculto !== true)
        .sort((a, b) => distanciaAlSpawn(a, spawn) - distanciaAlSpawn(b, spawn))
        .slice(0, perfil.fisica.cuerposMax);
    for (const o of candidatos) {
        const c = o.cuerpo as CuerpoFisico;
        const cuerpo = fisico.createRigidBody(descCuerpo(RAPIER, c, o));
        let col = formaDe(RAPIER, c, o.esc).setRestitution(c.rebote).setFriction(c.friccion)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        if (c.tipo !== "fijo") col = col.setMass(c.masa);
        const collider = fisico.createCollider(col, cuerpo);
        mf.cuerpos.set(o.id, cuerpo);
        mf.idsPorCollider.set(collider.handle, o.id);
        if (c.tipo === "dinamico") mf.dinamicos.add(o.id);
    }
    return mf;
}
function anotarChoques(mf: MundoFisico): void {
    mf.eventos.drainCollisionEvents((h1, h2, empezo) => {
        if (!empezo) return;
        const a = mf.idsPorCollider.get(h1), b = mf.idsPorCollider.get(h2);
        if (a && b) mf.choques.push({ a, b });
    });
}
export function paso(mf: MundoFisico, dt: number): number {
    if (!Number.isFinite(dt) || dt <= 0) return 0;
    mf.acumulador = Math.min(mf.acumulador + dt, mf.dtFijo * PASOS_MAX_FOTOGRAMA);
    let hechos = 0;
    while (mf.acumulador + EPS >= mf.dtFijo && hechos < PASOS_MAX_FOTOGRAMA) {
        mf.mundo.timestep = mf.dtFijo;
        mf.mundo.step(mf.eventos);
        anotarChoques(mf);
        mf.acumulador -= mf.dtFijo;
        hechos += 1;
        mf.pasos += 1;
    }
    if (hechos === PASOS_MAX_FOTOGRAMA) mf.acumulador = 0;
    return hechos;
}
export function leerPoses(mf: MundoFisico): Map<string, PoseCuerpo> {
    const salida = new Map<string, PoseCuerpo>();
    for (const id of mf.dinamicos) {
        const cuerpo = mf.cuerpos.get(id);
        if (!cuerpo) continue;
        const t = cuerpo.translation(), r = cuerpo.rotation();
        salida.set(id, { pos: [t.x, t.y, t.z], rot: [r.x, r.y, r.z, r.w] });
    }
    return salida;
}
export function aplicarFuerza(mf: MundoFisico, id: string, vector: Vec3): boolean {
    const cuerpo = mf.cuerpos.get(id);
    if (!cuerpo || !mf.dinamicos.has(id)) return false;
    cuerpo.applyImpulse({ x: vector[0], y: vector[1], z: vector[2] }, true);
    return true;
}
export function teletransportar(mf: MundoFisico, id: string, pos: Vec3): boolean {
    const cuerpo = mf.cuerpos.get(id);
    if (!cuerpo) return false;
    cuerpo.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true);
    return true;
}
export function leerChoques(mf: MundoFisico): ChoqueCuerpos[] {
    const salida = mf.choques;
    mf.choques = [];
    return salida;
}
export function liberarMundo(mf: MundoFisico | null): void {
    if (!mf) return;
    try { mf.eventos.free(); } catch { /* ya liberado */ }
    try { mf.mundo.free(); } catch { /* ya liberado */ }
}
