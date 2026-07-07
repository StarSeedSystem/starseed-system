"use client";

/*
 * CameraApp — cámara real del OS (foto + vídeo), con controles AUTO y
 * MANUALES aplicando MediaTrackConstraints reales soportadas por el hardware.
 * Guarda en la biblioteca personal (carpeta "Imágenes y videos" → subcarpeta
 * "Cámara") vía os-files + entity-library, con destino/nube/dispositivo
 * seleccionables y persistidos (camera-settings.ts).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
    Camera as CameraIcon, Video, Circle, Square, SwitchCamera, Zap, ZapOff,
    Grid3x3, Timer, Settings2, X, Loader2, AlertCircle, Images, Cloud, HardDriveDownload,
    FolderOpen, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCameraEngine } from "./use-camera-engine";
import {
    useCameraHwSettings, useCameraStoragePrefs, RESOLUTION_PRESETS, FPS_OPTIONS, TIMER_OPTIONS,
    type TimerSeconds, type PhotoFormat, type VideoFormat,
} from "@/lib/camera/camera-settings";
import { currentUserRef, type EntityRef } from "@/lib/sync/entity-state";
import { ensureMediaFolders, saveMediaToLibrary, type MediaFolders } from "@/lib/library/media-library";
import { listLibrary, type LibraryFolder } from "@/lib/library/entity-library";

type CaptureMode = "photo" | "video";

function downloadBlob(blob: Blob, name: string): void {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
        /* descarga best-effort: si falla, la copia en nube sigue disponible */
    }
}

function formatMs(ms: number): string {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60).toString().padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}

/** Aplana el árbol de carpetas bajo `rootId` (raíz incluida) en una lista con indentación. */
function flattenFolders(folders: LibraryFolder[], rootId: string): Array<{ id: string; label: string }> {
    const byParent = new Map<string | null, LibraryFolder[]>();
    for (const f of folders) {
        const list = byParent.get(f.parentId) ?? [];
        list.push(f);
        byParent.set(f.parentId, list);
    }
    const root = folders.find((f) => f.id === rootId);
    const out: Array<{ id: string; label: string }> = [];
    if (root) out.push({ id: root.id, label: root.name });
    const walk = (parentId: string, depth: number) => {
        for (const child of byParent.get(parentId) ?? []) {
            out.push({ id: child.id, label: `${"— ".repeat(depth)}${child.name}` });
            walk(child.id, depth + 1);
        }
    };
    walk(rootId, 1);
    return out;
}

