"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TAREAS RÁPIDAS — lista de tareas personal, persistente y sincronizada.
 * ---------------------------------------------------------------------------
 * Datos REALES del usuario (no simulados): checklist ligera pensada para el
 * widget de Dashboard "Tareas". Vive en localStorage bajo
 * `starseed.tasks.quick.v1` — igual patrón que dock-config.ts / neurons.ts —
 * y viaja con la cuenta a través de settings-sync.ts + realtime-sync.ts (SOP
 * §4): añadir/completar una tarea en un dispositivo se refleja en los demás.
 *
 * SSR-safe: toda lectura/escritura está guardada tras `typeof window`.
 * Defensivo: JSON corrupto o storage bloqueado degradan a lista vacía, nunca
 * lanzan. Tope de 200 tareas (se descartan las completadas más antiguas).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from "react";

export const QUICK_TASKS_KEY = "starseed.tasks.quick.v1";
/** Evento local (misma pestaña) tras cualquier cambio — y el que reenvía realtime-sync.ts. */
export const QUICK_TASKS_EVENT = "starseed:tasks";
const CAP = 200;

export interface QuickTask {
    id: string;
    text: string;
    done: boolean;
    createdAt: number;
    doneAt?: number;
    /** Prioridad opcional (afecta solo el orden/acento, nunca bloquea). */
    priority?: "baja" | "normal" | "alta";
}

function uuid(): string {
    try { return crypto.randomUUID(); } catch {
        return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    }
}

function isTask(v: unknown): v is QuickTask {
    if (!v || typeof v !== "object") return false;
    const t = v as Partial<QuickTask>;
    return typeof t.id === "string" && typeof t.text === "string" && typeof t.done === "boolean" && typeof t.createdAt === "number";
}

function emitChange(): void {
    if (typeof window === "undefined") return;
    try { window.dispatchEvent(new CustomEvent(QUICK_TASKS_EVENT)); } catch { /* noop */ }
}

export function readQuickTasks(): QuickTask[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(QUICK_TASKS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown[] })?.items;
        if (!Array.isArray(list)) return [];
        return list.filter(isTask);
    } catch {
        return [];
    }
}

function writeQuickTasks(tasks: QuickTask[]): void {
    if (typeof window === "undefined") return;
    try {
        // Tope defensivo: si se excede, se descartan primero las completadas más antiguas.
        let trimmed = tasks;
        if (trimmed.length > CAP) {
            const pending = trimmed.filter((t) => !t.done);
            const done = trimmed.filter((t) => t.done).sort((a, b) => (b.doneAt ?? b.createdAt) - (a.doneAt ?? a.createdAt));
            trimmed = [...pending, ...done].slice(0, CAP);
        }
        window.localStorage.setItem(QUICK_TASKS_KEY, JSON.stringify({ v: 1, items: trimmed }));
        emitChange();
    } catch { /* cuota llena / storage bloqueado: no rompemos nada */ }
}

export function addQuickTask(text: string, priority?: QuickTask["priority"]): QuickTask | null {
    const clean = text.trim();
    if (!clean) return null;
    const task: QuickTask = { id: uuid(), text: clean, done: false, createdAt: Date.now(), ...(priority ? { priority } : {}) };
    writeQuickTasks([task, ...readQuickTasks()]);
    return task;
}

export function toggleQuickTask(id: string): void {
    const tasks = readQuickTasks().map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : undefined } : t));
    writeQuickTasks(tasks);
}

export function removeQuickTask(id: string): void {
    writeQuickTasks(readQuickTasks().filter((t) => t.id !== id));
}

export function clearCompletedQuickTasks(): void {
    writeQuickTasks(readQuickTasks().filter((t) => !t.done));
}

// ── Hook reactivo ────────────────────────────────────────────────────────
export interface UseQuickTasks {
    tasks: QuickTask[];
    pending: QuickTask[];
    completed: QuickTask[];
    add: (text: string, priority?: QuickTask["priority"]) => void;
    toggle: (id: string) => void;
    remove: (id: string) => void;
    clearCompleted: () => void;
}

export function useQuickTasks(): UseQuickTasks {
    const [tasks, setTasks] = useState<QuickTask[]>([]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const refresh = () => setTasks(readQuickTasks());
        refresh();
        window.addEventListener(QUICK_TASKS_EVENT, refresh);
        const onStorage = (e: StorageEvent) => { if (e.key === QUICK_TASKS_KEY) refresh(); };
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener(QUICK_TASKS_EVENT, refresh);
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    const add = useCallback((text: string, priority?: QuickTask["priority"]) => { addQuickTask(text, priority); }, []);
    const toggle = useCallback((id: string) => toggleQuickTask(id), []);
    const remove = useCallback((id: string) => removeQuickTask(id), []);
    const clearCompleted = useCallback(() => clearCompletedQuickTasks(), []);

    return {
        tasks,
        pending: tasks.filter((t) => !t.done),
        completed: tasks.filter((t) => t.done),
        add, toggle, remove, clearCompleted,
    };
}
