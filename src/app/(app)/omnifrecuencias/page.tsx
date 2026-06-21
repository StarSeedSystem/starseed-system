'use client';

// ════════════════════════════════════════════════════════════════
// Ruta /omnifrecuencias — Estudio de frecuencias funcionales (app completa)
// ----------------------------------------------------------------
// Monta OmnifrecuenciasApp a pantalla casi completa dentro del layout
// del OS (cabecera global). Sirve como destino navegable del widget y
// del orquestador (que también puede abrir la app en una ventana del OS).
// ════════════════════════════════════════════════════════════════

import { OmnifrecuenciasApp } from '@/components/dashboard/apps/omnifrecuencias/omnifrecuencias-app';

export default function OmnifrecuenciasPage() {
    return (
        <div className="h-[calc(100vh-7rem)] min-h-[28rem] overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
            <OmnifrecuenciasApp />
        </div>
    );
}
