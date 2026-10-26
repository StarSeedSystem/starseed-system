"use client";

/** Botón del Centro de Control: diana de 44 px, foco visible ámbar y tres tonos (principal, peligro, sutil). */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Variante = "principal" | "peligro" | "sutil";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variante?: Variante;
  icono?: LucideIcon;
  children: ReactNode;
  bloque?: boolean;
}

const VARIANTES: Record<Variante, string> = {
  principal:
    "border-amber-300/70 bg-gradient-to-b from-amber-300 to-amber-500 text-black font-semibold shadow-[0_6px_22px_-8px_rgba(255,191,0,0.7)] hover:from-amber-200 hover:to-amber-400",
  peligro:
    "border-red-300/60 bg-gradient-to-b from-red-500 to-red-700 text-white font-semibold shadow-[0_6px_22px_-8px_rgba(220,20,60,0.7)] hover:from-red-400 hover:to-red-600",
  sutil: "border-white/15 bg-white/[0.06] text-amber-50 hover:border-amber-300/40 hover:bg-amber-400/[0.1]",
};

export const BotonLogic = forwardRef<HTMLButtonElement, Props>(function BotonLogic(
  { variante = "sutil", icono: Icono, children, bloque, className, type = "button", ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 text-[13px] outline-none",
        "transition-[background-color,border-color,transform,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-safe:active:scale-[0.97]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        bloque && "w-full",
        VARIANTES[variante],
        className,
      )}
      {...resto}
    >
      {Icono && <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
});
