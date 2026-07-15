"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Volume2, MessageSquarePlus, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuroraEngine } from "@/lib/aurora/engine";
import { toast } from "sonner";
import { AuroraReadButton } from "./aurora-read-button";

/**
 * TextSelectionToolbar — barra flotante global que aparece al seleccionar texto.
 * Ofrece: "Leer" (Aurora TTS), "Chat" (copiar al chat de Aurora), "Copiar".
 * Se monta una vez en el layout y escucha mouseup/mousedown en todo el documento.
 */
export function TextSelectionToolbar() {
    const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
    const aurora = useAuroraEngine();

    useEffect(() => {
        const handleMouseUp = (e: MouseEvent) => {
            // Ignora inputs y textareas
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            // Pequeño delay para que la selección esté estable
            requestAnimationFrame(() => {
                const sel = window.getSelection();
                if (!sel || sel.isCollapsed) {
                    setSelection(null);
                    return;
                }
                const text = sel.toString().trim();
                if (!text || text.length < 3) {
                    setSelection(null);
                    return;
                }
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                setSelection({ text, rect });
            });
        };
        const handleMouseDown = (e: MouseEvent) => {
            const toolbar = document.getElementById("text-selection-toolbar");
            if (toolbar && toolbar.contains(e.target as Node)) return;
            setSelection(null);
        };
        const handleKeyDown = () => setSelection(null);

        document.addEventListener("mouseup", handleMouseUp);
        document.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mouseup", handleMouseUp);
            document.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    const handleSpeak = useCallback(() => {
        if (!selection) return;
        aurora.speak(selection.text);
        setSelection(null);
        window.getSelection()?.removeAllRanges();
    }, [selection, aurora]);

    const handleCopyToChat = useCallback(() => {
        if (!selection) return;
        // Dispatch event that the Exocortex / Aurora chat can listen to
        window.dispatchEvent(
            new CustomEvent("aurora:inject-text", {
                detail: { text: selection.text.substring(0, 2000) },
            })
        );
        // Also open exocortex via the existing trinity event
        window.dispatchEvent(new CustomEvent("trinity:open-exocortex"));
        toast.success("Texto copiado al chat de Aurora");
        setSelection(null);
        window.getSelection()?.removeAllRanges();
    }, [selection]);

    const handleCopy = useCallback(() => {
        if (!selection) return;
        navigator.clipboard.writeText(selection.text).then(
            () => toast.success("Copiado"),
            () => toast.error("No se pudo copiar"),
        );
        setSelection(null);
        window.getSelection()?.removeAllRanges();
    }, [selection]);

    if (!selection) return null;

    const top = selection.rect.top - 48;
    const left = selection.rect.left + selection.rect.width / 2;
    // SSR-safe: window dimensions
    const maxLeft = typeof window !== "undefined" ? window.innerWidth - 200 : 800;

    return (
        <div
            id="text-selection-toolbar"
            className="fixed z-[99999] flex items-center gap-1 p-1 bg-black/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl animate-in fade-in zoom-in-95 duration-200"
            style={{
                top: Math.max(10, top),
                left: Math.max(60, Math.min(maxLeft, left)),
                transform: "translateX(-50%)",
            }}
        >
            <AuroraReadButton text={selection.text} className="border-none bg-transparent shadow-none" />
            <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-white/80 hover:text-white cursor-pointer"
                onClick={handleCopyToChat}
            >
                <MessageSquarePlus className="h-3.5 w-3.5" /> Chat
            </Button>
            <div className="w-px h-4 bg-white/10 mx-0.5" />
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/80 hover:text-white cursor-pointer"
                onClick={handleCopy}
            >
                <Copy className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}
