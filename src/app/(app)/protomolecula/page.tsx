"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PanelProtomoleculaAutonomo } from "@/components/protomolecula/PanelProtomoleculaAutonomo";

export default function ProtomoleculaPage() {
    const searchParams = useSearchParams();
    const moleculaId = searchParams.get("molecula") ?? "";

    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
                    Cargando Protomolécula…
                </div>
            }
        >
            <div className="flex flex-col items-center justify-center min-h-screen p-6">
                <h1 className="mb-4 text-2xl font-bold">Protomolécula</h1>
                <PanelProtomoleculaAutonomo moleculaId={moleculaId} />
            </div>
        </Suspense>
    );
}