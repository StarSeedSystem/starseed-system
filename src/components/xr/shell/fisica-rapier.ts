/**
 * StarSeed XR · FÍSICA DE MUNDOS con Rapier directo (contrato §3 g, `@dimforge/rapier3d-compat`).
 * Sin envoltorio de React. RAPIER llega INYECTADO tras `await RAPIER.init()` (lo hace `use-fisica.ts`),
 * así el módulo se prueba en node. Simulación LOCAL CON AUTORIDAD: la corren el anfitrión
 * (XR1010AC elige el menor id) y publica `pose-cuerpos` a 10 Hz; los demás interpolan. Paso FIJO
 * a `pasosHz` del perfil, tope de 4 pasos por fotograma. Los choques van a cola (XR1010U).
 */
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import type { MundoSpec, ObjetoMundo } from "@/lib/xr/mundo-tipos";
import type { NivelCalidad, Vec3 } from "@/lib/xr/tipos";

type V = { x: number; y: number; z: number };

/** Los tipos que la física usa de Rapier, estructurales: Rapier se inyecta, no se importa. */
export interface Rapier {
    World: new (gravedad: V) => MundoRapier;
    EventQueue: new (autodrenaje: boolean) => ColaChoques;
    RigidBodyDesc: { fixed(): CuerpoDesc; dynamic(): CuerpoDesc; kinematicPositionBased(): CuerpoDesc };
    ColliderDesc: { ball(r: number): ColDesc; capsule(h: number, r: number): ColDesc; cuboid(hx: number, hy: number, hz: number): ColDesc };
}
export type ColaChoques = { drainCollisionEvents(f: (h1: number, h2: number, inicio: boolean) => void): void };
export type ColDesc = { setFriction(f: number): ColDesc; setRestitution(r: number): ColDesc; setMass(m: number): ColDesc };
export type CuerpoDesc = { setTranslation(x: number, y: number, z: number): CuerpoDesc; setLinearDamping(d: number): CuerpoDesc };
export type CuerpoRapier = {
    translation(): V;
    rotation(): { x: number; y: number; z: number; w: number };
    setTranslation(t: V, despertar: boolean): void; setLinvel(v: V, despertar: boolean): void;
    setNextKinematicTranslation(t: V): void; applyImpulse(f: V, despertar: boolean): void;
};
export type MundoRapier = {
    timestep: number;
    step(cola?: ColaChoques): void;
    createRigidBody(desc: CuerpoDesc): CuerpoRapier;
    createCollider(desc: ColDesc, cuerpo?: CuerpoRapier): { handle: number };
    free(): void;
};
export type PosesCuerpos = Map<string, { pos: Vec3; rot: [number, number, number, number] }>;

/** Choque de dos objetos de mundo (el suelo no cuenta: no lleva id). */
export interface EventoChoque { readonly a: string; readonly b: string; readonly inicio: boolean }

export interface MundoFisico {
    mundo: MundoRapier; // instancia de Rapier: quien integre (EscenaOS) añade aquí cuerpos extra
    cuerpos: Map<string, CuerpoRapier>; // id de objeto → cuerpo rígido
    dinamico: Set<string>; // ids de cuerpos DINÁMICOS: los únicos que simulan y publican pose
    cinematico: Set<string>; // ids de cuerpos CINEMÁTICOS: los mueve la escena con `teletransportar`
    manejadores: Map<number, string>; // manejador de colisión de Rapier → id, para filtrar choques
    acumulador: number; // dt pendiente del paso fijo
    pasosHz: number;
    pasos: number; // pasos fijos ejecutados en total desde la creación
    pasosFotograma: number; // pasos del último `paso()` (4 como mucho)
    eventos: EventoChoque[]; // choques pendientes de leer con `tomarChoques`
    cola: ColaChoques;
}

/** Objetos con cuerpo, recortados a `cuerposMax` del nivel (los más cercanos al spawn primero). */
export function elegirCuerpos(mundo: MundoSpec, cuerposMax: number): ObjetoMundo[] {
    const spawn = mundo.spawns[0]?.pos;
    const dista = (o: ObjetoMundo): number =>
        Math.hypot(o.pos[0] - (spawn?.[0] ?? 0), o.pos[1] - (spawn?.[1] ?? 0), o.pos[2] - (spawn?.[2] ?? 0));
    return [...mundo.objetos.filter((o) => o.cuerpo && !o.oculto)]
        .sort((a, b) => dista(a) - dista(b))
        .slice(0, Math.max(0, cuerposMax));
}

