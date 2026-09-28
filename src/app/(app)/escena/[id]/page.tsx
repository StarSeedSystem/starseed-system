"use client";

/**
 * /escena/<id> — una escena 3D compartida (L5 · 2026-09-28).
 *
 * Acepta `?sesion=<id>` (la presencia global de apps en vivo lo lee de la URL; aquí no cambia
 * nada) y `?modo=vr|ar` (qué entrada a XR ofrecer primero). La escena se sincroniza por
 * `os_spaces` + un canal en vivo propio; el lienzo 3D se carga perezoso dentro del componente.
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
            modoPedido={modoXRDe(busqueda.get("modo"))}
            volver={{ ruta: "/escena", etiqueta: "Volver a mis escenas" }}
        />
    );
}

export default function PaginaEscena() {
    return (
        <main className="px-2 py-2 sm:px-4 sm:py-3">
            <Suspense fallback={<div className="h-[calc(100dvh-7.5rem)] min-h-[480px] rounded-3xl bg-[#05060f]" />}>
                <Interior />
            </Suspense>
        </main>
    );
}
