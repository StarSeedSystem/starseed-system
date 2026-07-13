"use client";

/*
 * study-ai — Generación con Aurora/Astraura para el Estudio (Adenda 66 §9).
 * ---------------------------------------------------------------------------
 * Usa el router gratis-primero de Astraura (src/ai/astraura/router.ts →
 * astrauraChat) para generar:
 *   · Guías de estudio personalizadas (itinerario con secciones + recursos).
 *   · Exámenes (preguntas de opción múltiple con respuesta y explicación).
 *   · Recomendaciones de tareas de estudio.
 *
 * Regla de oro (CLAUDE.md): Aurora SIEMPRE funciona (gratis y local primero) y
 * cambia sola de fuente si una se agota — de eso se encarga el router. Aquí solo
 * pedimos JSON estricto y parseamos de forma TOLERANTE: si el modelo devuelve
 * texto envuelto en ```json``` o con prosa alrededor, lo recuperamos igual; si
 * no hay nada usable, devolvemos { ok:false, error } y el UI degrada con gracia.
 */

import { astrauraChat } from "@/ai/astraura/router";
import type { ChatMessage } from "@/ai/providers/types";
import type { ExamQuestion, GuideSection, UpsertGuideInput } from "@/lib/education/study";

// ─────────────────────── Extracción tolerante de JSON ─────────────────────

function extractJson<T = unknown>(text: string): T | null {
    if (!text) return null;
    let t = text.trim();
    // 1) Bloque de código ```json … ``` si lo hay.
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence && fence[1]) t = fence[1].trim();
    // 2) Intento directo.
    try {
        return JSON.parse(t) as T;
    } catch {
        /* seguimos */
    }
    // 3) Recorte desde el primer { o [ hasta el último } o ] equilibrado.
    const firstObj = t.indexOf("{");
    const firstArr = t.indexOf("[");
    const candidates = [firstObj, firstArr].filter((i) => i >= 0);
    if (candidates.length === 0) return null;
    const start = Math.min(...candidates);
    const openCh = t[start];
    const closeCh = openCh === "{" ? "}" : "]";
    const end = t.lastIndexOf(closeCh);
    if (end <= start) return null;
    try {
        return JSON.parse(t.slice(start, end + 1)) as T;
    } catch {
        return null;
    }
}

async function ask(system: string, user: string, maxTokens = 1400): Promise<string> {
    const messages: ChatMessage[] = [
        { role: "system", content: system },
        { role: "user", content: user },
    ];
    const res = await astrauraChat({ messages, temperature: 0.5, maxTokens });
    return res?.text ?? "";
}

// ─────────────────────────────── Guías ────────────────────────────────────

export interface GenGuideResult {
    ok: boolean;
    guide?: UpsertGuideInput;
    error?: string;
}

/** Genera una guía de estudio (itinerario de aprendizaje) para un tema. */
export async function generateStudyGuide(
    topic: string,
    opts?: { level?: string; kind?: "guia" | "itinerario" },
): Promise<GenGuideResult> {
    const theme = topic.trim();
    if (!theme) return { ok: false, error: "Indica un tema." };
    const kind = opts?.kind ?? "guia";
    const level = opts?.level ? ` para nivel ${opts.level}` : "";
    const system =
        "Eres Aurora, la guía de aprendizaje de StarSeed. Diseñas itinerarios de estudio claros, rigurosos y accionables en español. " +
        "Respondes ÚNICAMENTE con JSON válido, sin texto adicional ni markdown.";
    const user =
        `Crea una guía de estudio${level} sobre "${theme}". ` +
        `Devuelve EXACTAMENTE este JSON: {"title": string, "summary": string, "sections": [{"title": string, "body": string, "resources": [{"label": string, "url": string}]}]}. ` +
        `Entre 4 y 6 secciones ordenadas de lo básico a lo avanzado. Cada "body" con 2-4 frases útiles y concretas. ` +
        `En "resources" incluye 1-2 referencias reales y verificables (Wikipedia, artículos, estudios) con URL válida; si no estás seguro de una URL, deja el array vacío. Sin inventar enlaces.`;
    try {
        const text = await ask(system, user, 1800);
        const parsed = extractJson<{ title?: string; summary?: string; sections?: GuideSection[] }>(text);
        if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
            return { ok: false, error: "Aurora no devolvió una guía válida. Inténtalo de nuevo." };
        }
        const sections: GuideSection[] = parsed.sections
            .filter((s) => s && typeof s.title === "string" && typeof s.body === "string")
            .map((s) => ({
                title: String(s.title).slice(0, 200),
                body: String(s.body),
                resources: Array.isArray(s.resources)
                    ? s.resources
                          .filter((r) => r && typeof r.label === "string")
                          .map((r) => ({ label: String(r.label).slice(0, 200), url: r.url ? String(r.url) : undefined }))
                    : [],
            }));
        if (sections.length === 0) return { ok: false, error: "Aurora no devolvió secciones válidas." };
        return {
            ok: true,
            guide: {
                title: (parsed.title && String(parsed.title)) || `Guía de ${theme}`,
                topic: theme,
                summary: parsed.summary ? String(parsed.summary) : "",
                kind,
                sections,
            },
        };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || "No se pudo contactar con Aurora." };
    }
}

