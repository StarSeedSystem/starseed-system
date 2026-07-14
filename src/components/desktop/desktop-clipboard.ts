'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Portapapeles del ESCRITORIO (Adenda 69 · H-2)
// ----------------------------------------------------------------
// Copiar · Cortar · Pegar iconos (apps, archivos, folders con toda su
// rama, widgets, enlaces) ENTRE folders, ENTRE páginas y ENTRE
// escritorios.
//
// Decisiones:
//   • Vive en localStorage (`starseed.desktop.clipboard.v1`) para que
//     copiar en un escritorio y pegar en otro funcione aunque se recargue
//     la página. NO se sincroniza a la cuenta: un portapapeles es estado
//     efímero DEL DISPOSITIVO (sincronizarlo pegaría cosas solo).
//   • CORTAR no borra nada al instante: marca el origen. El icono
//     desaparece del origen SOLO al pegar (si el usuario nunca pega, no
//     ha perdido nada). Mientras tanto el icono se pinta atenuado.
//   • Al PEGAR se re-identifica todo el nodo (identidad nueva, misma
//     referencia a la Entidad Única) — ver `insertIconNode`.
// ════════════════════════════════════════════════════════════════

import { useSyncExternalStore } from "react";
import type { DesktopIcon } from "./desktop-store";
import { insertIconNode, removeIcon, readDesktopsSnapshot, findIconInTree } from "./desktop-store";

const LS_KEY = "starseed.desktop.clipboard.v1";
const EVENT = "starseed:desktop-clipboard";

export type ClipboardMode = "copy" | "cut";

export interface DesktopClipboard {
    mode: ClipboardMode;
    /** Copia profunda del nodo (con su rama, si es folder). */
    node: DesktopIcon;
    /** Escritorio de origen (para poder retirar el original al CORTAR). */
    sourceDesktopId: string;
    at: number;
}

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function emit(): void {
    if (!isClient()) return;
    try { window.dispatchEvent(new Event(EVENT)); } catch { /* noop */ }
}

// Snapshot cacheado (estabilidad referencial para useSyncExternalStore).
let cache: { raw: string; value: DesktopClipboard | null } = { raw: "", value: null };

export function readClipboard(): DesktopClipboard | null {
    if (!isClient()) return null;
    let raw = "";
    try { raw = localStorage.getItem(LS_KEY) ?? ""; } catch { return null; }
    if (raw === cache.raw) return cache.value;
    let value: DesktopClipboard | null = null;
    try {
        const p = raw ? JSON.parse(raw) : null;
        if (p && (p.mode === "copy" || p.mode === "cut") && p.node && typeof p.node === "object") {
            value = {
                mode: p.mode,
                node: p.node as DesktopIcon,
                sourceDesktopId: typeof p.sourceDesktopId === "string" ? p.sourceDesktopId : "",
                at: typeof p.at === "number" ? p.at : 0,
            };
        }
    } catch { value = null; }
    cache = { raw, value };
    return value;
}

function write(c: DesktopClipboard | null): void {
    if (!isClient()) return;
    try {
        if (c) localStorage.setItem(LS_KEY, JSON.stringify(c));
        else localStorage.removeItem(LS_KEY);
    } catch { /* cuota / modo privado: degradamos en silencio */ }
    emit();
}

/** Copia un icono (con su rama) al portapapeles del escritorio. */
export function copyIcon(desktopId: string, iconId: string): void {
    const node = findNode(desktopId, iconId);
    if (!node) return;
    write({ mode: "copy", node, sourceDesktopId: desktopId, at: Date.now() });
}

/** Corta un icono: se marca, pero NO se retira hasta que se pega. */
export function cutIcon(desktopId: string, iconId: string): void {
    const node = findNode(desktopId, iconId);
    if (!node) return;
    write({ mode: "cut", node, sourceDesktopId: desktopId, at: Date.now() });
}

export function clearClipboard(): void {
    write(null);
}

function findNode(desktopId: string, iconId: string): DesktopIcon | null {
    const d = readDesktopsSnapshot().desktops.find((x) => x.id === desktopId);
    if (!d) return null;
    const node = findIconInTree(d.icons, iconId);
    if (!node) return null;
    // Copia profunda: el portapapeles no debe compartir referencias con el store.
    try { return JSON.parse(JSON.stringify(node)) as DesktopIcon; } catch { return null; }
}

/**
 * Pega el contenido del portapapeles en un escritorio (en el fondo, en una
 * posición concreta, o DENTRO de un folder). Devuelve el id del icono pegado.
 *
 * Reglas de seguridad:
 *   • Pegar un folder DENTRO DE SÍ MISMO (o de su propia rama) se ignora.
 *   • CORTAR + pegar en el mismo sitio = mover (se retira el original después
 *     de insertar la copia, así un fallo intermedio nunca destruye el icono).
 */
export function pasteClipboard(
    desktopId: string,
    folderId?: string | null,
    spot?: { x: number; y: number },
): string | null {
    const clip = readClipboard();
    if (!clip) return null;

    // No pegues un folder dentro de su propia descendencia (ni en sí mismo).
    if (folderId && clip.node.kind === "folder") {
        if (folderId === clip.node.id) return null;
        if (findIconInTree(clip.node.children ?? [], folderId)) return null;
    }

    const newId = insertIconNode(desktopId, clip.node, folderId ?? null, spot);

    if (clip.mode === "cut") {
        // El original se retira DESPUÉS de que la copia exista (nunca antes).
        removeIcon(clip.sourceDesktopId || desktopId, clip.node.id);
        clearClipboard();
    }
    return newId;
}

// ── Hook reactivo (SSR-safe) ─────────────────────────────────────
function subscribe(cb: () => void): () => void {
    if (!isClient()) return () => { /* noop */ };
    window.addEventListener(EVENT, cb);
    window.addEventListener("storage", cb);
    return () => {
        window.removeEventListener(EVENT, cb);
        window.removeEventListener("storage", cb);
    };
}

export function useDesktopClipboard(): DesktopClipboard | null {
    return useSyncExternalStore(subscribe, readClipboard, () => null);
}
