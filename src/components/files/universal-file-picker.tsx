"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UniversalFilePicker — SELECTOR UNIVERSAL de archivos (cualquier tipo)
 * ---------------------------------------------------------------------------
 * Diálogo con TRES fuentes de carga:
 *   (a) Dispositivo — input file multiple + drag&drop + progreso de subida
 *       (sube al bucket `os-files` vía src/lib/files/os-files.ts).
 *   (b) Bibliotecas  — navegador compacto de las bibliotecas accesibles del
 *       usuario (Mi biblioteca + páginas/grupos donde es dueño o miembro),
 *       reutilizando `listLibrary` de entity-library.ts; elegibles los ítems
 *       tipo `file`/`external` que tengan `url`.
 *   (c) Neuronas     — mis archivos ya subidos, agrupados por dispositivo
 *       (`listByNeuron`), con buscador + botón "Solicitar archivo a esta
 *       neurona" (broadcast de cuenta `acct:<uid>` evento 'file-request').
 *
 * `onPick(attachments[])` entrega siempre el mismo formato universal
 * (`UniversalAttachment` de os-files.ts), compatible con `DmAttachment` /
 * `CommentAttachment` (mismos campos: kind/name/mime/url/size + fileId extra).
 *
 * SOP: architecture/libreria-biblioteca-sync.md §9. Filosofía del repo:
 * aditivo, nunca lanza, SSR-safe, Crystal Liquid Glass, cursor-pointer,
 * transiciones 150-300ms, sin emojis-icono (lucide-react).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    Upload, Loader2, X, File as FileIcon, Image as ImageIcon, Music, Video as VideoIcon,
    Link as LinkIcon, BookMarked, Cpu, Search, Send, Check, AlertCircle,
} from "lucide-react";
import {
    uploadFile,
    listByNeuron,
    fileToAttachment,
    humanFileSize,
    type UniversalAttachment,
    type NeuronFileGroup,
    type OsFile,
} from "@/lib/files/os-files";
import { onAccountBroadcast, sendAccountBroadcast } from "@/lib/sync/realtime-sync";
import { deviceId } from "@/lib/sync/entity-state";
import {
    myLibraryDestinations,
    listLibrary,
    type LibraryDestination,
    type EntityRef,
    type SavedItem,
} from "@/lib/library/entity-library";

// ───────────────────────────── Tipos públicos ────────────────────────────────

export interface UniversalFilePickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Adjuntos elegidos (una o varias fuentes pueden entregar varios a la vez). */
    onPick: (attachments: UniversalAttachment[]) => void;
    /** Filtro de tipo opcional para el input de dispositivo (p. ej. "image/*"). */
    accept?: string;
    /** Carpeta lógica de subida (p. ej. "mensajes", "avatares", "biblioteca/<entidad>"). */
    folder?: string;
    /** Título del diálogo. */
    title?: string;
    /** Oculta alguna pestaña si no aplica al contexto (por defecto las 3 visibles). */
    hideTabs?: Array<"dispositivo" | "bibliotecas" | "neuronas">;
}

// ───────────────────────── Utilidades de icono/formato ───────────────────────

function iconFor(mime?: string | null, kind?: string | null): typeof FileIcon {
    const m = (mime || kind || "").toLowerCase();
    if (m.startsWith("image")) return ImageIcon;
    if (m.startsWith("audio")) return Music;
    if (m.startsWith("video")) return VideoIcon;
    if (m.includes("link") || m.includes("external") || m.includes("route")) return LinkIcon;
    return FileIcon;
}

// ───────────────────────────── (a) Pestaña Dispositivo ───────────────────────

interface DeviceUpload {
    id: string;
    name: string;
    size: number;
    pct: number;
    status: "subiendo" | "hecho" | "error";
    error?: string;
    attachment?: UniversalAttachment;
}

