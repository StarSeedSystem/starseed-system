"use client";

/*
 * group-education — Persistencia EDUCATIVA por GRUPO/PÁGINA (círculos de
 * estudio, colectivos, páginas de tipo proyecto): temario vinculado, tareas y
 * exámenes → insignias reales.
 * ---------------------------------------------------------------------------
 * Todo vive en `entity_state` bajo el ámbito de la propia entidad:
 *   · kind="group" para círculos/colectivos reales (RLS: miembros por
 *     os_memberships pueden leer/escribir).
 *   · kind="page"  para páginas de tipo "proyecto" (RLS: dueño de la página).
 *
 * Los temas vinculados en el Temario sólo pueden ser del CATÁLOGO BUILTIN
 * (src/lib/education/curriculum.ts) — nunca una extensión personal de un
 * usuario — porque el resto de miembros no podría resolverla (vive en un
 * ámbito privado ajeno). Esto mantiene el modelo honesto y simple.
 *
 * Insignia de examen: el catálogo de `badges` (Supabase) está sembrado con un
 * conjunto fijo de codes (verified, creator, legislator, mediator, scholar,
 * builder) — no se crean codes nuevos por examen desde el cliente (eso
 * requeriría una migración). Aprobar CUALQUIER examen de un grupo otorga la
 * insignia real de LOGRO "exam_passed" (EXAM_PASS_BADGE_CODE) — NUNCA
 * "scholar": aunque este code es fijo (no lo elige el creador del examen, a
 * diferencia de study.ts), "scholar" es una insignia de MÉRITO avalable entre
 * pares (ENDORSABLE_BADGE_CODES en badges.ts) que merit.ts pondera para el
 * peso de voto en gobernanza y que se muestra como credencial en el feed
 * político (political-proposal-card.tsx) — auto-otorgarla al aprobar CUALQUIER
 * examen de grupo (corrección 100% en cliente, ver submitExamAttempt) sería
 * spoofear esa credencial de "Erudito/a" reconocida por la comunidad sin aval
 * real (cierre del hallazgo de la Adenda 125, endurecido en la 143 — ver
 * migración 20260805210000_profile_badges_selfaward_allowlist.sql, que además
 * BLOQUEA en BD cualquier auto-otorgamiento de "scholar" pase lo que pase
 * aquí). Quien quiera la insignia "Erudito/a" real necesita el aval de un
 * tercero vía `endorseBadge` (src/components/profiles/endorse-badge.tsx). El
 * contador "cuántos aprobaron ESTE examen" sí es específico y real (se deriva
 * de los intentos registrados aquí).
 */

import { getEntityState, setEntityState, type EntityRef } from "@/lib/sync/entity-state";
import { myProfileId, awardBadge, hasBadge, isSelfAwardableBadge } from "@/lib/badges/badges";

export type GroupEntityKind = "group" | "page";

export function groupEduRef(kind: GroupEntityKind, slug: string): EntityRef {
    return { kind, id: slug };
}

// ── Temario (temas builtin vinculados) ──────────────────────────────────────

const TOPICS_KEY = "education:topics";

interface GroupTopicsValue {
    topicIds: string[];
}

export async function loadGroupTopics(ref: EntityRef): Promise<string[]> {
    const row = await getEntityState<GroupTopicsValue>(ref, TOPICS_KEY);
    return row?.value && Array.isArray(row.value.topicIds) ? row.value.topicIds : [];
}

export async function setGroupTopics(ref: EntityRef, topicIds: string[]): Promise<boolean> {
    const saved = await setEntityState<GroupTopicsValue>(ref, TOPICS_KEY, { topicIds });
    return !!saved;
}

// ── Proyectos y Tareas ───────────────────────────────────────────────────────

export type TaskStatus = "pendiente" | "en_progreso" | "hecho";

export interface GroupTask {
    id: string;
    title: string;
    status: TaskStatus;
    assignee?: string;
    createdAt: string;
}

