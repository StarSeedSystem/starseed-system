"use client";

/*
 * progress — Ruta de aprendizaje PERSONAL por tema (Módulo Educación).
 * ---------------------------------------------------------------------------
 * Cada tema (builtin o extensión propia) puede tener una lista ORDENADA de
 * pasos que la propia persona define para sí misma, con checkbox de progreso.
 * Persistido en su ámbito (entity_state kind="user") — honesto y simple: no
 * inventamos contenido de relleno, la persona añade sus propios pasos. Los
 * recursos REALES ya vinculados al tema por `tags` (cursos/artículos) se
 * muestran aparte, de sólo lectura, vía `contentForNode` en curriculum.ts.
 */

import { getEntityState, setEntityState, currentUserRef } from "@/lib/sync/entity-state";

export interface LearningStep {
    id: string;
    title: string;
    done: boolean;
    createdAt: string;
}

type ProgressMap = Record<string, LearningStep[]>;

const KEY = "education:progress";

async function loadAll(): Promise<ProgressMap> {
    const ref = await currentUserRef();
    if (!ref) return {};
    const row = await getEntityState<ProgressMap>(ref, KEY);
    return row?.value && typeof row.value === "object" ? (row.value as ProgressMap) : {};
}

async function saveAll(all: ProgressMap): Promise<boolean> {
    const ref = await currentUserRef();
    if (!ref) return false;
    const saved = await setEntityState<ProgressMap>(ref, KEY, all);
    return !!saved;
}

/** Pasos de la ruta de aprendizaje de un tema para la persona autenticada. [] sin sesión. */
export async function loadLearningPath(topicId: string): Promise<LearningStep[]> {
    const all = await loadAll();
    return all[topicId] ?? [];
}

export async function addLearningStep(topicId: string, title: string): Promise<LearningStep[]> {
    const t = title.trim();
    const all = await loadAll();
    const list = all[topicId] ?? [];
    if (!t) return list;
    const step: LearningStep = {
        id: `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        title: t,
        done: false,
        createdAt: new Date().toISOString(),
    };
    const nextList = [...list, step];
    await saveAll({ ...all, [topicId]: nextList });
    return nextList;
}

export async function toggleLearningStep(topicId: string, stepId: string): Promise<LearningStep[]> {
    const all = await loadAll();
    const list = all[topicId] ?? [];
    const nextList = list.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
    await saveAll({ ...all, [topicId]: nextList });
    return nextList;
}

export async function removeLearningStep(topicId: string, stepId: string): Promise<LearningStep[]> {
    const all = await loadAll();
    const nextList = (all[topicId] ?? []).filter((s) => s.id !== stepId);
    await saveAll({ ...all, [topicId]: nextList });
    return nextList;
}

export function progressPct(steps: LearningStep[]): number {
    if (steps.length === 0) return 0;
    return Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
}
