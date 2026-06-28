'use client';

// ════════════════════════════════════════════════════════════════════════════
// XREntryButton — acceso global flotante al Hub 3D / VR / AR (/xr)
// ----------------------------------------------------------------------------
// Botón "Ver en 3D / VR / AR" que entra al hub XR unificado. Acepta `ctx` para
// abrir un contexto enfocado (un cerebro, una pizarra, un área) vía ?ctx=.
// Es aditivo y reutilizable: se puede colocar flotante en cualquier superficie
// (p. ej. el espacio inmersivo) sin tocar el layout global.
//
// SSR-safe: "use client" + usa next/link (no toca Three.js aquí).
// ════════════════════════════════════════════════════════════════════════════

import Link from 'next/link';
import { Boxes } from 'lucide-react';

export function XREntryButton({
    ctx,
    floating = true,
    label = 'Ver en 3D / VR / AR',
    className = '',
}: {
    /** Contexto a enfocar en el hub (id o nombre de cerebro/pizarra/área). */
    ctx?: string | null;
    /** Si true, se posiciona flotante (esquina). Si false, es inline. */
    floating?: boolean;
    label?: string;
    className?: string;
}) {
    const href = ctx ? `/xr?ctx=${encodeURIComponent(ctx)}` : '/xr';

    const base =
        'inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-md transition-transform hover:-translate-y-px';
    const bg = {
        background: 'linear-gradient(135deg, #A855F7, #22D3EE)',
    } as const;

    if (floating) {
        return (
            <Link
                href={href}
                title="Abrir el Hub 3D / VR / AR de tu red"
                className={`pointer-events-auto absolute bottom-4 left-4 z-20 ${base} ${className}`}
                style={bg}
            >
                <Boxes className="size-4" /> {label}
            </Link>
        );
    }

    return (
        <Link href={href} title="Abrir el Hub 3D / VR / AR de tu red" className={`${base} ${className}`} style={bg}>
            <Boxes className="size-4" /> {label}
        </Link>
    );
}

export default XREntryButton;
