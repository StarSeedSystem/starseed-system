import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/header";
import AppProviders from "./app-providers";

// Server Component (sin "use client"): NO usa hooks de React directamente,
// así se elimina el "Invalid hook call" (#310) que aparecía en producción
// (Vercel) por el react duplicado de Next 15. Los providers y efectos
// globales viven en <AppProviders /> (Client Component), que hidrata con la
// instancia única de React del navegador.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <div className="flex flex-col min-h-screen transition-all duration-300 ease-in-out">
        <div className="flex flex-col min-w-0 transition-all duration-300 flex-1">
          <AppHeader />
          <main className="flex-1 flex flex-col bg-transparent transition-all duration-300 overflow-y-auto">
            <div className="w-full px-[clamp(0.75rem,2vw,2rem)] py-[clamp(0.75rem,1.5vw,1.5rem)] flex flex-col gap-[clamp(0.75rem,1.5vw,1.5rem)] flex-1">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AppProviders>
  );
}
