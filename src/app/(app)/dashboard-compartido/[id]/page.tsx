// src/app/(app)/dashboard-compartido/[id]/page.tsx
// Un dashboard compartido en vivo (L3 · 2026-09-28). El id es el del espacio `os_spaces`
// (doc.vivo = "dashboard"). Acepta `?sesion=<id>` sin más: la presencia de la sesión la anuncia el
// montaje global de mensajería leyendo la URL; esta página no lo necesita.

import type { Metadata } from "next";
import { DashboardVivo } from "@/components/vivo/dashboard/dashboard-vivo";

export const metadata: Metadata = {
    title: "Dashboard compartido · StarSeed",
    description: "Un tablero de widgets que se organiza entre varias personas, en vivo.",
};

export default async function DashboardCompartidoEspacioPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let espacioId = id;
    try {
        espacioId = decodeURIComponent(id);
    } catch {
        /* id mal codificado: se intenta tal cual y la página dirá que no lo encuentra */
    }
    return <DashboardVivo id={espacioId} />;
}
