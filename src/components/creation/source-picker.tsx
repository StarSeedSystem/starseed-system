"use client";

// src/components/creation/source-picker.tsx
// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR DE FUENTE UNIVERSAL (Adenda 66 §5).
//
// Un único componente reutilizable para elegir el ORIGEN de un contenido:
//   dispositivo (sube a os-files) · biblioteca · folder · archivo ·
//   cerebro/memoria · neurona · URL.
//
// Devuelve una `SourceRef` normalizada vía `onPick`. Lo consume el Lienzo (para
// insertar bloques de archivo/biblioteca/cerebro…) y se EXPORTA para que otras
// superficies (mensajes, composer) lo reutilicen (coordinación Adenda 66).
//
// SSR-safe: todo acceso a red ocurre en handlers/efectos tras abrir el diálogo.
// Estilo Crystal Liquid Glass · iconos Lucide · alias @/.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/lib/files/os-files";
import {
    myLibraryDestinations,
    listLibrary,
    type EntityRef,
    type LibraryDestination,
    type SavedItem,
    type LibraryFolder,
} from "@/lib/library/entity-library";
import { listBrains, type Brain } from "@/lib/brains/brains";
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";
import {
    HardDrive,
    Link2,
    Library,
    FolderTree,
    FileText,
    BrainCircuit,
    Cpu,
    Loader2,
    ChevronRight,
    ArrowLeft,
    type LucideIcon,
} from "lucide-react";

// ── Referencia normalizada devuelta por el picker ────────────────────────────

export type SourceRefKind =
    | "device"
    | "url"
    | "library"
    | "folder"
    | "file"
    | "brain"
    | "neuron";

export interface SourceRef {
    kind: SourceRefKind;
    /** URL pública (subida al dispositivo · URL externa · URL del archivo). */
    url?: string;
    name?: string;
    mime?: string;
    /** Etiqueta legible del recurso. */
    label?: string;
    /** Biblioteca/folder/archivo: entidad dueña de la biblioteca. */
    library?: { kind: string; id: string; label?: string };
    folderId?: string | null;
    itemId?: string;
    brainId?: string;
    neuronId?: string;
}

interface TabDef {
    id: SourceRefKind;
    label: string;
    icon: LucideIcon;
}

const ALL_TABS: TabDef[] = [
    { id: "device", label: "Dispositivo", icon: HardDrive },
    { id: "library", label: "Biblioteca", icon: Library },
    { id: "folder", label: "Folder", icon: FolderTree },
    { id: "file", label: "Archivo", icon: FileText },
    { id: "brain", label: "Cerebro", icon: BrainCircuit },
    { id: "neuron", label: "Neurona", icon: Cpu },
    { id: "url", label: "URL", icon: Link2 },
];

export interface SourcePickerProps {
    /** Se invoca con la referencia elegida. El picker se cierra tras elegir. */
    onPick: (ref: SourceRef) => void;
    /** Limita las pestañas disponibles (por defecto, todas). */
    kinds?: SourceRefKind[];
    /** Subfolder de os-files para las subidas del dispositivo. */
    uploadFolder?: string;
    /** Controlado: estado de apertura. Si se omite, el picker se autogestiona. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Trigger propio (modo no controlado). Si se omite, se muestra un botón. */
    trigger?: React.ReactNode;
    title?: string;
    description?: string;
}

