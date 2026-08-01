"use client";

/**
 * (app)/error.tsx — Límite de error (error boundary) del grupo de rutas (app).
 * Next.js lo cablea por convención: captura excepciones lanzadas al renderizar
 * cualquier segmento hijo de (app) y las sustituye por este panel amable, sin
 * jerga técnica. El layout (y sus providers) permanece montado por encima, por
 * lo que `Button` (que usa el AppearanceProvider del root layout) es seguro.
 *
 * - "Reintentar" invoca reset() → re-renderiza el segmento fallido.
 * - "Ir al panel" navega a /dashboard como salida segura.
 * - El detalle del error solo se muestra en desarrollo (nunca el stack en prod).
 */

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, LayoutDashboard, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log al console para no perder trazabilidad (no se expone al usuario).
    console.error("[StarSeed OS] Error de ruta:", error);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8 md:px-8">
      <div
        className={cn(
          "w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl",
          "shadow-[0_8px_32px_rgba(0,0,0,0.18)] transition-all duration-300",
        )}
      >
        <div className="mb-5 flex size-12 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10 text-amber-300">
          <TriangleAlert className="size-6" aria-hidden />
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Algo no salió como esperábamos
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground/70">
          Ocurrió un problema al mostrar esta parte del sistema. Puedes
          reintentar o volver al panel principal; tu información sigue a salvo.
        </p>

        {isDev && error?.message ? (
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-foreground/60">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => reset()}>
            <RotateCcw aria-hidden />
            Reintentar
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">
              <LayoutDashboard aria-hidden />
              Ir al panel
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
