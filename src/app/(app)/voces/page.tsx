"use client";

/**
 * /voces — ESTUDIO DE VOCES (Ola 228).
 * ============================================================================
 * Taller para buscar, probar y afinar las voces de Aurora: ajustes de ritmo y
 * carácter, prueba de sonido, clones y exportación del catálogo, con la ficha
 * técnica de cada voz a un clic.
 */

import Link from "next/link";
import { EstudioVoces } from "@/components/voces/estudio-voces";

/**
 * (2026-09-05) Página MÍNIMA, como el Puente de Mando: sin fondos WebGL, sin dock, sin bordes
 * Trinity, sin guía ni ventanas de arranque (ver RUTAS_MINIMAS). Solo el estudio y la orbe,
 * que aquí es el botón de prueba: un toque habla la frase de muestra con la voz activa.
 */
export default function VocesPage() {
    return (
        <main className="min-h-screen bg-[#07090f] px-4 py-8 text-white md:px-8">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Estudio de Voces</h1>
                    <p className="mt-1 text-sm text-white/60">
                        Ajusta, prueba y clona las voces que hablan en todo el sistema. Toca la orbe para oír la voz activa.
                    </p>
                </div>
                <Link href="/escritorios" className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5">
                    ← Volver al OS
                </Link>
            </header>
            <EstudioVoces />
        </main>
    );
}
