'use client';

// ════════════════════════════════════════════════════════════════
// ProfileXRView — modo "VR / AR" de la página de perfil
// ----------------------------------------------------------------
// Acceso al Espacio Inmersivo WebXR del SOSD desde el propio perfil:
//   • Embebe ImmersiveSpace (componente XR existente, SOLO importado)
//     con next/dynamic ssr:false — Three.js/R3F nunca corre en SSR.
//   • XREntryButton (existente, solo importado) para saltar al Hub
//     3D/VR/AR con el perfil como contexto.
//   • Enlace a /immersive a pantalla completa + nota de compatibilidad
//     honesta (WebXR no está disponible en todos los dispositivos).
// ════════════════════════════════════════════════════════════════

import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2, Expand, Info } from "lucide-react";
import { XREntryButton } from "@/components/xr/xr-entry-button";

// Igual que la ruta /immersive: carga perezosa, sin SSR (WebGL solo en cliente).
const ImmersiveSpace = dynamic(
    () =>
        import("@/components/dashboard/apps/immersive/immersive-space").then(
            (m) => m.ImmersiveSpace,
        ),
    {
        ssr: false,
        loading: () => (
            <div className="absolute inset-0 grid place-items-center bg-[#05060f] text-white/70">
                <div className="flex flex-col items-center gap-3 text-center">
                    <Loader2 className="size-8 animate-spin text-violet-400" />
                    <p className="text-sm font-semibold">Tejiendo el espacio inmersivo…</p>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                        WebXR · Three.js · R3F
                    </p>
                </div>
            </div>
        ),
    },
);

interface ProfileXRViewProps {
    /** Handle del perfil (contexto para el hub XR). */
    handle: string;
    /** Nombre visible del perfil. */
    name: string;
}

export function ProfileXRView({ handle, name }: ProfileXRViewProps) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h2 className="font-headline text-lg font-bold">Espacio Inmersivo</h2>
                    <p className="text-sm text-muted-foreground">
                        Explora la dimensión VR / AR de la red desde el perfil de {name}.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <XREntryButton floating={false} ctx={handle} label="Hub 3D / VR / AR" />
                    <Button
                        asChild
                        variant="outline"
                        className="cursor-pointer gap-1.5 border-white/10 bg-background/30 backdrop-blur-md hover:bg-background/50"
                    >
                        <Link href="/immersive">
                            <Expand className="h-4 w-4" /> Pantalla completa
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Escena inmersiva embebida (mismo componente que /immersive). */}
            <div className="relative h-[55vh] min-h-[22rem] overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
                <ImmersiveSpace />
            </div>

            {/* Nota de compatibilidad honesta. */}
            <div className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-muted-foreground backdrop-blur">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
                <p>
                    Compatibilidad: la entrada en VR requiere un visor con WebXR (p. ej. Meta
                    Quest con su navegador) y la entrada en AR un móvil compatible (Android +
                    Chrome con ARCore; en iOS el soporte WebXR es limitado). Los botones
                    “Entrar en VR / AR” solo aparecen si tu dispositivo lo soporta. Sin XR,
                    puedes explorar la escena 3D con ratón o gestos táctiles.
                </p>
            </div>
        </div>
    );
}
