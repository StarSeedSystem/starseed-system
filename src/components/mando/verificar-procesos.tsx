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
 *
 * 2026-09-20: el reporte se abre en un panel flotante anclado bajo el botón
 * (ya no empuja la rejilla), con botón de cerrar, Esc y click fuera.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, CircleX, Loader2, ShieldCheck, TriangleAlert, X } from "lucide-react";

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

export function segundosDesde(iso: string, ahora: number): number {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, Math.floor((ahora - t) / 1000));
}

export function VerificarProcesos() {
    const [reporte, setReporte] = useState<Reporte | null>(null);
    const [corriendo, setCorriendo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [abierto, setAbierto] = useState(false);
    const [ahora, setAhora] = useState(() => Date.now());
    const raiz = useRef<HTMLDivElement | null>(null);

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
            setAbierto(true);
        } catch {
            setError("No se pudo verificar: la consola no respondió.");
        } finally {
            setCorriendo(false);
        }
    }, []);

    useEffect(() => {
        if (!abierto) return;
        const alPresionar = (ev: KeyboardEvent) => {
            if (ev.key === "Escape") setAbierto(false);
        };
        const alClicar = (ev: MouseEvent) => {
            if (raiz.current && !raiz.current.contains(ev.target as Node)) setAbierto(false);
        };
        document.addEventListener("keydown", alPresionar);
        document.addEventListener("mousedown", alClicar);
        return () => {
            document.removeEventListener("keydown", alPresionar);
            document.removeEventListener("mousedown", alClicar);
        };
    }, [abierto]);

    useEffect(() => {
        if (!abierto || !reporte) return;
        const intervalo = setInterval(() => setAhora(Date.now()), 10_000);
        return () => clearInterval(intervalo);
    }, [abierto, reporte]);

    const alPulsar = () => {
        if (reporte && !abierto) setAbierto(true);
        else void verificar();
    };

    const etiqueta = corriendo
        ? "Comprobando procesos…"
        : reporte && !abierto
            ? "Ver último reporte"
            : reporte
                ? "Verificar de nuevo"
                : "Verificar procesos y generar reporte";

    return (
        <div ref={raiz} className="relative flex flex-col items-end gap-2">
            <button
                type="button"
                disabled={corriendo}
                onClick={alPulsar}
                className="mc-cristal mc-alzar mc-centrado mc-neon--ok inline-flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-200 disabled:cursor-wait disabled:opacity-70"
            >
                {corriendo ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                )}
                {etiqueta}
            </button>

            {error ? (
                <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-100">
                    {error}
                </p>
            ) : null}

            {reporte && abierto ? (
                <div
                    role="dialog"
                    aria-label="Reporte de procesos"
                    className="mc-cristal mc-desplegar absolute right-0 top-full z-30 mt-2 w-[min(34rem,92vw)] max-sm:w-[calc(100vw-2rem)] border border-white/15 p-3 shadow-[0_18px_60px_-18px_rgba(0,0,0,0.8)]"
                >
                    <div className="mc-centrado flex items-start justify-between gap-2">
                        <p className="text-[11px] font-medium text-white/75">
                            {reporte.veredicto}
                            <span className="ml-1 text-white/35">
                                {new Date(reporte.t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                        </p>
                        <button
                            type="button"
                            aria-label="Cerrar reporte"
                            onClick={() => setAbierto(false)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/60 transition hover:bg-white/10 hover:text-white"
                        >
                            <X className="h-3 w-3" aria-hidden />
                            Cerrar
                        </button>
                    </div>
                    <ul className="mt-2 max-h-[70vh] space-y-1.5 overflow-y-auto pr-1">
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
                        Guardado en starseed_memory_root/mando/verificaciones/ · Comprobado hace {segundosDesde(reporte.t, ahora)} s
                    </p>
                </div>
            ) : null}
        </div>
    );
}
