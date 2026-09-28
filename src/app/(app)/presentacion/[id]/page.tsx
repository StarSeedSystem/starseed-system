// src/app/(app)/presentacion/[id]/page.tsx
// Presentación en vivo (L2 · 2026-09-28): diapositivas que se editan juntos y se presentan a todos.
// El id es el del espacio `os_spaces` (doc.app = "presentacion"). Acepta `?sesion=<id>` sin más.

import type { Metadata } from "next";
import { PaginaPresentacion } from "@/components/vivo/presentacion/pagina-presentacion";

export const metadata: Metadata = {
    title: "Presentación · StarSeed",
    description: "Diapositivas que se editan entre varias personas y se presentan a todos en tiempo real.",
};

export default async function PresentacionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let espacioId = id;
    try {
        espacioId = decodeURIComponent(id);
    } catch {
        /* id mal codificado: se intenta tal cual */
    }
    return <PaginaPresentacion espacioId={espacioId} />;
}
