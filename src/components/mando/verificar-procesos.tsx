"use client";

/**
 * Botón «Verificar procesos y generar reporte» (2026-09-15).
 *
 * Sustituye al de «Abrir director», que solo cambiaba de pestaña. El comentario
 * que había junto a aquel botón ya decía la verdad: «la navegación no constituye
 * una verificación».
 *
 * No se lanza sola al montar: verificar es una acción de una persona, y además
 * cuesta varios `ps` y un `df`.
 */

import { useCallback, useState } from "react";
import { CircleCheck, CircleX, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

interface Punto {
    nombre: string;
    estado: "ok" | "aviso" | "fallo";
    dato: string;
    porque: string;
}

interface Reporte {
    t: string;
    veredicto: string;
    peor: "ok" | "aviso" | "fallo";
    puntos: Punto[];
}

const ICONO = {
    ok: CircleCheck,
    aviso: TriangleAlert,
    fallo: CircleX,
} as const;

const COLOR = {
    ok: "text-emerald-300",
    aviso: "text-amber-300",
    fallo: "text-rose-300",
} as const;

export function VerificarProcesos() {
    const [reporte, setReporte] = useState<Reporte | null>(null);
    const [corriendo, setCorriendo] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const verificar = useCallback(async () => {
        setCorriendo(true);
        setError(null);
        try {
            const r = await fetch("/api/mando/verificacion", { method: "POST", cache: "no-store" });
            if (!r.ok) {
                setError(`La verificación respondió ${r.status}.`);
                return;
            }
            setReporte((await r.json()) as Reporte);
        } catch {
            setError("No se pudo verificar: la consola no respondió.");
        } finally {
            setCorriendo(false);
        }
    }, []);

    return (
        <div className="flex flex-col items-end gap-2">
            <button
                type="button"
                disabled={corriendo}
                onClick={() => void verificar()}
                className="mc-cristal mc-alzar mc-centrado mc-neon--ok inline-flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-200 disabled:cursor-wait disabled:opacity-70"
            >
                {corriendo ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                )}
                {corriendo ? "Comprobando procesos…" : "Verificar procesos y generar reporte"}
            </button>

            {error ? (
                <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-100">
                    {error}
                </p>
            ) : null}

            {reporte ? (
                <div className="mc-cristal mc-desplegar w-[min(30rem,86vw)] p-3">
                    <p className="mc-centrado text-[11px] font-medium text-white/75">
                        {reporte.veredicto}
                        <span className="ml-1 text-white/35">
                            {new Date(reporte.t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                    </p>
                    <ul className="mt-2 space-y-1.5">
                        {reporte.puntos.map((p) => {
                            const Icono = ICONO[p.estado];
                            return (
                                <li key={p.nombre} className="flex gap-2 rounded-lg border border-white/10 bg-black/25 p-2">
                                    <Icono className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${COLOR[p.estado]}`} aria-hidden />
                                    <div className="min-w-0">
                                        <p className="text-[11px] text-white/80">
                                            {p.nombre}
                                            <span className="ml-1.5 text-white/45">{p.dato}</span>
                                        </p>
                                        {/* El porqué es lo que hace útil el reporte: sin él es una
                                            lista de luces de colores que no dice qué hacer. */}
                                        <p className="mt-0.5 text-[10px] leading-relaxed text-white/45">{p.porque}</p>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="mc-centrado mt-2 text-[10px] text-white/30">
                        Guardado en starseed_memory_root/mando/verificaciones/
                    </p>
                </div>
            ) : null}
        </div>
    );
}
