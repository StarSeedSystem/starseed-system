"use client";

// MainProviders — providers de la sección (main). Client Component hijo de
// (main)/layout (Server Component) para que el layout NO use hooks de React
// directamente → elimina el "Invalid hook call" (#310) en producción (Vercel)
// por el react duplicado de Next 15.
import { AppearanceProvider } from "@/context/appearance-context";
import type { ReactNode } from "react";
// Clic derecho global «Variaciones públicas» (Ola 1019V · tarea N): el grupo
// (main) —dashboard, ajustes, mensajes, escritorios— es hermano de (app), así
// que también monta el anfitrión y el menú para que la función valga en TODO el OS.
import { ClicDerechoGlobal } from "@/components/variaciones/clic-derecho-global";
import { VariacionesHost } from "@/components/variaciones/variaciones-host";

export default function MainProviders({ children }: { children: ReactNode }) {
  return (
    <AppearanceProvider>
      {children}
      <ClicDerechoGlobal />
      <VariacionesHost />
    </AppearanceProvider>
  );
}
