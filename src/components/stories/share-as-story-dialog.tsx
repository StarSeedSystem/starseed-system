"use client";

/*
 * ShareAsStoryDialog — "Compartir como historia" desde la Galería/visor.
 * Duración editable (presets + personalizada, default 24h), audiencia
 * (personal/pública/grupo(s)) y ubicación opcional. Publica vía la API real
 * de `network-stories.ts` (que a su vez usa `publish()` sin modificarlo).
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MapPin, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { SavedItem } from "@/lib/library/entity-library";
import { mediaKindOf } from "@/lib/library/media-library";
import { listDestinations, type DestinationOption } from "@/lib/publish/publish";
import {
    shareAsStory, STORY_DURATION_PRESETS, DEFAULT_STORY_HOURS, type StoryAudience, type NetworkStoryLocation,
} from "@/lib/stories/network-stories";

export interface ShareAsStoryDialogProps {
    item: SavedItem;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ShareAsStoryDialog({ item, open, onOpenChange }: ShareAsStoryDialogProps) {
    const [hours, setHours] = useState<number>(DEFAULT_STORY_HOURS);
    const [customHours, setCustomHours] = useState("");
    const [audience, setAudience] = useState<StoryAudience>("publica");
    const [groups, setGroups] = useState<DestinationOption[]>([]);
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
    const [caption, setCaption] = useState("");
    const [attachLocation, setAttachLocation] = useState(false);
    const [location, setLocation] = useState<NetworkStoryLocation | null>(null);
    const [locating, setLocating] = useState(false);
    const [locationLabel, setLocationLabel] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (audience === "grupo" && groups.length === 0) {
            void listDestinations("grupo").then(setGroups);
        }
    }, [audience, groups.length]);

    useEffect(() => {
        if (!attachLocation || !navigator.geolocation) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setLocating(false);
            },
            () => {
                toast.error("No se pudo obtener tu ubicación.");
                setAttachLocation(false);
                setLocating(false);
            },
            { timeout: 8000 },
        );
    }, [attachLocation]);

    const handleSubmit = async () => {
        const kind = mediaKindOf(item);
        if (kind === "other" || !item.url) {
            toast.error("Este archivo no se puede compartir como historia.");
            return;
        }
        setSubmitting(true);
        const res = await shareAsStory({
            url: item.url,
            mime: item.mime,
            mediaKind: kind,
            caption: caption.trim() || undefined,
            hours,
            audience,
            groupIds: audience === "grupo" ? Array.from(selectedGroups) : undefined,
            location: attachLocation && location ? { ...location, label: locationLabel.trim() || undefined } : undefined,
        });
        setSubmitting(false);
        if (res.ok) {
            toast.success("Historia compartida.");
            onOpenChange(false);
        } else {
            toast.error(res.error || "No se pudo compartir la historia.");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-amber-300" /> Compartir como historia</DialogTitle>
                    <DialogDescription>«{item.title}» aparecerá temporalmente y se filtrará sola al caducar.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Duración</p>
                        <div className="flex flex-wrap gap-1.5">
                            {STORY_DURATION_PRESETS.map((p) => (
                                <button
                                    key={p.hours}
                                    onClick={() => {
                                        setHours(p.hours);
                                        setCustomHours("");
                                    }}
                                    className={cn(
                                        "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                        hours === p.hours && !customHours ? "border-amber-400/60 bg-amber-500/15 text-amber-200" : "border-border/50 text-muted-foreground",
                                    )}
                                >
                                    {p.label}
                                </button>
                            ))}
                            <Input
                                value={customHours}
                                onChange={(e) => {
                                    setCustomHours(e.target.value);
                                    const n = Number(e.target.value);
                                    if (Number.isFinite(n) && n > 0) setHours(n);
                                }}
                                placeholder="Otra (horas)"
                                className="h-7 w-28 text-xs"
                                type="number"
                                min={1}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Audiencia</p>
                        <div className="flex gap-1.5">
                            {([
                                { id: "personal", label: "Personal" },
                                { id: "publica", label: "Pública" },
                                { id: "grupo", label: "Grupo(s)" },
                            ] as const).map((a) => (
                                <button
                                    key={a.id}
                                    onClick={() => setAudience(a.id)}
                                    className={cn(
                                        "flex-1 cursor-pointer rounded-full border px-2 py-1.5 text-xs font-semibold transition-colors",
                                        audience === a.id ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-border/50 text-muted-foreground",
                                    )}
                                >
                                    {a.label}
                                </button>
                            ))}
                        </div>
                        {audience === "grupo" && (
                            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border/40 p-2">
                                {groups.length === 0 && <p className="px-1 py-2 text-[11px] text-muted-foreground/70">No perteneces a ningún grupo todavía.</p>}
                                {groups.map((g) => (
                                    <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/30">
                                        <Checkbox
                                            checked={selectedGroups.has(g.id)}
                                            onCheckedChange={(v) => {
                                                setSelectedGroups((prev) => {
                                                    const next = new Set(prev);
                                                    if (v) next.add(g.id);
                                                    else next.delete(g.id);
                                                    return next;
                                                });
                                            }}
                                        />
                                        {g.label}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Texto (opcional)</p>
                        <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Añade un texto…" className="h-16 text-xs" />
                    </div>

                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                        <Checkbox checked={attachLocation} onCheckedChange={(v) => setAttachLocation(!!v)} />
                        <MapPin className="size-3.5" /> Adjuntar ubicación
                        {locating && <Loader2 className="size-3 animate-spin" />}
                    </label>
                    {attachLocation && location && (
                        <Input
                            value={locationLabel}
                            onChange={(e) => setLocationLabel(e.target.value)}
                            placeholder="Nombre del lugar (opcional)"
                            className="h-8 text-xs"
                        />
                    )}
                </div>

                <DialogFooter>
                    <Button onClick={() => void handleSubmit()} disabled={submitting} className="w-full cursor-pointer">
                        {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                        Compartir historia
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default ShareAsStoryDialog;
