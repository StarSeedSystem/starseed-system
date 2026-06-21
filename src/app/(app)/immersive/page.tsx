'use client';

// ════════════════════════════════════════════════════════════════
// Ruta /immersive — Espacio Inmersivo VR/AR (fundación WebXR del SOSD)
// ----------------------------------------------------------------
// Monta ImmersiveSpace a pantalla casi completa dentro del layout del OS.
// La escena R3F (WebGL) se carga con next/dynamic (ssr:false) para no
// ejecutar Three.js en el servidor. Los botones "Entrar en VR / AR" y
// "Salir" viven dentro de la propia escena (necesitan el renderer de R3F)
// y solo aparecen si el dispositivo soporta la sesión correspondiente.
//
// Destino navegable del widget IMMERSIVE y del orquestador / launcher.
// SOP: architecture/dashboard-launcher-apps-y-archivos.md
// ════════════════════════════════════════════════════════════════

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const ImmersiveSpace = dynamic(
    () => import('@/components/dashboard/apps/immersive/immersive-space').then((m) => m.ImmersiveSpace),
    {
        ssr: false,
        loading: () => (
            <div className="absolute inset-0 grid place-items-center bg-[#05060f] text-white/70">
                <div className="flex flex-col items-center gap-3 text-center">
                    <Loader2 className="size-8 animate-spin text-violet-400" />
                    <p className="text-sm font-semibold">Tejiendo el espacio inmersivo…</p>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">WebXR · Three.js · R3F</p>
                </div>
            </div>
        ),
    }
);

export default function ImmersivePage() {
    return (
        <div className="relative h-[calc(100vh-7rem)] min-h-[28rem] overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
            <ImmersiveSpace />
        </div>
    );
}
