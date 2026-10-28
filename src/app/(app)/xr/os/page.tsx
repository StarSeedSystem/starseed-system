"use client";

/**
 * /xr/os · el OS entero en 3D dentro de un visor o en pantalla (XR1010G, contrato
 * `architecture/starseed-xr.md` §3 a y c). Esta página es SOLO la cáscara de la ruta:
 *  - lee `?modo=vr|ar|pantalla` para que «Web Launch», los atajos de la PWA y
 *    `EntradaGlobalXR` abran el formato correcto;
 *  - carga `EscenaOS` con `next/dynamic` y `ssr:false`: el motor 3D (three/R3F/XR) no
 *    puede ejecutarse en el servidor ni debe entrar en el chunk del layout raíz;
 *  - envuelve el árbol en `Suspense` porque `useSearchParams` lo exige en el render
 *    estático.
 * Una ruta de Next solo puede exportar `default` y la configuración de segmento: por eso
 * `modoDeRuta` se queda privada (una función exportada de más rompe `.next/types`).
 */

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { modoXRDe } from "@/lib/vivo/xr";

export const dynamic = "force-dynamic";

/** Modo que entiende la escena: los dos inmersivos de `modoXRDe` más la vista 3D explícita. */
type ModoRuta = ReturnType<typeof modoXRDe> | "pantalla";

/** `?modo=pantalla` es la vista 3D de escritorio/iPhone; cualquier otro valor se ignora. */
function modoDeRuta(valor: string | null): ModoRuta {
  const inmersivo = modoXRDe(valor);
  if (inmersivo) return inmersivo;
  return valor === "pantalla" ? "pantalla" : null;
}

const EscenaOS = nextDynamic(
  () => import("@/components/xr/shell/escena-os").then((m) => m.EscenaOS),
  {
    ssr: false,
    loading: () => (
      <div
        className="absolute inset-0 grid place-items-center bg-[#060814] text-[#F5F7FF]"
        role="status"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="size-8 animate-spin rounded-full border-2 border-[#39FF14] border-t-transparent" />
          <p className="text-sm font-medium">Preparando tu espacio 3D…</p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">StarSeed XR</p>
        </div>
      </div>
    ),
  },
);

/** Toda la lectura de la URL vive aquí, dentro del `Suspense` que pide `useSearchParams`. */
function EscenaDeLaRuta() {
  const parametros = useSearchParams();
  return <EscenaOS modo={modoDeRuta(parametros.get("modo"))} />;
}

export default function PaginaXR() {
  return (
    <section className="relative flex min-h-[78vh] flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#060814] shadow-2xl">
      <Suspense fallback={<div className="absolute inset-0 bg-[#060814]" />}>
        <EscenaDeLaRuta />
      </Suspense>
    </section>
  );
}
