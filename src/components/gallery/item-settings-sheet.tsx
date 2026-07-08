"use client";

/*
 * ItemSettingsSheet — configuración por CARPETA o ARCHIVO de la Galería:
 *   · Cerebros a sincronizar (patrón media-brains.ts — default: privados).
 *   · Permisos privado/público (os_files.is_public para archivos; ACL de
 *     entity-library para carpetas).
 *   · "Servicios externos": Google Photos sigue siendo un conector futuro
 *     honesto (solo enlace/nota, sin OAuth todavía). Immich SÍ es un conector
 *     REAL de solo lectura v1 (src/lib/integrations, id "immich"): lista tus
 *     álbumes/assets recientes y permite "Importar a Biblioteca" (guarda una
 *     REFERENCIA — Lienzo Universal — vía media-library.ts, nunca copia el
 *     archivo original).
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Cloud, Lock, Globe2, BrainCircuit, Loader2, ImagePlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentUserRef, type EntityRef } from "@/lib/sync/entity-state";
import type { SavedItem, LibraryFolder } from "@/lib/library/entity-library";
import { setFolderAcl } from "@/lib/library/entity-library";
import { useMediaBrains } from "@/lib/library/media-brains";
import { findFileByUrl, updateFileAccess, type OsFile } from "@/lib/files/os-files";
import { loadIntegrationConfig, saveIntegrationConfig, runIntegration } from "@/lib/integrations";
import { saveExternalRefToMedia } from "@/lib/library/media-library";

interface ImmichAlbumRow { id?: string; nombre?: string; elementos?: number }
interface ImmichAssetRow { id?: string; nombre?: string; tipo?: string; fecha?: string }

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

    // ── Immich (conector real de solo lectura v1) ────────────────────────
    const [immichEndpoint, setImmichEndpoint] = useState("");
    const [immichApiKey, setImmichApiKey] = useState("");
    const [immichConnected, setImmichConnected] = useState(false);
    const [immichEditing, setImmichEditing] = useState(false);
    const [immichBusy, setImmichBusy] = useState<"albums" | "assets" | null>(null);
    const [immichError, setImmichError] = useState<string | null>(null);
    const [immichAlbums, setImmichAlbums] = useState<ImmichAlbumRow[] | null>(null);
    const [immichAssets, setImmichAssets] = useState<ImmichAssetRow[] | null>(null);
    const [importingId, setImportingId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const cfg = loadIntegrationConfig("immich");
        setImmichEndpoint(cfg.endpoint || "");
        setImmichApiKey(cfg.apiKey || "");
        const already = !!(cfg.endpoint && cfg.apiKey);
        setImmichConnected(already);
        setImmichEditing(!already);
        setImmichAlbums(null);
        setImmichAssets(null);
        setImmichError(null);
    }, [open, targetId]);

    const saveImmichConnection = () => {
        const endpoint = immichEndpoint.trim();
        const apiKey = immichApiKey.trim();
        if (!endpoint || !apiKey) {
            toast.error("Indica la URL y la clave (x-api-key) de tu Immich.");
            return;
        }
        saveIntegrationConfig("immich", { enabled: true, endpoint, apiKey });
        setImmichConnected(true);
        setImmichEditing(false);
        toast.success("Immich conectado.");
    };

    const loadImmich = async (kind: "albums" | "assets") => {
        setImmichBusy(kind);
        setImmichError(null);
        const res = await runIntegration("immich", kind, kind === "assets" ? { take: 12 } : {});
        setImmichBusy(null);
        if (!res.ok) {
            setImmichError(res.error || "No se pudo conectar con tu Immich.");
            return;
        }
        if (kind === "albums") {
            setImmichAssets(null);
            setImmichAlbums(res.data?.albums ?? []);
        } else {
            setImmichAlbums(null);
            setImmichAssets(res.data?.assets ?? []);
        }
    };

    const importImmichRef = async (kind: "album" | "asset", row: ImmichAlbumRow | ImmichAssetRow) => {
        if (!row.id) return;
        setImportingId(row.id);
        const base = immichEndpoint.trim().replace(/\/+$/, "");
        const deepLink = `${base}/${kind === "album" ? "albums" : "photos"}/${row.id}`;
        const title = ("nombre" in row && row.nombre) || (kind === "album" ? "Álbum de Immich" : "Foto/vídeo de Immich");
        const destFolderId = target && target.kind === "folder" ? target.folder.id : null;
        const res = await saveExternalRefToMedia(libraryRef, {
            title,
            url: deepLink,
            origin: "Importadas",
            destFolderId,
            note: `Importado desde Immich (${kind === "album" ? "álbum" : "asset"}). Ábrelo en tu instancia (requiere sesión iniciada allí) — referencia, no copia.`,
            tags: ["immich", "importado"],
        });
        setImportingId(null);
        if (res.ok) toast.success(`«${title}» guardado en tu Biblioteca.`);
        else toast.error(res.error || "No se pudo importar la referencia.");
    };

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

                        <div className="space-y-2 rounded-xl border border-border/40 bg-muted/10 px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 text-sm font-bold">Im</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold">Immich</p>
                                    <p className="text-[10px] text-muted-foreground/70">
                                        {immichConnected ? "Conector real de solo lectura — conectado." : "Servidor self-host de fotos/vídeos con IA."}
                                    </p>
                                </div>
                                {immichConnected && !immichEditing && (
                                    <button
                                        type="button"
                                        onClick={() => setImmichEditing(true)}
                                        className="cursor-pointer text-[10px] text-muted-foreground underline decoration-dotted hover:text-foreground"
                                    >
                                        editar
                                    </button>
                                )}
                            </div>

                            {immichEditing ? (
                                <div className="space-y-1.5">
                                    <Input
                                        value={immichEndpoint}
                                        onChange={(e) => setImmichEndpoint(e.target.value)}
                                        placeholder="https://tu-immich.ejemplo.com"
                                        className="h-7 text-[11px]"
                                    />
                                    <Input
                                        value={immichApiKey}
                                        onChange={(e) => setImmichApiKey(e.target.value)}
                                        placeholder="Clave de API (x-api-key)"
                                        type="password"
                                        className="h-7 text-[11px]"
                                    />
                                    <Button size="sm" variant="secondary" className="h-7 cursor-pointer text-[11px]" onClick={saveImmichConnection}>
                                        Conectar
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 cursor-pointer text-[11px]"
                                            disabled={immichBusy !== null}
                                            onClick={() => void loadImmich("albums")}
                                        >
                                            {immichBusy === "albums" ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                                            Ver álbumes
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 cursor-pointer text-[11px]"
                                            disabled={immichBusy !== null}
                                            onClick={() => void loadImmich("assets")}
                                        >
                                            {immichBusy === "assets" ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                                            Recientes
                                        </Button>
                                    </div>

                                    {immichError && <p className="text-[10px] text-destructive">{immichError}</p>}

                                    {immichAlbums && (
                                        <ul className="max-h-40 space-y-1 overflow-y-auto">
                                            {immichAlbums.length === 0 && <li className="text-[10px] text-muted-foreground/70">Sin álbumes.</li>}
                                            {immichAlbums.map((a) => (
                                                <li key={a.id} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-white/5">
                                                    <span className="min-w-0 flex-1 truncate">{a.nombre || "Álbum"} <span className="text-muted-foreground/60">({a.elementos ?? 0})</span></span>
                                                    <button
                                                        type="button"
                                                        title="Importar a Biblioteca"
                                                        disabled={importingId === a.id}
                                                        onClick={() => void importImmichRef("album", a)}
                                                        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-50"
                                                    >
                                                        {importingId === a.id ? <Loader2 className="size-3 animate-spin" /> : <ImagePlus className="size-3" />}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {immichAssets && (
                                        <ul className="max-h-40 space-y-1 overflow-y-auto">
                                            {immichAssets.length === 0 && <li className="text-[10px] text-muted-foreground/70">Sin assets recientes.</li>}
                                            {immichAssets.map((a) => (
                                                <li key={a.id} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-white/5">
                                                    <span className="min-w-0 flex-1 truncate">{a.nombre || "Foto/vídeo"} <span className="text-muted-foreground/60">{a.tipo}</span></span>
                                                    <button
                                                        type="button"
                                                        title="Importar a Biblioteca"
                                                        disabled={importingId === a.id}
                                                        onClick={() => void importImmichRef("asset", a)}
                                                        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-50"
                                                    >
                                                        {importingId === a.id ? <Loader2 className="size-3 animate-spin" /> : <ImagePlus className="size-3" />}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                            <p className="text-[10px] text-muted-foreground/60">
                                Solo lectura v1: lista tus álbumes/recientes y «Importar» guarda una referencia en tu Biblioteca (no sube ni copia el archivo original).
                            </p>
                        </div>
                    </section>
                </div>
            </SheetContent>
        </Sheet>
    );
}

export default ItemSettingsSheet;
