"use client";

/*
 * study — Capa de datos del ESTUDIO con Aurora/Astraura (Adenda 66 §9).
 * ---------------------------------------------------------------------------
 * Grupos de estudio (miembros reales + chat), guías inteligentes + itinerarios,
 * exámenes opcionales con insignias, tareas y proyectos. Todo OPCIONAL y libre.
 *
 * Backend: Supabase del OS `nxstilnyidvkqeosofuh`, tablas creadas por
 * `supabase/migrations/20260712140000_estudio_aurora.sql` (RLS + realtime):
 *   study_groups · study_group_members · study_group_posts · study_guides ·
 *   exams · exam_attempts · study_tasks · study_projects.
 *
 * Principios (como src/lib/badges/badges.ts y src/lib/knowledge/knowledge.ts):
 *   - TOLERANTE A FALLOS: sin sesión / sin tabla / error de red NUNCA lanza;
 *     devuelve [] / null / false. El consumidor nunca rompe.
 *   - RLS decide fila a fila (owner = auth.uid()); aquí no se confía en el
 *     cliente para la seguridad, solo para la ergonomía.
 *   - Insignias reales: al aprobar un examen se llama a awardBadge (profile_badges).
 */

import { createClient } from "@/utils/supabase/client";
import { awardBadge, myProfileId } from "@/lib/badges/badges";

// ───────────────────────────── Tipos ──────────────────────────────────────

export interface StudyGroup {
    id: string;
    name: string;
    description: string;
    topic_id: string | null;
    topic_name: string | null;
    is_public: boolean;
    owner: string;
    created_at: string;
}

export interface StudyGroupMember {
    group_id: string;
    account: string;
    role: "owner" | "member";
    joined_at: string;
}

export interface StudyGroupPost {
    id: string;
    group_id: string;
    author: string;
    body: string;
    created_at: string;
}

export interface GuideResource {
    label: string;
    url?: string;
    kind?: string;
}
export interface GuideSection {
    title: string;
    body: string;
    type?: string;
    date?: string | null;
    resources?: GuideResource[];
    /** Referencia opcional a un evento/tarea/examen del itinerario. */
    ref?: { event_id?: string; task_id?: string; exam_id?: string };
}
export type GuideKind = "guia" | "itinerario";
export interface StudyGuide {
    id: string;
    owner: string | null;
    kind: GuideKind;
    title: string;
    topic: string | null;
    summary: string;
    sections: GuideSection[];
    is_template: boolean;
    created_at: string;
    updated_at: string;
}

export interface ExamQuestion {
    q: string;
    options: string[];
    /** Índice 0-based de la opción correcta. */
    answer: number;
    explanation?: string;
}
export interface Exam {
    id: string;
    owner: string | null;
    title: string;
    topic: string | null;
    questions: ExamQuestion[];
    pass_threshold: number;
    badge_code: string | null;
    is_template: boolean;
    created_at: string;
}
export interface ExamAttempt {
    id: string;
    exam_id: string;
    account: string;
    answers: number[];
    score: number;
    passed: boolean;
    created_at: string;
}
export interface ExamResult {
    ok: boolean;
    score: number;
    correct: number;
    total: number;
    passed: boolean;
    /** code de la insignia otorgada (o null si no se otorgó ninguna). */
    awardedBadge: string | null;
    needsProfile?: boolean;
}

export interface StudyTask {
    id: string;
    owner: string;
    title: string;
    notes: string;
    done: boolean;
    due_at: string | null;
    topic: string | null;
    group_id: string | null;
    guide_id: string | null;
    source: "user" | "astraura";
    created_at: string;
}

export type ProjectStatus = "idea" | "activo" | "pausado" | "hecho";
export interface StudyProject {
    id: string;
    owner: string;
    title: string;
    description: string;
    status: ProjectStatus;
    topic: string | null;
    links: { label: string; url?: string }[];
    created_at: string;
    updated_at: string;
}

