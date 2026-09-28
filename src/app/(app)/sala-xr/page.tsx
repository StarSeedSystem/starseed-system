"use client";

/**
 * /sala-xr — Sala XR compartida (L5 · 2026-09-28).
 *
 *   · `/sala-xr?sesion=<id>&modo=vr|ar` — la sala EFÍMERA de una llamada «sala VR/AR» (los mismos
 *     parámetros que la llamada manda hoy a `/xr`): quien esté en la llamada entra en la misma
 *     escena, con avatares y objetos en vivo; nada se guarda salvo que alguien guarde una copia.
 *   · `/sala-xr` sin sesión — crear o abrir una sala guardada (`/sala-xr/<id>`).
 */

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { EscenaCompartida } from "@/components/vivo/espacial/escena-compartida";
import { LanzadorEscenas } from "@/components/vivo/espacial/lanzador-escenas";
import { modoXRDe } from "@/lib/vivo/xr";
import type { FuenteEscena } from "@/lib/vivo/espacial/sesion";

export const dynamic = "force-dynamic";

/** Id de sesión aceptable como nombre de canal (uuid u otro id opaco, sin caracteres raros). */
function sesionValida(v: string | null): string | null {
    return v && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

function Interior() {
    const busqueda = useSearchParams();
    const sesionId = sesionValida(busqueda.get("sesion"));
    const modo = modoXRDe(busqueda.get("modo"));
    const fuente = useMemo<FuenteEscena | null>(() => (sesionId ? { tipo: "llamada", sesionId } : null), [sesionId]);
    if (!fuente) return <LanzadorEscenas destino="xr" />;
    return (
        <main className="px-2 py-2 sm:px-4 sm:py-3">
            <EscenaCompartida fuente={fuente} enfoqueXR modoPedido={modo} volver={{ ruta: "/messages", etiqueta: "Ir a los mensajes" }} />
        </main>
    );
}

export default function PaginaSalaXR() {
    return (
        <Suspense fallback={<div className="m-2 h-[calc(100dvh-7.5rem)] min-h-[480px] rounded-3xl bg-[#05060f]" />}>
            <Interior />
        </Suspense>
    );
}
