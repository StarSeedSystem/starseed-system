"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAuroraEngine, type AuroraEngine } from "@/lib/aurora/engine";

const AuroraContext = createContext<AuroraEngine | null>(null);

export function AuroraProvider({ children }: { children: ReactNode }) {
  const engine = useAuroraEngine();
  return <AuroraContext.Provider value={engine}>{children}</AuroraContext.Provider>;
}

/**
 * Acceso al motor de Aurora. Devuelve `null` si no hay provider montado;
 * los consumidores deben degradar con elegancia.
 */
export function useAurora(): AuroraEngine | null {
  return useContext(AuroraContext);
}

export default AuroraProvider;
