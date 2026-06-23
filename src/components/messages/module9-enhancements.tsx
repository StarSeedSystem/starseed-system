"use client";

// src/components/messages/module9-enhancements.tsx
// -----------------------------------------------------------------------------
// MÓDULO 9 — MENSAJES · Mejoras aditivas (sub-componentes cliente).
//
// Este archivo agrupa las piezas NUEVAS del Módulo 9 para no inflar la página
// principal (`src/app/(main)/messages/page.tsx`). Todo es ADITIVO y SSR-safe.
//
// Contiene:
//   • useMessagesRealtime  — suscripción honesta a `astraura_messages` (filtrada
//                            por user_id) vía useRealtime; dispara un callback al
//                            llegar nuevos mensajes. Si no hay sesión/Supabase,
//                            degrada a no-op silencioso.
//   • useChatFolders       — Carpetas de chats persistidas en localStorage,
//                            keyed por usuario (HONESTO: no hay tabla todavía).
//                            Crear / renombrar / reordenar / asignar chats.
//   • FoldersPanel         — panel visual de Carpetas que filtra la lista.
//   • UniversalCompositor  — Compositor Universal: selector de formato
//                            (Texto / Audio-Video / Galería / Archivo / Lienzo).
//   • SharePublicationDialog — Interconexión: pegar/adjuntar una ref `/post/<id>`
//                            y "Enviar al chat".
//
// NOTA DE HONESTIDAD:
//   - Las carpetas viven en localStorage (no en BD). Se documenta en la UI.
//   - La captura Audio/Video usa las APIs del navegador / "los sentidos"
//     (getUserMedia); aquí marcamos el flujo como tal sin fingir backend.
//   - El realtime escucha `astraura_messages`; la página actual usa datos en
//     memoria, así que el callback se usa para refrescar/anexar de forma segura.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRealtime, type RealtimePayload } from "@/lib/realtime/realtime";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
    DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
    Folder, FolderPlus, Check, X, ChevronUp, ChevronDown, Pencil, Trash2,
    Inbox, Type, Video, Image as ImageIcon, File as FileIcon, PenSquare,
    Share2, Send, Link as LinkIcon, Mic,
} from "lucide-react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// 1) REALTIME — suscripción honesta a `astraura_messages`
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resuelve el id del usuario autenticado (Supabase). SSR-safe: devuelve null en
 * el servidor o si no hay sesión. No lanza.
 */
export function useCurrentUserId(): string | null {
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        let active = true;
        try {
            const supabase = createClient();
            supabase.auth
                .getUser()
                .then(({ data }) => {
                    if (active) setUserId(data?.user?.id ?? null);
                })
                .catch(() => {
                    if (active) setUserId(null);
                });
        } catch {
            setUserId(null);
        }
        return () => {
            active = false;
        };
    }, []);

    return userId;
}

/**
 * Se suscribe a `astraura_messages` filtrando por `user_id` (cuando hay sesión).
 * Llama `onMessage` con cada payload INSERT/UPDATE/DELETE. HONESTO: la página
 * usa datos en memoria; este hook permite reflejar mensajes nuevos en vivo sin
 * romper ese estado (el consumidor decide qué hacer con el payload).
 *
 * Si no hay `userId`, escuchamos toda la tabla (RLS sigue aplicándose en el
 * servidor, así que sólo llegan filas legibles).
 */
export function useMessagesRealtime(
    onMessage: (payload: RealtimePayload) => void,
    userId?: string | null,
): void {
    const filter = userId ? `user_id=eq.${userId}` : undefined;
    useRealtime("astraura_messages", { filter, event: "*" }, onMessage);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) CARPETAS (folders) — localStorage, keyed por usuario (HONESTO, mínimo)
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatFolder {
    id: string;
    name: string;
}

interface FoldersState {
    folders: ChatFolder[];
    /** chatId -> folderId */
    assignments: Record<string, string>;
}

const FOLDERS_VERSION = "v1";

function foldersStorageKey(userId: string | null): string {
    // Keyed por usuario; "anon" cuando no hay sesión (sigue siendo per-dispositivo).
    return `starseed.messages.folders.${FOLDERS_VERSION}.${userId ?? "anon"}`;
}

