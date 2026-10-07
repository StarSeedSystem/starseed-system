"use client";

/**
 * Aviso de autocuración de Genesis (2026-10-05): cuando la página se atasca y se cura sola
 * (`src/lib/mando/autocuracion-pagina.ts`), lo dice aquí en una línea, sin tapar nada. Tras una
 * recarga automática, la página nueva explica por qué se recargó. Honesto y discreto: el
 * remedio ya está hecho, esto solo cuenta qué pasó.
 */
import { useEffect, useState } from "react";
import { CLAVE_RECARGA, EVENTO, type Remedio } from "@/lib/mando/autocuracion-pagina";

const TEXTO: Record<Remedio, string> = {
    nada: "",
    "reiniciar-guardia": "Genesis se atascó y se ha desatascado solo",
    recargar: "Genesis se atascó y se recarga solo",
    "esperar-servidor": "El servidor de Genesis no responde: la Mac lo está levantando",
};

export function AvisoAutocuracion() {
    const [aviso, setAviso] = useState<{ texto: string; porque: string } | null>(null);

    useEffect(() => {
        try {
            const crudo = window.sessionStorage.getItem(CLAVE_RECARGA);
            const previo = crudo ? (JSON.parse(crudo) as { t?: number; porque?: string }) : null;
            if (previo?.t && Date.now() - previo.t < 120_000) {
                setAviso({ texto: "Genesis se recargó solo tras atascarse", porque: previo.porque ?? "" });
            }
        } catch {
            // Sin sessionStorage no hay aviso de la recarga anterior.
        }
        const alCurarse = (e: Event) => {
            const d = (e as CustomEvent<{ remedio: Remedio; porque: string }>).detail;
            if (d && TEXTO[d.remedio]) setAviso({ texto: TEXTO[d.remedio], porque: d.porque });
        };
        window.addEventListener(EVENTO, alCurarse);
        return () => window.removeEventListener(EVENTO, alCurarse);
    }, []);

    useEffect(() => {
        if (!aviso) return;
        const t = window.setTimeout(() => setAviso(null), 12_000);
        return () => window.clearTimeout(t);
    }, [aviso]);

    if (!aviso) return null;
    return (
        <div
            role="status"
            aria-live="polite"
            data-testid="aviso-autocuracion"
            className="fixed bottom-4 left-4 z-50 flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-xl border border-cyan-400/30 bg-slate-900/90 px-3 py-2 text-xs text-cyan-100 shadow-lg backdrop-blur"
        >
            <span>
                <strong className="font-semibold">{aviso.texto}.</strong>{" "}
                <span className="text-cyan-100/70">{aviso.porque}</span>
            </span>
            <button
                type="button"
                onClick={() => setAviso(null)}
                className="cursor-pointer rounded px-1 text-cyan-100/70 transition-colors duration-200 hover:text-cyan-50"
                aria-label="Cerrar el aviso de autocuración"
            >
                ×
            </button>
        </div>
    );
}
