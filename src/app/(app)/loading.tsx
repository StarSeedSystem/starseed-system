import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * (app)/loading.tsx — Fallback de carga (Suspense) para TODO el grupo de rutas
 * (app). Next.js lo cablea automáticamente por convención mientras un segmento
 * resuelve sus datos/JS. Es un esqueleto ligero y neutro (sirve para cualquier
 * ruta) con la estética "Crystal Liquid Glass": paneles con backdrop-blur,
 * bordes tenues y un pulso sutil. Respeta `prefers-reduced-motion` desactivando
 * toda animación descendente. Server Component (sin estado ni hooks).
 */

function GlassPanel({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl",
        "shadow-[0_8px_32px_rgba(0,0,0,0.12)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Bar({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-white/[0.06]", className)} />
  );
}

export default function AppLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      // `motion-reduce:[&_*]:!animate-none` — convención del repo: bajo
      // prefers-reduced-motion se anula el pulso de todos los descendientes.
      className="min-h-screen px-4 py-8 md:px-8 motion-reduce:[&_*]:!animate-none"
    >
      <span className="sr-only">Cargando…</span>

      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {/* Encabezado */}
        <GlassPanel className="flex flex-col gap-4 p-6">
          <Bar className="h-7 w-1/3" />
          <Bar className="h-4 w-2/3" />
        </GlassPanel>

        {/* Rejilla de paneles neutra */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <GlassPanel key={i} className="flex flex-col gap-4 p-6">
              <Bar className="h-10 w-10 rounded-full" />
              <Bar className="h-5 w-3/4" />
              <Bar className="h-4 w-full" />
              <Bar className="h-4 w-5/6" />
            </GlassPanel>
          ))}
        </div>
      </div>
    </main>
  );
}
