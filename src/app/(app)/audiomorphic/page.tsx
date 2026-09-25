'use client';

// ════════════════════════════════════════════════════════════════
// Ruta /audiomorphic — Audiomorphic en su ÚLTIMA versión oficial
// ----------------------------------------------------------------
// (2026-09-25) Cambio de rumbo pedido por Alex: «las apps dentro de StarSeed OS
// deben ser las mismas que las últimas versiones de sus repos oficiales, usando
// el enlace de su sitio web para las versiones en línea».
//
// Antes (Adenda 68 · E) esta ruta montaba un PORT del repo
// StarSeedSystem/Audiomorphic-AR-app copiado dentro del OS. Ese port se quedó
// atrás (sin AR, sin lo que trae la v1.2.0) y cada release obligaba a volver a
// portarlo. Ahora se abre la web oficial (audiomorphic.vercel.app, que se
// despliega sola desde su repo) dentro del OS, con su versión viva leída del
// último release de GitHub y un botón para instalar las apps nativas en tus
// dispositivos.
//
// El port NO se borra: sigue moviendo la CAPA DE FONDO del OS y queda como
// «versión integrada», que solo se descarga si la persona la elige.
// ════════════════════════════════════════════════════════════════

import { AudiomorphicOficial } from '@/components/apps-oficiales/vistas-oficiales';

export default function AudiomorphicPage() {
    return (
        <div className="h-[calc(100dvh-7rem)] min-h-[28rem] overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
            <AudiomorphicOficial />
        </div>
    );
}
