"use client";

// ════════════════════════════════════════════════════════════════════════════
// ConnectedRepoSheet — ficha de un repositorio GitHub CONECTADO (Adenda 65,
// §17): README/releases (metadatos cacheados), Sincronizar/Instalar/Descargar
// /Compartir/Abrir en GitHub/Guardar en otra biblioteca.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { GitBranch, Star, GitFork, RefreshCcw, Download, Share2, ExternalLink, Package, Loader2 } from "lucide-react";
import type { SavedItem } from "@/lib/library/entity-library";
import type { EntityRef } from "@/lib/sync/entity-state";
import { deepLinkFor } from "@/components/library/finder/finder-types";
import { resyncConnectedRepo, githubZipUrl, tryInstallManifest } from "@/lib/library/connected-repos";
import { SaveToLibrary } from "@/components/library/save-to-library";

export interface ConnectedRepoSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    entityRef: EntityRef;
    /** Ítem `type==="repo"` con `connectedRepo` presente. */
    item: SavedItem;
    onChanged: () => void;
}

export function ConnectedRepoSheet({ open, onOpenChange, entityRef, item, onChanged }: ConnectedRepoSheetProps) {
    const meta = item.connectedRepo;
    const [busy, setBusy] = useState(false);

    if (!meta) return null;

    const handleResync = async () => {
        setBusy(true);
        const res = await resyncConnectedRepo(entityRef, item.id, meta.owner, meta.repo);
        setBusy(false);
        if (res.ok) {
            toast.success("Metadatos actualizados");
            onChanged();
        } else {
            toast.error("No se pudo sincronizar", { description: res.error });
        }
    };

    const handleInstall = async () => {
        setBusy(true);
        const res = await tryInstallManifest(meta);
        setBusy(false);
        if (res.ok) toast.success("Repo instalado como fuente de paquetes", { description: res.message });
        else toast.message("No instalable directamente", { description: res.message });
    };

    const handleShare = () => {
        const link = deepLinkFor(entityRef, item.id);
        if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(link).then(
                () => toast.success("Enlace copiado", { description: link }),
                () => toast.message("Enlace generado", { description: link }),
            );
        } else {
            toast.message("Enlace generado", { description: link });
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full overflow-y-auto border-white/10 bg-black/85 backdrop-blur-2xl sm:max-w-xl">
                <SheetHeader className="text-left">
                    <div className="flex items-start gap-3">
                        {meta.ownerAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={meta.ownerAvatar} alt={meta.ownerLogin} className="h-12 w-12 shrink-0 rounded-2xl border border-white/10 object-cover" />
                        ) : (
                            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5">
                                <GitBranch className="h-6 w-6 text-white/70" />
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <SheetTitle className="text-lg text-white">{meta.fullName}</SheetTitle>
                            <SheetDescription className="text-xs">{meta.description || "Sin descripción."}</SheetDescription>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                    <Star className="h-3 w-3" /> {meta.stars}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <GitFork className="h-3 w-3" /> {meta.forks}
                                </span>
                                {meta.language && <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5">{meta.language}</span>}
                                {meta.license && <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5">{meta.license}</span>}
                            </div>
                            {meta.topics.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {meta.topics.map((t) => (
                                        <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] text-muted-foreground">
                                            #{t}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </SheetHeader>

                <div className="mt-5 flex flex-col gap-5 pb-10">
                    <p className="text-[10px] text-muted-foreground">
                        Sincronizado {new Date(meta.syncedAt).toLocaleString("es-ES")} · lectura pública sin token (límite: 60 peticiones/hora).
                    </p>

                    <div
                        className={cn(
                            "prose prose-invert prose-sm max-h-96 max-w-none overflow-auto rounded-xl border border-white/10 bg-white/[0.02] p-4",
                            "prose-headings:text-white/90 prose-p:text-white/75 prose-a:text-cyan-300 prose-strong:text-white prose-code:text-amber-200",
                        )}
                    >
                        <ReactMarkdown>{meta.readme || "_(este repo no tiene README, o no se pudo leer)_"}</ReactMarkdown>
                    </div>

                    {meta.releases.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Releases</p>
                            {meta.releases.slice(0, 6).map((r, i) => (
                                <div key={`${r.tag}-${i}`} className="rounded-lg border border-white/10 bg-black/20 p-2 text-[11px]">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-white/85">{r.name || r.tag}</span>
                                        {r.publishedAt && <span className="text-muted-foreground">{new Date(r.publishedAt).toLocaleDateString("es-ES")}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            className="cursor-pointer gap-1.5 border-white/15 text-xs hover:bg-white/10"
                            onClick={() => void handleResync()}
                            disabled={busy}
                        >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Sincronizar metadatos
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="cursor-pointer gap-1.5 border-emerald-500/30 text-xs text-emerald-300 hover:bg-emerald-500/10"
                            onClick={() => void handleInstall()}
                            disabled={busy}
                        >
                            <Package className="h-3.5 w-3.5" /> Instalar
                        </Button>
                        <Button size="sm" variant="outline" className="cursor-pointer gap-1.5 border-white/15 text-xs hover:bg-white/10" asChild>
                            <a href={githubZipUrl(meta)} target="_blank" rel="noopener noreferrer">
                                <Download className="h-3.5 w-3.5" /> Descargar .zip
                            </a>
                        </Button>
                        <Button size="sm" variant="outline" className="cursor-pointer gap-1.5 border-white/15 text-xs hover:bg-white/10" onClick={handleShare}>
                            <Share2 className="h-3.5 w-3.5" /> Compartir
                        </Button>
                        <Button size="sm" variant="outline" className="cursor-pointer gap-1.5 border-white/15 text-xs hover:bg-white/10" asChild>
                            <a href={meta.htmlUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" /> Abrir en GitHub
                            </a>
                        </Button>
                        <SaveToLibrary
                            variant="button"
                            label="Guardar en otra biblioteca…"
                            item={{ type: "repo", url: meta.htmlUrl, title: meta.fullName, note: meta.description }}
                        />
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

export default ConnectedRepoSheet;
