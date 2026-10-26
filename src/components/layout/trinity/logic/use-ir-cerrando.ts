"use client";

/**
 * «Ir a…» desde el Centro de Control: cierra la cortina con su animación y navega (igual que Horizon).
 * Montado fuera de una cortina (pruebas), solo navega.
 */
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePanelCortina } from "../panel-cortina";

export function useIrCerrando(): (href: string) => void {
  const router = useRouter();
  const panel = usePanelCortina();
  return useCallback(
    (href: string) => {
      panel?.cerrar();
      router.push(href);
    },
    [panel, router],
  );
}
