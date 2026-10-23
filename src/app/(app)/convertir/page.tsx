"use client";

// /convertir — conversor de archivos del OS (motor Filee en la neurona).
// Contrato: `architecture/conversion-archivos.md`.

import { Suspense } from "react";

import { Conversor } from "@/components/conversion/conversor";

export const dynamic = "force-dynamic";

export default function PaginaConvertir() {
    return (
        <Suspense fallback={null}>
            <Conversor />
        </Suspense>
    );
}
