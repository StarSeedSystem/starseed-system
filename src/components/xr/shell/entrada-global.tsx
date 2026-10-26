"use client";

/**
 * StarSeed XR · Entrada global ligera (XR1010F, contrato §3 c y regla 6 del §0).
 * Montado en AppGlobals (no en el layout raíz) como `next/dynamic` sin SSR.
 * No carga motores pesados: solo `BotonEntradaXR`, lucide y Next.
 */
import { useCallback, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { BotonEntradaXR, type ModoBotonXR } from "./boton-entrada-xr";
import { useCapacidadesXR } from "./use-capacidades-xr";

const OCULTO_KEY = "starseed.xr.boton.oculto.v1";

export function EntradaGlobalXR() {
  const pathname = usePathname();
  const router = useRouter();
  const { capacidades, estado } = useCapacidadesXR({ modo: "auto" });
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(OCULTO_KEY);
      if (v === "1" || v === "true") setOculto(true);
    } catch { /* sin localStorage */ }
  }, []);

  const modosInmersivos = capacidades?.modos?.filter(
    (m: string) => m === "vr-inmersivo" || m === "ar-passthrough" || m === "ar-mano"
  ) ?? [];

  const alEntrar = useCallback(
    (modo: ModoBotonXR) => {
      const query = modo === "vr-inmersivo" ? "vr" : modo === "ar-passthrough" ? "ar" : "vr";
      router.push(`/xr/os?modo=${query}`);
    },
    [router]
  );

  const ocultar = useCallback(() => {
    setOculto(true);
    try { localStorage.setItem(OCULTO_KEY, "1"); } catch { /* sin localStorage */ }
  }, []);

  // Mientras sondea no afirma nada: sin botón muerto.
  if (estado !== "listo") return null;
  // No se muestra en /genesis ni en /xr/os.
  if (pathname === "/genesis" || pathname === "/xr/os" || pathname?.startsWith("/xr/os")) return null;
  // Si no hay modos inmersivos disponibles, no pinta nada.
  if (estado === "listo" && modosInmersivos.length === 0) return null;
  // Si está oculto por preferencia, no pinta nada.
  if (oculto) return null;

  return (
    <div
      className="fixed bottom-[72px] left-[24px] z-50 flex items-center gap-2"
      style={{ position: "fixed" }}
      data-testid="entrada-global-xr"
    >
      <BotonEntradaXR variante="flotante" modo="auto" alEntrar={alEntrar} />
      <button
        type="button"
        onClick={ocultar}
        aria-label="Ocultar botón de entrada a XR"
        title="Ocultar"
        className="cursor-pointer inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[#0E101E]/70 text-white/70 shadow transition hover:bg-[#0E101E] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]/70"
        data-testid="boton-ocultar-entrada"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
