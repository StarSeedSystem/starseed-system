"use client";

// ════════════════════════════════════════════════════════════════════════════
// HistoryDialog — HISTORIAL (versiones + ramas) y REGISTRO de un ítem o folder
// de la Biblioteca. Adenda 66 §2 · SOP: architecture/folders-permisos-publicaciones.md
// ----------------------------------------------------------------------------
// Fuente de verdad: tablas `os_versions` / `os_access_log` (en la NUBE), así que
// el historial es el MISMO en todos los dispositivos y perfiles con acceso — la
// RLS ya garantiza que solo lo ve quien puede ver el recurso.
//
// Además funde los snapshots LOCALES heredados (`item.versions`, Adenda 65 §13)
// para no perder el historial que ya tuvieran los ítems guardados antes de esta
// ola. Se muestran juntos, ordenados por fecha, marcando su origen.
//
// Acciones: Restaurar · Crear rama · Comparar (diff de texto) · Registro.
// Estilo: Crystal Liquid Glass (negro translúcido + blur + bordes suaves).
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    History, RotateCcw, GitCompare, Clock, GitBranch, ScrollText,
    Cloud, HardDrive, Loader2, Plus, User as UserIcon, MonitorSmartphone,
} from "lucide-react";
import type { EntityRef, SavedItem, ItemVersionEntry } from "@/lib/library/entity-library";
import {
    listVersions, listBranches, listAccessLog, restoreVersion, branchFrom,
    MAIN_BRANCH, type ResourceVersion, type AccessLogEntry, type ResourceKind,
} from "@/lib/versions/versions";
import { simpleLineDiff } from "./finder-types";

/** Entrada unificada de la lista: viene de la nube (`os_versions`) o del snapshot local heredado. */
interface HistoryEntry {
    id: string;
    origin: "nube" | "local";
    at: string;
    by: string | null;
    deviceId?: string | null;
    branch: string;
    rev: number | null;
    message: string;
    /** Texto comparable (contenido/nota/título) de esa revisión. */
    text: string;
    /** Snapshot completo (solo las de nube) para restaurar de verdad. */
    snapshot?: Record<string, unknown> | null;
}

function textOfLocal(v: Pick<ItemVersionEntry, "content" | "note" | "title">): string {
    return v.content ?? v.note ?? v.title ?? "";
}

/** Texto comparable del snapshot de una revisión de nube (`{item:…}` o `{folder:…}`). */
function textOfSnapshot(snapshot: Record<string, unknown> | null | undefined): string {
    if (!snapshot) return "";
    const node = (snapshot.item ?? snapshot.folder ?? null) as Partial<SavedItem> | null;
    if (!node) return "";
    return node.content ?? node.note ?? node.title ?? "";
}

function shortId(id: string | null | undefined): string {
    if (!id) return "—";
    return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function fmt(at: string): string {
    try {
        return new Date(at).toLocaleString("es-ES");
    } catch {
        return at;
    }
}

export interface HistoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Biblioteca a la que pertenece el recurso (define el `owner` del historial). */
    entityRef: EntityRef;
    /** Qué se versiona. */
    resourceKind: Extract<ResourceKind, "library" | "folder" | "file">;
    resourceId: string;
    title: string;
    /** Ítem actual (si el recurso es un ítem): habilita comparar contra el estado vivo. */
    item?: SavedItem | null;
    /** Restaurar un snapshot LOCAL heredado (versions[] del ítem). */
    onRestoreLocal?: (versionId: string) => void | Promise<void>;
    /** Aplicar el snapshot de una revisión de NUBE al recurso real. */
    onApplySnapshot?: (snapshot: Record<string, unknown> | null | undefined) => void | Promise<void>;
}

