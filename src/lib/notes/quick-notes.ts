"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NOTAS RÁPIDAS — bloc persistente y sincronizado para el widget de Dashboard.
 * ---------------------------------------------------------------------------
 * Varias notas cortas (no un documento largo — para eso está /memorias).
 * Persisten en localStorage bajo `starseed.notes.quick.v1` y viajan con la
 * cuenta vía settings-sync.ts + realtime-sync.ts, igual que quick-tasks.ts.
 *
 * SSR-safe y defensivo: nunca lanza; JSON corrupto degrada a lista vacía.
 * Tope de 60 notas (se descarta la más antigua al superarlo).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from "react";

export const QUICK_NOTES_KEY = "starseed.notes.quick.v1";
export const QUICK_NOTES_EVENT = "starseed:notes";
const CAP = 60;

export interface QuickNote {
    id: string;
    text: string;
    color?: string;
    createdAt: number;
    updatedAt: number;
    pinned?: boolean;
}

function uuid(): string {
    try { return crypto.randomUUID(); } catch {
        return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    }
}

function isNote(v: unknown): v is QuickNote {
    if (!v || typeof v !== "object") return false;
    const n = v as Partial<QuickNote>;
    return typeof n.id === "string" && typeof n.text === "string" && typeof n.createdAt === "number";
}

function emitChange(): void {
    if (typeof window === "undefined") return;
    try { window.dispatchEvent(new CustomEvent(QUICK_NOTES_EVENT)); } catch { /* noop */ }
}

export function readQuickNotes(): QuickNote[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(QUICK_NOTES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown[] })?.items;
        if (!Array.isArray(list)) return [];
        return list.filter(isNote);
    } catch {
        return [];
    }
}

function writeQuickNotes(notes: QuickNote[]): void {
    if (typeof window === "undefined") return;
    try {
        const trimmed = notes.length > CAP
            ? [...notes].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || b.updatedAt - a.updatedAt).slice(0, CAP)
            : notes;
        window.localStorage.setItem(QUICK_NOTES_KEY, JSON.stringify({ v: 1, items: trimmed }));
        emitChange();
    } catch { /* cuota llena / storage bloqueado: no rompemos nada */ }
}

const PALETTE = ["#f59e0b", "#38bdf8", "#a855f7", "#10b981", "#f472b6", "#f43f5e"];

export function addQuickNote(text: string): QuickNote | null {
    const clean = text.trim();
    if (!clean) return null;
    const now = Date.now();
    const note: QuickNote = { id: uuid(), text: clean, color: PALETTE[Math.floor(Math.random() * PALETTE.length)], createdAt: now, updatedAt: now };
    writeQuickNotes([note, ...readQuickNotes()]);
    return note;
}

export function updateQuickNote(id: string, text: string): void {
    const clean = text.trim();
    const notes = readQuickNotes().map((n) => (n.id === id ? { ...n, text: clean, updatedAt: Date.now() } : n));
    writeQuickNotes(notes);
}

export function togglePinQuickNote(id: string): void {
    writeQuickNotes(readQuickNotes().map((n) => (n.id === id ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n)));
}

export function removeQuickNote(id: string): void {
    writeQuickNotes(readQuickNotes().filter((n) => n.id !== id));
}

// ── Hook reactivo ────────────────────────────────────────────────────────
export interface UseQuickNotes {
    notes: QuickNote[];
    add: (text: string) => void;
    update: (id: string, text: string) => void;
    togglePin: (id: string) => void;
    remove: (id: string) => void;
}

export function useQuickNotes(): UseQuickNotes {
    const [notes, setNotes] = useState<QuickNote[]>([]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const refresh = () => setNotes(readQuickNotes());
        refresh();
        window.addEventListener(QUICK_NOTES_EVENT, refresh);
        const onStorage = (e: StorageEvent) => { if (e.key === QUICK_NOTES_KEY) refresh(); };
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener(QUICK_NOTES_EVENT, refresh);
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    const sorted = [...notes].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || b.updatedAt - a.updatedAt);

    return {
        notes: sorted,
        add: useCallback((text: string) => { addQuickNote(text); }, []),
        update: useCallback((id: string, text: string) => updateQuickNote(id, text), []),
        togglePin: useCallback((id: string) => togglePinQuickNote(id), []),
        remove: useCallback((id: string) => removeQuickNote(id), []),
    };
}
