'use client';

// ════════════════════════════════════════════════════════════════
// Ruta /audiomorphic — Visualizador de consciencia (app NATIVA, completa)
// ----------------------------------------------------------------
// Adenda 68 · E. Antes Audiomorphic solo existía como <iframe> a la app
// externa (con su tour de bienvenida, su corona de "planes" y su fondo
// negro opaco). Ahora está PORTADO al OS desde la repo del propio usuario
// (github.com/StarSeedSystem/Audiomorphic-AR-app): es código del OS.
//
// Aquí se abre DESBLOQUEADO: sin tour, sin login, sin planes. El mismo motor
// alimenta la CAPA DE FONDO del OS (con transparencia real).
// ════════════════════════════════════════════════════════════════

import dynamic from 'next/dynamic';

// Carga diferida: el motor (canvas + panel) no debe pesar en el arranque del OS.
const AudiomorphicApp = dynamic(
    () => import('@/components/dashboard/apps/audiomorphic/audiomorphic-app').then((m) => m.AudiomorphicApp),
    {
        ssr: false,
        loading: () => (
            <div className="grid h-full w-full place-items-center bg-black text-xs text-white/60">
                Cargando visualizador…
            </div>
        ),
    },
);

export default function AudiomorphicPage() {
    return (
        <div className="h-[calc(100vh-7rem)] min-h-[28rem] overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
            <AudiomorphicApp />
        </div>
    );
}
