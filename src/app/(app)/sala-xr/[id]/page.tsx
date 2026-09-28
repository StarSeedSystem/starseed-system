"use client";

/**
 * /sala-xr/<id> — una escena 3D guardada, entrada en VR/AR (L5 · 2026-09-28).
 *
 * Acepta `?modo=vr|ar` (la entrada que se ofrece primero) y `?sesion=<id>` (sin efecto aquí;
 * lo lee la presencia global de apps en vivo). Sin WebXR, la misma escena se abre en 3D y la
 * tarjeta de entrada explica por qué, según el dispositivo.
 */

import { Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { EscenaCompartida } from "@/components/vivo/espacial/escena-compartida";
import { modoXRDe } from "@/lib/vivo/xr";
import type { FuenteEscena } from "@/lib/vivo/espacial/sesion";

export const dynamic = "force-dynamic";

function Interior() {
    const params = useParams<{ id: string }>();
    const busqueda = useSearchParams();
    const id = typeof params?.id === "string" ? decodeURIComponent(params.id) : "";
    const fuente = useMemo<FuenteEscena>(() => ({ tipo: "espacio", id }), [id]);
    return (
        <EscenaCompartida
            fuente={fuente}
            enfoqueXR
            modoPedido={modoXRDe(busqueda.get("modo"))}
            volver={{ ruta: "/sala-xr", etiqueta: "Volver a mis salas" }}
        />
    );
}

export default function PaginaSalaXRGuardada() {
    return (
        <main className="px-2 py-2 sm:px-4 sm:py-3">
            <Suspense fallback={<div className="h-[calc(100dvh-7.5rem)] min-h-[480px] rounded-3xl bg-[#05060f]" />}>
                <Interior />
            </Suspense>
        </main>
    );
}
