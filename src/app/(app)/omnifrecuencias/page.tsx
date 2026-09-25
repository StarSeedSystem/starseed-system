'use client';

// ════════════════════════════════════════════════════════════════
// Ruta /omnifrecuencias — Omnifrecuencias en su ÚLTIMA versión oficial
// ----------------------------------------------------------------
// (2026-09-25) Pedido de Alex: «las apps dentro de StarSeed OS deben ser las
// mismas que las últimas versiones de sus repos oficiales, usando el enlace de
// su sitio web para las versiones en línea».
//
// Antes esta ruta montaba OmnifrecuenciasApp, un port recortado del repo
// StarSeedSystem/generador_frecuencias que se quedó atrás respecto a la v2.0.0.
// Ahora se abre la web oficial (omnifrecuencias.vercel.app, desplegada sola
// desde su repo) dentro del OS, con la versión viva de su último release y el
// botón «Instalar en mis dispositivos» para las apps de Android, macOS, Windows
// y Linux.
//
// El port se conserva como «versión integrada» (también lo usa el widget
// compacto del panel) y solo se carga si la persona la elige.
// ════════════════════════════════════════════════════════════════

import { OmnifrecuenciasOficial } from '@/components/apps-oficiales/vistas-oficiales';

export default function OmnifrecuenciasPage() {
    return (
        <div className="h-[calc(100dvh-7rem)] min-h-[28rem] overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
            <OmnifrecuenciasOficial />
        </div>
    );
}
