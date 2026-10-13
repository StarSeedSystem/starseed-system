"use client";

/**
 * Aviso honesto de una parte de la sección de cerebros que el enjambre aún está construyendo
 * (ola CB1013, architecture/cerebros-fusion-telepatia.md §10). Dice qué tarea la trae y qué
 * hará; no finge datos. Cuando la tarea aterriza, sustituye el componente que lo usaba.
 */

import { Hammer } from "lucide-react";

export interface EnConstruccionProps {
    titulo: string;
    tarea: string;
    queHara: string;
    mientras?: string;
}

export function EnConstruccion({ titulo, tarea, queHara, mientras }: EnConstruccionProps) {
    return (
        <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-white/85">
                <Hammer className="h-4 w-4 text-amber-300" aria-hidden />
                {titulo}: lo está construyendo el enjambre
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/60">{queHara}</p>
            {mientras && <p className="mt-2 text-xs leading-relaxed text-white/45">Mientras tanto: {mientras}</p>}
            <p className="mt-3 text-[11px] text-white/35">
                Tarea {tarea} · contrato architecture/cerebros-fusion-telepatia.md
            </p>
        </div>
    );
}