export function SourcePicker({
    onPick,
    kinds,
    uploadFolder = "creaciones",
    open,
    onOpenChange,
    trigger,
    title = "Elegir fuente",
    description = "Inserta desde tu dispositivo, la biblioteca, un cerebro, una neurona o una URL.",
}: SourcePickerProps) {
    const controlled = open !== undefined;
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = controlled ? !!open : internalOpen;
    const setOpen = useCallback(
        (v: boolean) => {
            if (!controlled) setInternalOpen(v);
            onOpenChange?.(v);
        },
        [controlled, onOpenChange],
    );

    const tabs = useMemo(
        () => (kinds ? ALL_TABS.filter((t) => kinds.includes(t.id)) : ALL_TABS),
        [kinds],
    );
    const [tab, setTab] = useState<SourceRefKind>(tabs[0]?.id ?? "device");

    const handlePick = useCallback(
        (ref: SourceRef) => {
            onPick(ref);
            setOpen(false);
        },
        [onPick, setOpen],
    );

    const body = (
        <DialogContent className="max-w-2xl border-white/10 bg-[#0b0b12]/95 backdrop-blur-xl">
            <DialogHeader>
                <DialogTitle className="text-white/90">{title}</DialogTitle>
                <DialogDescription className="text-white/45">{description}</DialogDescription>
            </DialogHeader>

            {/* Pestañas */}
            <div className="flex flex-wrap gap-1.5">
                {tabs.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer",
                                active
                                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                                    : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.07] hover:text-white/85",
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            <div className="min-h-[220px] pt-1">
                {tab === "device" && <DevicePanel folder={uploadFolder} onPick={handlePick} />}
                {tab === "url" && <UrlPanel onPick={handlePick} />}
                {tab === "library" && <LibraryPanel mode="library" onPick={handlePick} />}
                {tab === "folder" && <LibraryPanel mode="folder" onPick={handlePick} />}
                {tab === "file" && <LibraryPanel mode="file" onPick={handlePick} />}
                {tab === "brain" && <BrainPanel onPick={handlePick} />}
                {tab === "neuron" && <NeuronPanel onPick={handlePick} />}
            </div>
        </DialogContent>
    );

    return (
        <Dialog open={isOpen} onOpenChange={setOpen}>
            {!controlled &&
                (trigger ? (
                    <DialogTrigger asChild>{trigger}</DialogTrigger>
                ) : (
                    <DialogTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="cursor-pointer gap-2 border-white/15 bg-white/[0.03] hover:bg-white/[0.08]"
                        >
                            <HardDrive className="w-3.5 h-3.5" />
                            Elegir fuente
                        </Button>
                    </DialogTrigger>
                ))}
            {body}
        </Dialog>
    );
}

// ── Panel: dispositivo ───────────────────────────────────────────────────────

function DevicePanel({ folder, onPick }: { folder: string; onPick: (r: SourceRef) => void }) {
    const { toast } = useToast();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const [pct, setPct] = useState(0);

    const onChoose = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            setPct(0);
            const res = await uploadFile(file, {
                folder,
                meta: { context: "source-picker" },
                onProgress: setPct,
            });
            setUploading(false);
            if (res.ok && res.file?.url) {
                onPick({
                    kind: "device",
                    url: res.file.url,
                    name: file.name,
                    mime: file.type || res.file.mime || undefined,
                    label: file.name,
                });
            } else {
                toast({
                    title: "Error al subir",
                    description: res.error || res.warning || "No se pudo subir el archivo.",
                    variant: "destructive",
                });
            }
        },
        [folder, onPick, toast],
    );

    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-8 text-center">
            <HardDrive className="h-8 w-8 text-white/30" />
            <p className="text-sm text-white/60">Sube un archivo desde tu dispositivo a tu nube.</p>
            {uploading ? (
                <div className="flex items-center gap-2 text-xs text-white/50">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-300" /> Subiendo… {pct}%
                </div>
            ) : (
                <Button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="cursor-pointer gap-2 bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30"
                >
                    <HardDrive className="h-4 w-4" /> Elegir archivo
                </Button>
            )}
            <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={(e) => void onChoose(e)}
            />
        </div>
    );
}

// ── Panel: URL ───────────────────────────────────────────────────────────────

