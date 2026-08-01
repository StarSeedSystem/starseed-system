import Link from "next/link";
import { Compass, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * (app)/not-found.tsx — Pantalla 404 del grupo de rutas (app). Next.js la
 * renderiza cuando un segmento hijo llama a notFound() o la ruta no existe
 * dentro de (app). Panel "Crystal Liquid Glass" neutro con salida al panel.
 * Server Component (sin estado). `Button` se monta como isla cliente; el
 * AppearanceProvider del root layout está disponible por encima.
 */

export default function AppNotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-8 md:px-8">
      <div
        className={cn(
          "w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-xl",
          "shadow-[0_8px_32px_rgba(0,0,0,0.18)] transition-all duration-300",
        )}
      >
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
          <Compass className="size-6" aria-hidden />
        </div>

        <p className="text-sm font-medium tracking-[0.2em] text-foreground/50">
          404
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
          No encontramos esta página
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground/70">
          Puede que se haya movido, renombrado o que el enlace ya no exista.
          Desde el panel puedes retomar tu camino.
        </p>

        <div className="mt-6 flex justify-center">
          <Button asChild>
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
