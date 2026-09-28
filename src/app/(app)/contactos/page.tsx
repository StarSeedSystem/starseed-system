// src/app/(app)/contactos/page.tsx
// Contactos (2026-09-28): la libreta privada de personas del OS — sustituye a «seguir» para
// personas. Toda la app vive en <AppContactos/>; aquí solo el envoltorio con Suspense
// (lee `?c=` y `?nuevo=` con useSearchParams).

import { Suspense } from "react";
import type { Metadata } from "next";

import { AppContactos } from "@/components/contactos/app/app-contactos";

export const metadata: Metadata = {
    title: "Contactos · StarSeed",
    description: "Tu libreta privada de personas: datos, relación, categorías, listas y una línea de tiempo que solo ves tú.",
};

export default function ContactosPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-[calc(100dvh-6rem)] items-center justify-center text-sm text-white/60">Abriendo tu libreta…</div>
            }
        >
            <AppContactos />
        </Suspense>
    );
}