function UrlPanel({ onPick }: { onPick: (r: SourceRef) => void }) {
    const [url, setUrl] = useState("");
    const [label, setLabel] = useState("");
    const valid = /^https?:\/\/\S+/i.test(url.trim());
    return (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/40">URL</label>
                <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://…"
                    className="bg-black/30 border-white/10 text-sm"
                />
            </div>
            <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/40">Etiqueta (opcional)</label>
                <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Nombre visible"
                    className="bg-black/30 border-white/10 text-sm"
                />
            </div>
            <div className="flex justify-end">
                <Button
                    type="button"
                    disabled={!valid}
                    onClick={() => onPick({ kind: "url", url: url.trim(), label: label.trim() || undefined, name: label.trim() || undefined })}
                    className="cursor-pointer gap-2 bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-40"
                >
                    <Link2 className="h-4 w-4" /> Usar enlace
                </Button>
            </div>
        </div>
    );
}

// ── Panel: biblioteca / folder / archivo ─────────────────────────────────────

function LibraryPanel({
    mode,
    onPick,
}: {
    mode: "library" | "folder" | "file";
    onPick: (r: SourceRef) => void;
}) {
    const [dests, setDests] = useState<LibraryDestination[]>([]);
    const [loading, setLoading] = useState(true);
    const [chosen, setChosen] = useState<LibraryDestination | null>(null);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        myLibraryDestinations().then((list) => {
            if (!alive) return;
            setDests(list);
            setLoading(false);
        });
        return () => {
            alive = false;
        };
    }, []);

    if (loading) {
        return (
            <p className="flex items-center gap-2 p-6 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando tus bibliotecas…
            </p>
        );
    }
    if (dests.length === 0) {
        return (
            <p className="rounded-2xl border border-dashed border-white/12 p-6 text-center text-sm text-white/45">
                Inicia sesión para ver tus bibliotecas.
            </p>
        );
    }

    // Paso 1: elegir biblioteca (para "library" esto es también el resultado).
    if (!chosen) {
        return (
            <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-white/40">Elige una biblioteca</p>
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
                    {dests.map((d) => (
                        <button
                            key={`${d.ref.kind}:${d.ref.id}`}
                            type="button"
                            onClick={() =>
                                mode === "library"
                                    ? onPick({
                                          kind: "library",
                                          library: { kind: d.ref.kind, id: d.ref.id, label: d.label },
                                          label: d.label,
                                      })
                                    : setChosen(d)
                            }
                            className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/[0.07] cursor-pointer"
                        >
                            <Library className="h-4 w-4 shrink-0 text-cyan-300" />
                            <span className="min-w-0 flex-1 truncate">{d.label}</span>
                            {d.hint && <span className="text-[10px] text-white/35">{d.hint}</span>}
                            {mode !== "library" && <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // "library" se resuelve en el Paso 1 (nunca fija `chosen`); aquí sólo
    // quedan folder/file, así que estrechamos el modo para <LibraryContents>.
    if (mode === "library") return null;

    // Paso 2: folder o archivo dentro de la biblioteca elegida.
    return (
        <LibraryContents
            dest={chosen}
            mode={mode}
            onBack={() => setChosen(null)}
            onPick={onPick}
        />
    );
}

function LibraryContents({
    dest,
    mode,
    onBack,
    onPick,
}: {
    dest: LibraryDestination;
    mode: "folder" | "file";
    onBack: () => void;
    onPick: (r: SourceRef) => void;
}) {
    const [folders, setFolders] = useState<LibraryFolder[]>([]);
    const [items, setItems] = useState<SavedItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        listLibrary(dest.ref)
            .then((doc) => {
                if (!alive) return;
                setFolders(doc.folders);
                setItems(doc.items);
                setLoading(false);
            })
            .catch(() => alive && setLoading(false));
        return () => {
            alive = false;
        };
    }, [dest.ref]);

    const lib = { kind: dest.ref.kind, id: dest.ref.id, label: dest.label };

    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white/80 cursor-pointer"
            >
                <ArrowLeft className="h-3.5 w-3.5" /> {dest.label}
            </button>

            {loading ? (
                <p className="flex items-center gap-2 p-4 text-sm text-white/50">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                </p>
            ) : mode === "folder" ? (
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
                    <button
                        type="button"
                        onClick={() => onPick({ kind: "folder", library: lib, folderId: null, label: `${dest.label} · raíz` })}
                        className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/[0.07] cursor-pointer"
                    >
                        <FolderTree className="h-4 w-4 shrink-0 text-cyan-300" />
                        Raíz de la biblioteca
                    </button>
                    {folders.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => onPick({ kind: "folder", library: lib, folderId: f.id, label: f.name })}
                            className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/[0.07] cursor-pointer"
                        >
                            <FolderTree className="h-4 w-4 shrink-0 text-cyan-300" />
                            <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
                    {items.length === 0 && (
                        <p className="p-4 text-center text-xs text-white/40">Esta biblioteca está vacía.</p>
                    )}
                    {items.map((it) => (
                        <button
                            key={it.id}
                            type="button"
                            onClick={() =>
                                onPick({
                                    kind: "file",
                                    library: lib,
                                    itemId: it.id,
                                    url: it.url,
                                    name: it.title,
                                    label: it.title,
                                    folderId: it.folderId ?? null,
                                })
                            }
                            className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/[0.07] cursor-pointer"
                        >
                            <FileText className="h-4 w-4 shrink-0 text-cyan-300" />
                            <span className="min-w-0 flex-1 truncate">{it.title}</span>
                            <span className="text-[10px] text-white/35">{it.type}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Panel: cerebro / memoria ─────────────────────────────────────────────────

function BrainPanel({ onPick }: { onPick: (r: SourceRef) => void }) {
    const [brains, setBrains] = useState<Brain[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        listBrains()
            .then((list) => alive && (setBrains(list), setLoading(false)))
            .catch(() => alive && setLoading(false));
        return () => {
            alive = false;
        };
    }, []);

    if (loading) {
        return (
            <p className="flex items-center gap-2 p-6 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando cerebros…
            </p>
        );
    }
    if (brains.length === 0) {
        return (
            <p className="rounded-2xl border border-dashed border-white/12 p-6 text-center text-sm text-white/45">
                No tienes cerebros configurados todavía.
            </p>
        );
    }
    return (
        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
            {brains.map((b) => (
                <button
                    key={b.id}
                    type="button"
                    onClick={() => onPick({ kind: "brain", brainId: b.id, label: b.name })}
                    className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/[0.07] cursor-pointer"
                >
                    <BrainCircuit className="h-4 w-4 shrink-0 text-fuchsia-300" />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    {b.description && <span className="hidden sm:block max-w-[40%] truncate text-[10px] text-white/35">{b.description}</span>}
                </button>
            ))}
        </div>
    );
}

// ── Panel: neurona ───────────────────────────────────────────────────────────

function NeuronPanel({ onPick }: { onPick: (r: SourceRef) => void }) {
    const [neurons, setNeurons] = useState<Neuron[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        listNeurons()
            .then((list) => alive && (setNeurons(list), setLoading(false)))
            .catch(() => alive && setLoading(false));
        return () => {
            alive = false;
        };
    }, []);

    if (loading) {
        return (
            <p className="flex items-center gap-2 p-6 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando neuronas…
            </p>
        );
    }
    if (neurons.length === 0) {
        return (
            <p className="rounded-2xl border border-dashed border-white/12 p-6 text-center text-sm text-white/45">
                No hay neuronas vinculadas todavía.
            </p>
        );
    }
    return (
        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
            {neurons.map((n) => (
                <button
                    key={n.id}
                    type="button"
                    onClick={() => onPick({ kind: "neuron", neuronId: n.id, label: n.name })}
                    className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/[0.07] cursor-pointer"
                >
                    <Cpu className="h-4 w-4 shrink-0 text-sky-300" />
                    <span className="min-w-0 flex-1 truncate">{n.name}</span>
                    <span className="text-[10px] text-white/35">{n.online ? "en línea" : n.kind}</span>
                </button>
            ))}
        </div>
    );
}