const TASKS_KEY = "education:tasks";

export async function loadGroupTasks(ref: EntityRef): Promise<GroupTask[]> {
    const row = await getEntityState<GroupTask[]>(ref, TASKS_KEY);
    return Array.isArray(row?.value) ? (row!.value as GroupTask[]) : [];
}

async function saveGroupTasks(ref: EntityRef, tasks: GroupTask[]): Promise<boolean> {
    const saved = await setEntityState<GroupTask[]>(ref, TASKS_KEY, tasks);
    return !!saved;
}

export async function addGroupTask(ref: EntityRef, title: string, assignee?: string): Promise<GroupTask[]> {
    const t = title.trim();
    const current = await loadGroupTasks(ref);
    if (!t) return current;
    const task: GroupTask = {
        id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        title: t,
        status: "pendiente",
        assignee: assignee?.trim() || undefined,
        createdAt: new Date().toISOString(),
    };
    const next = [task, ...current];
    await saveGroupTasks(ref, next);
    return next;
}

export async function setGroupTaskStatus(ref: EntityRef, taskId: string, status: TaskStatus): Promise<GroupTask[]> {
    const current = await loadGroupTasks(ref);
    const next = current.map((t) => (t.id === taskId ? { ...t, status } : t));
    await saveGroupTasks(ref, next);
    return next;
}

export async function removeGroupTask(ref: EntityRef, taskId: string): Promise<GroupTask[]> {
    const current = await loadGroupTasks(ref);
    const next = current.filter((t) => t.id !== taskId);
    await saveGroupTasks(ref, next);
    return next;
}

// ── Exámenes ─────────────────────────────────────────────────────────────────

export interface ExamQuestion {
    id: string;
    prompt: string;
    options: string[];
    correctIndex: number;
}

export interface Exam {
    id: string;
    title: string;
    /** Umbral de aprobado, 0-100. */
    passThreshold: number;
    questions: ExamQuestion[];
    createdAt: string;
}

const EXAMS_KEY = "education:exams";

export async function loadExams(ref: EntityRef): Promise<Exam[]> {
    const row = await getEntityState<Exam[]>(ref, EXAMS_KEY);
    return Array.isArray(row?.value) ? (row!.value as Exam[]) : [];
}

async function saveExams(ref: EntityRef, exams: Exam[]): Promise<boolean> {
    const saved = await setEntityState<Exam[]>(ref, EXAMS_KEY, exams);
    return !!saved;
}

export interface CreateExamInput {
    title: string;
    passThreshold: number;
    questions: Array<{ prompt: string; options: string[]; correctIndex: number }>;
}

