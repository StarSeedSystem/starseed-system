/**
 * StarSeed XR · FÍSICA CON RAPIER (XR1010W · contrato §3 g). `@dimforge/rapier3d-compat` DIRECTO;
 * el motor entra INYECTADO tras `RAPIER.init()`: así se prueba en node con el WASM embebido, sin red
 * ni WebGL. Paso fijo a `PERFILES[nivel].fisica.pasosHz` (tope 4 por fotograma), cuerpos recortados
 * a `cuerposMax` por cercanía al spawn, poses solo de los dinámicos y choques en cola (XR1010U).
 */
import { PERFILES } from "../../../lib/xr/calidad-perfiles";
import type { MundoSpec, ObjetoMundo } from "../../../lib/xr/mundo-tipos";
import type { NivelCalidad, Vec3 } from "../../../lib/xr/tipos";

export type MotorRapier = typeof import("@dimforge/rapier3d-compat");
export type CuerpoRapier = InstanceType<MotorRapier["RigidBody"]>;

export const MAX_PASOS_FOTOGRAMA = 4;
/** Una pose en el mundo: posición y rotación como cuaternión (x, y, z, w). */
export interface PoseCuerpo { pos: Vec3; rot: [number, number, number, number] }
/** Choque tal como lo leerá el motor de reglas: dos ids de objeto y si el contacto empezó. */
export interface EventoChoque { a: string; b: string; inicio: boolean }
export interface MundoFisico {
    /** Avanza el paso fijo (devuelve cuántos pasos dio); poses solo dinámicos; empujón = impulso. */
    paso(dt: number): number;
    leerPoses(): Map<string, PoseCuerpo>;
    aplicarFuerza(id: string, vector: Vec3): void;
    teletransportar(id: string, pos: Vec3): void;
    extraerChoques(): EventoChoque[];
    terminar(): void;
    recortados: number;
}

export interface RecorteCuerpos { cuerpos: ObjetoMundo[]; recortados: number }
/** Los cuerpos que SIMULA este nivel: los fijos siempre; los móviles por cercanía al primer spawn. */
export function seleccionarCuerpos(mundo: MundoSpec, max: number): RecorteCuerpos {
    const spawn = mundo.spawns[0]?.pos ?? [0, 0, 0];
    const d2 = (o: ObjetoMundo) => (o.pos[0] - spawn[0]) ** 2 + (o.pos[1] - spawn[1]) ** 2 + (o.pos[2] - spawn[2]) ** 2;
    const conCuerpo = mundo.objetos.filter((o) => o.cuerpo !== undefined);
    const volando = conCuerpo.filter((o) => o.cuerpo?.tipo !== "fijo");
    const fijos = conCuerpo.filter((o) => o.cuerpo?.tipo === "fijo");
    if (volando.length <= max) return { cuerpos: conCuerpo, recortados: 0 };
    const quedan = new Set(volando.map((o) => ({ o, d: d2(o) })).sort((p, q) => p.d - q.d).slice(0, max).map((x) => x.o.id));
    return { cuerpos: [...fijos, ...volando.filter((o) => quedan.has(o.id))], recortados: volando.length - quedan.size };
}
/** Descritor de colisión según `CuerpoFisico.forma`: caja, esfera, capsula o convexa (cubo de `esc`). */
function dscColision(motor: MotorRapier, o: ObjetoMundo) {
    const [ex, ey, ez] = o.esc; const f = o.cuerpo?.forma ?? "caja";
    const d = f === "esfera" ? motor.ColliderDesc.ball(ex / 2)
        : f === "capsula" ? motor.ColliderDesc.capsule(ey / 2, Math.min(ex, ez) / 2)
        : f === "convexa" ? motor.ColliderDesc.convexHull(esquinas(o))
        : motor.ColliderDesc.cuboid(ex / 2, ey / 2, ez / 2);
    return (d ?? motor.ColliderDesc.cuboid(ex / 2, ey / 2, ez / 2))
        .setActiveEvents(motor.ActiveEvents.COLLISION_EVENTS)
        .setRestitution(o.cuerpo?.rebote ?? 0.2).setFriction(o.cuerpo?.friccion ?? 0.6);
}

