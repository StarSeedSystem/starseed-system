// src/app/(app)/network/layout.tsx
'use client';
import { ReactNode } from "react";
import { NetworkNavigation } from "./_components/navigation";
import { Sparkles } from "lucide-react";

/**
 * Cabecera compacta y estética de La Red.
 *
 * Diseño: pill horizontal con icono luminoso, título con gradiente sutil
 * y subtítulo en una sola línea. Ocupa una sola fila visual y se integra
 * con el lenguaje "Crystal Liquid Glass" del sistema.
 */
export default function NetworkLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3 flex-wrap">
        <div className="relative inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur px-4 py-1.5 shadow-[0_0_30px_rgba(168,85,247,0.08)]">
          <span className="relative flex w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-60" aria-hidden />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-cyan-300" aria-hidden />
          </span>
          <Sparkles className="w-4 h-4 text-purple-300" aria-hidden />
          <h1 className="text-base font-bold tracking-wide font-headline bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-purple-300 to-amber-200">
            La Red
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground/80 leading-tight">
          Latido vivo de la <span className="text-cyan-300/90">gobernanza</span>,{' '}
          <span className="text-emerald-300/90">educación</span> y{' '}
          <span className="text-purple-300/90">cultura</span>.
        </p>
      </header>
      <NetworkNavigation />
      <div>{children}</div>
    </div>
  );
}