// ─────────────────────────────── Exámenes ─────────────────────────────────

export interface GenExamResult {
    ok: boolean;
    questions?: ExamQuestion[];
    error?: string;
}

/** Genera N preguntas de opción múltiple sobre un tema. */
export async function generateExam(topic: string, count = 5): Promise<GenExamResult> {
    const theme = topic.trim();
    if (!theme) return { ok: false, error: "Indica un tema." };
    const n = Math.max(3, Math.min(10, Math.round(count)));
    const system =
        "Eres Aurora, evaluadora de StarSeed. Creas exámenes justos y educativos en español. " +
        "Respondes ÚNICAMENTE con JSON válido, sin texto adicional ni markdown.";
    const user =
        `Crea un examen de ${n} preguntas de opción múltiple sobre "${theme}". ` +
        `Devuelve EXACTAMENTE: {"questions": [{"q": string, "options": [string, string, string], "answer": number, "explanation": string}]}. ` +
        `"options" con 3 o 4 opciones; "answer" es el índice 0-based de la opción correcta; "explanation" breve. ` +
        `Preguntas claras, con una sola respuesta correcta inequívoca.`;
    try {
        const text = await ask(system, user, 1600);
        const parsed = extractJson<{ questions?: ExamQuestion[] }>(text);
        const raw = Array.isArray(parsed?.questions) ? parsed!.questions : [];
        const questions: ExamQuestion[] = raw
            .filter(
                (q) =>
                    q &&
                    typeof q.q === "string" &&
                    Array.isArray(q.options) &&
                    q.options.length >= 2 &&
                    typeof q.answer === "number" &&
                    q.answer >= 0 &&
                    q.answer < q.options.length,
            )
            .map((q) => ({
                q: String(q.q),
                options: q.options.map((o) => String(o)),
                answer: q.answer,
                explanation: q.explanation ? String(q.explanation) : undefined,
            }));
        if (questions.length === 0) return { ok: false, error: "Aurora no devolvió preguntas válidas. Inténtalo de nuevo." };
        return { ok: true, questions };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || "No se pudo contactar con Aurora." };
    }
}

// ────────────────────────── Recomendaciones ───────────────────────────────

export interface GenTasksResult {
    ok: boolean;
    tasks?: string[];
    error?: string;
}

/** Recomienda tareas de estudio accionables para un tema/contexto. */
export async function recommendTasks(context: string, count = 5): Promise<GenTasksResult> {
    const ctx = context.trim();
    if (!ctx) return { ok: false, error: "Indica un tema o contexto." };
    const n = Math.max(3, Math.min(8, Math.round(count)));
    const system =
        "Eres Aurora, mentora de estudio de StarSeed. Propones tareas concretas y accionables en español. " +
        "Respondes ÚNICAMENTE con JSON válido, sin texto adicional.";
    const user =
        `Propón ${n} tareas de estudio concretas y accionables para: "${ctx}". ` +
        `Devuelve EXACTAMENTE: {"tasks": [string, ...]}. Cada tarea empieza por un verbo (Leer, Practicar, Resumir, Construir…) y es realizable en una sesión.`;
    try {
        const text = await ask(system, user, 800);
        const parsed = extractJson<{ tasks?: string[] }>(text);
        const tasks = (Array.isArray(parsed?.tasks) ? parsed!.tasks : [])
            .filter((t) => typeof t === "string" && t.trim())
            .map((t) => String(t).trim().slice(0, 240));
        if (tasks.length === 0) return { ok: false, error: "Aurora no devolvió recomendaciones. Inténtalo de nuevo." };
        return { ok: true, tasks };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || "No se pudo contactar con Aurora." };
    }
}
