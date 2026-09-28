// src/app/(app)/juego/[id]/page.tsx
// Sala de juegos en vivo (L4 · 2026-09-28). El id es el del espacio `os_spaces` (doc.vivo.tipo =
// "juego"). Acepta `?sesion=<id>` sin más: la presencia de la sesión la anuncia el montaje global
// de mensajería leyendo la URL.

import type { Metadata } from "next";
import { SalaJuegos } from "@/components/vivo/juegos/sala-juegos";

export const metadata: Metadata = {
    title: "Juego en vivo · StarSeed",
    description: "Una partida compartida en tiempo real: cada jugada se comprueba con las mismas reglas en todos los dispositivos.",
};

export default async function SalaJuegoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let espacioId = id;
    try {
        espacioId = decodeURIComponent(id);
    } catch {
        /* id mal codificado: se intenta tal cual y la sala dirá que no la encuentra */
    }
    return <SalaJuegos spaceId={espacioId} />;
}
