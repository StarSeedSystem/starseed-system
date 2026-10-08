"use client";

/*
 * /estaciones/[id] (Ola 1010E · ES1010L) — detalle de estación: reproductor
 * grande, metadatos, presencia y chat efímero (Realtime `estacion:<id>`, §6.3).
 * Next 15: `params` es una promesa; los ids `interna:*` se resuelven con las
 * fuentes internas del OS (§8), el resto contra `os_estaciones`.
 */

import { use } from "react";
import { DetalleEstacion } from "@/components/estaciones/detalle-estacion";

export default function EstacionDetallePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
            <DetalleEstacion id={decodeURIComponent(id)} />
        </div>
    );
}

export const dynamic = "force-dynamic";
