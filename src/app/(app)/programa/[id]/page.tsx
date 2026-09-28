// src/app/(app)/programa/[id]/page.tsx
// Programa en vivo (L4 · 2026-09-28). El id es el del espacio `os_spaces` (doc.vivo.tipo =
// "programa"). Acepta `?sesion=<id>` sin más: la presencia de la sesión la anuncia el montaje global
// de mensajería leyendo la URL.

import type { Metadata } from "next";
import { SalaPrograma } from "@/components/vivo/programas/sala-programa";

export const metadata: Metadata = {
    title: "Programa en vivo · StarSeed",
    description: "Un programa compartido en tiempo real: cada acción se comprueba con las mismas reglas en todos los dispositivos.",
};

export default async function SalaProgramaPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let espacioId = id;
    try {
        espacioId = decodeURIComponent(id);
    } catch {
        /* id mal codificado: se intenta tal cual y el programa dirá que no lo encuentra */
    }
    return <SalaPrograma spaceId={espacioId} />;
}
