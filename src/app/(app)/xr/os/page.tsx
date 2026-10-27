"use client";

/**
 * /xr/os — el SISTEMA de StarSeed en 3D (contrato `architecture/starseed-xr.md` §3 a y c).
 * Componente fino: el Canvas y el almacén XR solo van en el navegador → `next/dynamic` sin SSR
 * (el layout raíz no carga motores pesados, regla §0.6). `?modo=vr|ar` pide entrada inmersiva;
 * `?modo=pantalla` (o sin modo) deja la escena en 3D en pantalla (escritorio e iPhone).
 */

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { modoXRDe } from "@/lib/vivo/xr";

export const dynamic = "force-dynamic";

const EscenaOS = nextDynamic(
    () => import("@/components/xr/shell/escena-os").then((m) => m.EscenaOS),
    {
        ssr: false,
        loading: () => (
            <div className="grid min-h-[60vh] place-items-center bg-[#060814] text-[#B9C0D8]" role="status">
                <p className="text-sm font-medium">Preparando el sistema en 3D…</p>
            </div>
        ),
    },
);

function EscenaConModo() {
    const params = useSearchParams();
    return <EscenaOS modo={modoXRDe(params.get("modo"))} />;
}

export default function PaginaXROS() {
    return (
        <section className="relative flex min-h-[78vh] flex-1 flex-col">
            <Suspense fallback={<div className="min-h-[60vh] flex-1 bg-[#060814]" />}>
                <EscenaConModo />
            </Suspense>
        </section>
    );
}
