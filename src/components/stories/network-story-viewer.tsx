"use client";

/*
 * NetworkStoryViewer — visor de Historias reales en red: barra de progreso,
 * tap siguiente/anterior, responder por mensaje (dm.ts, sin tocar UI de
 * Mensajes) y eliminar (solo si es tuya).
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X, Send, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { currentUserRef } from "@/lib/sync/entity-state";
import { deleteStory, replyToStoryByMessage, type NetworkStory } from "@/lib/stories/network-stories";

const PROGRESS_MS = 6000;

export interface NetworkStoryViewerProps {
    stories: NetworkStory[];
    initialIndex: number;
    onClose: () => void;
    onChanged?: () => void;
}

export function NetworkStoryViewer({ stories, initialIndex, onClose, onChanged }: NetworkStoryViewerProps) {
    const [index, setIndex] = useState(initialIndex);
    const [elapsed, setElapsed] = useState(0);
    const [paused, setPaused] = useState(false);
    const [uid, setUid] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");
    const [sending, setSending] = useState(false);
    const startRef = useRef(Date.now());

    useEffect(() => {
        void currentUserRef().then((r) => setUid(r?.id ?? null));
    }, []);
    useEffect(() => {
        setIndex(initialIndex);
    }, [initialIndex]);

    const current = stories[index];

    useEffect(() => {
        setElapsed(0);
        startRef.current = Date.now();
    }, [current?.postId]);

    useEffect(() => {
        if (paused || !current) return;
        const id = window.setInterval(() => {
            const e = Date.now() - startRef.current;
            setElapsed(e);
            if (e >= PROGRESS_MS) {
                if (index < stories.length - 1) setIndex((i) => i + 1);
                else onClose();
            }
        }, 100);
        return () => window.clearInterval(id);
    }, [paused, index, stories.length, onClose, current]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1);
            else if (e.key === "ArrowRight") {
                if (index < stories.length - 1) setIndex(index + 1);
                else onClose();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [index, stories.length, onClose]);

    if (!current) return null;
    const isOwn = !!uid && uid === current.authorId;
    const remainingHours = Math.max(0, Math.round((new Date(current.expiresAt).getTime() - Date.now()) / 3_600_000));

    const handleDelete = async () => {
        if (!confirm("¿Eliminar esta historia?")) return;
        const ok = await deleteStory(current.postId);
        if (ok) {
            toast.success("Historia eliminada.");
            onChanged?.();
            onClose();
        } else {
            toast.error("No se pudo eliminar la historia.");
        }
    };

    const handleReply = async () => {
        const text = replyText.trim();
        if (!text) return;
        setSending(true);
        const res = await replyToStoryByMessage(current, text);
        setSending(false);
        if (res.ok) {
            toast.success("Mensaje enviado.");
            setReplyText("");
        } else {
            toast.error(res.error || "No se pudo enviar el mensaje.");
        }
    };

    return (
        <div className="fixed inset-0 z-[210] grid place-items-center bg-black/80" onClick={onClose}>
            <div className="relative aspect-[9/16] w-full max-w-sm overflow-hidden rounded-2xl bg-black" onClick={(e) => e.stopPropagation()}>
                <div className="absolute inset-x-2 top-2 z-20 flex gap-1">
                    {stories.map((_, i) => {
                        const filled = i < index ? 1 : i === index ? Math.min(elapsed / PROGRESS_MS, 1) : 0;
                        return (
                            <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
                                <div className="h-full bg-white" style={{ width: `${filled * 100}%`, transition: "width 100ms linear" }} />
                            </div>
                        );
                    })}
                </div>

                <div className="absolute left-3 right-3 top-5 z-20 flex items-center gap-2">
                    <div className="grid size-8 place-items-center rounded-full border border-white/20 bg-white/10 text-xs font-bold text-white">
                        {current.authorName[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-white">{current.authorName}</p>
                        <p className="text-[10px] text-white/60">Caduca en {remainingHours}h</p>
                    </div>
                    {isOwn && (
                        <button onClick={() => void handleDelete()} className="grid size-7 cursor-pointer place-items-center rounded-full text-white/70 hover:bg-white/10" title="Eliminar">
                            <Trash2 className="size-3.5" />
                        </button>
                    )}
                    <button onClick={onClose} className="grid size-7 cursor-pointer place-items-center rounded-full text-white/70 hover:bg-white/10" title="Cerrar">
                        <X className="size-4" />
                    </button>
                </div>

                <div className="absolute inset-0 grid place-items-center">
                    {current.mediaKind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={current.url} alt={current.caption ?? ""} className="max-h-full max-w-full object-contain" />
                    ) : (
                        <video src={current.url} autoPlay controls className="max-h-full max-w-full" />
                    )}
                </div>

                {current.caption && (
                    <div className="absolute bottom-16 left-3 right-3 z-20">
                        <p className="rounded-xl bg-black/40 px-3 py-2 text-sm text-white backdrop-blur">{current.caption}</p>
                    </div>
                )}

                <button
                    className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-pointer"
                    onClick={() => index > 0 && setIndex(index - 1)}
                    aria-label="Historia anterior"
                />
                <button
                    className="absolute inset-y-0 right-0 z-10 w-1/3 cursor-pointer"
                    onClick={() => (index < stories.length - 1 ? setIndex(index + 1) : onClose())}
                    aria-label="Historia siguiente"
                />

                <div className="absolute inset-x-2 bottom-2 z-20 flex items-center gap-1.5">
                    <Input
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void handleReply();
                        }}
                        onFocus={() => setPaused(true)}
                        onBlur={() => setPaused(false)}
                        placeholder="Responder por mensaje…"
                        className="h-8 flex-1 border-white/20 bg-black/40 text-xs text-white placeholder:text-white/40"
                    />
                    <button
                        onClick={() => void handleReply()}
                        disabled={sending || !replyText.trim()}
                        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default NetworkStoryViewer;
