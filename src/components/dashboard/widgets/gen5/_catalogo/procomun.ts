"use client";
/**
 * El procomún de la red (Ola 0929-C): los RECURSOS COMUNES reales del Área Política
 * (`src/lib/governance/political.ts`: entity_state «gov:resources», con espejo local).
 *
 * Una lectura compartida entre widgets (Trueque, Energía…) cada 10 min como mucho y solo a
 * la vista; las acciones (usar, devolver, ofrecer) escriben con las MISMAS funciones del panel
 * de Recursos comunes y refrescan la lista compartida sin esperar a que caduque.
 */
import { uidActual } from "@/lib/consumo/usuario";
import { obtenerCompartido, useCompartido, type EstadoCompartido } from "./recurso";

export type EstadoRecurso = "Disponible" | "En uso" | "Mantenimiento";

export interface Recurso {
    id: string;
    nombre: string;
    tipo: string;
    estado: EstadoRecurso;
    asignadoA: string | null;
    asignadoNombre: string | null;
    actualizado: string;
    /** La fila tal cual vino (para no perder campos como `notes` al escribir). */
    crudo: Record<string, unknown>;
}

export const TIPOS_RECURSO = ["Herramienta", "Espacio", "Conocimiento", "Energía", "Semilla 3D"] as const;
export const TTL_PROCOMUN_MS = 10 * 60_000;
const CLAVE = "procomun:red";

let modulo: Promise<typeof import("@/lib/governance/political")> | null = null;
/** El módulo del Área Política pesa: se carga una sola vez y solo cuando hace falta. */
export const politica = () => (modulo ??= import("@/lib/governance/political"));

const ESTADOS: EstadoRecurso[] = ["Disponible", "En uso", "Mantenimiento"];

export function normalizarRecursos(v: unknown): Recurso[] {
    return (Array.isArray(v) ? v : [])
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string" && typeof (r as { name?: unknown }).name === "string")
        .map((r) => ({
            id: String(r.id),
            nombre: String(r.name).trim() || "Recurso sin nombre",
            tipo: typeof r.type === "string" && r.type.trim() ? r.type : "Recurso",
            estado: ESTADOS.includes(r.status as EstadoRecurso) ? (r.status as EstadoRecurso) : "Disponible",
            asignadoA: typeof r.assignedTo === "string" && r.assignedTo ? r.assignedTo : null,
            asignadoNombre: typeof r.assignedLabel === "string" && r.assignedLabel ? r.assignedLabel : null,
            actualizado: typeof r.updatedAt === "string" ? r.updatedAt : "",
            crudo: r,
        }));
}

export interface Procomun { recursos: Recurso[]; local: boolean }

async function cargar(): Promise<Procomun> {
    const m = await politica();
    const r = await m.loadCommonsResources();
    return { recursos: normalizarRecursos(r.list), local: r.degraded };
}

export function useProcomun(activo: boolean): EstadoCompartido<Procomun> {
    return useCompartido<Procomun>(CLAVE, TTL_PROCOMUN_MS, cargar, activo, { persistir: false });
}

/** Tras una acción del usuario: vuelve a leer ya (sin esperar a la caducidad) y avisa a todos. */
export async function refrescarProcomun(): Promise<void> {
    await obtenerCompartido<Procomun>(CLAVE, TTL_PROCOMUN_MS, cargar, { forzar: true, persistir: false });
}

export type ResultadoAccion = { ok: true; local: boolean } | { ok: false; error: string };

function aCommons(r: Recurso) {
    const { updatedAt: _fecha, ...resto } = r.crudo;
    return { ...resto, id: r.id, name: r.nombre, type: r.tipo, status: r.estado, assignedTo: r.asignadoA, assignedLabel: r.asignadoNombre };
}

/** Usar un recurso libre: queda «En uso» a tu nombre. */
export async function usarRecurso(r: Recurso): Promise<ResultadoAccion> {
    const uid = await uidActual().catch(() => null);
    if (!uid) return { ok: false, error: "Inicia sesión para usar un recurso del procomún." };
    const m = await politica();
    const nombre = await m.labelForUser(uid);
    const res = await m.upsertCommonsResource({ ...aCommons(r), assignedTo: uid, assignedLabel: nombre, status: "En uso" });
    await refrescarProcomun().catch(() => undefined);
    return res.ok ? { ok: true, local: res.degraded } : { ok: false, error: "No se pudo guardar." };
}

/** Devolverlo al procomún: vuelve a estar libre. */
export async function devolverRecurso(r: Recurso): Promise<ResultadoAccion> {
    const m = await politica();
    const res = await m.upsertCommonsResource({ ...aCommons(r), assignedTo: null, assignedLabel: null, status: "Disponible" });
    await refrescarProcomun().catch(() => undefined);
    return res.ok ? { ok: true, local: res.degraded } : { ok: false, error: "No se pudo guardar." };
}

/** Ofrecer algo tuyo al procomún. */
export async function ofrecerRecurso(nombre: string, tipo: string): Promise<ResultadoAccion> {
    const limpio = nombre.trim().slice(0, 80);
    if (!limpio) return { ok: false, error: "Ponle un nombre a lo que ofreces." };
    const m = await politica();
    const id = `res_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const res = await m.upsertCommonsResource({ id, name: limpio, type: tipo, status: "Disponible" });
    await refrescarProcomun().catch(() => undefined);
    return res.ok ? { ok: true, local: res.degraded } : { ok: false, error: "No se pudo guardar." };
}

/** Orden útil: lo que tienes tú (para devolver), lo libre, lo prestado a otros, lo que se repara. */
export function ordenarRecursos(rs: Recurso[], uid: string | null): Recurso[] {
    const peso = (r: Recurso) => (uid && r.asignadoA === uid && r.estado === "En uso" ? 0 : r.estado === "Disponible" ? 1 : r.estado === "En uso" ? 2 : 3);
    return [...rs].sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, "es"));
}
