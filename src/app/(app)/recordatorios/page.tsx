// src/app/(app)/recordatorios/page.tsx
// Página de gestión de recordatorios y tareas programadas (scheduled_tasks).
// El CRUD vive en <RecordatoriosPanel/>; aquí solo el marco de la página.

import { RecordatoriosPanel } from "@/components/recordatorios/recordatorios-panel";

export const metadata = {
    title: "Recordatorios · StarSeed",
    description: "Crea, edita y elimina recordatorios y tareas programadas que saltan automáticamente.",
};

export default function RecordatoriosPage() {
    return (
        <main className="min-h-screen px-4 py-8 md:px-8">
            <div className="mx-auto max-w-3xl">
                <h1 className="text-2xl font-bold text-fuchsia-50">Recordatorios</h1>
                <p className="mb-6 mt-1 text-sm text-white/50">
                    Programa avisos y tareas con fecha, hora y recurrencia. El sistema los dispara
                    solo —como notificación— cuando vencen, y reprograma los repetitivos.
                </p>
                <RecordatoriosPanel />
            </div>
        </main>
    );
}
