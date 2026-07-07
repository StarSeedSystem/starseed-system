"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DesktopCanvas } from "@/components/desktop/desktop-canvas";
import { CursorFxHost } from "@/components/desktop/cursor-fx";

// ════════════════════════════════════════════════════════════════
// /escritorios — Página principal del OS (antes que los dashboards)
// ----------------------------------------------------------------
// Escritorio soberano estilo macOS/Linux en Crystal Liquid Glass:
// iconos, ventanas, widgets vivos, archivos y navegador, sobre el
// fondo global del usuario. CursorFxHost aplica el cursor elegido y
// las animaciones de clic (config en 'starseed.cursorfx.v1').
//
// `?space=<id>` (SOP §11, Adenda 65): abre un escritorio COMPARTIDO
// (os_spaces kind='desktop') en modo colaborativo — ver
// src/lib/sync/shared-desktop-space.ts. Envuelto en Suspense (mismo
// patrón que /pizarra) porque useSearchParams exige un boundary.
// ════════════════════════════════════════════════════════════════

// Evita el bailout de prerender estático (useSearchParams + Supabase en cliente).
export const dynamic = "force-dynamic";

function EscritoriosBody() {
    const params = useSearchParams();
    const spaceId = params.get("space") ?? null;
    return <DesktopCanvas spaceId={spaceId} />;
}

export default function EscritoriosPage() {
    return (
        <>
            <Suspense fallback={<div className="h-screen w-full" />}>
                <EscritoriosBody />
            </Suspense>
            <CursorFxHost />
        </>
    );
}
