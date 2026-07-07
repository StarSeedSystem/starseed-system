"use client";

/*
 * ItemSettingsSheet — configuración por CARPETA o ARCHIVO de la Galería:
 *   · Cerebros a sincronizar (patrón media-brains.ts — default: privados).
 *   · Permisos privado/público (os_files.is_public para archivos; ACL de
 *     entity-library para carpetas).
 *   · "Servicios externos" (Google Photos, etc.): conectores futuros
 *     honestos — solo enlace/nota, sin OAuth todavía.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Cloud, Lock, Globe2, BrainCircuit } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { currentUserRef, type EntityRef } from "@/lib/sync/entity-state";
import type { SavedItem, LibraryFolder } from "@/lib/library/entity-library";
import { setFolderAcl } from "@/lib/library/entity-library";
import { useMediaBrains } from "@/lib/library/media-brains";
import { findFileByUrl, updateFileAccess, type OsFile } from "@/lib/files/os-files";

export type SettingsTarget = { kind: "file"; item: SavedItem } | { kind: "folder"; folder: LibraryFolder };

export interface ItemSettingsSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    libraryRef: EntityRef;
    target: SettingsTarget | null;
}

export function ItemSettingsSheet({ open, onOpenChange, libraryRef, target }: ItemSettingsSheetProps) {
    const targetId = target ? (target.kind === "file" ? target.item.id : target.folder.id) : null;
    const name = target ? (target.kind === "file" ? target.item.title : target.folder.name) : "";
    const { config, brains, setMode, toggleBrain } = useMediaBrains(libraryRef, targetId);

    const [osFile, setOsFile] = useState<OsFile | null>(null);
    const [uid, setUid] = useState<string | null>(null);
    const [folderPrivate, setFolderPrivate] = useState(false);

    useEffect(() => {
        void currentUserRef().then((r) => setUid(r?.id ?? null));
    }, []);

    useEffect(() => {
        if (!target || target.kind !== "file" || !target.item.url) {
            setOsFile(null);
            return;
        }
        void findFileByUrl(target.item.url).then(setOsFile);
    }, [target]);

    useEffect(() => {
        if (!target || target.kind !== "folder") return;
        setFolderPrivate((target.folder.acl?.read?.length ?? 0) > 0);
    }, [target]);

    if (!target) return null;

    const togglePublicFile = async (isPublic: boolean) => {
        if (!osFile) return;
        const ok = await updateFileAccess(osFile.id, { isPublic });
        if (ok) {
            setOsFile({ ...osFile, isPublic });
            toast.success(isPublic ? "Archivo marcado como público." : "Archivo marcado como privado.");
        } else {
            toast.error("No se pudo actualizar el permiso.");
        }
    };

    const toggleFolderPrivacy = async (makePrivate: boolean) => {
        if (target.kind !== "folder" || !uid) return;
        if (makePrivate) {
            await setFolderAcl(libraryRef, target.folder.id, {
                read: [{ kind: "user", id: uid, label: "Yo" }],
                write: [{ kind: "user", id: uid, label: "Yo" }],
            });
        } else {
            await setFolderAcl(libraryRef, target.folder.id, null);
        }
        setFolderPrivate(makePrivate);
        toast.success(makePrivate ? "Carpeta marcada como privada." : "Carpeta marcada como visible para quien acceda a esta biblioteca.");
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-sm">
                <SheetHeader>
                    <SheetTitle className="truncate">{name}</SheetTitle>
                    <SheetDescription>Cerebros, permisos y sincronización externa.</SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-6 px-1">
                    <section className="space-y-3">
                        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            <BrainCircuit className="size-3.5" /> Cerebros a sincronizar
                        </h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setMode("all")}
                                className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${config.mode === "all" ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-border/50 text-muted-foreground"}`}
                            >
                                Todos los privados
                            </button>
                            <button
                                onClick={() => setMode("selected")}
                                className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors ${config.mode === "selected" ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-border/50 text-muted-foreground"}`}
                            >
                                Elegir
                            </button>
                        </div>
                        {config.mode === "selected" && (
                            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/40 p-2">
                                {brains.length === 0 && <p className="px-1 py-2 text-[11px] text-muted-foreground/70">Aún no tienes cerebros registrados.</p>}
                                {brains.map((b) => (
                                    <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/30">
                                        <Checkbox checked={config.brains.includes(b.id)} onCheckedChange={() => toggleBrain(b.id)} />
                                        <span className="truncate">{b.name}</span>
                                        {b.scope !== "account" && <Badge variant="outline" className="ml-auto text-[9px]">{b.scope}</Badge>}
                                    </label>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="space-y-3 border-t border-border/50 pt-4">
                        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            <Lock className="size-3.5" /> Permisos
                        </h3>
                        {target.kind === "file" ? (
                            osFile ? (
                                <div className="flex items-center justify-between">
                                    <Label className="flex items-center gap-1.5"><Globe2 className="size-3.5" /> Archivo público</Label>
                                    <Switch checked={osFile.isPublic} onCheckedChange={(v) => void togglePublicFile(v)} />
                                </div>
                            ) : (
                                <p className="text-[11px] text-muted-foreground/70">No se pudo resolver el archivo original en el almacenamiento.</p>
                            )
                        ) : (
                            <div className="flex items-center justify-between">
                                <Label className="flex items-center gap-1.5"><Lock className="size-3.5" /> Carpeta privada (solo yo)</Label>
                                <Switch checked={folderPrivate} onCheckedChange={(v) => void toggleFolderPrivacy(v)} />
                            </div>
                        )}
                    </section>

                    <section className="space-y-2 border-t border-border/50 pt-4">
                        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            <Cloud className="size-3.5" /> Servicios externos
                        </h3>
                        <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-muted/10 px-3 py-2.5">
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 text-sm font-bold">G</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold">Google Photos</p>
                                <p className="text-[10px] text-muted-foreground/70">Conector futuro — aún sin integración real.</p>
                            </div>
                            <a
                                href="https://photos.google.com"
                                target="_blank"
                                rel="noreferrer"
                                className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
                                title="Abrir Google Photos"
                            >
                                <ExternalLink className="size-3.5" />
                            </a>
                        </div>
                        <p className="text-[10px] text-muted-foreground/60">
                            La sincronización con servicios externos (Google Photos y similares) no está conectada todavía: este apartado es honesto sobre eso, no simula una sincronización que no existe.
                        </p>
                    </section>
                </div>
            </SheetContent>
        </Sheet>
    );
}

export default ItemSettingsSheet;
