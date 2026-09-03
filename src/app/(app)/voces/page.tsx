"use client";

/**
 * /voces — ESTUDIO DE VOCES (Ola 228).
 * ============================================================================
 * Taller para buscar, probar y afinar las voces de Aurora: ajustes de ritmo y
 * carácter, prueba de sonido, clones y exportación del catálogo, con la ficha
 * técnica de cada voz a un clic.
 */

import { EstudioVoces } from "@/components/voces/estudio-voces";

export default function VocesPage() {
    return (
        <main className="min-h-screen px-4 py-8 md:px-8">
            <header className="mb-6">
                <h1 className="text-2xl font-semibold">Estudio de Voces</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Ajusta, prueba y clona las voces que hablan en todo el sistema.
                </p>
            </header>
            <EstudioVoces />
        </main>
    );
}
