"use client";

// ════════════════════════════════════════════════════════════════════════════
// RepoDetailSheet — ficha de un repositorio propio (Adenda 65, §16): README
// (ver/editar), metadatos, releases ("Publicar versión") y acciones estilo
// GitHub (Replicar/Instalar/Descargar/Compartir).
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import {
    GitBranch, PenSquare, Save, Tag, Download, Share2, Copy, Package, Loader2,
    Lock, Globe2, FolderOpen, Rocket,
} from "lucide-react";
import { useMyLibraryDestinations, type EntityLibraryDoc, type LibraryFolder } from "@/lib/library/entity-library";
import type { EntityRef } from "@/lib/sync/entity-state";
import { deepLinkForFolder } from "@/components/library/finder/finder-types";
import {
    updateRepoMeta, publishRepoRelease, forkRepo, hasInstallablePackages,
    installRepoPackages, downloadRepoZip,
} from "@/lib/library/user-repos";
import { CreateRepoDialog } from "./create-repo-dialog";

export interface RepoDetailSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    entityRef: EntityRef;
    doc: EntityLibraryDoc;
    folder: LibraryFolder;
    onOpenFolder: (folderId: string) => void;
    onChanged: () => void;
}

export function RepoDetailSheet({ open, onOpenChange, entityRef, doc, folder, onOpenFolder, onChanged }: RepoDetailSheetProps) {
    const repo = folder.repo;
    const [editingReadme, setEditingReadme] = useState(false);
    const [readmeDraft, setReadmeDraft] = useState(repo?.readme ?? "");
    const [busy, setBusy] = useState(false);
    const [metaDialogOpen, setMetaDialogOpen] = useState(false);
    const [releaseTag, setReleaseTag] = useState("");
    const [releaseNote, setReleaseNote] = useState("");
    const [forkOpen, setForkOpen] = useState(false);
    const { destinations } = useMyLibraryDestinations();
    const [forkDestKey, setForkDestKey] = useState("");

    if (!repo) return null;

    const itemsDirect = doc.items.filter((it) => (it.folderId ?? null) === folder.id);
    const subfolders = doc.folders.filter((f) => (f.parentId ?? null) === folder.id);
    const canInstall = hasInstallablePackages(doc, folder.id);

    const handleSaveReadme = async () => {
        setBusy(true);
        await updateRepoMeta(entityRef, folder, { readme: readmeDraft });
        setBusy(false);
        setEditingReadme(false);
        onChanged();
        toast.success("README actualizado");
    };

    const handlePublishRelease = async () => {
        if (!releaseTag.trim() && !releaseNote.trim()) {
            toast.error("Añade al menos un tag o una nota para la versión.");
            return;
        }
        setBusy(true);
        const res = await publishRepoRelease(entityRef, doc, folder, { tag: releaseTag, note: releaseNote });
        setBusy(false);
        if (res.ok) {
            toast.success("Versión publicada", { description: res.message });
            setReleaseTag("");
            setReleaseNote("");
            onChanged();
        } else {
            toast.error("No se pudo publicar la versión", { description: res.message });
        }
    };

    const handleInstall = async () => {
        setBusy(true);
        const res = await installRepoPackages(doc, folder.id);
        setBusy(false);
        if (res.installed > 0) {
            toast.success(`Instalados ${res.installed} paquete(s)`, { description: res.skipped ? `${res.skipped} omitido(s).` : undefined });
        } else {
            toast.error("No se instaló ningún paquete", { description: "Puede que ya estuvieran instalados o no sean válidos." });
        }
    };

    const handleDownload = async () => {
        const res = await downloadRepoZip(doc, folder);
        if (!res.ok) toast.error("No se pudo generar el zip", { description: res.error });
    };

    const handleShare = () => {
        const link = deepLinkForFolder(entityRef, folder.id);
        if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(link).then(
                () => toast.success("Enlace copiado", { description: link }),
                () => toast.message("Enlace generado", { description: link }),
            );
        } else {
            toast.message("Enlace generado", { description: link });
        }
    };

    const handleFork = async () => {
        const dest = destinations.find((d) => `${d.ref.kind}:${d.ref.id}` === forkDestKey) ?? destinations[0];
        if (!dest) {
            toast.error("Inicia sesión para replicar este repositorio.");
            return;
        }
        setBusy(true);
        const res = await forkRepo(entityRef, doc, folder, dest.ref, null);
        setBusy(false);
        if (res.ok) {
            toast.success("Repositorio replicado", { description: `Copiado a ${dest.label} (${res.itemsCopied ?? 0} ítem(s)).` });
            setForkOpen(false);
        } else {
            toast.error("No se pudo replicar", { description: res.error });
        }
    };

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent side="right" className="w-full overflow-y-auto border-white/10 bg-black/85 backdrop-blur-2xl sm:max-w-xl">
                    <SheetHeader className="text-left">
                        <div className="flex items-start gap-3">
                            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-lime-500/30 bg-lime-500/10">
                                <GitBranch className="h-6 w-6 text-lime-300" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <SheetTitle className="text-lg text-white">{folder.name}</SheetTitle>
                                <SheetDescription className="text-xs">{repo.description || "Sin descripción."}</SheetDescription>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span
                                        className={cn(
                                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold",
                                            repo.visibility === "publico"
                                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                                : "border-white/15 bg-white/5 text-muted-foreground",
                                        )}
                                    >
                                        {repo.visibility === "publico" ? <Globe2 className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                                        {repo.visibility === "publico" ? "Público" : "Privado"}
                                    </span>
                                    {repo.license && (
                                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                                            {repo.license}
                                        </span>
                                    )}
                                    {repo.topics.map((t) => (
                                        <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] text-muted-foreground">
                                            #{t}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </SheetHeader>

                    <div className="mt-5 flex flex-col gap-5 pb-10">
                        {repo.forkedFrom && (
                            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-[11px] text-muted-foreground">
                                Replicado (fork) de otro repositorio.
                            </p>
                        )}

                        <div className="space-y-2">
                            <p className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                <span>
                                    Archivos ({itemsDirect.length} ítem(s), {subfolders.length} carpeta(s))
                                </span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 cursor-pointer gap-1 px-2 text-[11px]"
                                    onClick={() => {
                                        onOpenFolder(folder.id);
                                        onOpenChange(false);
                                    }}
                                >
                                    <FolderOpen className="h-3 w-3" /> Abrir en el Finder
                                </Button>
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">README.md</p>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 cursor-pointer gap-1 px-2 text-[11px]"
                                    onClick={() => {
                                        setReadmeDraft(repo.readme);
                                        setEditingReadme((v) => !v);
                                    }}
                                >
                                    <PenSquare className="h-3 w-3" /> {editingReadme ? "Cancelar" : "Editar"}
                                </Button>
                            </div>
                            {editingReadme ? (
                                <div className="space-y-2">
                                    <Textarea
                                        value={readmeDraft}
                                        onChange={(e) => setReadmeDraft(e.target.value)}
                                        rows={10}
                                        className="border-white/15 bg-black/30 font-mono text-xs"
                                    />
                                    <Button
                                        size="sm"
                                        onClick={() => void handleSaveReadme()}
                                        disabled={busy}
                                        className="cursor-pointer gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-500"
                                    >
                                        <Save className="h-3.5 w-3.5" /> Guardar README
                                    </Button>
                                </div>
                            ) : (
                                <div
                                    className={cn(
                                        "prose prose-invert prose-sm max-h-72 max-w-none overflow-auto rounded-xl border border-white/10 bg-white/[0.02] p-4",
                                        "prose-headings:text-white/90 prose-p:text-white/75 prose-a:text-cyan-300 prose-strong:text-white prose-code:text-amber-200",
                                    )}
                                >
                                    <ReactMarkdown>{repo.readme || "_(sin README)_"}</ReactMarkdown>
                                </div>
                            )}
                        </div>

                        <Button
                            size="sm"
                            variant="outline"
                            className="w-fit cursor-pointer gap-1.5 border-white/15 text-xs hover:bg-white/10"
                            onClick={() => setMetaDialogOpen(true)}
                        >
                            <Tag className="h-3.5 w-3.5" /> Editar metadatos…
                        </Button>

                        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                <Rocket className="h-3.5 w-3.5" /> Publicar versión (release)
                            </p>
                            <div className="grid grid-cols-[1fr_2fr] gap-2">
                                <Input
                                    value={releaseTag}
                                    onChange={(e) => setReleaseTag(e.target.value)}
                                    placeholder={`v${repo.releases.length + 1}`}
                                    className="h-8 border-white/15 bg-black/30 text-xs"
                                />
                                <Input
                                    value={releaseNote}
                                    onChange={(e) => setReleaseNote(e.target.value)}
                                    placeholder="Nota de esta versión…"
                                    className="h-8 border-white/15 bg-black/30 text-xs"
                                />
                            </div>
                            <Button
                                size="sm"
                                onClick={() => void handlePublishRelease()}
                                disabled={busy}
                                className="cursor-pointer gap-1.5 bg-lime-600 text-xs text-white hover:bg-lime-500"
                            >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />} Publicar versión
                            </Button>
                            {repo.releases.length > 0 && (
                                <div className="mt-2 space-y-1.5">
                                    {repo.releases.slice(0, 6).map((r) => (
                                        <div key={r.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-[11px]">
                                            <div className="flex items-center justify-between">
                                                <span className="font-semibold text-white/85">{r.tag}</span>
                                                <span className="text-muted-foreground">
                                                    {new Date(r.createdAt).toLocaleDateString("es-ES")} {r.published && "· pública"}
                                                </span>
                                            </div>
                                            {r.note && <p className="mt-0.5 text-muted-foreground">{r.note}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className="text-[10px] text-muted-foreground">
                                {repo.visibility === "publico"
                                    ? "Al publicar, esta carpeta se vuelca de nuevo a la Librería pública (instantánea; no es un diff real de git)."
                                    : "Este repositorio es privado: la versión queda en el historial, sin volcarse a la Librería pública."}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="cursor-pointer gap-1.5 border-white/15 text-xs hover:bg-white/10"
                                onClick={() => setForkOpen((v) => !v)}
                            >
                                <GitBranch className="h-3.5 w-3.5" /> Replicar / Guardar copia…
                            </Button>
                            {canInstall && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="cursor-pointer gap-1.5 border-emerald-500/30 text-xs text-emerald-300 hover:bg-emerald-500/10"
                                    onClick={() => void handleInstall()}
                                    disabled={busy}
                                >
                                    <Package className="h-3.5 w-3.5" /> Instalar
                                </Button>
                            )}
                            <Button size="sm" variant="outline" className="cursor-pointer gap-1.5 border-white/15 text-xs hover:bg-white/10" onClick={() => void handleDownload()}>
                                <Download className="h-3.5 w-3.5" /> Descargar .zip
                            </Button>
                            <Button size="sm" variant="outline" className="cursor-pointer gap-1.5 border-white/15 text-xs hover:bg-white/10" onClick={handleShare}>
                                <Share2 className="h-3.5 w-3.5" /> Compartir
                            </Button>
                        </div>

                        {forkOpen && (
                            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                <p className="text-xs text-muted-foreground">Copia este repositorio (con su contenido) a una de tus bibliotecas.</p>
                                <Select value={forkDestKey || `${destinations[0]?.ref.kind}:${destinations[0]?.ref.id}`} onValueChange={setForkDestKey}>
                                    <SelectTrigger className="h-9 border-white/15 bg-black/30 text-xs">
                                        <SelectValue placeholder="Biblioteca destino" />
                                    </SelectTrigger>
                                    <SelectContent className="border-white/10 bg-black/90 backdrop-blur-xl">
                                        {destinations.map((d) => (
                                            <SelectItem key={`${d.ref.kind}:${d.ref.id}`} value={`${d.ref.kind}:${d.ref.id}`} className="text-xs">
                                                {d.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button size="sm" onClick={() => void handleFork()} disabled={busy} className="cursor-pointer gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-500">
                                    <Copy className="h-3.5 w-3.5" /> Replicar aquí
                                </Button>
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            <CreateRepoDialog
                open={metaDialogOpen}
                onOpenChange={setMetaDialogOpen}
                fixedName={folder.name}
                initial={{
                    description: repo.description,
                    visibility: repo.visibility,
                    category: repo.category,
                    license: repo.license,
                    topics: repo.topics.join(", "),
                    readme: repo.readme,
                }}
                title="Editar metadatos del repositorio"
                submitLabel="Guardar cambios"
                busy={busy}
                onSubmit={(value) => {
                    void (async () => {
                        setBusy(true);
                        await updateRepoMeta(entityRef, folder, {
                            description: value.description,
                            visibility: value.visibility,
                            category: value.category,
                            license: value.license,
                            topics: value.topics,
                            readme: value.readme,
                        });
                        setBusy(false);
                        setMetaDialogOpen(false);
                        onChanged();
                        toast.success("Metadatos actualizados");
                    })();
                }}
            />
        </>
    );
}

export default RepoDetailSheet;
