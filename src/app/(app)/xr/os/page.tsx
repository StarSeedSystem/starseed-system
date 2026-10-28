"use client";

// ════════════════════════════════════════════════════════════════════════════
// Ruta /xr/os — el StarSeed OS dentro de la escena XR (contrato §3 a y c).
// ----------------------------------------------------------------------------
// Página FINA: no monta three/R3F aquí, solo carga `EscenaOS` con next/dynamic
// sin SSR (el layout raíz no arrastra motores pesados) y le pasa el modo pedido
// en la URL. `?modo=vr|ar` entra en ese formato; `?modo=pantalla` fuerza la
// escena 3D en pantalla (escritorio e iPhone). Sin modo, decide el aparato.
//
// Es "use client" porque next/dynamic con `ssr:false` no se permite desde un
// Server Component y porque lee la URL con useSearchParams. Por eso tampoco
// exporta `metadata`: una ruta de Next solo expone default/config/dynamic/
// runtime/maxDuration/metadata, y nada más (rompe .next/types).
// ════════════════════════════════════════════════════════════════════════════

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { modoXRDe } from "@/lib/vivo/xr";
import type { ModoXR } from "@/lib/xr/tipos";

export const dynamic = "force-dynamic";

const EscenaOS = nextDynamic(
  () => import("@/components/xr/shell/escena-os").then((m) => m.EscenaOS),
  {
    ssr: false,
    loading: () => <Cargando />,
  },
);

/** Modo del núcleo a partir del parámetro corto de la URL (`vr`, `ar`, `pantalla`). */
function modoDeRuta(valor: string | null): ModoXR | null {
  if (valor === "pantalla") return "3d-pantalla";
  const corto = modoXRDe(valor);
  if (corto === "vr") return "vr-inmersivo";
  if (corto === "ar") return "ar-passthrough";
  return null;
}

function Cargando() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#060814] text-[#F5F7FF]/70">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-8 animate-spin text-[#39FF14]" aria-hidden="true" />
        <p className="text-sm font-semibold">Montando el StarSeed OS en 3D…</p>
        <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">
          WebXR · sin salir del sistema
        </p>
      </div>
    </div>
  );
}

function Interior() {
  const busqueda = useSearchParams();
  const modoPedido = modoDeRuta(busqueda.get("modo"));
  return <EscenaOS modoPedido={modoPedido} />;
}

export default function PaginaXRSO() {
  return (
    <main className="relative h-[calc(100dvh-6.5rem)] min-h-[480px] w-full overflow-hidden rounded-3xl border border-white/10 bg-[#060814] shadow-2xl">
      <Suspense fallback={<Cargando />}>
        <Interior />
      </Suspense>
    </main>
  );
}
