"use client";

/**
 * Orbe asistente del Puente de Mando (cliente)
 * ─────────────────────────────────────────────────────────────────────────────
 * En `/mando`, la orbe flotante de Astraura (AuroraWidget, layout raíz) deja de abrir el
 * Exocórtex y abre ESTE panel: el asistente técnico de administración de la orquestación,
 * con el mismo chat y el mismo selector de modelo que la sección «Asistente» de la
 * pestaña Chat. Se abre/cierra con el evento `starseed:mando-asistente` (lo lanza el toque
 * de la orbe) y también con el botón de respaldo por si la orbe está oculta.
 */

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

import { AsistenteMando } from "@/components/mando/asistente-mando";
import { anunciar, escuchar } from "@/lib/mando/asistente-cliente";

export function OrbeAsistente() {
    const [abierto, setAbierto] = useState(false);

    useEffect(() => {
        return escuchar((aviso) => {
            if (aviso.tipo === "toggle") setAbierto((a) => !a);
            if (aviso.tipo === "abrir") setAbierto(true);
        });
    }, []);

    useEffect(() => {
        if (!abierto) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setAbierto(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [abierto]);

    return (
        <>
            {/* Botón de respaldo (la orbe de Astraura es la vía principal). */}
            <button
                type="button"
                onClick={() => anunciar({ tipo: "toggle" })}
                className="fixed bottom-24 right-4 z-[60] inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-violet-400/40 bg-black/60 px-3 py-1.5 text-[11px] text-violet-100 shadow-lg backdrop-blur hover:bg-violet-500/20"
                title="Asistente técnico de la orquestación (también al tocar la orbe)"
            >
                <Bot className="h-3.5 w-3.5" aria-hidden />
                Asistente
            </button>
            {abierto ? (
                <div
                    className="fixed bottom-4 right-4 z-[70] flex max-h-[80vh] w-[min(520px,calc(100vw-2rem))] flex-col rounded-2xl border border-violet-400/30 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur"
                    role="dialog"
                    aria-label="Asistente técnico del Puente de Mando"
                >
                    <AsistenteMando modo="flotante" onCerrar={() => setAbierto(false)} />
                </div>
            ) : null}
        </>
    );
}
