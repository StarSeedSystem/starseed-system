"use client";

/**
 * `/xr/os` — el StarSeed OS completo en 3D (XR1010G, contrato `architecture/starseed-xr.md` §3 a y c).
 * Página FINA: carga la escena con `next/dynamic` sin SSR (el motor de render no llega ni al servidor
 * ni al layout raíz) y lee `?modo=vr|ar|pantalla` una vez montada en el navegador; `vr`/`ar` piden
 * sesión inmersiva (con entrada automática cuando el plan la permite) y `pantalla` —o nada— la evita.
 * La escena vive en `@/components/xr/shell/escena-os`.
 */
import { useEffect, useState } from "react";
import nextDynamic from "next/dynamic";
import { modoXRDe, type ModoXR as ModoURL } from "@/lib/vivo/xr";

const EscenaOS = nextDynamic(() => import("@/components/xr/shell/escena-os"), {
    ssr: false,
    loading: () => <p role="status">Abriendo el sistema en 3D…</p>,
});

export default function PaginaXROS() {
    const [busqueda, setBusqueda] = useState("");
    useEffect(() => setBusqueda(window.location.search), []);
    const modo: ModoURL | null = modoXRDe(new URLSearchParams(busqueda).get("modo"));
    return (
        <main className="fixed inset-0 flex flex-col bg-[#060814] text-[#F5F7FF]" data-testid="xr-os" data-modo={modo ?? "pantalla"}>
            <EscenaOS modo={modo} />
        </main>
    );
}
