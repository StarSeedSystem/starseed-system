// src/app/(app)/documento/[id]/page.tsx
// Documento en vivo (L2 · 2026-09-28): texto con formato que varias personas escriben a la vez.
// El id es el del espacio `os_spaces` (doc.app = "documento"). Acepta `?sesion=<id>` sin más: la
// presencia de la sesión la anuncia el montaje global de mensajería leyendo la URL.

import type { Metadata } from "next";
import { PaginaDocumento } from "@/components/vivo/documento/pagina-documento";

export const metadata: Metadata = {
    title: "Documento · StarSeed",
    description: "Un documento compartido que se escribe entre varias personas a la vez, con historial de versiones.",
};

export default async function DocumentoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let espacioId = id;
    try {
        espacioId = decodeURIComponent(id);
    } catch {
        /* id mal codificado: se intenta tal cual y la página dirá que no lo encuentra */
    }
    return <PaginaDocumento espacioId={espacioId} />;
}
