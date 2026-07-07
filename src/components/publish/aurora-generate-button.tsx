"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * AuroraGenerateButton — "Generar con Aurora" reutilizable (Lienzo de Creación)
 * -----------------------------------------------------------------------------
 * Botón + popover mínimo: pide un prompt, llama a `auroraGenerateContent`
 * (wrapper sobre `astrauraChat`, gratis-primero + failover ya existente) y
 * entrega el texto resultante al padre vía `onResult` — el padre decide cómo
 * aplicarlo (reemplazar cuerpo, añadir bloque, sustituir código…).
 *
 * Reutilizado por: el composer clásico (botón global), el Creador de Layouts
 * (botón global + un botón por bloque) y el Modo Código. Aditivo, autónomo,
 * sin dependencias nuevas. SSR-safe (todo el estado es local de cliente).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { auroraGenerateContent, type AuroraGenerateKind } from "@/lib/aurora/generate-content";

export interface AuroraGenerateButtonProps {
    /** Tipo de contenido a generar (ajusta el system prompt). */
    kind: AuroraGenerateKind;
    /** Contexto libre adicional (tipo de publicación, área, tipo de bloque…). */
    context?: string;
    /** Contenido actual, para regenerar/mejorar en vez de partir de cero. */
    currentText?: string;
    /** Se llama con el texto generado por Aurora. */
    onResult: (text: string) => void;
    /** Etiqueta del botón (por defecto "Generar"/"Regenerar con Aurora"). */
    label?: string;
    /** Placeholder del prompt (por defecto genérico). */
    placeholder?: string;
    className?: string;
    size?: "xs" | "sm";
    /** Alinea el popover a la derecha en vez de a la izquierda. */
    align?: "left" | "right";
}

export default function AuroraGenerateButton({
    kind,
    context,
    currentText,
    onResult,
    label,
    placeholder,
    className,
    size = "sm",
    align = "left",
}: AuroraGenerateButtonProps) {
    const [open, setOpen] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");

    async function generate() {
        if (!prompt.trim()) {
            toast.error("Escribe qué quieres que genere Aurora.");
            return;
        }
        setLoading(true);
        setStatus("");
        const res = await auroraGenerateContent({
            prompt,
            kind,
            context,
            previous: currentText,
            onStatus: setStatus,
        });
        setLoading(false);
        if (!res.ok || !res.text) {
            toast.error(res.error || "No se pudo generar contenido.");
            return;
        }
        onResult(res.text);
        setOpen(false);
        setPrompt("");
        setStatus("");
        toast.success("Aurora generó el contenido.");
    }

    const isSm = size === "sm";
    const defaultLabel = currentText ? "Regenerar con Aurora" : "Generar con Aurora";

    return (
        <div className={cn("relative inline-block", className)}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 font-medium text-fuchsia-100 transition-colors hover:bg-fuchsia-400/20",
                    isSm ? "px-3 py-1.5 text-xs" : "px-2 py-1 text-[11px]",
                )}
            >
                <Sparkles className={isSm ? "h-3.5 w-3.5" : "h-3 w-3"} />
                {label || defaultLabel}
            </button>

            {open && (
                <div
                    className={cn(
                        "absolute top-full z-30 mt-2 w-80 space-y-2 rounded-xl border border-fuchsia-400/25 bg-[#12141c] p-3 shadow-xl",
                        align === "right" ? "right-0" : "left-0",
                    )}
                >
                    <Textarea
                        autoFocus
                        placeholder={placeholder || "Describe qué quieres que Aurora genere…"}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                void generate();
                            }
                        }}
                        className="min-h-[70px] bg-white/[0.04] text-xs text-amber-50"
                    />
                    {loading && status && (
                        <p className="flex items-center gap-1.5 text-[11px] text-fuchsia-200/80">
                            <Loader2 className="h-3 w-3 animate-spin" /> {status}
                        </p>
                    )}
                    <div className="flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setOpen(false)}
                            className="h-7 px-2 text-xs text-white/50 hover:text-white/80"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={generate}
                            disabled={loading}
                            className="h-7 gap-1.5 bg-fuchsia-500/80 px-3 text-xs text-white hover:bg-fuchsia-500"
                        >
                            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            Generar
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
