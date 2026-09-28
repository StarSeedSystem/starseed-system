// src/app/(app)/dashboard-compartido/page.tsx
// Dashboard compartido en vivo (L3 · 2026-09-28): portada para crear un tablero y volver a los
// tuyos. El tablero en sí vive en /dashboard-compartido/<id>. Acepta `?sesion=<id>` sin más.
// (El /dashboard personal no lee `?space=`, por eso esta ruta propia.)

import type { Metadata } from "next";
import { ListaDashboards } from "@/components/vivo/dashboard/lista-dashboards";

export const metadata: Metadata = {
    title: "Dashboard compartido · StarSeed",
    description: "Un tablero de widgets que se organiza entre varias personas, en vivo.",
};

export default function DashboardCompartidoPage() {
    return <ListaDashboards />;
}
