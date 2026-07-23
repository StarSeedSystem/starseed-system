"use client";

// MainProviders — providers de la sección (main). Client Component hijo de
// (main)/layout (Server Component) para que el layout NO use hooks de React
// directamente → elimina el "Invalid hook call" (#310) en producción (Vercel)
// por el react duplicado de Next 15.
import { AppearanceProvider } from "@/context/appearance-context";
import type { ReactNode } from "react";

export default function MainProviders({ children }: { children: ReactNode }) {
  return <AppearanceProvider>{children}</AppearanceProvider>;
}
