"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Canales StarSeed (Ola 285 · K5) — sección pública «Canales».
 * ---------------------------------------------------------------------------
 * Página que monta el directorio en tiempo real de canales de la red. La
 * cabecera deja claro el modelo abierto: cualquiera publica su canal y este
 * aparece al instante para toda la comunidad (lectura pública en RLS).
 *
 * Todo el listado, el buscador, los filtros y el alta viven en los componentes
 * `DirectorioCanales` y `NuevoCanal`; aquí solo se define el envoltorio.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Radio } from "lucide-react";
import { DirectorioCanales } from "@/components/canales/directorio-canales";

export default function CanalesPage() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
            {/* Cabecera: el directorio abierto de la red (lectura pública). */}
            <header className="flex flex-col gap-1">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/30 backdrop-blur">
                        <Radio className="h-4.5 w-4.5 text-emerald-300" />
                    </span>
                    <div>
                        <h1 className="font-headline text-2xl font-bold tracking-tight">
                            Canales StarSeed
                        </h1>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            el directorio abierto de la red
                        </p>
                    </div>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    El espacio público donde la red comparte sus canales. Cualquiera puede
                    publicar el suyo y aparece al instante para todos — sin revisión previa,
                    como dicta el procomún de la red.
                </p>
            </header>

            <DirectorioCanales />
        </div>
    );
}