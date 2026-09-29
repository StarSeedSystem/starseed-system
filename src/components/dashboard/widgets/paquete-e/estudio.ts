"use client";
/**
 * Datos reales del estudio para los widgets de proyectos y rutas (paquete E).
 *
 *  · Proyectos y tareas: tablas `study_projects` / `study_tasks` (RLS por dueño) — las mismas que
 *    el panel «Tareas y proyectos» de /network/education. UNA lectura compartida, caché 5 min.
 *  · Rutas de aprendizaje: `entity_state` (kind user, clave «education:progress»), la misma que
 *    escribe el módulo de Educación: pasos que la persona se pone a sí misma, con su casilla.
 *
 * A diferencia de los listados tolerantes de study.ts (que devuelven [] ante cualquier fallo), aquí
 * un fallo es un fallo: el widget puede decir «no se pudo leer» en vez de «no tienes nada».
 */
import { createClient } from "@/utils/supabase/client";
import { uidActual } from "@/lib/consumo/usuario";
import { leerAvisoConsumo, mensajePausa } from "@/lib/consumo/guardian";
import { frenoActivo } from "@/lib/consumo/freno";
import { getEntityStateChecked } from "@/lib/sync/entity-state";
import type { StudyProject, StudyTask, ProjectStatus } from "@/lib/education/study";
import type { LearningStep } from "@/lib/education/progress";
import { normalizarE } from "./lanzador";

export type { StudyProject, StudyTask, ProjectStatus, LearningStep };

/** Mensaje honesto si la nube está en pausa por consumo (corte, freno remoto o día agotado). */
export function pausaServidorE(): string | null {
    try {
        const a = leerAvisoConsumo();
        if (a.corte) return mensajePausa("corte", a.corteHasta);
        if (a.diaAgotado) return mensajePausa("dia", null);
        if (frenoActivo()) return mensajePausa("freno-remoto", null);
    } catch { /* sin guardián (SSR/pruebas) */ }
    return null;
}

export interface DatosEstudio {
    sesion: boolean;
    proyectos: StudyProject[];
    tareas: StudyTask[];
}

export async function cargarEstudio(): Promise<DatosEstudio> {
    const uid = await uidActual();
    if (!uid) return { sesion: false, proyectos: [], tareas: [] };
    const sb = createClient();
    const [p, t] = await Promise.all([
        sb.from("study_projects").select("*").order("updated_at", { ascending: false }).limit(40),
        sb.from("study_tasks").select("*").order("created_at", { ascending: false }).limit(150),
    ]);
    if (p.error) throw new Error(p.error.message || "No se pudieron leer tus proyectos");
    if (t.error) throw new Error(t.error.message || "No se pudieron leer tus tareas");
    const proyectos = ((p.data ?? []) as StudyProject[]).map((x) => ({ ...x, links: Array.isArray(x.links) ? x.links : [] }));
    return { sesion: true, proyectos, tareas: (t.data ?? []) as StudyTask[] };
}

export interface ProgresoProyecto {
    hechas: number;
    total: number;
    /** 0-1, o null si no hay tareas vinculadas (no se inventa un 0 %). */
    pct: number | null;
    siguiente: StudyTask | null;
    pendientes: StudyTask[];
}

/** Progreso de un proyecto por las tareas de su mismo tema (como las vincula el panel de Educación). */
export function progresoProyecto(p: Pick<StudyProject, "topic" | "status">, tareas: readonly StudyTask[]): ProgresoProyecto {
    const clave = normalizarE(p.topic ?? "");
    const propias = clave ? tareas.filter((t) => normalizarE(t.topic ?? "") === clave) : [];
    const hechas = propias.filter((t) => t.done).length;
    const pendientes = propias
        .filter((t) => !t.done)
        .sort((a, b) => {
            const da = a.due_at ? Date.parse(a.due_at) : Infinity;
            const db = b.due_at ? Date.parse(b.due_at) : Infinity;
            return da - db || Date.parse(a.created_at) - Date.parse(b.created_at);
        });
    const pct = p.status === "hecho" ? 1 : propias.length ? hechas / propias.length : null;
    return { hechas, total: propias.length, pct, siguiente: pendientes[0] ?? null, pendientes };
}

const ORDEN_ESTADO: Record<ProjectStatus, number> = { activo: 0, idea: 1, pausado: 2, hecho: 3 };

export function ordenarProyectos(lista: readonly StudyProject[]): StudyProject[] {
    return [...lista].sort((a, b) => ORDEN_ESTADO[a.status] - ORDEN_ESTADO[b.status] || Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at));
}

export const ETIQUETA_ESTADO: Record<ProjectStatus, string> = { activo: "Activo", idea: "Idea", pausado: "En pausa", hecho: "Hecho" };
export const COLOR_ESTADO: Record<ProjectStatus, string> = { activo: "#39ff14", idea: "#7c5cff", pausado: "#ffbf00", hecho: "#23d5ab" };

// ── Rutas de aprendizaje ──────────────────────────────────────────────

export const CLAVE_PROGRESO = "education:progress";

export interface DatosRutas {
    sesion: boolean;
    rutas: Record<string, LearningStep[]>;
}

export async function cargarRutas(): Promise<DatosRutas> {
    const uid = await uidActual();
    if (!uid) return { sesion: false, rutas: {} };
    const r = await getEntityStateChecked<Record<string, LearningStep[]>>({ kind: "user", id: uid }, CLAVE_PROGRESO);
    if (r.error) throw new Error(r.error);
    const v = r.row?.value;
    const rutas: Record<string, LearningStep[]> = {};
    if (v && typeof v === "object") {
        for (const [k, pasos] of Object.entries(v)) {
            if (Array.isArray(pasos)) rutas[k] = pasos.filter((s): s is LearningStep => !!s && typeof s.id === "string" && typeof s.title === "string");
        }
    }
    return { sesion: true, rutas };
}

export interface ResumenRuta {
    tema: string;
    pasos: LearningStep[];
    hechos: number;
    pct: number;
    siguiente: LearningStep | null;
}

/** Rutas con pasos, las empezadas y no terminadas primero; luego las nuevas; al final las completas. */
export function resumirRutas(rutas: Record<string, LearningStep[]>): ResumenRuta[] {
    return Object.entries(rutas)
        .filter(([, pasos]) => pasos.length > 0)
        .map(([tema, pasos]) => {
            const hechos = pasos.filter((s) => s.done).length;
            return { tema, pasos, hechos, pct: hechos / pasos.length, siguiente: pasos.find((s) => !s.done) ?? null };
        })
        .sort((a, b) => {
            const grupo = (x: ResumenRuta) => (x.pct >= 1 ? 2 : x.hechos > 0 ? 0 : 1);
            return grupo(a) - grupo(b) || b.pct - a.pct || a.tema.localeCompare(b.tema);
        });
}

/** Nombre legible de un tema: el del catálogo si lo conocemos; si no, el id sin prefijo ni guiones. */
export function nombreTema(id: string, catalogo: Map<string, { name: string }>): string {
    const n = catalogo.get(id)?.name;
    if (n) return n;
    const limpio = id.replace(/^(cat|top|sub|ext|user)-/, "").replace(/[-_]+/g, " ").trim();
    return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : id;
}
