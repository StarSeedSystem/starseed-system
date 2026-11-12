"use client";

/** PRB1111V: la única línea de «Pruebas» dentro del panel «Versiones»: dice cómo van y lleva al medidor. */

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";

export function LineaDePruebas({ alAbrir }: { alAbrir?: () => void }) {
    const [resumen, setResumen] = useState<string | null>(null);
    useEffect(() => {
        let vivo = true;
        void (async () => {
            try {
                const r = await fetch("/api/mando/lanzamientos/pruebas", { cache: "no-store" });
                if (!r.ok) return;
                const c = (await r.json()) as { resumen?: unknown };
                if (vivo && typeof c.resumen === "string") setResumen(c.resumen);
            } catch {
                /* sin resumen: la línea sigue llevando a Pruebas */
            }
        })();
        return () => {
            vivo = false;
        };
    }, []);
    return (
        <div data-testid="linea-pruebas" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
            <FlaskConical className="h-4 w-4 shrink-0 text-cyan-200" aria-hidden />
            <p className="min-w-0 flex-1 break-words text-white/75">
                Versiones de prueba: {resumen ?? "se ven en el medidor Pruebas"}
            </p>
            {alAbrir ? (
                <Button size="sm" variant="outline" className="h-8 cursor-pointer text-xs" onClick={alAbrir}>
                    Abrir Pruebas
                </Button>
            ) : null}
        </div>
    );
}
