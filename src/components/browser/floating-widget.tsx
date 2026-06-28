"use client";

// src/components/browser/floating-widget.tsx
// ─────────────────────────────────────────────────────────────────────────────
// WIDGET FLOTANTE del Navegador (punto 2): abre una página como una ventanita
// flotante ENCIMA de la pantalla, movible y redimensionable a vista mínima. Se
// puede minimizar, expandir a pantalla completa (vía callback) o cerrar. Varios
// widgets pueden coexistir; el padre (BrowserWindows) mantiene la lista.
//
// SSR-SAFE: el arrastre usa eventos del puntero sólo en el cliente.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minus, GripVertical, ExternalLink, Globe } from "lucide-react";
import { WebFrame } from "@/components/browser/web-frame";
import { urlHost, type NetMode } from "@/lib/browser/browser";

export interface FloatingWidgetData {
    id: string;
    url: string;
    title: string;
}

export default function FloatingWidget({
    data,
    netMode,
    index = 0,
    onClose,
    onExpand,
}: {
    data: FloatingWidgetData;
    netMode: NetMode;
    index?: number;
    onClose: () => void;
    onExpand?: () => void;
}) {
    // Posición inicial escalonada para no apilar widgets exactamente.
    const [pos, setPos] = useState(() => ({ x: 80 + index * 28, y: 96 + index * 28 }));
    const [minimized, setMinimized] = useState(false);
    const drag = useRef<{ dx: number; dy: number } | null>(null);

    useEffect(() => {
        function onMove(e: PointerEvent) {
            if (!drag.current) return;
            const maxX = (typeof window !== "undefined" ? window.innerWidth : 1200) - 80;
            const maxY = (typeof window !== "undefined" ? window.innerHeight : 800) - 60;
            setPos({
                x: Math.min(Math.max(8, e.clientX - drag.current.dx), maxX),
                y: Math.min(Math.max(8, e.clientY - drag.current.dy), maxY),
            });
        }
        function onUp() {
            drag.current = null;
        }
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
    }, []);

    function startDrag(e: React.PointerEvent) {
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    }

    return (
        // z-[65] < dock z-[70]: flota encima del contenido y de la ventana completa,
        // pero el dock de la OS sigue por encima y usable.
        <div
            className="fixed z-[65] flex flex-col overflow-hidden rounded-xl border border-cyan-400/30 bg-[#0b0b14]/95 shadow-2xl backdrop-blur-xl"
            style={{ left: pos.x, top: pos.y, width: minimized ? 240 : 360 }}
        >
            <div
                className="flex cursor-grab items-center gap-1.5 border-b border-white/10 bg-black/40 px-2 py-1 active:cursor-grabbing"
                onPointerDown={startDrag}
            >
                <GripVertical className="h-3.5 w-3.5 text-white/30" />
                <Globe className="h-3.5 w-3.5 text-cyan-200" />
                <span className="truncate text-[11px] text-amber-50">{data.title || urlHost(data.url)}</span>
                <div className="ml-auto flex items-center gap-0.5">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => setMinimized((m) => !m)}
                        title={minimized ? "Restaurar" : "Minimizar"}
                    >
                        <Minus className="h-3.5 w-3.5" />
                    </Button>
                    {onExpand && (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onExpand} title="Expandir a ventana completa">
                            <Maximize2 className="h-3.5 w-3.5" />
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => typeof window !== "undefined" && window.open(data.url, "_blank", "noopener,noreferrer")}
                        title="Abrir en pestaña externa"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-300/80" onClick={onClose} title="Cerrar widget">
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            {!minimized && (
                <div className="h-56 w-full bg-black/20">
                    <WebFrame
                        url={data.url}
                        title={data.title}
                        netMode={netMode}
                        className={cn("h-full w-full")}
                    />
                </div>
            )}
        </div>
    );
}
