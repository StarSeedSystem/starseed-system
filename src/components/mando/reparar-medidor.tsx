"use client";

/**
 * «Reparar» junto a «Comprobar ahora» en cada medidor (2026-10-23).
 *
 * Alex: «agrega un botón de reparar junto al de comprobar en los medidores; debería funcionar
 * automáticamente por la supervisión de los directores para que no tenga que presionarlo, pero aun
 * así agrégalo para poder hacerlo manualmente». Los directores reparan solos cada 10 min (la
 * autocuración lanza `reparar_medidor.py --todos`); el botón lanza lo mismo para ESTE medidor, ya.
 *
 * Lo que se aprendió con «Comprobar» y vale aquí igual: el botón pregunta hasta que termina, enseña
 * QUÉ hizo cada acción y cómo quedó, y una reparación vieja no se pinta como si fuera de ahora.
 * También se enseña la última que hicieron los directores, para que se vea que la supervisión actúa.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wrench } from "lucide-react";

import {
    quienReparo,
    reparacionVigente,
    tonoReparacion,
    type Reparacion,
} from "@/lib/mando/reparacion-tipos";

const TOPE_ESPERA_MS = 300_000;
const ENTRE_LECTURAS_MS = 2_000;

const COLOR: Record<ReturnType<typeof tonoReparacion>, string> = {
    ok: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
    aviso: "border-amber-300/30 bg-amber-400/10 text-amber-100",
    peligro: "border-rose-300/30 bg-rose-400/10 text-rose-100",
    normal: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
};

function haceMin(iso: string | null | undefined): string {
    const t = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(t)) return "";
    const min = Math.max(0, Math.round((Date.now() - t) / 60_000));
    return min < 1 ? "hace menos de 1 min" : `hace ${min} min`;
}

async function leer(clave: string): Promise<Reparacion | null> {
    try {
        const r = await fetch(`/api/mando/reparar?medidor=${encodeURIComponent(clave)}`, { cache: "no-store" });
        const d = (await r.json()) as { reparacion?: Reparacion | null };
        return d.reparacion ?? null;
    } catch {
        return null;
    }
}

/** Estado del botón y de la última reparación de un medidor. */
export function useReparacion(clave: string, alTerminar?: () => void) {
    const [reparacion, setReparacion] = useState<Reparacion | null>(null);
    const [reparando, setReparando] = useState(false);

    useEffect(() => {
        let vivo = true;
        void leer(clave).then((r) => {
            if (vivo) setReparacion(r);
        });
        return () => {
            vivo = false;
        };
    }, [clave]);

    const reparar = useCallback(async () => {
        setReparando(true);
        setReparacion({ medidor: clave, origen: "boton", empezado: new Date().toISOString(), terminado: null,
            resumen: "Reparando…", paso: "comprobando", acciones: [] });
        try {
            await fetch("/api/mando/reparar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ medidor: clave }),
            });
            // Comprueba, repara y vuelve a comprobar: de unos segundos a pocos minutos.
            const hasta = Date.now() + TOPE_ESPERA_MS;
            for (;;) {
                const r = await leer(clave);
                if (r) setReparacion(r);
                if (r?.terminado || Date.now() > hasta) break;
                await new Promise((listo) => window.setTimeout(listo, ENTRE_LECTURAS_MS));
            }
        } finally {
            setReparando(false);
            alTerminar?.();
        }
    }, [alTerminar, clave]);

    return { reparacion, reparando, reparar };
}

export function BotonReparar({ reparando, alPulsar }: { reparando: boolean; alPulsar: () => void }) {
    return (
        <button
            type="button"
            disabled={reparando}
            onClick={alPulsar}
            title="Comprueba el medidor, repara lo que esté mal y vuelve a comprobar. Los directores lo hacen solos cada 10 min."
            className="ml-2 inline-flex cursor-pointer items-center gap-1 rounded-md border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
            {reparando ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Wrench className="h-3 w-3" aria-hidden />}
            Reparar
        </button>
    );
}

/** Lo que hizo la reparación en curso o la última (del botón o de los directores). */
export function ResultadoReparacion({ reparacion }: { reparacion: Reparacion | null }) {
    if (!reparacion) return null;
    if (!reparacion.terminado) {
        return (
            <p role="status" aria-live="polite" data-testid="reparacion-en-curso"
                className="mc-centrado mt-1 flex items-center justify-center gap-2 text-[10px] text-amber-100">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Reparando · {reparacion.paso ?? "comprobando"}
            </p>
        );
    }
    if (!reparacionVigente(reparacion)) {
        return (
            <p className="mc-centrado mt-1 text-[10px] text-white/40" data-testid="reparacion-antigua">
                última reparación: {haceMin(reparacion.terminado)} · por {quienReparo(reparacion)}
            </p>
        );
    }
    const tono = tonoReparacion(reparacion.resultado);
    return (
        <div data-testid="resultado-reparacion"
            className={`mc-centrado mt-1.5 rounded-md border px-2 py-1.5 text-[10px] ${COLOR[tono]}`}>
            <p className="font-semibold">
                {reparacion.resumen}
                <span className="ml-1 font-normal opacity-70">
                    · {haceMin(reparacion.terminado)} · por {quienReparo(reparacion)}
                </span>
            </p>
            {reparacion.acciones.length ? (
                <ul className="mt-1 flex flex-col gap-0.5 text-left">
                    {reparacion.acciones.map((a) => (
                        <li key={a.accion} className={a.ok ? "text-emerald-200/90" : "text-rose-200"}>
                            {a.ok ? "✓" : "✗"} {a.titulo}: {a.resultado ?? "—"}
                        </li>
                    ))}
                </ul>
            ) : null}
            {reparacion.sin_reparacion?.length ? (
                <ul className="mt-1 flex flex-col gap-0.5 text-left text-white/60">
                    {reparacion.sin_reparacion.map((s) => (
                        <li key={s}>● sin reparación automática: {s}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
