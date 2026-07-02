import type { Metadata } from "next";
import { DesktopCanvas } from "@/components/desktop/desktop-canvas";
import { CursorFxHost } from "@/components/desktop/cursor-fx";

// ════════════════════════════════════════════════════════════════
// /escritorios — Página principal del OS (antes que los dashboards)
// ----------------------------------------------------------------
// Escritorio soberano estilo macOS/Linux en Crystal Liquid Glass:
// iconos, ventanas, widgets vivos, archivos y navegador, sobre el
// fondo global del usuario. CursorFxHost aplica el cursor elegido y
// las animaciones de clic (config en 'starseed.cursorfx.v1').
// ════════════════════════════════════════════════════════════════

export const metadata: Metadata = {
    title: "Escritorios · StarSeed OS",
    description:
        "Tu escritorio soberano: apps StarSeed, widgets vivos, archivos y ventanas líquidas de cristal.",
};

export default function EscritoriosPage() {
    return (
        <>
            <DesktopCanvas />
            <CursorFxHost />
        </>
    );
}
