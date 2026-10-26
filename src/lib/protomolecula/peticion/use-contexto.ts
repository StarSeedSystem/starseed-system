"use client";
/**
 * Petición a la Protomolécula · hook del contexto (Ola 1026P · P3).
 * Devuelve el contexto de la pantalla actual (ruta + último anuncio) y se actualiza al navegar o al anunciar.
 */
import { useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { ContextoProto } from "./contrato";
import { leerContexto, suscribirContexto, versionContexto } from "./contexto";

const SIN_ANUNCIO = (): number => 0;

export function useContextoProto(): ContextoProto {
  const ruta = usePathname() ?? "/";
  const version = useSyncExternalStore(suscribirContexto, versionContexto, SIN_ANUNCIO);
  // La consulta (`?canvas=…`) no cambia `usePathname`; se lee al calcular, ya en el navegador.
  return useMemo(() => {
    const consulta = typeof window !== "undefined" && window.location.pathname === ruta ? window.location.search : "";
    return leerContexto(ruta + consulta);
  }, [ruta, version]);
}