// ─────────────────────────── Helpers internos ─────────────────────────────

function isClient(): boolean {
    return typeof window !== "undefined";
}

export async function currentUid(): Promise<string | null> {
    if (!isClient()) return null;
    try {
        const { data } = await createClient().auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

function asArray<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}

// ════════════════════════════ Grupos de estudio ═══════════════════════════

/** Grupos visibles para mí (públicos + míos + donde soy miembro; lo decide RLS). */
export async function listStudyGroups(): Promise<StudyGroup[]> {
    if (!isClient()) return [];
    try {
        const { data, error } = await createClient()
            .from("study_groups")
            .select("*")
            .order("created_at", { ascending: false });
        if (error || !Array.isArray(data)) return [];
        return data as StudyGroup[];
    } catch {
        return [];
    }
}

/** Ids de los grupos en los que soy miembro (para marcar "unido"). */
export async function myGroupIds(): Promise<Set<string>> {
    const out = new Set<string>();
    const uid = await currentUid();
    if (!uid) return out;
    try {
        const { data } = await createClient()
            .from("study_group_members")
            .select("group_id")
            .eq("account", uid);
        for (const r of asArray<{ group_id: string }>(data)) out.add(r.group_id);
    } catch {
        /* noop */
    }
    return out;
}

export interface CreateGroupInput {
    name: string;
    description?: string;
    topicId?: string | null;
    topicName?: string | null;
    isPublic?: boolean;
}

/** Crea un grupo y añade al creador como dueño-miembro. Devuelve el grupo o null. */
export async function createStudyGroup(input: CreateGroupInput): Promise<StudyGroup | null> {
    const name = input.name.trim();
    if (!name) return null;
    const uid = await currentUid();
    if (!uid) return null;
    try {
        const sb = createClient();
        const { data, error } = await sb
            .from("study_groups")
            .insert({
                name,
                description: input.description?.trim() || "",
                topic_id: input.topicId ?? null,
                topic_name: input.topicName ?? null,
                is_public: input.isPublic ?? true,
                owner: uid,
            })
            .select("*")
            .single();
        if (error || !data) return null;
        const group = data as StudyGroup;
        // Auto-membresía del dueño (idempotente).
        await sb
            .from("study_group_members")
            .upsert({ group_id: group.id, account: uid, role: "owner" }, { onConflict: "group_id,account", ignoreDuplicates: true });
        return group;
    } catch {
        return null;
    }
}

export async function joinStudyGroup(groupId: string): Promise<boolean> {
    const uid = await currentUid();
    if (!uid || !groupId) return false;
    try {
        const { error } = await createClient()
            .from("study_group_members")
            .upsert({ group_id: groupId, account: uid, role: "member" }, { onConflict: "group_id,account", ignoreDuplicates: true });
        return !error;
    } catch {
        return false;
    }
}

export async function leaveStudyGroup(groupId: string): Promise<boolean> {
    const uid = await currentUid();
    if (!uid || !groupId) return false;
    try {
        const { error } = await createClient()
            .from("study_group_members")
            .delete()
            .eq("group_id", groupId)
            .eq("account", uid);
        return !error;
    } catch {
        return false;
    }
}

export async function deleteStudyGroup(groupId: string): Promise<boolean> {
    if (!groupId) return false;
    try {
        const { error } = await createClient().from("study_groups").delete().eq("id", groupId);
        return !error;
    } catch {
        return false;
    }
}

export async function listGroupMembers(groupId: string): Promise<StudyGroupMember[]> {
    if (!groupId) return [];
    try {
        const { data } = await createClient()
            .from("study_group_members")
            .select("*")
            .eq("group_id", groupId)
            .order("joined_at", { ascending: true });
        return asArray<StudyGroupMember>(data);
    } catch {
        return [];
    }
}

export async function listGroupPosts(groupId: string): Promise<StudyGroupPost[]> {
    if (!groupId) return [];
    try {
        const { data } = await createClient()
            .from("study_group_posts")
            .select("*")
            .eq("group_id", groupId)
            .order("created_at", { ascending: true });
        return asArray<StudyGroupPost>(data);
    } catch {
        return [];
    }
}

export async function postToGroup(groupId: string, body: string): Promise<StudyGroupPost | null> {
    const text = body.trim();
    const uid = await currentUid();
    if (!uid || !groupId || !text) return null;
    try {
        const { data, error } = await createClient()
            .from("study_group_posts")
            .insert({ group_id: groupId, author: uid, body: text })
            .select("*")
            .single();
        if (error || !data) return null;
        return data as StudyGroupPost;
    } catch {
        return null;
    }
}

/** Realtime del chat de un grupo (INSERT/DELETE). Devuelve fn de limpieza. */
export function subscribeGroupPosts(groupId: string, onChange: () => void): () => void {
    if (!isClient() || !groupId) return () => {};
    try {
        const sb = createClient();
        const channel = sb
            .channel(`study-group-posts:${groupId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "study_group_posts", filter: `group_id=eq.${groupId}` },
                () => onChange(),
            )
            .subscribe();
        return () => {
            try {
                sb.removeChannel(channel);
            } catch {
                /* noop */
            }
        };
    } catch {
        return () => {};
    }
}

// ═══════════════════════════════ Guías ════════════════════════════════════

export async function listGuides(): Promise<StudyGuide[]> {
    if (!isClient()) return [];
    try {
        const { data, error } = await createClient()
            .from("study_guides")
            .select("*")
            .order("is_template", { ascending: false })
            .order("updated_at", { ascending: false });
        if (error || !Array.isArray(data)) return [];
        return (data as StudyGuide[]).map((g) => ({ ...g, sections: asArray<GuideSection>(g.sections) }));
    } catch {
        return [];
    }
}

export interface UpsertGuideInput {
    title: string;
    topic?: string | null;
    summary?: string;
    kind?: GuideKind;
    sections: GuideSection[];
}

export async function createGuide(input: UpsertGuideInput): Promise<StudyGuide | null> {
    const title = input.title.trim();
    const uid = await currentUid();
    if (!uid || !title) return null;
    try {
        const { data, error } = await createClient()
            .from("study_guides")
            .insert({
                owner: uid,
                kind: input.kind ?? "guia",
                title,
                topic: input.topic ?? null,
                summary: input.summary ?? "",
                sections: input.sections ?? [],
                is_template: false,
            })
            .select("*")
            .single();
        if (error || !data) return null;
        return { ...(data as StudyGuide), sections: asArray<GuideSection>((data as StudyGuide).sections) };
    } catch {
        return null;
    }
}

export async function updateGuide(
    id: string,
    patch: Partial<Pick<StudyGuide, "title" | "topic" | "summary" | "sections" | "kind">>,
): Promise<boolean> {
    if (!id) return false;
    try {
        const { error } = await createClient()
            .from("study_guides")
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

export async function deleteGuide(id: string): Promise<boolean> {
    if (!id) return false;
    try {
        const { error } = await createClient().from("study_guides").delete().eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

/** Copia una guía (p.ej. una plantilla) a MI biblioteca de guías, editable. */
export async function forkGuide(source: StudyGuide): Promise<StudyGuide | null> {
    return createGuide({
        title: `${source.title} (mi copia)`,
        topic: source.topic,
        summary: source.summary,
        kind: source.kind,
        sections: source.sections,
    });
}

// ═══════════════════════════════ Exámenes ═════════════════════════════════

export async function listExams(): Promise<Exam[]> {
    if (!isClient()) return [];
    try {
        const { data, error } = await createClient()
            .from("exams")
            .select("*")
            .order("is_template", { ascending: false })
            .order("created_at", { ascending: false });
        if (error || !Array.isArray(data)) return [];
        return (data as Exam[]).map((e) => ({ ...e, questions: asArray<ExamQuestion>(e.questions) }));
    } catch {
        return [];
    }
}

export interface CreateExamInput {
    title: string;
    topic?: string | null;
    questions: ExamQuestion[];
    passThreshold?: number;
    badgeCode?: string | null;
}

export async function createExam(input: CreateExamInput): Promise<Exam | null> {
    const title = input.title.trim();
    const uid = await currentUid();
    if (!uid || !title || !input.questions?.length) return null;
    try {
        const { data, error } = await createClient()
            .from("exams")
            .insert({
                owner: uid,
                title,
                topic: input.topic ?? null,
                questions: input.questions,
                pass_threshold: input.passThreshold ?? 0.7,
                badge_code: input.badgeCode ?? "exam_passed",
                is_template: false,
            })
            .select("*")
            .single();
        if (error || !data) return null;
        return { ...(data as Exam), questions: asArray<ExamQuestion>((data as Exam).questions) };
    } catch {
        return null;
    }
}

export async function deleteExam(id: string): Promise<boolean> {
    if (!id) return false;
    try {
        const { error } = await createClient().from("exams").delete().eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

/**
 * Corrige un examen, guarda el intento y, si se aprueba, otorga la insignia
 * real (profile_badges vía awardBadge). NUNCA lanza.
 */
export async function submitExamAttempt(exam: Exam, answers: number[]): Promise<ExamResult> {
    const total = exam.questions.length || 1;
    let correct = 0;
    exam.questions.forEach((q, i) => {
        if (answers[i] === q.answer) correct++;
    });
    const score = correct / total;
    const passed = score >= (exam.pass_threshold ?? 0.7);
    const result: ExamResult = { ok: false, score, correct, total: exam.questions.length, passed, awardedBadge: null };

    const uid = await currentUid();
    if (!uid) return result; // sin sesión: corregimos en local pero no persistimos

    try {
        await createClient()
            .from("exam_attempts")
            .insert({ exam_id: exam.id, account: uid, answers, score, passed });
        result.ok = true;
    } catch {
        /* el intento no se guardó, pero seguimos con la corrección local */
    }

    if (passed && exam.badge_code) {
        const pid = await myProfileId();
        if (pid) {
            const ok = await awardBadge(pid, exam.badge_code);
            if (ok) result.awardedBadge = exam.badge_code;
        } else {
            result.needsProfile = true;
        }
    }
    return result;
}

export async function listMyAttempts(examId?: string): Promise<ExamAttempt[]> {
    const uid = await currentUid();
    if (!uid) return [];
    try {
        let query = createClient().from("exam_attempts").select("*").eq("account", uid);
        if (examId) query = query.eq("exam_id", examId);
        const { data } = await query.order("created_at", { ascending: false });
        return asArray<ExamAttempt>(data).map((a) => ({ ...a, answers: asArray<number>(a.answers) }));
    } catch {
        return [];
    }
}

// ═══════════════════════════════ Tareas ═══════════════════════════════════

export async function listTasks(): Promise<StudyTask[]> {
    if (!isClient()) return [];
    try {
        const { data, error } = await createClient()
            .from("study_tasks")
            .select("*")
            .order("done", { ascending: true })
            .order("created_at", { ascending: false });
        if (error || !Array.isArray(data)) return [];
        return data as StudyTask[];
    } catch {
        return [];
    }
}

export interface CreateTaskInput {
    title: string;
    notes?: string;
    dueAt?: string | null;
    topic?: string | null;
    groupId?: string | null;
    guideId?: string | null;
    source?: "user" | "astraura";
}

export async function createTask(input: CreateTaskInput): Promise<StudyTask | null> {
    const title = input.title.trim();
    const uid = await currentUid();
    if (!uid || !title) return null;
    try {
        const { data, error } = await createClient()
            .from("study_tasks")
            .insert({
                owner: uid,
                title,
                notes: input.notes ?? "",
                due_at: input.dueAt ?? null,
                topic: input.topic ?? null,
                group_id: input.groupId ?? null,
                guide_id: input.guideId ?? null,
                source: input.source ?? "user",
            })
            .select("*")
            .single();
        if (error || !data) return null;
        return data as StudyTask;
    } catch {
        return null;
    }
}

/** Inserta varias tareas de golpe (recomendaciones de Astraura). Devuelve nº creadas. */
export async function createTasksBulk(titles: string[], meta?: { topic?: string | null }): Promise<number> {
    const uid = await currentUid();
    const clean = titles.map((t) => t.trim()).filter(Boolean);
    if (!uid || clean.length === 0) return 0;
    try {
        const rows = clean.map((title) => ({ owner: uid, title, topic: meta?.topic ?? null, source: "astraura" as const }));
        const { data, error } = await createClient().from("study_tasks").insert(rows).select("id");
        if (error) return 0;
        return asArray<{ id: string }>(data).length;
    } catch {
        return 0;
    }
}

export async function toggleTask(id: string, done: boolean): Promise<boolean> {
    if (!id) return false;
    try {
        const { error } = await createClient().from("study_tasks").update({ done }).eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

export async function deleteTask(id: string): Promise<boolean> {
    if (!id) return false;
    try {
        const { error } = await createClient().from("study_tasks").delete().eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

// ═══════════════════════════════ Proyectos ════════════════════════════════

export async function listProjects(): Promise<StudyProject[]> {
    if (!isClient()) return [];
    try {
        const { data, error } = await createClient()
            .from("study_projects")
            .select("*")
            .order("created_at", { ascending: false });
        if (error || !Array.isArray(data)) return [];
        return (data as StudyProject[]).map((p) => ({ ...p, links: asArray(p.links) }));
    } catch {
        return [];
    }
}

export interface CreateProjectInput {
    title: string;
    description?: string;
    status?: ProjectStatus;
    topic?: string | null;
}

export async function createProject(input: CreateProjectInput): Promise<StudyProject | null> {
    const title = input.title.trim();
    const uid = await currentUid();
    if (!uid || !title) return null;
    try {
        const { data, error } = await createClient()
            .from("study_projects")
            .insert({
                owner: uid,
                title,
                description: input.description ?? "",
                status: input.status ?? "activo",
                topic: input.topic ?? null,
            })
            .select("*")
            .single();
        if (error || !data) return null;
        return { ...(data as StudyProject), links: asArray((data as StudyProject).links) };
    } catch {
        return null;
    }
}

export async function updateProject(
    id: string,
    patch: Partial<Pick<StudyProject, "title" | "description" | "status" | "topic" | "links">>,
): Promise<boolean> {
    if (!id) return false;
    try {
        const { error } = await createClient()
            .from("study_projects")
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

export async function deleteProject(id: string): Promise<boolean> {
    if (!id) return false;
    try {
        const { error } = await createClient().from("study_projects").delete().eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

// ════════════════════ Itinerarios → calendario (os_events) ═════════════════
// Un itinerario (guía kind='itinerario') puede materializar sus pasos como
// eventos reales en os_events. Defensivo: si la RLS/tabla no lo permite,
// devuelve null y el UI lo comunica con gracia (nunca rompe).

export interface CreateEventInput {
    title: string;
    startsAt: string; // ISO
    description?: string;
}

export async function createStudyEvent(input: CreateEventInput): Promise<{ id: string } | null> {
    const title = input.title.trim();
    const uid = await currentUid();
    if (!uid || !title) return null;
    try {
        const { data, error } = await createClient()
            .from("os_events")
            .insert({
                title,
                description: input.description ?? "",
                starts_at: input.startsAt,
                kind: "estudio",
                owner_id: uid,
            })
            .select("id")
            .single();
        if (error || !data) return null;
        return data as { id: string };
    } catch {
        return null;
    }
}
