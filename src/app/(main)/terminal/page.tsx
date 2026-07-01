"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Terminal (ruta heredada → Cerebros)
// ----------------------------------------------------------------
// La Terminal integrada (consola sandbox + dispositivos como servidores)
// ya NO es una sección/botón suelto: vive DENTRO de Cerebros
// (brains-panel → «Terminal y dispositivos»). Esta ruta se conserva por
// compatibilidad de enlaces y redirige automáticamente a la sección de
// Cerebros. Si el redirect no ocurriera (JS deshabilitado), se ofrece un
// enlace manual.
// ════════════════════════════════════════════════════════════════

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TerminalSquare, ArrowRight } from "lucide-react";

export default function TerminalPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirección suave a la sección de Terminal dentro de Cerebros.
    try {
      router.replace("/cerebros#terminal");
    } catch {
      /* defensivo: si el router no está listo, queda el enlace manual */
    }
  }, [router]);

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500">
            <TerminalSquare className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-emerald-50">La Terminal ahora vive en Cerebros</h1>
            <p className="mt-1 text-sm text-white/60">
              La consola integrada y tus dispositivos como servidores se han unificado dentro de la sección
              de Cerebros. Te estamos llevando allí…
            </p>
            <Link
              href="/cerebros#terminal"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-100 transition-colors hover:bg-emerald-500/10"
            >
              Ir a Cerebros → Terminal <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