/** Los 8 vértices del cubo de `esc` (lo único convexo que promete el vocabulario cerrado). */
function esquinas(o: ObjetoMundo): Float32Array {
    const [ex, ey, ez] = o.esc; const c: number[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) c.push((x * ex) / 2, (y * ey) / 2, (z * ez) / 2);
    return new Float32Array(c);
}
/** Crea el simulacro físico del mundo: gravedad, suelo y un cuerpo por objeto, con la cola de choques. */
export function crearMundoFisico(motor: MotorRapier, mundo: MundoSpec, nivel: NivelCalidad): MundoFisico {
    const perfil = PERFILES[nivel].fisica;
    const { cuerpos, recortados } = seleccionarCuerpos(mundo, perfil.cuerposMax);
    const hs = 1 / perfil.pasosHz;
    const mundoG = new motor.World({ x: 0, y: mundo.fisica.gravedad, z: 0 });
    mundoG.timestep = hs;
    const cola = new motor.EventQueue(true);
    const cuerpoPorId = new Map<string, CuerpoRapier>();
    const idPorManejador = new Map<number, string>();
    if (mundo.fisica.suelo) {
        const t = Math.max(mundo.entorno.tamano, 2);
        const suelo = mundoG.createRigidBody(motor.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
        idPorManejador.set(mundoG.createCollider(motor.ColliderDesc.cuboid(t / 2 + 1, 0.5, t / 2 + 1).setFriction(0.9).setActiveEvents(motor.ActiveEvents.COLLISION_EVENTS), suelo).handle, "suelo");
    }
    for (const o of cuerpos) {
        const c = o.cuerpo;
        if (!c) continue;
        const base = c.tipo === "fijo" ? motor.RigidBodyDesc.fixed() : c.tipo === "cinematico" ? motor.RigidBodyDesc.kinematicPositionBased() : motor.RigidBodyDesc.dynamic();
        const cuerpo = mundoG.createRigidBody(base.setTranslation(o.pos[0], o.pos[1], o.pos[2]));
        idPorManejador.set(mundoG.createCollider(dscColision(motor, o), cuerpo).handle, o.id);
        cuerpoPorId.set(o.id, cuerpo);
    }
    let acumulado = 0;
    /** La cola `autoDrain` se vacía ANTES de cada paso: drenamos tras cada uno a búfer propio. */
    const choquesPendientes: EventoChoque[] = [];
    const sacarChoques = (): void => cola.drainCollisionEvents((h1, h2, inicio) => {
        const a = idPorManejador.get(h1); const b = idPorManejador.get(h2);
        if (a && b) choquesPendientes.push({ a, b, inicio });
    });
    return {
        recortados,
        paso(dt: number): number {
            acumulado += Math.max(0, dt);
            let pasos = 0;
            while (acumulado >= hs && pasos < MAX_PASOS_FOTOGRAMA) { mundoG.step(cola); sacarChoques(); pasos += 1; acumulado -= hs; }
            if (pasos === MAX_PASOS_FOTOGRAMA && acumulado >= hs) acumulado = 0;
            return pasos;
        },
        leerPoses(): Map<string, PoseCuerpo> {
            const poses = new Map<string, PoseCuerpo>();
            for (const [id, c] of cuerpoPorId) {
                if (!c.isDynamic()) continue;
                const p = c.translation(); const r = c.rotation();
                poses.set(id, { pos: [p.x, p.y, p.z], rot: [r.x, r.y, r.z, r.w] });
            }
            return poses;
        },
        aplicarFuerza(id: string, v: Vec3): void {
            const c = cuerpoPorId.get(id);
            if (c?.isDynamic()) c.applyImpulse({ x: v[0], y: v[1], z: v[2] }, true);
        },
        teletransportar(id: string, pos: Vec3): void {
            const c = cuerpoPorId.get(id);
            if (c) c.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true);
            if (c) c.setLinvel({ x: 0, y: 0, z: 0 }, true);
        },
        extraerChoques(): EventoChoque[] { return choquesPendientes.splice(0); },
        terminar(): void { mundoG.free(); },
    };
}
