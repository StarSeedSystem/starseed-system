"use client";

// src/app/(app)/crear/page.tsx
// Centro de Creación (Trinity · Horizon) — página completa a la que navega la
// cortina "Centro de Creación" (side-curtains):
//   /crear · /crear?area=lienzo · /crear?area=fragua · /crear?area=pizarras ·
//   /crear?area=publicar&dest=biblioteca|politica|educacion|cultura
//
// CreationCenter lee useSearchParams, así que se envuelve en <Suspense> y se
// fuerza el render dinámico (mismo patrón que /publish y /pizarra) para evitar
// el bailout de prerender estático en el build de Vercel.

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { CreationCenter } from "@/components/creation/creation-center";

export default function CrearPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
                    Cargando Centro de Creación…
                </div>
            }
        >
            <CreationCenter />
        </Suspense>
    );
}
