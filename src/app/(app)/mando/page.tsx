"use client";

/**
 * /mando — PUENTE DE MANDO DEL PROYECTO (Ola 231 · dos versiones desde 2026-09-25).
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex: «el que usamos nosotros es una versión especial del Puente de Mando que
 * usamos para programar todo StarSeed OS desde ahí mismo, y ese es un acceso único
 * nuestro; debemos desarrollar otra versión para las cuentas de los usuarios».
 *
 *   · Aquí vive el Mando del PROYECTO (`CentroMando`): solo donde `/api/mando/acceso`
 *     dice `proyecto: true` (la Mac del proyecto o su túnel privado; la misma regla que
 *     `guardianMando` aplica a todas las `/api/mando/*`).
 *   · Cualquier otra persona —y cualquier dock que todavía apunte a `/mando`— va a
 *     `/mi-mando`, «Mi Puente de Mando», que sí lleva el cromo del OS (esta ruta es de
 *     consola: sin fondos ni capas pesadas, ver `solo-fuera-de-consola.tsx`).
 *
 * Hasta saber la respuesta no se pinta nada: antes, en el OS publicado, el dock abría
 * esta consola y se quedaba rota (sus APIs responden 404 allí). La consola se carga
 * bajo demanda, así que quien no es del equipo ni la descarga.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import { preguntarAcceso } from "@/lib/mi-mando/acceso";

const CentroMando = lazy(() =>
    import("@/components/mando/centro-mando").then((m) => ({ default: m.CentroMando })),
);

type Acceso = "cargando" | "proyecto" | "personal";

function CargandoDiscreto({ texto }: { texto: string }) {
    return (
        <div role="status" className="flex items-center gap-2 py-10 text-sm text-white/55">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {texto}
        </div>
    );
}

export default function MandoPage() {
    const [acceso, setAcceso] = useState<Acceso>("cargando");
    const router = useRouter();

    useEffect(() => {
        const ctrl = new AbortController();
        void preguntarAcceso(ctrl.signal).then((proyecto) => {
            if (ctrl.signal.aborted) return;
            setAcceso(proyecto ? "proyecto" : "personal");
            if (!proyecto) router.replace("/mi-mando");
        });
        return () => ctrl.abort();
    }, [router]);

    if (acceso === "cargando") {
        return (
            <main className="min-h-screen px-4 py-8 md:px-8">
                <CargandoDiscreto texto="Preparando el Puente de Mando…" />
            </main>
        );
    }
    if (acceso === "personal") {
        return (
            <main className="min-h-screen px-4 py-8 md:px-8">
                <CargandoDiscreto texto="Abriendo Mi Puente de Mando…" />
            </main>
        );
    }
    return (
        <main className="min-h-screen px-4 py-8 md:px-8">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Puente de Mando · StarSeed OS</h1>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                        Consola de producción y desarrollo del proyecto: olas, tareas, flota de proveedores y el
                        relevo entre agentes, en vivo y en esta máquina. Acceso único del equipo.
                    </p>
                </div>
                <Link
                    href="/mi-mando"
                    className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 sm:min-h-[2.25rem]"
                >
                    Mi Puente de Mando <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
            </header>
            <Suspense fallback={<CargandoDiscreto texto="Cargando la consola…" />}>
                <CentroMando />
            </Suspense>
        </main>
    );
}
