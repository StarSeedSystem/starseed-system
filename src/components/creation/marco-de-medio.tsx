"use client";

/**
 * MARCO DE FORMA PARA UN MEDIO DEL LIENZO (Adenda 219 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * Control OPCIONAL que acompaña a una foto o vídeo del Lienzo Universal:
 * plegado, es un botón «Marco de forma»; abierto, muestra el mismo editor que
 * la foto de perfil (forma, encuadre, ampliación, rotación, borde) y un botón
 * para quitar el marco. Sin marco, la publicación se ve exactamente como antes.
 */

import { useState } from "react";
import { Shapes, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Marco, MARCO_POR_DEFECTO } from "@/lib/profile/marco-foto";
import { EditorMarco } from "@/components/profile/foto-con-marco";

export function MarcoDeMedio({
    src,
    value,
    onChange,
    video = false,
    className,
}: {
    /** URL del medio ya subido. Sin URL no hay nada que encuadrar. */
    src?: string | null;
    value?: Marco | null;
    /** `undefined` = sin marco. */
    onChange: (m: Marco | undefined) => void;
    video?: boolean;
    className?: string;
}) {
    const [abierto, setAbierto] = useState(false);
    if (!src) return null;
    const activo = !!value;

    return (
        <div className={cn("space-y-2", className)}>
            <div className="flex flex-wrap items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => {
                        if (!activo) onChange({ ...MARCO_POR_DEFECTO });
                        setAbierto((v) => !v || !activo);
                    }}
                    aria-expanded={abierto}
                    className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                        activo
                            ? "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100"
                            : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]",
                    )}
                >
                    <Shapes className="h-3 w-3" />
                    {activo ? (abierto ? "Cerrar marco" : "Ajustar marco") : "Marco de forma"}
                </button>
                {activo && (
                    <button
                        type="button"
                        onClick={() => { onChange(undefined); setAbierto(false); }}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[11px] text-white/50 transition-colors hover:border-red-400/40 hover:text-red-200"
                    >
                        <X className="h-3 w-3" /> Quitar marco
                    </button>
                )}
                <span className="text-[10px] text-white/35">Círculo, estrella, hexágono… y encuadre a mano.</span>
            </div>
            {activo && abierto && (
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <EditorMarco src={src} value={value} onChange={onChange} video={video} size={160} />
                </div>
            )}
        </div>
    );
}