export function CameraApp() {
    const [hw, updateHw] = useCameraHwSettings();
    const [ref, setRef] = useState<EntityRef | null>(null);
    const [mode, setMode] = useState<CaptureMode>("photo");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [preview, setPreview] = useState<{ blob: Blob; kind: "image" | "video"; url: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [mediaFolders, setMediaFolders] = useState<MediaFolders | null>(null);
    const [folderOptions, setFolderOptions] = useState<Array<{ id: string; label: string }>>([]);
    const [torchOn, setTorchOn] = useState(false);

    const [prefs, updatePrefs] = useCameraStoragePrefs(ref);

    const engine = useCameraEngine({ facingMode: hw.facingMode, resolution: hw.resolution, fps: hw.fps });

    useEffect(() => {
        void currentUserRef().then(setRef);
    }, []);

    useEffect(() => {
        void engine.start();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- se relanza dentro del propio hook al cambiar hw.facingMode/resolution/fps
    }, [hw.facingMode, hw.resolution, hw.fps]);

    useEffect(() => () => engine.stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!ref) return;
        let alive = true;
        void (async () => {
            const folders = await ensureMediaFolders(ref);
            const doc = await listLibrary(ref);
            if (!alive) return;
            setMediaFolders(folders);
            setFolderOptions(flattenFolders(doc.folders, folders.rootId));
        })();
        return () => {
            alive = false;
        };
    }, [ref]);

    const doCapturePhoto = useCallback(async () => {
        const blob = await engine.capturePhoto({ format: hw.photoFormat, quality: hw.quality });
        if (!blob) {
            toast.error("No se pudo capturar la foto. Vuelve a intentarlo.");
            return;
        }
        setPreview({ blob, kind: "image", url: URL.createObjectURL(blob) });
    }, [engine, hw.photoFormat, hw.quality]);

    const runCapture = useCallback(() => {
        if (mode === "video") {
            if (engine.isRecording) {
                void engine.stopRecording().then((blob) => {
                    if (blob) setPreview({ blob, kind: "video", url: URL.createObjectURL(blob) });
                    else toast.error("No se pudo finalizar la grabación.");
                });
            } else {
                engine.startRecording();
            }
            return;
        }
        if (hw.timerSeconds > 0) {
            let remaining = hw.timerSeconds;
            setCountdown(remaining);
            const id = window.setInterval(() => {
                remaining -= 1;
                if (remaining <= 0) {
                    window.clearInterval(id);
                    setCountdown(null);
                    void doCapturePhoto();
                } else {
                    setCountdown(remaining);
                }
            }, 1000);
        } else {
            void doCapturePhoto();
        }
    }, [mode, engine, hw.timerSeconds, doCapturePhoto]);

    const handleSave = useCallback(async () => {
        if (!preview) return;
        if (!ref) {
            toast.error("Inicia sesión para guardar en tu biblioteca.");
            return;
        }
        setSaving(true);
        const ext = preview.kind === "image" ? hw.photoFormat : hw.videoFormat;
        const name = `captura-${Date.now()}.${ext}`;
        const results: string[] = [];

        if (prefs.saveToCloud) {
            const res = await saveMediaToLibrary(ref, {
                file: preview.blob,
                name,
                origin: "Cámara",
                destFolderId: prefs.destFolderId ?? mediaFolders?.subfolders["Cámara"] ?? null,
            });
            if (res.ok) results.push("tu nube");
            else toast.error(res.error || "No se pudo guardar en la nube.");
        }
        if (prefs.saveToDevice) {
            downloadBlob(preview.blob, name);
            results.push("este dispositivo");
        }
        setSaving(false);
        if (results.length > 0) toast.success(`Guardado en ${results.join(" y ")}.`);
        URL.revokeObjectURL(preview.url);
        setPreview(null);
    }, [preview, ref, prefs, hw.photoFormat, hw.videoFormat, mediaFolders]);

    const discardPreview = useCallback(() => {
        if (preview) URL.revokeObjectURL(preview.url);
        setPreview(null);
    }, [preview]);

    const resolutionValue = useMemo(() => hw.resolution, [hw.resolution]);

    return (
        <div className="relative flex h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-black">
            {/* Vista de la cámara */}
            <div className="relative flex-1 overflow-hidden bg-black">
                <video
                    ref={engine.videoRef as React.RefObject<HTMLVideoElement>}
                    playsInline
                    muted
                    className={cn(
                        "h-full w-full object-cover transition-opacity duration-300",
                        hw.facingMode === "user" && "-scale-x-100",
                        engine.status === "active" ? "opacity-100" : "opacity-0",
                    )}
                />

                {hw.grid && engine.status === "active" && (
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                        {Array.from({ length: 9 }).map((_, i) => (
                            <div key={i} className="border border-white/15" />
                        ))}
                    </div>
                )}

                {countdown !== null && (
                    <div className="absolute inset-0 grid place-items-center bg-black/40">
                        <span className="text-8xl font-black text-white drop-shadow-lg">{countdown}</span>
                    </div>
                )}

                {engine.status === "requesting" && (
                    <div className="absolute inset-0 grid place-items-center gap-3 text-center text-white/70">
                        <Loader2 className="size-8 animate-spin" />
                        <p className="text-sm">Solicitando acceso a la cámara…</p>
                    </div>
                )}

                {engine.status === "error" && (
                    <div className="absolute inset-0 grid place-items-center gap-3 px-6 text-center">
                        <AlertCircle className="size-8 text-rose-400" />
                        <p className="max-w-xs text-sm text-white/80">{engine.error}</p>
                        <Button onClick={() => void engine.start()} className="cursor-pointer">
                            Reintentar
                        </Button>
                    </div>
                )}

                {engine.status === "idle" && (
                    <div className="absolute inset-0 grid place-items-center gap-3 px-6 text-center">
                        <CameraIcon className="size-8 text-white/50" />
                        <p className="max-w-xs text-sm text-white/70">Activa la cámara para empezar a capturar.</p>
                        <Button onClick={() => void engine.start()} className="cursor-pointer">
                            Activar cámara
                        </Button>
                    </div>
                )}

                {/* Barra superior */}
                <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
                    <Link
                        href="/galeria"
                        className="grid size-9 cursor-pointer place-items-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
                        title="Ir a la Galería"
                    >
                        <Images className="size-4" />
                    </Link>
                    <div className="flex items-center gap-2">
                        {engine.isRecording && (
                            <span className="flex items-center gap-1.5 rounded-full bg-rose-600/90 px-2.5 py-1 text-xs font-bold text-white">
                                <span className="size-2 animate-pulse rounded-full bg-white" /> {formatMs(engine.recordMs)}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => updateHw({ grid: !hw.grid })}
                            className={cn(
                                "grid size-9 cursor-pointer place-items-center rounded-full backdrop-blur transition-colors",
                                hw.grid ? "bg-cyan-500/70 text-white" : "bg-black/40 text-white/80 hover:bg-black/60",
                            )}
                            title="Cuadrícula"
                        >
                            <Grid3x3 className="size-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                updateHw({ timerSeconds: TIMER_OPTIONS[(TIMER_OPTIONS.indexOf(hw.timerSeconds) + 1) % TIMER_OPTIONS.length] })
                            }
                            className={cn(
                                "grid size-9 cursor-pointer place-items-center rounded-full backdrop-blur transition-colors",
                                hw.timerSeconds > 0 ? "bg-amber-500/70 text-white" : "bg-black/40 text-white/80 hover:bg-black/60",
                            )}
                            title={`Temporizador: ${hw.timerSeconds === 0 ? "desactivado" : `${hw.timerSeconds}s`}`}
                        >
                            <Timer className="size-4" />
                        </button>
                        {engine.capabilities.torch && (
                            <button
                                type="button"
                                onClick={() => {
                                    const next = !torchOn;
                                    setTorchOn(next);
                                    void engine.setTorch(next);
                                }}
                                className={cn(
                                    "grid size-9 cursor-pointer place-items-center rounded-full backdrop-blur transition-colors",
                                    torchOn ? "bg-amber-400/80 text-black" : "bg-black/40 text-white/80 hover:bg-black/60",
                                )}
                                title={torchOn ? "Apagar linterna" : "Encender linterna"}
                            >
                                {torchOn ? <Zap className="size-4" /> : <ZapOff className="size-4" />}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setSettingsOpen(true)}
                            className="grid size-9 cursor-pointer place-items-center rounded-full bg-black/40 text-white/80 backdrop-blur transition-colors hover:bg-black/60"
                            title="Ajustes de cámara"
                        >
                            <Settings2 className="size-4" />
                        </button>
                    </div>
                </div>

                {/* Zoom (solo si el hardware lo soporta de verdad) */}
                {engine.capabilities.zoom && engine.status === "active" && (
                    <div className="absolute bottom-28 right-3 flex h-40 flex-col items-center gap-2 rounded-full bg-black/40 px-2 py-3 backdrop-blur">
                        <Slider
                            orientation="vertical"
                            min={engine.capabilities.zoom.min}
                            max={engine.capabilities.zoom.max}
                            step={engine.capabilities.zoom.step}
                            defaultValue={[engine.capabilities.zoom.min]}
                            onValueChange={(v) => void engine.setZoom(v[0])}
                            className="h-32"
                        />
                        <span className="text-[10px] font-bold text-white/80">Zoom</span>
                    </div>
                )}
            </div>

            {/* Barra inferior de controles */}
            <div className="flex flex-col items-center gap-3 bg-black/90 px-4 py-4">
                <div className="flex items-center gap-1 rounded-full bg-white/10 p-1">
                    <button
                        type="button"
                        onClick={() => setMode("photo")}
                        className={cn(
                            "cursor-pointer rounded-full px-4 py-1.5 text-xs font-bold transition-colors",
                            mode === "photo" ? "bg-white text-black" : "text-white/70",
                        )}
                    >
                        Foto
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode("video")}
                        disabled={!engine.mediaRecorderSupported}
                        className={cn(
                            "cursor-pointer rounded-full px-4 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                            mode === "video" ? "bg-white text-black" : "text-white/70",
                        )}
                        title={engine.mediaRecorderSupported ? undefined : "Este navegador no soporta grabación de vídeo"}
                    >
                        Vídeo
                    </button>
                </div>

                <div className="flex w-full items-center justify-between px-6">
                    <button
                        type="button"
                        onClick={() => updateHw({ facingMode: hw.facingMode === "user" ? "environment" : "user" })}
                        className="grid size-11 cursor-pointer place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                        title="Cambiar cámara"
                    >
                        <SwitchCamera className="size-5" />
                    </button>

                    <button
                        type="button"
                        onClick={runCapture}
                        disabled={engine.status !== "active" || countdown !== null}
                        className={cn(
                            "grid size-[72px] cursor-pointer place-items-center rounded-full border-4 border-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
                            mode === "video" && engine.isRecording ? "bg-rose-600" : "bg-white/20",
                        )}
                        title={mode === "photo" ? "Capturar foto" : engine.isRecording ? "Detener grabación" : "Iniciar grabación"}
                    >
                        {mode === "photo" ? (
                            <CameraIcon className="size-7 text-white" />
                        ) : engine.isRecording ? (
                            <Square className="size-6 fill-white text-white" />
                        ) : (
                            <Circle className="size-9 fill-rose-600 text-rose-600" />
                        )}
                    </button>

                    <span className="grid size-11 place-items-center text-white/40">
                        {mode === "photo" ? <CameraIcon className="size-5" /> : <Video className="size-5" />}
                    </span>
                </div>
            </div>

            {/* Sheet de ajustes */}
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
                <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-sm">
                    <SheetHeader>
                        <SheetTitle>Ajustes de cámara</SheetTitle>
                        <SheetDescription>Controles reales según lo que soporta tu dispositivo.</SheetDescription>
                    </SheetHeader>

                    <div className="mt-4 space-y-6 px-1">
                        <section className="space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Captura</h3>

                            <div className="space-y-1.5">
                                <Label>Resolución</Label>
                                <Select value={resolutionValue} onValueChange={(v) => updateHw({ resolution: v as typeof hw.resolution })}>
                                    <SelectTrigger className="cursor-pointer">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(Object.keys(RESOLUTION_PRESETS) as Array<keyof typeof RESOLUTION_PRESETS>).map((k) => (
                                            <SelectItem key={k} value={k} className="cursor-pointer">
                                                {RESOLUTION_PRESETS[k].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label>Fotogramas por segundo</Label>
                                <Select value={String(hw.fps)} onValueChange={(v) => updateHw({ fps: Number(v) })}>
                                    <SelectTrigger className="cursor-pointer">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {FPS_OPTIONS.map((f) => (
                                            <SelectItem key={f} value={String(f)} className="cursor-pointer">
                                                {f} fps
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label>Formato de foto</Label>
                                <Select value={hw.photoFormat} onValueChange={(v) => updateHw({ photoFormat: v as PhotoFormat })}>
                                    <SelectTrigger className="cursor-pointer">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="jpeg" className="cursor-pointer">JPEG</SelectItem>
                                        <SelectItem value="png" className="cursor-pointer">PNG</SelectItem>
                                        <SelectItem value="webp" className="cursor-pointer">WebP</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label>Formato de vídeo</Label>
                                <Select
                                    value={hw.videoFormat}
                                    onValueChange={(v) => updateHw({ videoFormat: v as VideoFormat })}
                                >
                                    <SelectTrigger className="cursor-pointer">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="webm" className="cursor-pointer">WebM (soporte amplio)</SelectItem>
                                        <SelectItem value="mp4" className="cursor-pointer">MP4 (si tu navegador lo soporta)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label>Calidad</Label>
                                    <span className="text-xs text-muted-foreground">{Math.round(hw.quality * 100)}%</span>
                                </div>
                                <Slider
                                    min={0.5}
                                    max={1}
                                    step={0.01}
                                    value={[hw.quality]}
                                    onValueChange={(v) => updateHw({ quality: v[0] })}
                                />
                            </div>

                            {engine.capabilities.focusDistance && (
                                <div className="space-y-1.5">
                                    <Label>Enfoque manual</Label>
                                    <Slider
                                        min={engine.capabilities.focusDistance.min}
                                        max={engine.capabilities.focusDistance.max}
                                        step={engine.capabilities.focusDistance.step}
                                        defaultValue={[engine.capabilities.focusDistance.min]}
                                        onValueChange={(v) => void engine.setFocusDistance(v[0])}
                                    />
                                </div>
                            )}

                            {engine.capabilities.exposureCompensation && (
                                <div className="space-y-1.5">
                                    <Label>Exposición</Label>
                                    <Slider
                                        min={engine.capabilities.exposureCompensation.min}
                                        max={engine.capabilities.exposureCompensation.max}
                                        step={engine.capabilities.exposureCompensation.step}
                                        defaultValue={[0]}
                                        onValueChange={(v) => void engine.setExposureCompensation(v[0])}
                                    />
                                </div>
                            )}

                            {!engine.capabilities.zoom && !engine.capabilities.focusDistance && !engine.capabilities.exposureCompensation && (
                                <p className="text-[11px] text-muted-foreground/70">
                                    Tu dispositivo no expone controles manuales adicionales (zoom/enfoque/exposición) para esta cámara.
                                </p>
                            )}
                        </section>

                        <section className="space-y-3 border-t border-border/50 pt-4">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Almacenamiento</h3>

                            <div className="space-y-1.5">
                                <Label>Carpeta destino</Label>
                                <Select
                                    value={prefs.destFolderId ?? mediaFolders?.subfolders["Cámara"] ?? ""}
                                    onValueChange={(v) => updatePrefs({ destFolderId: v })}
                                >
                                    <SelectTrigger className="cursor-pointer">
                                        <SelectValue placeholder="Imágenes y videos › Cámara" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {folderOptions.map((f) => (
                                            <SelectItem key={f.id} value={f.id} className="cursor-pointer">
                                                {f.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center justify-between">
                                <Label className="flex items-center gap-1.5"><Cloud className="size-3.5" /> Guardar en la nube (biblioteca)</Label>
                                <Switch checked={prefs.saveToCloud} onCheckedChange={(v) => updatePrefs({ saveToCloud: v })} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label className="flex items-center gap-1.5"><HardDriveDownload className="size-3.5" /> Guardar también en este dispositivo</Label>
                                <Switch checked={prefs.saveToDevice} onCheckedChange={(v) => updatePrefs({ saveToDevice: v })} />
                            </div>
                        </section>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Vista previa tras capturar */}
            <Dialog open={!!preview} onOpenChange={(o) => !o && discardPreview()}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{preview?.kind === "video" ? "Vídeo capturado" : "Foto capturada"}</DialogTitle>
                        <DialogDescription>Revisa antes de guardar. Se guardará según tus ajustes de almacenamiento.</DialogDescription>
                    </DialogHeader>
                    {preview && (
                        <div className="overflow-hidden rounded-xl border border-border/50 bg-black">
                            {preview.kind === "image" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={preview.url} alt="Vista previa" className="max-h-80 w-full object-contain" />
                            ) : (
                                <video src={preview.url} controls className="max-h-80 w-full" />
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                        <FolderOpen className="size-3.5 shrink-0" />
                        <span className="truncate">
                            {prefs.saveToCloud ? "Se guardará en tu biblioteca" : "No se guardará en la nube"}
                            {prefs.saveToDevice ? " y se descargará a este dispositivo." : "."}
                        </span>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button variant="outline" onClick={discardPreview} className="cursor-pointer">
                            <X className="mr-1.5 size-4" /> Descartar
                        </Button>
                        <Button onClick={() => void handleSave()} disabled={saving} className="cursor-pointer">
                            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Check className="mr-1.5 size-4" />}
                            Guardar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default CameraApp;