function readFolders(userId: string | null): FoldersState {
    if (typeof window === "undefined") return { folders: [], assignments: {} };
    try {
        const raw = window.localStorage.getItem(foldersStorageKey(userId));
        if (!raw) return { folders: [], assignments: {} };
        const parsed = JSON.parse(raw);
        return {
            folders: Array.isArray(parsed?.folders) ? parsed.folders : [],
            assignments:
                parsed?.assignments && typeof parsed.assignments === "object"
                    ? parsed.assignments
                    : {},
        };
    } catch {
        return { folders: [], assignments: {} };
    }
}

function writeFolders(userId: string | null, state: FoldersState): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            foldersStorageKey(userId),
            JSON.stringify(state),
        );
    } catch {
        /* almacenamiento lleno / bloqueado: best-effort */
    }
}

export interface UseChatFoldersResult {
    folders: ChatFolder[];
    assignments: Record<string, string>;
    createFolder: (name: string) => void;
    renameFolder: (id: string, name: string) => void;
    deleteFolder: (id: string) => void;
    moveFolder: (id: string, dir: -1 | 1) => void;
    assignChat: (chatId: string, folderId: string | null) => void;
    folderOf: (chatId: string) => string | null;
}

/**
 * Estado de Carpetas persistido en localStorage (per usuario). HONESTO: no hay
 * tabla `chat_folders`; esto es almacenamiento local del dispositivo.
 */
