"use client";

// ════════════════════════════════════════════════════════════════════════════
// InstallToDialog — "Instalar/guardar en…" (Adenda 65, §18): un único diálogo
// con 4 destinos REALES (nunca inventados), cada uno sobre infraestructura ya
// existente en el repo:
//   · Biblioteca/folder   → saveItem() (entity-library.ts)
//   · Escritorio (acceso directo) → addIcon() (desktop-store.ts)
//   · Cerebro (memoria)    → saveBrain() empujando a includes.memories[] (brains.ts)
//   · Servidor/host propio → api/integrations/proxy (ya existente) — mejor esfuerzo,
//     honesto: solo funciona si ese host expone POST /starseed/import.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BookMarked, Monitor, BrainCircuit, Server, Loader2, Check, Folder } from "lucide-react";
import { saveItem, useMyLibraryDestinations, listLibrary, type SaveItemInput } from "@/lib/library/entity-library";
import { readDesktopsSnapshot, addIcon } from "@/components/desktop/desktop-store";
import { listBrains, saveBrain, type Brain, type BrainServer } from "@/lib/brains/brains";

export interface InstallToDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Datos mínimos del ítem a instalar/guardar (sin acoplar a SavedItem completo). */
    item: {
        id: string;
        title: string;
        route?: string;
        url?: string;
        note?: string;
        content?: string;
        mime?: string;
        type: SaveItemInput["type"];
        refId?: string;
        tags?: string[];
    };
    defaultDest?: "biblioteca" | "escritorio" | "cerebro" | "servidor";
}

type Dest = "biblioteca" | "escritorio" | "cerebro" | "servidor";

const DEST_META: Record<Dest, { label: string; icon: typeof BookMarked }> = {
    biblioteca: { label: "Biblioteca", icon: BookMarked },
    escritorio: { label: "Escritorio", icon: Monitor },
    cerebro: { label: "Cerebro", icon: BrainCircuit },
    servidor: { label: "Servidor", icon: Server },
};

