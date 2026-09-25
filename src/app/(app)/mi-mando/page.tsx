"use client";

/**
 * /mi-mando — MI PUENTE DE MANDO (2026-09-25).
 * ─────────────────────────────────────────────────────────────────────────────
 * El panel de cada persona para controlar SU StarSeed OS: dispositivos (neuronas),
 * apps y dónde viven, archivos y sincronización, perfiles, privacidad y a su gusto.
 * Va en una ruta propia —no en `/mando`— porque `/mando` es ruta de consola (sin fondo
 * ni capas del OS) y este panel debe sentirse parte del sistema. `/mando` redirige
 * aquí a quien no tiene acceso al Mando del proyecto, así que ningún dock antiguo se
 * queda en una pantalla rota. Código abierto: src/components/mi-mando/.
 */

import Link from "next/link";
import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import { preguntarAcceso } from "@/lib/mi-mando/acceso";

const MiPuenteDeMando = lazy(() =>
    import("@/components/mi-mando/mi-puente-de-mando").then((m) => ({ default: m.MiPuenteDeMando })),
);

export default function MiMandoPage() {
    const [proyecto, setProyecto] = useState(false);

    useEffect(() => {
        const ctrl = new AbortController();
        void preguntarAcceso(ctrl.signal).then((si) => {
            if (!ctrl.signal.aborted) setProyecto(si);
        });
        return () => ctrl.abort();
    }, []);

    return (
        <main className="min-h-screen px-4 py-8 md:px-8">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Mi Puente de Mando</h1>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                        Controla tu propio StarSeed OS: tus dispositivos, apps, archivos, perfiles y privacidad, a tu
                        manera.
                    </p>
                </div>
                {proyecto ? (
                    <Link
                        href="/mando"
                        className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 sm:min-h-[2.25rem]"
                    >
                        Mando del proyecto <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                ) : null}
            </header>
            <Suspense
                fallback={
                    <div role="status" className="flex items-center gap-2 py-10 text-sm text-white/55">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Cargando…
                    </div>
                }
            >
                <MiPuenteDeMando />
            </Suspense>
        </main>
    );
}