export function HistoryDialog({
    open, onOpenChange, entityRef, resourceKind, resourceId, title,
    item, onRestoreLocal, onApplySnapshot,
}: HistoryDialogProps) {
    const [loading, setLoading] = useState(true);
    const [cloud, setCloud] = useState<ResourceVersion[]>([]);
    const [branches, setBranches] = useState<Array<{ branch: string; head: number; count: number }>>([]);
    const [logs, setLogs] = useState<AccessLogEntry[]>([]);
    const [branch, setBranch] = useState<string>(MAIN_BRANCH);
    const [compareId, setCompareId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [newBranchFor, setNewBranchFor] = useState<string | null>(null);
    const [newBranchName, setNewBranchName] = useState("");

    const reload = useCallback(async () => {
        setLoading(true);
        const [v, b, l] = await Promise.all([
            listVersions(resourceKind, resourceId, entityRef, { limit: 200 }),
            listBranches(resourceKind, resourceId, entityRef),
            listAccessLog(resourceKind, resourceId, entityRef, 100),
        ]);
        setCloud(v);
        setBranches(b.map((x) => ({ branch: x.branch, head: x.head, count: x.count })));
        setLogs(l);
        setLoading(false);
    }, [resourceKind, resourceId, entityRef]);

    useEffect(() => {
        if (!open) return;
        void reload();
    }, [open, reload]);

    /** Lista unificada (nube de la rama activa + snapshots locales heredados), más reciente primero. */
    const entries = useMemo<HistoryEntry[]>(() => {
        const fromCloud: HistoryEntry[] = cloud
            .filter((v) => v.branch === branch)
            .map((v) => ({
                id: v.id,
                origin: "nube",
                at: v.createdAt,
                by: v.author,
                deviceId: v.deviceId,
                branch: v.branch,
                rev: v.rev,
                message: v.message || `Revisión ${v.rev}`,
                text: textOfSnapshot(v.snapshot),
                snapshot: v.snapshot,
            }));

        // Los snapshots locales solo tienen sentido en la rama principal (no tenían ramas).
        const fromLocal: HistoryEntry[] =
            branch === MAIN_BRANCH
                ? (item?.versions ?? []).map((v) => ({
                      id: v.id,
                      origin: "local" as const,
                      at: v.at,
                      by: v.by,
                      branch: MAIN_BRANCH,
                      rev: null,
                      message: v.label || "Edición anterior (guardada en este dispositivo)",
                      text: textOfLocal(v),
                  }))
                : [];

        return [...fromCloud, ...fromLocal].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    }, [cloud, branch, item]);

    const currentText = item ? (item.content ?? item.note ?? item.title ?? "") : "";

    const handleRestore = useCallback(
        async (entry: HistoryEntry) => {
            setBusy(true);
            try {
                if (entry.origin === "local") {
                    await onRestoreLocal?.(entry.id);
                    toast.success("Versión restaurada");
                } else {
                    const res = await restoreVersion(entry.id);
                    if (!res.ok) {
                        toast.error("No se pudo restaurar", { description: res.error });
                        return;
                    }
                    await onApplySnapshot?.(res.snapshot);
                    toast.success("Revisión restaurada", {
                        description: "Se anotó una revisión nueva: el historial nunca se reescribe.",
                    });
                    await reload();
                }
            } finally {
                setBusy(false);
            }
        },
        [onRestoreLocal, onApplySnapshot, reload],
    );

    const handleCreateBranch = useCallback(async () => {
        if (!newBranchFor) return;
        const name = newBranchName.trim();
        if (!name) {
            toast.error("Ponle un nombre a la rama.");
            return;
        }
        setBusy(true);
        try {
            const res = await branchFrom(newBranchFor, name);
            if (!res.ok) {
                toast.error("No se pudo crear la rama", { description: res.error });
                return;
            }
            toast.success(`Rama «${name}» creada`, { description: "El original queda intacto." });
            setNewBranchFor(null);
            setNewBranchName("");
            await reload();
            setBranch(name);
        } finally {
            setBusy(false);
        }
    }, [newBranchFor, newBranchName, reload]);

    const kindLabel =
        resourceKind === "folder" ? "folder" : resourceKind === "library" ? "biblioteca" : "archivo";

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) {
                    setCompareId(null);
                    setNewBranchFor(null);
                }
                onOpenChange(o);
            }}
        >
            <DialogContent className="max-w-2xl border-white/10 bg-black/90 text-white backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                        <History className="h-4 w-4 text-primary" /> Historial · {title}
                    </DialogTitle>
                    <DialogDescription>
                        Cada guardado de este {kindLabel} crea una revisión en tu cuenta: la ves desde cualquier
                        dispositivo y perfil con acceso.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="versiones">
                    <TabsList className="grid w-full grid-cols-2 border border-white/10 bg-white/[0.03]">
                        <TabsTrigger value="versiones" className="cursor-pointer gap-1.5 text-xs">
                            <History className="h-3.5 w-3.5" /> Versiones
                        </TabsTrigger>
                        <TabsTrigger value="registro" className="cursor-pointer gap-1.5 text-xs">
                            <ScrollText className="h-3.5 w-3.5" /> Registro
                        </TabsTrigger>
                    </TabsList>

                    {/* ── Versiones + ramas ─────────────────────────────────────── */}
                    <TabsContent value="versiones" className="mt-3">
                        {branches.length > 0 && (
                            <div className="mb-3 flex flex-wrap items-center gap-1.5">
                                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                                {branches.map((b) => (
                                    <button
                                        key={b.branch}
                                        type="button"
                                        onClick={() => setBranch(b.branch)}
                                        className={cn(
                                            "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-200",
                                            branch === b.branch
                                                ? "border-primary/40 bg-primary/15 text-primary"
                                                : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/5 hover:text-white",
                                        )}
                                    >
                                        {b.branch} · {b.count}
                                    </button>
                                ))}
                            </div>
                        )}

                        {loading ? (
                            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Cargando historial…
                            </div>
                        ) : (
                            <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
                                {item && (
                                    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Actual</p>
                                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-white/70">
                                            {currentText || "(sin contenido)"}
                                        </p>
                                    </div>
                                )}

                                {entries.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-8 text-center">
                                        <p className="text-xs text-muted-foreground">
                                            Aún no hay revisiones en esta rama. Se crea una automáticamente cada vez que
                                            guardas un cambio.
                                        </p>
                                    </div>
                                )}

                                {entries.map((e) => (
                                    <div key={`${e.origin}-${e.id}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                                    {e.origin === "nube" ? (
                                                        <Cloud className="h-3 w-3 text-sky-300" />
                                                    ) : (
                                                        <HardDrive className="h-3 w-3 text-amber-300" />
                                                    )}
                                                    {e.rev != null && (
                                                        <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                                                            rev {e.rev}
                                                        </span>
                                                    )}
                                                    <Clock className="h-3 w-3" /> {fmt(e.at)}
                                                </p>
                                                <p className="mt-1 truncate text-xs font-medium text-white/85">{e.message}</p>
                                                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[10.5px] text-muted-foreground">
                                                    <span className="inline-flex items-center gap-1">
                                                        <UserIcon className="h-3 w-3" /> {shortId(e.by)}
                                                    </span>
                                                    {e.deviceId && (
                                                        <span className="inline-flex items-center gap-1">
                                                            <MonitorSmartphone className="h-3 w-3" /> {shortId(e.deviceId)}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>

                                            <div className="flex shrink-0 items-center gap-1.5">
                                                {item && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 cursor-pointer gap-1 px-2 text-[11px]"
                                                        onClick={() => setCompareId((prev) => (prev === e.id ? null : e.id))}
                                                    >
                                                        <GitCompare className="h-3 w-3" /> Comparar
                                                    </Button>
                                                )}
                                                {e.origin === "nube" && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 cursor-pointer gap-1 px-2 text-[11px] text-lime-300 hover:text-lime-200"
                                                        disabled={busy}
                                                        onClick={() => {
                                                            setNewBranchFor(e.id);
                                                            setNewBranchName("");
                                                        }}
                                                    >
                                                        <GitBranch className="h-3 w-3" /> Rama
                                                    </Button>
                                                )}
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 cursor-pointer gap-1 border-white/15 px-2 text-[11px]"
                                                    disabled={busy}
                                                    onClick={() => void handleRestore(e)}
                                                >
                                                    <RotateCcw className="h-3 w-3" /> Restaurar
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Crear rama desde esta revisión */}
                                        {newBranchFor === e.id && (
                                            <div className="mt-2 flex items-center gap-2 rounded-lg border border-lime-500/25 bg-lime-500/[0.06] p-2">
                                                <Input
                                                    value={newBranchName}
                                                    onChange={(ev) => setNewBranchName(ev.target.value)}
                                                    placeholder="Nombre de la rama (p. ej. «variante-oscura»)"
                                                    className="h-8 rounded-lg border-white/10 bg-black/30 text-xs"
                                                    onKeyDown={(ev) => {
                                                        if (ev.key === "Enter") void handleCreateBranch();
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    className="h-8 cursor-pointer gap-1 bg-lime-500/20 px-2.5 text-[11px] text-lime-200 hover:bg-lime-500/30"
                                                    disabled={busy}
                                                    onClick={() => void handleCreateBranch()}
                                                >
                                                    <Plus className="h-3 w-3" /> Crear
                                                </Button>
                                            </div>
                                        )}

                                        {/* Comparar con el estado actual (solo texto) */}
                                        {compareId === e.id && item && (
                                            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-black/40 p-2 font-mono text-[10.5px] leading-relaxed">
                                                {simpleLineDiff(e.text, currentText).map((line, i) => (
                                                    <div
                                                        key={i}
                                                        className={cn(
                                                            "whitespace-pre-wrap px-1",
                                                            line.kind === "add" && "bg-emerald-500/15 text-emerald-200",
                                                            line.kind === "remove" &&
                                                                "bg-rose-500/15 text-rose-200 line-through decoration-rose-400/60",
                                                        )}
                                                    >
                                                        {line.kind === "add" ? "+ " : line.kind === "remove" ? "- " : "  "}
                                                        {line.text || " "}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    {/* ── Registro de accesos y cambios ─────────────────────────── */}
                    <TabsContent value="registro" className="mt-3">
                        {loading ? (
                            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Cargando registro…
                            </div>
                        ) : logs.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-10 text-center">
                                <p className="text-xs text-muted-foreground">
                                    Sin actividad registrada todavía.
                                </p>
                            </div>
                        ) : (
                            <div className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
                                {logs.map((l) => (
                                    <div
                                        key={l.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                                    >
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/70">
                                                {l.action}
                                            </span>
                                            <span className="truncate text-[11px] text-white/75">
                                                {typeof l.detail?.message === "string" ? l.detail.message : ""}
                                            </span>
                                        </div>
                                        <p className="flex shrink-0 items-center gap-2 text-[10.5px] text-muted-foreground">
                                            <span className="inline-flex items-center gap-1">
                                                <UserIcon className="h-3 w-3" /> {shortId(l.actor)}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <MonitorSmartphone className="h-3 w-3" /> {shortId(l.deviceId)}
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <Clock className="h-3 w-3" /> {fmt(l.createdAt)}
                                            </span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

export default HistoryDialog;
