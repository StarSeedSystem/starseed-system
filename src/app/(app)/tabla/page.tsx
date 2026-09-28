// src/app/(app)/tabla/page.tsx
// Tabla de datos en vivo (L3 · 2026-09-28): portada para crear una tabla y volver a las tuyas. La
// tabla en sí vive en /tabla/<id>. Acepta `?sesion=<id>` sin más (no lo usa).

import type { Metadata } from "next";
import { ListaTablas } from "@/components/vivo/tabla/lista-tablas";

export const metadata: Metadata = {
    title: "Tabla de datos · StarSeed",
    description: "Una hoja de datos que se rellena entre varias personas, celda a celda y en vivo.",
};

export default function TablaPage() {
    return <ListaTablas />;
}