export function useChatFolders(userId: string | null): UseChatFoldersResult {
    const [state, setState] = useState<FoldersState>({ folders: [], assignments: {} });

    // Carga / recarga cuando cambia el usuario (incluye la hidratación inicial).
    useEffect(() => {
        setState(readFolders(userId));
    }, [userId]);

    const persist = useCallback(
        (next: FoldersState) => {
            setState(next);
            writeFolders(userId, next);
        },
        [userId],
    );

    const createFolder = useCallback(
        (name: string) => {
            const clean = name.trim();
            if (!clean) return;
            const folder: ChatFolder = {
                id: `fld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: clean,
            };
            persist({ ...state, folders: [...state.folders, folder] });
        },
        [state, persist],
    );

    const renameFolder = useCallback(
        (id: string, name: string) => {
            const clean = name.trim();
            if (!clean) return;
            persist({
                ...state,
                folders: state.folders.map((f) => (f.id === id ? { ...f, name: clean } : f)),
            });
        },
        [state, persist],
    );

    const deleteFolder = useCallback(
        (id: string) => {
            const assignments = { ...state.assignments };
            // Desasigna los chats que apuntaban a esta carpeta.
            for (const chatId of Object.keys(assignments)) {
                if (assignments[chatId] === id) delete assignments[chatId];
            }
            persist({
                folders: state.folders.filter((f) => f.id !== id),
                assignments,
            });
        },
        [state, persist],
    );

    const moveFolder = useCallback(
        (id: string, dir: -1 | 1) => {
            const idx = state.folders.findIndex((f) => f.id === id);
            if (idx < 0) return;
            const target = idx + dir;
            if (target < 0 || target >= state.folders.length) return;
            const next = [...state.folders];
            const [item] = next.splice(idx, 1);
            next.splice(target, 0, item);
            persist({ ...state, folders: next });
        },
        [state, persist],
    );

    const assignChat = useCallback(
        (chatId: string, folderId: string | null) => {
            const assignments = { ...state.assignments };
            if (folderId == null) delete assignments[chatId];
            else assignments[chatId] = folderId;
            persist({ ...state, assignments });
        },
        [state, persist],
    );

    const folderOf = useCallback(
        (chatId: string) => state.assignments[chatId] ?? null,
        [state.assignments],
    );

    return useMemo(
        () => ({
            folders: state.folders,
            assignments: state.assignments,
            createFolder,
            renameFolder,
            deleteFolder,
            moveFolder,
            assignChat,
            folderOf,
        }),
        [state, createFolder, renameFolder, deleteFolder, moveFolder, assignChat, folderOf],
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// FoldersPanel — panel visual de Carpetas
// ─────────────────────────────────────────────────────────────────────────────

export function FoldersPanel({
    api,
    activeFolderId,
    onSelectFolder,
    counts,
    totalCount,
    className,
}: {
    api: UseChatFoldersResult;
    activeFolderId: string | null; // null = "Todos"
    onSelectFolder: (folderId: string | null) => void;
    /** folderId -> nº de chats (para badges). */
    counts: Record<string, number>;
    totalCount: number;
    className?: string;
}) {
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");

    const commitCreate = () => {
        if (newName.trim()) api.createFolder(newName);
        setNewName("");
        setCreating(false);
    };

    const commitRename = (id: string) => {
        if (editName.trim()) api.renameFolder(id, editName);
        setEditingId(null);
        setEditName("");
    };

    return (
        <div className={cn("flex flex-col h-full", className)}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
                <div className="flex items-center gap-1.5">
                    <Folder className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Carpetas</span>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 cursor-pointer"
                    title="Nueva carpeta"
                    onClick={() => {
                        setCreating(true);
                        setNewName("");
                    }}
                >
                    <FolderPlus className="w-4 h-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-0.5">
                    {/* Todos */}
                    <button
                        onClick={() => onSelectFolder(null)}
                        className={cn(
                            "flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-left text-sm transition-colors cursor-pointer",
                            activeFolderId === null
                                ? "bg-primary/10 text-primary font-medium"
                                : "hover:bg-muted/60",
                        )}
                    >
                        <Inbox className="w-4 h-4 shrink-0" />
                        <span className="flex-1 truncate">Todos los chats</span>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            {totalCount}
                        </Badge>
                    </button>

                    {api.folders.map((folder, idx) => (
                        <div
                            key={folder.id}
                            className={cn(
                                "group flex items-center gap-1 rounded-lg px-1.5 py-1 transition-colors",
                                activeFolderId === folder.id ? "bg-primary/10" : "hover:bg-muted/60",
                            )}
                        >
                            {editingId === folder.id ? (
                                <div className="flex items-center gap-1 flex-1">
                                    <Input
                                        autoFocus
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") commitRename(folder.id);
                                            if (e.key === "Escape") setEditingId(null);
                                        }}
                                        className="h-7 text-sm px-2"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 cursor-pointer text-emerald-500"
                                        onClick={() => commitRename(folder.id)}
                                    >
                                        <Check className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 cursor-pointer"
                                        onClick={() => setEditingId(null)}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={() => onSelectFolder(folder.id)}
                                        className={cn(
                                            "flex items-center gap-2 flex-1 min-w-0 px-1 py-1 text-left text-sm cursor-pointer",
                                            activeFolderId === folder.id && "text-primary font-medium",
                                        )}
                                    >
                                        <Folder className="w-4 h-4 shrink-0" />
                                        <span className="flex-1 truncate">{folder.name}</span>
                                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                            {counts[folder.id] ?? 0}
                                        </Badge>
                                    </button>
                                    {/* Acciones (visibles al hover) */}
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 cursor-pointer"
                                            title="Subir"
                                            disabled={idx === 0}
                                            onClick={() => api.moveFolder(folder.id, -1)}
                                        >
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 cursor-pointer"
                                            title="Bajar"
                                            disabled={idx === api.folders.length - 1}
                                            onClick={() => api.moveFolder(folder.id, 1)}
                                        >
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 cursor-pointer"
                                            title="Renombrar"
                                            onClick={() => {
                                                setEditingId(folder.id);
                                                setEditName(folder.name);
                                            }}
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 cursor-pointer text-destructive"
                                            title="Eliminar"
                                            onClick={() => api.deleteFolder(folder.id)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}

                    {creating && (
                        <div className="flex items-center gap-1 rounded-lg px-1.5 py-1 bg-muted/40">
                            <Folder className="w-4 h-4 shrink-0 text-muted-foreground ml-1" />
                            <Input
                                autoFocus
                                placeholder="Nombre de carpeta"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") commitCreate();
                                    if (e.key === "Escape") setCreating(false);
                                }}
                                className="h-7 text-sm px-2"
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 cursor-pointer text-emerald-500"
                                onClick={commitCreate}
                            >
                                <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 cursor-pointer"
                                onClick={() => setCreating(false)}
                            >
                                <X className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    )}

                    {api.folders.length === 0 && !creating && (
                        <p className="px-2.5 py-3 text-[11px] text-muted-foreground leading-relaxed">
                            Crea carpetas para organizar tus chats. Se guardan en este
                            dispositivo (localStorage).
                        </p>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) COMPOSITOR UNIVERSAL — selector de formato
// ─────────────────────────────────────────────────────────────────────────────

export type ComposeFormat = "texto" | "audiovideo" | "galeria" | "archivo" | "lienzo";

export interface UniversalComposePayload {
    format: ComposeFormat;
    text?: string;
    url?: string;
}

const FORMATS: {
    key: ComposeFormat;
    label: string;
    icon: React.ReactNode;
    hint: string;
}[] = [
    { key: "texto", label: "Solo Texto", icon: <Type className="w-4 h-4" />, hint: "Mensaje de texto plano." },
    { key: "audiovideo", label: "Audio / Video", icon: <Video className="w-4 h-4" />, hint: "Captura con los sentidos (navegador)." },
    { key: "galeria", label: "Galería", icon: <ImageIcon className="w-4 h-4" />, hint: "Imágenes o álbum (URL)." },
    { key: "archivo", label: "Archivo Único", icon: <FileIcon className="w-4 h-4" />, hint: "Adjunta un archivo (URL)." },
    { key: "lienzo", label: "Lienzo Universal", icon: <PenSquare className="w-4 h-4" />, hint: "Contenido enriquecido en /pizarra." },
];

/**
 * Compositor Universal: elige el FORMATO del mensaje y, según el formato,
 * permite escribir texto o pegar una URL. Para "Lienzo" enlaza a /pizarra.
 * Devuelve un payload estructurado vía `onSend`. HONESTO sobre audio/video.
 */
export function UniversalCompositor({
    open,
    onOpenChange,
    onSend,
    initialFormat = "texto",
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSend: (payload: UniversalComposePayload) => void;
    initialFormat?: ComposeFormat;
}) {
    const [format, setFormat] = useState<ComposeFormat>(initialFormat);
    const [text, setText] = useState("");
    const [url, setUrl] = useState("");

    useEffect(() => {
        if (open) {
            setFormat(initialFormat);
            setText("");
            setUrl("");
        }
    }, [open, initialFormat]);

    const active = FORMATS.find((f) => f.key === format)!;

    const canSend =
        format === "texto"
            ? text.trim().length > 0
            : format === "lienzo"
            ? true
            : url.trim().length > 0 || text.trim().length > 0;

    const handleSend = () => {
        const payload: UniversalComposePayload = { format };
        if (text.trim()) payload.text = text.trim();
        if (url.trim()) payload.url = url.trim();
        onSend(payload);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="font-headline text-xl flex items-center gap-2">
                        <PenSquare className="w-5 h-5 text-primary" />
                        Compositor Universal
                    </DialogTitle>
                    <DialogDescription>
                        Elige el formato del mensaje. El compositor adapta los campos según
                        el tipo de contenido.
                    </DialogDescription>
                </DialogHeader>

                {/* Selector de formato */}
                <div className="grid grid-cols-5 gap-1.5">
                    {FORMATS.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => setFormat(f.key)}
                            className={cn(
                                "flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-center transition-all cursor-pointer",
                                format === f.key
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border/60 hover:bg-muted/60 text-muted-foreground",
                            )}
                            title={f.hint}
                        >
                            <span className="shrink-0">{f.icon}</span>
                            <span className="text-[10px] font-medium leading-tight">{f.label}</span>
                        </button>
                    ))}
                </div>

                <p className="text-xs text-muted-foreground -mt-1">{active.hint}</p>

                {/* Campos según formato */}
                <div className="space-y-3">
                    {format === "texto" && (
                        <textarea
                            autoFocus
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Escribe tu mensaje…"
                            rows={4}
                            className="w-full resize-none rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
                        />
                    )}

                    {format === "audiovideo" && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-amber-600 dark:text-amber-400">
                                <Mic className="w-4 h-4 shrink-0" />
                                <p className="text-xs leading-relaxed">
                                    La grabación usa <strong>los sentidos</strong> (APIs del
                                    navegador, p. ej. <code>getUserMedia</code>). Aquí puedes
                                    pegar una URL de audio/video ya existente o describirlo.
                                </p>
                            </div>
                            <Input
                                placeholder="URL de audio/video (opcional)"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                            />
                            <Input
                                placeholder="Descripción (opcional)"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                            />
                        </div>
                    )}

                    {(format === "galeria" || format === "archivo") && (
                        <div className="space-y-2">
                            <Input
                                autoFocus
                                placeholder={
                                    format === "galeria"
                                        ? "URL de imagen o álbum"
                                        : "URL del archivo"
                                }
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                            />
                            <Input
                                placeholder="Pie de foto / nombre (opcional)"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                            />
                        </div>
                    )}

                    {format === "lienzo" && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-primary">
                                <PenSquare className="w-4 h-4 shrink-0" />
                                <p className="text-xs leading-relaxed">
                                    El Lienzo Universal vive en <strong>/pizarra</strong>. Crea
                                    o abre un lienzo y compártelo como mensaje enriquecido.
                                </p>
                            </div>
                            <Input
                                placeholder="Título del lienzo (opcional)"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                            />
                            <Button asChild variant="outline" className="w-full cursor-pointer">
                                <Link href="/pizarra" target="_blank" rel="noopener noreferrer">
                                    <PenSquare className="mr-2 h-4 w-4" />
                                    Abrir Lienzo Universal (/pizarra)
                                </Link>
                            </Button>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline" className="cursor-pointer">
                            Cancelar
                        </Button>
                    </DialogClose>
                    <Button className="cursor-pointer" onClick={handleSend} disabled={!canSend}>
                        <Send className="mr-2 h-4 w-4" />
                        Enviar al chat
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) INTERCONEXIÓN — Compartir publicación → Enviar al chat
// ─────────────────────────────────────────────────────────────────────────────

/** Normaliza una entrada a una ref `/post/<id>` si es posible. */
export function normalizePostRef(input: string): { id: string; path: string } | null {
    const raw = input.trim();
    if (!raw) return null;
    // Acepta: "/post/abc", "post/abc", "abc", o una URL que contenga /post/<id>.
    const match = raw.match(/post\/([A-Za-z0-9_-]+)/);
    const id = match ? match[1] : /^[A-Za-z0-9_-]+$/.test(raw) ? raw : null;
    if (!id) return null;
    return { id, path: `/post/${id}` };
}

/**
 * Diálogo de Interconexión: pegar/adjuntar una referencia a una publicación
 * (`/post/<id>`) y enviarla al chat activo. Minimal + real.
 */
export function SharePublicationDialog({
    open,
    onOpenChange,
    onShare,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onShare: (ref: { id: string; path: string }) => void;
}) {
    const [value, setValue] = useState("");
    const ref = normalizePostRef(value);

    useEffect(() => {
        if (open) setValue("");
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-headline text-xl flex items-center gap-2">
                        <Share2 className="w-5 h-5 text-primary" />
                        Compartir publicación
                    </DialogTitle>
                    <DialogDescription>
                        Pega el enlace o ID de una publicación (<code>/post/&lt;id&gt;</code>)
                        para enviarla al chat actual.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <div className="relative">
                        <LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            autoFocus
                            placeholder="/post/abc123  ·  o pega una URL"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                    {value && (
                        <p
                            className={cn(
                                "text-xs",
                                ref ? "text-emerald-500" : "text-destructive",
                            )}
                        >
                            {ref
                                ? `Se enviará: ${ref.path}`
                                : "No se reconoce una referencia /post/<id> válida."}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline" className="cursor-pointer">
                            Cancelar
                        </Button>
                    </DialogClose>
                    <Button
                        className="cursor-pointer"
                        disabled={!ref}
                        onClick={() => {
                            if (ref) {
                                onShare(ref);
                                onOpenChange(false);
                            }
                        }}
                    >
                        <Send className="mr-2 h-4 w-4" />
                        Enviar al chat
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
