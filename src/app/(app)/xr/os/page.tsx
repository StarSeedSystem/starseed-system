"use client";

// ════════════════════════════════════════════════════════════════════════════
// Ruta /xr/os — el StarSeed OS dentro de la escena XR (contrato §3 a y c).
// ----------------------------------------------------------------------------
// Página FINA: aquí no se monta three/R3F, solo se carga `EscenaOS` con
// `next/dynamic` sin SSR (el motor pesado no llega al servidor ni al layout
// raíz) y se le pasa el modo que pide la URL: `?modo=vr`, `?modo=ar` o
// `?modo=pantalla`. Sin modo, decide el aparato. La escena, el botón universal,
// la entrada automática y «Salir al sistema» viven en `escena-os.tsx`.
//
// Solo se exporta `default` (y la configuración de ruta `dynamic`): una página
// de Next que exporta otra función rompe `.next/types`.
// ════════════════════════════════════════════════════════════════════════════

import { Suspense, type ComponentType } from "react";
import nextDynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { modoXRDe } from "@/lib/vivo/xr";

// Evita el bailout de prerender estático: la escena solo existe en el navegador.
export const dynamic = "force-dynamic";

type ModoEscena = "vr" | "ar" | null;
/** `modo` y `modoPedido` son el mismo dato: la escena puede leer cualquiera de los dos nombres. */
type PropsEscena = { modo?: ModoEscena; modoPedido?: ModoEscena };
type ComponenteEscena = ComponentType<PropsEscena>;

const EscenaOS = nextDynamic<PropsEscena>(
  () =>
    // @ts-ignore — `escena-os` lo escribe XR1010G parte 2; en cuanto exista, resuelve sola.
    import("@/components/xr/shell/escena-os").then((m) => {
      const mod = m as unknown as { EscenaOS?: ComponenteEscena; default?: ComponenteEscena };
      return (mod.EscenaOS ?? mod.default) as ComponenteEscena;
    }),
  { ssr: false, loading: () => <Cargando /> },
);

/** `pantalla` fuerza la vista 3D de escritorio/iPhone; `vr`/`ar` piden sesión inmersiva. */
function modoDeRuta(valor: string | null): ModoEscena {
  if (valor === "pantalla") return null;
  return modoXRDe(valor);
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

/**
 * La URL se lee en el cliente (esta página no se pre-renderiza por la escena):
 * `pantalla` fuerza la vista 3D; `vr`/`ar` piden su sesión. El `<Suspense>`
 * cubre la carga perezosa de `EscenaOS`.
 */
function InteriorEscena() {
  const busqueda = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const modo = modoDeRuta(busqueda.get("modo"));
  return <EscenaOS modo={modo} modoPedido={modo} />;
}

export default function PaginaXRSO() {
  return (
    <main
      className="fixed inset-0 overflow-hidden bg-[#060814] text-[#F5F7FF]"
      data-testid="xr-os"
    >
      <Suspense fallback={<Cargando />}>
        <InteriorEscena />
      </Suspense>
    </main>
  );
}
