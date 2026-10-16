"use client";

// src/app/(app)/protomolecula/page.tsx (Ola 1010P · PM1010F0I)
// Página de la app «Protomolécula»: panel autónomo a pantalla completa.
// `/protomolecula?molecula=<id>` abre una molécula concreta; sin parámetro,
// el panel usa el último controlador registrado o muestra su estado vacío.
// El lector del parámetro va dentro de <Suspense> (mismo patrón que /crear)
// para evitar el bailout de prerender estático en el build.

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Atom } from "lucide-react";
import { PanelProtomoleculaAutonomo } from "@/components/protomolecula/panel-protomolecula";

function ProtomoleculaInterior() {
  const params = useSearchParams();
  const moleculaId = params.get("molecula") ?? undefined;
  return (
    <main className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6">
        <Atom className="h-5 w-5 text-primary" aria-hidden />
        <h1 className="text-lg font-semibold">Protomolécula</h1>
      </header>
      <section className="min-h-0 flex-1 overflow-hidden">
        <PanelProtomoleculaAutonomo moleculaId={moleculaId} />
      </section>
    </main>
  );
}

export default function ProtomoleculaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
          Cargando Protomolécula…
        </div>
      }
    >
      <ProtomoleculaInterior />
    </Suspense>
  );
}