export function InstallToDialog({ open, onOpenChange, item, defaultDest = "biblioteca" }: InstallToDialogProps) {
    const [dest, setDest] = useState<Dest>(defaultDest);
    const [busy, setBusy] = useState(false);

    // ── Biblioteca/folder ──
    const { destinations, loading: loadingDests } = useMyLibraryDestinations();
    const [libKey, setLibKey] = useState("");
    const [folderId, setFolderId] = useState("__root__");
    const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
    const selectedLib = useMemo(
        () => destinations.find((d) => `${d.ref.kind}:${d.ref.id}` === libKey) ?? destinations[0],
        [destinations, libKey],
    );
    useEffect(() => {
        if (!selectedLib) return;
        listLibrary(selectedLib.ref).then((doc) => setFolders(doc.folders.map((f) => ({ id: f.id, name: f.name }))));
    }, [selectedLib]);

    // ── Cerebro ──
    const [brains, setBrains] = useState<Brain[]>([]);
    const [brainId, setBrainId] = useState("");
    useEffect(() => {
        if (open) void listBrains().then(setBrains);
    }, [open]);

    // ── Servidor ──
    const servers = useMemo(
        () =>
            brains.flatMap((b) =>
                (b.servers ?? [])
                    .filter((s) => !!s.endpoint)
                    .map((s) => ({ ...s, brainName: b.name }) as BrainServer & { brainName: string }),
            ),
        [brains],
    );
    const [serverKey, setServerKey] = useState("");

    useEffect(() => {
        if (open) setDest(defaultDest);
    }, [open, defaultDest]);

    const doSaveToLibrary = async () => {
        if (!selectedLib) {
            toast.error("Inicia sesión para guardar en una biblioteca");
            return;
        }
        setBusy(true);
        const res = await saveItem(
            selectedLib.ref,
            { type: item.type, refId: item.refId, route: item.route, url: item.url, title: item.title, note: item.note, tags: item.tags, content: item.content, mime: item.mime },
            folderId === "__root__" ? null : folderId,
        );
        setBusy(false);
        if (res.ok) {
            toast.success("Guardado en biblioteca", { description: `«${item.title}» en ${selectedLib.label}.` });
            onOpenChange(false);
        } else {
            toast.error("No se pudo guardar");
        }
    };

    const doDesktopShortcut = () => {
        const snap = readDesktopsSnapshot();
        if (!snap.activeId) {
            toast.error("No hay un escritorio activo para crear el acceso directo.");
            return;
        }
        addIcon(snap.activeId, { kind: "link", name: item.title, url: item.route ?? item.url ?? "" });
        toast.success("Acceso directo creado", { description: "Revisa tu escritorio activo." });
        onOpenChange(false);
    };

    const doAddToBrainMemory = async () => {
        const brain = brains.find((b) => b.id === brainId);
        if (!brain) {
            toast.error("Elige un cerebro");
            return;
        }
        setBusy(true);
        const memoRef = `entitylib:${item.id}:${item.title}`;
        const nextMemories = Array.from(new Set([...(brain.includes?.memories ?? []), memoRef]));
        const saved = await saveBrain({ ...brain, includes: { ...brain.includes, memories: nextMemories } });
        setBusy(false);
        if (saved) {
            toast.success("Añadido como memoria", { description: `«${item.title}» en el cerebro «${brain.name}».` });
            onOpenChange(false);
        } else {
            toast.error("No se pudo actualizar el cerebro");
        }
    };

    const doSendToServer = async () => {
        const server = servers.find((s) => s.id === serverKey);
        if (!server?.endpoint) {
            toast.error("Elige un servidor configurado");
            return;
        }
        setBusy(true);
        try {
            const res = await fetch("/api/integrations/proxy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: "install-to-server",
                    endpoint: server.endpoint,
                    method: "POST",
                    path: "/starseed/import",
                    body: { title: item.title, url: item.url, route: item.route, note: item.note, content: item.content, mime: item.mime },
                    auth: "none",
                }),
            });
            const json = (await res.json().catch(() => null)) as { ok?: boolean; status?: number; error?: string } | null;
            if (json?.ok) {
                toast.success("Enviado al servidor", { description: `Respondió ${json.status ?? "OK"}.` });
                onOpenChange(false);
            } else {
                toast.error("No se pudo enviar", { description: json?.error ?? "Puede que ese host no exponga POST /starseed/import." });
            }
        } finally {
            setBusy(false);
        }
    };

    const handleConfirm = () => {
        if (dest === "biblioteca") void doSaveToLibrary();
        else if (dest === "escritorio") doDesktopShortcut();
        else if (dest === "cerebro") void doAddToBrainMemory();
        else void doSendToServer();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md border-white/10 bg-black/90 text-white backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle className="text-sm font-semibold">Instalar / guardar en… · {item.title}</DialogTitle>
                    <DialogDescription>Elige un destino real — nada se finge: cada opción usa infraestructura ya existente del OS.</DialogDescription>
                </DialogHeader>

                <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
                    {(Object.keys(DEST_META) as Dest[]).map((d) => {
                        const meta = DEST_META[d];
                        return (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setDest(d)}
                                className={cn(
                                    "flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                                    dest === d ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white",
                                )}
                            >
                                <meta.icon className="h-3.5 w-3.5" /> {meta.label}
                            </button>
                        );
                    })}
                </div>

                {dest === "biblioteca" && (
                    <div className="space-y-2">
                        {loadingDests ? (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando bibliotecas…</p>
                        ) : destinations.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Inicia sesión para guardar en tu biblioteca o en la de tus comunidades.</p>
                        ) : (
                            <>
                                <Select value={libKey || `${destinations[0]?.ref.kind}:${destinations[0]?.ref.id}`} onValueChange={setLibKey}>
                                    <SelectTrigger className="h-9 border-white/15 bg-black/30 text-xs"><SelectValue placeholder="Biblioteca destino" /></SelectTrigger>
                                    <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                                        {destinations.map((d) => (
                                            <SelectItem key={`${d.ref.kind}:${d.ref.id}`} value={`${d.ref.kind}:${d.ref.id}`} className="text-xs">{d.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={folderId} onValueChange={setFolderId}>
                                    <SelectTrigger className="h-9 border-white/15 bg-black/30 text-xs"><SelectValue placeholder="Folder" /></SelectTrigger>
                                    <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                                        <SelectItem value="__root__" className="text-xs"><span className="flex items-center gap-1.5"><Folder className="h-3 w-3" /> Sin folder (raíz)</span></SelectItem>
                                        {folders.map((f) => (
                                            <SelectItem key={f.id} value={f.id} className="text-xs"><span className="flex items-center gap-1.5"><Folder className="h-3 w-3" /> {f.name}</span></SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </>
                        )}
                    </div>
                )}

                {dest === "escritorio" && (
                    <p className="text-xs text-muted-foreground">
                        Crea un acceso directo (tipo enlace) en tu escritorio ACTIVO, apuntando a la ruta/URL de este ítem.
                    </p>
                )}

                {dest === "cerebro" && (
                    <div className="space-y-2">
                        {brains.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No tienes cerebros todavía.</p>
                        ) : (
                            <Select value={brainId} onValueChange={setBrainId}>
                                <SelectTrigger className="h-9 border-white/15 bg-black/30 text-xs"><SelectValue placeholder="Elige un cerebro" /></SelectTrigger>
                                <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                                    {brains.map((b) => (
                                        <SelectItem key={b.id} value={b.id} className="text-xs">{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <p className="text-[10px] text-muted-foreground">Añade una referencia estable a `includes.memories` del cerebro elegido.</p>
                    </div>
                )}

                {dest === "servidor" && (
                    <div className="space-y-2">
                        {servers.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No tienes servidores con URL configurada en ningún cerebro.</p>
                        ) : (
                            <Select value={serverKey} onValueChange={setServerKey}>
                                <SelectTrigger className="h-9 border-white/15 bg-black/30 text-xs"><SelectValue placeholder="Elige un servidor" /></SelectTrigger>
                                <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                                    {servers.map((s) => (
                                        <SelectItem key={s.id} value={s.id} className="text-xs">{s.name} · {(s as BrainServer & { brainName: string }).brainName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                            Mejor esfuerzo: envía un POST JSON a «/starseed/import» en ese host. Funciona si tu servidor expone esa ruta; si no, verás el error real.
                        </p>
                    </div>
                )}

                <Button type="button" onClick={handleConfirm} disabled={busy} className="w-full cursor-pointer gap-2 bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Confirmar
                </Button>
            </DialogContent>
        </Dialog>
    );
}

export default InstallToDialog;