function DeviceTab({
    accept, folder, onUploaded,
}: {
    accept?: string;
    folder?: string;
    onUploaded: (attachments: UniversalAttachment[]) => void;
}) {
    const [uploads, setUploads] = useState<DeviceUpload[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback(
        async (files: FileList | File[] | null) => {
            if (!files) return;
            const list = Array.from(files);
            if (list.length === 0) return;

            const initial: DeviceUpload[] = list.map((f) => ({
                id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: f.name,
                size: f.size,
                pct: 0,
                status: "subiendo",
            }));
            setUploads((prev) => [...initial, ...prev]);

            const done: UniversalAttachment[] = [];
            for (let i = 0; i < list.length; i++) {
                const file = list[i];
                const uploadId = initial[i].id;
                const res = await uploadFile(file, {
                    folder,
                    onProgress: (pct) => {
                        setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, pct } : u)));
                    },
                });
                if (res.ok && res.file) {
                    const attachment = fileToAttachment(res.file);
                    done.push(attachment);
                    setUploads((prev) =>
                        prev.map((u) => (u.id === uploadId ? { ...u, status: "hecho", pct: 100, attachment } : u)),
                    );
                } else {
                    setUploads((prev) =>
                        prev.map((u) => (u.id === uploadId ? { ...u, status: "error", error: res.error } : u)),
                    );
                    toast.error(res.error || `No se pudo subir «${file.name}».`);
                }
            }
            if (done.length > 0) onUploaded(done);
        },
        [folder, onUploaded],
    );

    return (
        <div className="space-y-3">
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    void handleFiles(e.dataTransfer.files);
                }}
                onClick={() => inputRef.current?.click()}
                className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors duration-200",
                    dragOver
                        ? "border-cyan-400/60 bg-cyan-500/10"
                        : "border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]",
                )}
            >
                <Upload className={cn("size-7", dragOver ? "text-cyan-300" : "text-white/40")} />
                <p className="text-sm font-medium text-white/80">Arrastra archivos aquí o haz clic para elegir</p>
                <p className="text-[11px] text-white/40">Cualquier formato · hasta 50MB por archivo</p>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={accept}
                    className="hidden"
                    onChange={(e) => {
                        void handleFiles(e.target.files);
                        e.target.value = "";
                    }}
                />
            </div>

            {uploads.length > 0 && (
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {uploads.map((u) => {
                        const Icon = iconFor(u.attachment?.mime);
                        return (
                            <div
                                key={u.id}
                                className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                            >
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5">
                                    {u.status === "subiendo" ? (
                                        <Loader2 className="size-3.5 animate-spin text-cyan-300" />
                                    ) : u.status === "error" ? (
                                        <AlertCircle className="size-3.5 text-rose-300" />
                                    ) : (
                                        <Icon className="size-3.5 text-white/60" />
                                    )}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium text-white/85">{u.name}</p>
                                    {u.status === "subiendo" ? (
                                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                                            <div
                                                className="h-full rounded-full bg-cyan-400 transition-all duration-200"
                                                style={{ width: `${u.pct}%` }}
                                            />
                                        </div>
                                    ) : (
                                        <p
                                            className={cn(
                                                "text-[10px]",
                                                u.status === "error" ? "text-rose-300/80" : "text-white/40",
                                            )}
                                        >
                                            {u.status === "error" ? u.error || "Error al subir" : humanFileSize(u.size)}
                                        </p>
                                    )}
                                </div>
                                {u.status === "hecho" && <Check className="size-3.5 shrink-0 text-emerald-400" />}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ───────────────────────────── (b) Pestaña Bibliotecas ───────────────────────

function LibrariesTab({ onPicked }: { onPicked: (attachments: UniversalAttachment[]) => void }) {
    const [destinations, setDestinations] = useState<LibraryDestination[]>([]);
    const [loadingDest, setLoadingDest] = useState(true);
    const [activeRef, setActiveRef] = useState<EntityRef | null>(null);
    const [items, setItems] = useState<SavedItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [query, setQuery] = useState("");

    useEffect(() => {
        let alive = true;
        setLoadingDest(true);
        myLibraryDestinations().then((list) => {
            if (!alive) return;
            setDestinations(list);
            setLoadingDest(false);
            if (list.length > 0) setActiveRef(list[0].ref);
        });
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        if (!activeRef) {
            setItems([]);
            return;
        }
        let alive = true;
        setLoadingItems(true);
        listLibrary(activeRef).then((doc) => {
            if (!alive) return;
            setItems(doc.items.filter((it) => (it.type === "file" || it.type === "external") && !!it.url));
            setLoadingItems(false);
        });
        return () => {
            alive = false;
        };
    }, [activeRef?.kind, activeRef?.id]);

    const filtered = items.filter((it) => it.title.toLowerCase().includes(query.trim().toLowerCase()));

    const pick = (item: SavedItem) => {
        if (!item.url) return;
        const attachment: UniversalAttachment = {
            kind: item.mime?.startsWith("image")
                ? "image"
                : item.mime?.startsWith("audio")
                  ? "audio"
                  : item.mime?.startsWith("video")
                    ? "video"
                    : "file",
            name: item.title,
            mime: item.mime ?? undefined,
            url: item.url,
        };
        onPicked([attachment]);
    };

    if (loadingDest) {
        return (
            <div className="flex items-center justify-center py-10">
                <Loader2 className="size-5 animate-spin text-white/40" />
            </div>
        );
    }

    if (destinations.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-white/40">
                <BookMarked className="size-6 opacity-40" />
                <p className="text-xs">Inicia sesión para ver tus bibliotecas.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
                {destinations.map((d) => {
                    const active = activeRef?.kind === d.ref.kind && activeRef?.id === d.ref.id;
                    return (
                        <button
                            key={`${d.ref.kind}:${d.ref.id}`}
                            type="button"
                            onClick={() => setActiveRef(d.ref)}
                            className={cn(
                                "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-200",
                                active
                                    ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                                    : "border-white/10 bg-white/[0.02] text-white/55 hover:border-white/25 hover:text-white",
                            )}
                        >
                            {d.label}
                        </button>
                    );
                })}
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/30" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar en esta biblioteca…"
                    className="h-8 rounded-lg border-white/10 bg-black/20 pl-8 text-xs"
                />
            </div>

            {loadingItems ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-4 animate-spin text-white/40" />
                </div>
            ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-xs text-white/35">
                    No hay archivos o enlaces guardados en esta biblioteca.
                </p>
            ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                    {filtered.map((it) => {
                        const Icon = iconFor(it.mime, it.type);
                        return (
                            <button
                                key={it.id}
                                type="button"
                                onClick={() => pick(it)}
                                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left transition-colors duration-200 hover:border-cyan-400/30 hover:bg-white/[0.06]"
                            >
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5">
                                    <Icon className="size-3.5 text-white/60" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium text-white/85">{it.title}</p>
                                    <p className="truncate text-[10px] text-white/40">{it.url}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ───────────────────────────── (c) Pestaña Neuronas ──────────────────────────

function NeuronsTab({ onPicked }: { onPicked: (attachments: UniversalAttachment[]) => void }) {
    const [groups, setGroups] = useState<NeuronFileGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [requestOpen, setRequestOpen] = useState<string | null>(null);
    const [requestNote, setRequestNote] = useState("");
    const [requesting, setRequesting] = useState(false);

    const reload = useCallback(() => {
        setLoading(true);
        listByNeuron().then((g) => {
            setGroups(g);
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    const q = query.trim().toLowerCase();
    const filteredGroups = groups
        .map((g) => ({ ...g, files: q ? g.files.filter((f) => f.name.toLowerCase().includes(q)) : g.files }))
        .filter((g) => g.files.length > 0 || !q);

    const pick = (file: OsFile) => {
        onPicked([fileToAttachment(file)]);
    };

    const requestFrom = async (toDevice: string) => {
        setRequesting(true);
        try {
            await sendAccountBroadcast("file-request", {
                toDevice,
                fromDevice: deviceId(),
                note: requestNote.trim() || undefined,
                at: Date.now(),
            });
            toast.success("Solicitud enviada a la neurona.");
            setRequestOpen(null);
            setRequestNote("");
        } finally {
            setRequesting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-10">
                <Loader2 className="size-5 animate-spin text-white/40" />
            </div>
        );
    }

    if (groups.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-white/40">
                <Cpu className="size-6 opacity-40" />
                <p className="text-xs">Aún no tienes archivos subidos desde ninguna neurona.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/30" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar archivo por nombre…"
                    className="h-8 rounded-lg border-white/10 bg-black/20 pl-8 text-xs"
                />
            </div>

            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                {filteredGroups.map((g) => (
                    <div key={g.deviceId} className="space-y-1.5">
                        <div className="flex items-center gap-2 px-0.5">
                            <Cpu className={cn("size-3.5", g.isThisDevice ? "text-cyan-300" : "text-white/40")} />
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                                {g.deviceName}
                                {g.isThisDevice && " · este dispositivo"}
                            </span>
                            {!g.isThisDevice && (
                                <button
                                    type="button"
                                    onClick={() => setRequestOpen(requestOpen === g.deviceId ? null : g.deviceId)}
                                    className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-white/50 transition-colors duration-200 hover:border-cyan-400/30 hover:text-cyan-200"
                                >
                                    <Send className="size-2.5" /> Solicitar archivo
                                </button>
                            )}
                        </div>

                        {requestOpen === g.deviceId && (
                            <div className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-2.5 py-2">
                                <Input
                                    value={requestNote}
                                    onChange={(e) => setRequestNote(e.target.value)}
                                    placeholder="Nota opcional (qué archivo necesitas)…"
                                    className="h-7 flex-1 border-white/10 bg-black/20 text-[11px]"
                                />
                                <Button
                                    size="sm"
                                    className="h-7 cursor-pointer text-[11px]"
                                    disabled={requesting}
                                    onClick={() => void requestFrom(g.deviceId)}
                                >
                                    {requesting ? <Loader2 className="size-3 animate-spin" /> : "Enviar"}
                                </Button>
                            </div>
                        )}

                        {g.files.map((f) => {
                            const Icon = iconFor(f.mime);
                            return (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => pick(f)}
                                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left transition-colors duration-200 hover:border-cyan-400/30 hover:bg-white/[0.06]"
                                >
                                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5">
                                        <Icon className="size-3.5 text-white/60" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-medium text-white/85">{f.name}</p>
                                        <p className="text-[10px] text-white/40">{humanFileSize(f.size)}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ───────────────────────────── Componente raíz ───────────────────────────────

export function UniversalFilePicker({
    open, onOpenChange, onPick, accept, folder, title = "Adjuntar archivo", hideTabs = [],
}: UniversalFilePickerProps) {
    const tabs = (["dispositivo", "bibliotecas", "neuronas"] as const).filter((t) => !hideTabs.includes(t));

    const handlePicked = (attachments: UniversalAttachment[]) => {
        if (attachments.length === 0) return;
        onPick(attachments);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="size-4 text-cyan-300" /> {title}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Desde tu dispositivo, cualquiera de tus bibliotecas, o pídelo a otra neurona de tu cuenta.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue={tabs[0]} className="mt-1">
                    <TabsList>
                        {tabs.includes("dispositivo") && (
                            <TabsTrigger value="dispositivo" className="cursor-pointer gap-1.5">
                                <Upload className="size-3.5" /> Dispositivo
                            </TabsTrigger>
                        )}
                        {tabs.includes("bibliotecas") && (
                            <TabsTrigger value="bibliotecas" className="cursor-pointer gap-1.5">
                                <BookMarked className="size-3.5" /> Bibliotecas
                            </TabsTrigger>
                        )}
                        {tabs.includes("neuronas") && (
                            <TabsTrigger value="neuronas" className="cursor-pointer gap-1.5">
                                <Cpu className="size-3.5" /> Neuronas
                            </TabsTrigger>
                        )}
                    </TabsList>

                    {tabs.includes("dispositivo") && (
                        <TabsContent value="dispositivo">
                            <DeviceTab accept={accept} folder={folder} onUploaded={handlePicked} />
                        </TabsContent>
                    )}
                    {tabs.includes("bibliotecas") && (
                        <TabsContent value="bibliotecas">
                            <LibrariesTab onPicked={handlePicked} />
                        </TabsContent>
                    )}
                    {tabs.includes("neuronas") && (
                        <TabsContent value="neuronas">
                            <NeuronsTab onPicked={handlePicked} />
                        </TabsContent>
                    )}
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

export default UniversalFilePicker;

// ───────────────────────── Botón compacto reutilizable ───────────────────────

export interface AttachFilePickerButtonProps {
    onPick: (attachments: UniversalAttachment[]) => void;
    accept?: string;
    folder?: string;
    title?: string;
    hideTabs?: Array<"dispositivo" | "bibliotecas" | "neuronas">;
    className?: string;
    /** Icono/etiqueta ya los define el llamador vía children; por defecto un clip. */
    children?: ReactNode;
}

/** Botón + diálogo listos para usar (clip por defecto) — evita repetir el estado `open` en cada composer. */
export function AttachFilePickerButton({
    onPick, accept, folder, title, hideTabs, className, children,
}: AttachFilePickerButtonProps) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                    "cursor-pointer transition-colors duration-200",
                    className,
                )}
            >
                {children ?? <Upload className="size-4" />}
            </button>
            <UniversalFilePicker
                open={open}
                onOpenChange={setOpen}
                onPick={(a) => {
                    onPick(a);
                    setOpen(false);
                }}
                accept={accept}
                folder={folder}
                title={title}
                hideTabs={hideTabs}
            />
        </>
    );
}

// Re-exportado para que los consumidores no tengan que importar de dos sitios.
export { onAccountBroadcast };
