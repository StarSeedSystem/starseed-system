"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { BotonEntradaXR } from "./boton-entrada-xr";
import { useCapacidadesXR } from "./use-capacidades-xr";

/**
 * EntradaGlobalXR (XR1010F): pinta en la esquina inferior izquierda el `BotonEntradaXR`
 * flotante, solo si el visor es capaz y no estamos en /genesis o /xr/os.
 */
export function EntradaGlobalXR() {
  const [oculto, setOculto] = useState(false);
  const pathname = usePathname();
  const { capacidades } = useCapacidadesXR({});

  useEffect(() => {
    try {
      setOculto(localStorage.getItem("starseed.xr.boton.oculto.v1") === "true");
    } catch {}
  }, []);

  const ocultar = () => {
    setOculto(true);
    try {
      localStorage.setItem("starseed.xr.boton.oculto.v1", "true");
    } catch {}
  };

  const inmersivos = capacidades.modos.filter((m) => m === "vr-inmersivo" || m === "ar-passthrough" || m === "ar-mano");
  const posible = inmersivos.length > 0;
  const enRutaProhibida = pathname === "/genesis" || pathname === "/xr/os";

  if (!posible || oculto || enRutaProhibida) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[60] flex items-end gap-2">
      <BotonEntradaXR variante="flotante" />
      <button
        onClick={ocultar}
        aria-label="Ocultar botón de XR"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0E101E]/80 text-[#F5F7FF] hover:bg-[#0E101E] border border-white/15"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
