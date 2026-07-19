"use client";

/*
 * /estudio — Estudio Universal de Diseño.
 * Ruta NUEVA (ver DesignStudio.tsx para el porqué frente a construir sobre
 * `/design-canvas`, que está fuertemente acoplado a `appearance-context` en
 * plena refactorización paralela). Aditiva: no reemplaza ni enlaza fuera
 * `/design-canvas`, que sigue intacto.
 *
 * Suspense: DesignStudio lee query params (?design=id / ?import=1) con
 * useSearchParams — envolverlo evita el bailout de prerender en App Router.
 */

import { Suspense } from "react";
import { DesignStudio } from "@/components/estudio/DesignStudio";

export default function EstudioPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#050507]" />}>
            <DesignStudio />
        </Suspense>
    );
}
