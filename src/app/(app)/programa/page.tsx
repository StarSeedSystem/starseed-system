// src/app/(app)/programa/page.tsx
// Programas en vivo (L4 · 2026-09-28): portada para crear un programa desde una plantilla (encuesta,
// lista compartida, tablero kanban, contador de votos, formulario de inscripción, reunión) y volver a
// los tuyos. El programa vive en /programa/<id>. No ejecuta código: es un catálogo cerrado de bloques.

import type { Metadata } from "next";
import { HubProgramas } from "@/components/vivo/programas/hub-programas";

export const metadata: Metadata = {
    title: "Programas en vivo · StarSeed",
    description: "Encuestas, listas de tareas, tableros kanban, contadores y formularios compartidos en tiempo real con las personas de tu chat.",
};

export default function ProgramaPage() {
    return <HubProgramas />;
}