export async function createExam(ref: EntityRef, input: CreateExamInput): Promise<Exam[]> {
    const title = input.title.trim();
    const current = await loadExams(ref);
    const validQuestions = input.questions.filter(
        (q) => q.prompt.trim() && q.options.filter((o) => o.trim()).length >= 2,
    );
    if (!title || validQuestions.length === 0) return current;
    const exam: Exam = {
        id: `exam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        passThreshold: Math.max(0, Math.min(100, Math.round(input.passThreshold) || 60)),
        questions: validQuestions.map((q, i) => ({
            id: `q${i}-${Date.now().toString(36)}${i}`,
            prompt: q.prompt.trim(),
            options: q.options.map((o) => o.trim()).filter(Boolean),
            correctIndex: Math.max(0, Math.min(q.options.length - 1, q.correctIndex)),
        })),
        createdAt: new Date().toISOString(),
    };
    const next = [exam, ...current];
    await saveExams(ref, next);
    return next;
}

export async function removeExam(ref: EntityRef, examId: string): Promise<Exam[]> {
    const current = await loadExams(ref);
    const next = current.filter((e) => e.id !== examId);
    await saveExams(ref, next);
    return next;
}

// ── Intentos + insignia real ─────────────────────────────────────────────────

export interface ExamAttempt {
    examId: string;
    profileId: string | null;
    score: number;
    passed: boolean;
    at: string;
}

const ATTEMPTS_KEY = "education:exam-attempts";
const MAX_ATTEMPTS_STORED = 200;

/**
 * Insignia REAL de LOGRO (catálogo existente) otorgada al aprobar un examen de
 * grupo. Debe ser SIEMPRE un code de SELF_AWARDABLE_BADGE_CODES (badges.ts) —
 * NUNCA "scholar" ni otra insignia de autoridad/mérito (ENDORSABLE_BADGE_CODES):
 * la corrección del examen es 100% en cliente, así que auto-otorgar aquí un
 * code de autoridad equivaldría al mismo primitivo de auto-otorgamiento
 * arbitrario que cierra la Adenda 143 en study.ts. Ver el comentario de
 * cabecera de este fichero.
 */
export const EXAM_PASS_BADGE_CODE = "exam_passed";

export async function loadAttempts(ref: EntityRef): Promise<ExamAttempt[]> {
    const row = await getEntityState<ExamAttempt[]>(ref, ATTEMPTS_KEY);
    return Array.isArray(row?.value) ? (row!.value as ExamAttempt[]) : [];
}

export interface GradeResult {
    score: number;
    passed: boolean;
    correctCount: number;
    total: number;
    /** Ya tenía la insignia antes de este intento (para no anunciarla como "nueva" si ya la tenía). */
    alreadyHadBadge: boolean;
    badgeAwarded: boolean;
}

/** Corrige el examen, registra el intento y (si aprueba) otorga la insignia real. Nunca lanza. */
export async function submitExamAttempt(
    ref: EntityRef,
    exam: Exam,
    answers: Record<string, number>,
): Promise<GradeResult> {
    const total = exam.questions.length || 1;
    let correct = 0;
    for (const q of exam.questions) {
        if (answers[q.id] === q.correctIndex) correct += 1;
    }
    const score = Math.round((correct / total) * 100);
    const passed = score >= exam.passThreshold;

    let alreadyHadBadge = false;
    let badgeAwarded = false;
    let profileId: string | null = null;
    try {
        profileId = await myProfileId();
        // isSelfAwardableBadge(...) es un guardia defensivo (espejo del trigger
        // BD): EXAM_PASS_BADGE_CODE ya es una constante segura, pero así una
        // futura edición accidental de su valor a un code de autoridad no
        // otorgaría nada en silencio en vez de depender sólo de que la BD lo
        // rechace.
        if (passed && profileId && isSelfAwardableBadge(EXAM_PASS_BADGE_CODE)) {
            alreadyHadBadge = await hasBadge(profileId, EXAM_PASS_BADGE_CODE);
            badgeAwarded = await awardBadge(profileId, EXAM_PASS_BADGE_CODE);
        }
    } catch {
        /* la insignia es un extra; el resultado del examen ya se calculó */
    }

    try {
        const current = await loadAttempts(ref);
        const attempt: ExamAttempt = { examId: exam.id, profileId, score, passed, at: new Date().toISOString() };
        const next = [attempt, ...current].slice(0, MAX_ATTEMPTS_STORED);
        await setEntityState<ExamAttempt[]>(ref, ATTEMPTS_KEY, next);
    } catch {
        /* registro del intento es best-effort */
    }

    return { score, passed, correctCount: correct, total: exam.questions.length, alreadyHadBadge, badgeAwarded };
}

/** Contador REAL para el grupo: nº de perfiles distintos que aprobaron ESTE examen. */
export function passedCount(attempts: ExamAttempt[], examId: string): number {
    const passedProfiles = new Set<string>();
    for (const a of attempts) {
        if (a.examId === examId && a.passed && a.profileId) passedProfiles.add(a.profileId);
    }
    return passedProfiles.size;
}
