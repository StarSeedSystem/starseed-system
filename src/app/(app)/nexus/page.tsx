"use client";

/**
 * StarSeed OS — `/nexus` → REDIRECT a la sección Astraura IA · pestaña «Nexus».
 * ============================================================================
 * Esta ruta era una página INDEPENDIENTE con datos MOCK (espacios y burbujas
 * hardcodeadas, sin handlers). Se ELIMINÓ y sus características de valor se
 * fusionaron —implementadas de verdad, sobre datos reales— dentro de la pestaña
 * «Nexus» de `/agent` (el antiguo «Chat Neural»), que comparte el mismo cerebro,
 * cuentas, carpetas y contexto que el orbe y el Exocórtex.
 *
 * Aquí solo queda un redirect que preserva los query params entrantes y fija la
 * pestaña `chat` (Nexus). Cualquier enlace antiguo a `/nexus` sigue funcionando.
 */

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Evita el bailout de prerender estático por useSearchParams (build de Vercel).
export const dynamic = "force-dynamic";

function NexusRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const sp = new URLSearchParams(params?.toString() ?? "");
    if (!sp.has("tab")) sp.set("tab", "chat"); // pestaña «Nexus»
    router.replace(`/agent?${sp.toString()}`);
  }, [router, params]);

  return (
    <div className="flex h-[60vh] w-full items-center justify-center text-sm text-cyan-200/60">
      Abriendo el Nexus de Astraura IA…
    </div>
  );
}

export default function NexusPage() {
  return (
    <Suspense fallback={null}>
      <NexusRedirect />
    </Suspense>
  );
}
