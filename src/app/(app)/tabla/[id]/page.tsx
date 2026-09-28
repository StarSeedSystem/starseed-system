// src/app/(app)/tabla/[id]/page.tsx
// Una tabla de datos en vivo (L3 · 2026-09-28). El id es el del espacio `os_spaces`
// (doc.vivo = "tabla"). Acepta `?sesion=<id>` sin más: la presencia de la sesión la anuncia el
// montaje global de mensajería leyendo la URL; esta página no lo necesita.

import type { Metadata } from "next";
import { TablaViva } from "@/components/vivo/tabla/tabla-viva";

export const metadata: Metadata = {
    title: "Tabla de datos · StarSeed",
    description: "Una hoja de datos que se rellena entre varias personas, celda a celda y en vivo.",
};

export default async function TablaEspacioPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let espacioId = id;
    try {
        espacioId = decodeURIComponent(id);
    } catch {
        /* id mal codificado: se intenta tal cual y la página dirá que no lo encuentra */
    }
    return <TablaViva id={espacioId} />;
}