export function crearMundoFisico(RAPIER: Rapier, mundoSpec: MundoSpec, nivel: NivelCalidad): MundoFisico {
    const { pasosHz, cuerposMax } = PERFILES[nivel].fisica;
    const m = new RAPIER.World({ x: 0, y: mundoSpec.fisica.gravedad, z: 0 });
    m.timestep = 1 / pasosHz;
    const wf: MundoFisico = {
        mundo: m, cuerpos: new Map(), dinamico: new Set(), cinematico: new Set(), manejadores: new Map(),
        acumulador: 0, pasosHz, pasos: 0, pasosFotograma: 0, eventos: [], cola: new RAPIER.EventQueue(true),
    };
    if (mundoSpec.fisica.suelo) crearSuelo(RAPIER, wf, Math.max(1, mundoSpec.entorno.tamano));
    for (const o of elegirCuerpos(mundoSpec, cuerposMax)) crearCuerpo(RAPIER, wf, o);
    return wf;
}

function crearSuelo(RAPIER: Rapier, wf: MundoFisico, t: number): void {
    const cuerpo = wf.mundo.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    wf.mundo.createCollider(RAPIER.ColliderDesc.cuboid(t, 0.5, t).setFriction(1), cuerpo);
}

function crearCuerpo(RAPIER: Rapier, wf: MundoFisico, o: ObjetoMundo): void {
    const c = o.cuerpo!;
    const [ex, ey, ez] = o.esc.map((v) => Math.max(0.01, v / 2));
    let desc: ColDesc;
    if (c.forma === "esfera") desc = RAPIER.ColliderDesc.ball(Math.min(ex, ey, ez));
    else if (c.forma === "capsula") desc = RAPIER.ColliderDesc.capsule(ey, Math.min(ex, ez));
    else desc = RAPIER.ColliderDesc.cuboid(ex, ey, ez); // caja exacta; «convexa» sin vértices, su envolvente
    desc.setFriction(c.friccion).setRestitution(c.rebote);
    if (c.tipo === "dinamico") desc.setMass(Math.max(0.1, c.masa));
    let cuerpo: CuerpoDesc;
    if (c.tipo === "cinematico") cuerpo = RAPIER.RigidBodyDesc.kinematicPositionBased();
    else if (c.tipo === "fijo") cuerpo = RAPIER.RigidBodyDesc.fixed();
    else cuerpo = RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.2); // que se asiente sin bailar
    cuerpo.setTranslation(o.pos[0], o.pos[1], o.pos[2]);
    const rb = wf.mundo.createRigidBody(cuerpo);
    wf.manejadores.set(wf.mundo.createCollider(desc, rb).handle, o.id);
    wf.cuerpos.set(o.id, rb);
    if (c.tipo === "dinamico") wf.dinamico.add(o.id);
    else if (c.tipo === "cinematico") wf.cinematico.add(o.id);
}

export function paso(wf: MundoFisico, dt: number): void {
    wf.pasosFotograma = 0;
    if (!Number.isFinite(dt) || dt <= 0) return;
    const h = 1 / wf.pasosHz;
    // El acumulador se limita a 4 pasos: un salto de fotograma consume 4 y tira el resto,
    // así la simulación no entra en espiral de «más dt → más pasos → más dt».
    wf.acumulador = Math.min(wf.acumulador + dt, 4 * h);
    let pasos = 0;
    while (wf.acumulador >= h && pasos < 4) {
        wf.mundo.step(wf.cola);
        wf.acumulador -= h;
        pasos++;
        drenarChoques(wf);
    }
    wf.pasosFotograma = pasos;
    wf.pasos += pasos;
}

function drenarChoques(wf: MundoFisico): void {
    if (!wf.cola) return;
    wf.cola.drainCollisionEvents((h1, h2, inicio) => {
        // Sólo pares con DOS objetos de mundo: el suelo no genera `al-chocar`.
        const a = wf.manejadores.get(h1), b = wf.manejadores.get(h2);
        if (a && b && wf.eventos.length < 64) wf.eventos.push({ a, b, inicio });
    });
}

export function tomarChoques(wf: MundoFisico): EventoChoque[] {
    const tomados = wf.eventos;
    wf.eventos = [];
    return tomados;
}

export function leerPoses(wf: MundoFisico): PosesCuerpos {
    const poses: PosesCuerpos = new Map();
    for (const id of wf.dinamico) {
        const rb = wf.cuerpos.get(id);
        if (!rb) continue;
        const t = rb.translation(), r = rb.rotation();
        poses.set(id, { pos: [t.x, t.y, t.z], rot: [r.x, r.y, r.z, r.w] });
    }
    return poses;
}

export function aplicarFuerza(wf: MundoFisico, id: string, vector: Vec3): void {
    const rb = wf.cuerpos.get(id);
    if (rb && wf.dinamico.has(id)) rb.applyImpulse({ x: vector[0], y: vector[1], z: vector[2] }, true);
}

export function teletransportar(wf: MundoFisico, id: string, pos: Vec3): void {
    const rb = wf.cuerpos.get(id);
    if (!rb) return;
    const t = { x: pos[0], y: pos[1], z: pos[2] };
    if (wf.dinamico.has(id)) {
        rb.setTranslation(t, true);
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    } else if (wf.cinematico.has(id)) rb.setNextKinematicTranslation(t);
}
