"use client";

import type { ReactNode } from "react";
// import { AppSidebar } from "@/components/layout/sidebar"; // Removed Sidebar
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";

export default function MainLayout({ children }: { children: ReactNode }) {
  const { config } = useAppearance();

  return (
    /* os-main-shell / os-main-scroll: bajo body[data-materia] (tema Materia
       Viva) globals.css vuelve translúcidos estos fondos para que el canvas
       global respire tras los widgets. Fuera de materia, cero cambios. */
    <div className="os-main-shell flex min-h-screen w-full flex-col transition-all duration-300 bg-transparent">
      {/* MIDDLE AREA (Content Only) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* CENTER CONTENT */}
        <div className="flex flex-col flex-1 min-w-0 relative h-full">
          {/* Main Page Content — fondo transparente para que el fondo animado
              global (Spline/Living/Materia…) se vea en TODAS las áreas
              (dashboard, configuración, mensajes, etc.). */}
          <main className="os-main-scroll flex-1 overflow-y-auto bg-transparent scrollbar-hide">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
