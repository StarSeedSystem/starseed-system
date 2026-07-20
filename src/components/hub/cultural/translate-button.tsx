"use client";

/*
 * TranslateButton — botón «Traducir» inline (Adenda 77 · PACK 2 cultural).
 * Traduce el texto con el router gratis de Astraura y muestra la traducción
 * DEBAJO del original, etiquetada «traducido». Caché local por hash. Honesto:
 * si falla, muestra el error; nunca deja UI muerta.
 */

import { useState } from "react";
import { Languages, Loader2, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { translateText, targetLangName, type TranslateResult } from "@/lib/cultural/translate";

export interface TranslateButtonProps {
    /** Texto a traducir. */
    text: string;
    /** Idioma destino (código base). Por defecto, el del navegador. */
    target?: string;
    className?: string;
    /** Variante compacta (solo icono). */
    compact?: boolean;
}

export function TranslateButton({ text, target, className, compact = false }: TranslateButtonProps) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<TranslateResult | null>(null);
    const [open, setOpen] = useState(false);

    const clean = (text ?? "").trim();
    if (!clean) return null;

    const run = async () => {
        if (result && result.ok) {
            setOpen((v) => !v);
            return;
        }
        setLoading(true);
        try {
            const res = await translateText(clean, { target });
            setResult(res);
            setOpen(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            <button
                type="button"
                onClick={run}
                disabled={loading}
                data-testid="translate-button"
                aria-label="Traducir"
                title="Traducir con Astraura"
                className={cn(
                    "inline-flex w-fit min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary transition-colors duration-200 hover:bg-primary/20 disabled:opacity-60",
                    compact && "px-2",
                )}
            >
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : open && result?.ok ? <ChevronUp className="size-3.5" /> : <Languages className="size-3.5" />}
                {!compact && <span>{loading ? "Traduciendo…" : open && result?.ok ? "Ocultar" : "Traducir"}</span>}
            </button>

            {open && result && (
                <div
                    data-testid="translation-result"
                    className={cn(
                        "rounded-xl border px-3 py-2 text-xs leading-relaxed animate-in fade-in-50 slide-in-from-top-1 duration-200",
                        result.ok ? "border-primary/20 bg-primary/[0.06] text-foreground/90" : "border-red-500/25 bg-red-500/[0.06] text-red-300",
                    )}
                >
                    {result.ok ? (
                        <>
                            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                                <Languages className="size-2.5" /> traducido{result.fromCache ? " · caché" : ""} · {targetLangName(result.target)}
                            </span>
                            <p className="mt-1">{result.text}</p>
                        </>
                    ) : (
                        <p className="flex items-start gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-red-400">Sin traducción</span>
                            <span>{result.error}</span>
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

export default TranslateButton;
