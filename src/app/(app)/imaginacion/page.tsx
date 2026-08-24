"use client";

// ════════════════════════════════════════════════════════════════════════════
// Ruta /imaginacion — "Imaginación Intuitiva (Always-On)", paridad con la
// pantalla del programa original Astraura 1.58-bit (`IntuitiveImaginationView.jsx`,
// spec técnica en `/tmp/imagination-spec.md`).
// --------------------------------------------------------------------------
// Nota sobre `metadata` + `next/dynamic({ ssr:false })`: Next.js App Router
// PROHÍBE `ssr:false` en `dynamic()` cuando se llama desde un Server Component
// (build error "ssr: false is not allowed with next/dynamic in Server
// Components"), y a la vez prohíbe exportar `metadata` desde un archivo
// "use client". El visor sondea cada 5s, lee `localStorage` y usa `window.
// confirm/prompt` — necesita `ssr:false` de verdad (evita cualquier intento de
// render en servidor y el hydration mismatch que traería). Mismo patrón que
// ya usan otras rutas de este repo con la misma necesidad (`/conocimiento`,
// `/red-3d`, `/cerebro/mapa`, `/xr`, `/audiomorphic`, `/publicar`): página
// "use client" + `dynamic(…, { ssr:false })`, sin `metadata` — ninguna de
// ellas exporta `metadata` por la misma razón técnica.
// ════════════════════════════════════════════════════════════════════════════

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const ImaginacionView = dynamic(
  () => import("@/components/astraura/imaginacion/imaginacion-view").then((m) => m.ImaginacionView),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-white/70">
        <Loader2 className="h-8 w-8 animate-spin text-purple-300" aria-hidden="true" />
        <p className="text-[13px]">Sincronizando Sistema de Imaginación Intuitiva 1.58-Bit...</p>
      </div>
    ),
  },
);

export default function ImaginacionPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl">
        <ImaginacionView />
      </div>
    </main>
  );
}
