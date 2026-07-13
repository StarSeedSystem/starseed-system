"use client";

/**
 * Primitivas visuales compartidas del Centro de Configuración de Aurora
 * (Adenda 67 · P1). Un solo lenguaje: Crystal Liquid Glass, iconos Lucide,
 * cursor pointer en todo lo clicable, transiciones 150-300 ms, accesible.
 */

import * as React from "react";
import * as Lucide from "lucide-react";
import { Info, TriangleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Clases base ── */

export const cardCls =
  "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md shadow-lg";

export const btnCls =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/85 transition-colors duration-200 hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";

export const btnPrimaryCls =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#7fb8ff] px-3.5 py-2 text-[12px] font-semibold text-[#0d1220] transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

export const inputCls =
  "w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors duration-200 placeholder:text-white/30 focus:border-[#7fb8ff]/50";

export const selectCls =
  "w-full cursor-pointer rounded-lg border border-white/12 bg-[#0d1220] px-2.5 py-2 text-xs text-white outline-none transition-colors duration-200 focus:border-[#7fb8ff]/50";

export const labelCls = "mb-1 block text-[11px] font-medium text-white/65";

/* ── Icono Lucide por nombre (defensivo: cae a Sparkles) ── */

export function Icon({ name, className }: { name: string; className?: string }) {
  const map = Lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  const C = map[name] ?? Lucide.Sparkles;
  return <C className={className ?? "h-4 w-4"} />;
}

/* ── Sección con título ── */

export function Block({
  title,
  hint,
  icon,
  right,
  children,
  className,
}: {
  title: string;
  hint?: string;
  icon?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(cardCls, "p-3.5", className)}>
      <header className="mb-2.5 flex flex-wrap items-center gap-2">
        {icon && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#7fb8ff]/12 text-[#7fb8ff] ring-1 ring-[#7fb8ff]/25">
            <Icon name={icon} className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-semibold text-white">{title}</h3>
          {hint && <p className="text-[11px] leading-snug text-white/50">{hint}</p>}
        </div>
        {right && <div className="flex shrink-0 items-center gap-1.5">{right}</div>}
      </header>
      {children}
    </section>
  );
}

/* ── Interruptor accesible ── */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
  tone = "azure",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  hint?: string;
  disabled?: boolean;
  tone?: "azure" | "lime";
}) {
  const on = tone === "lime" ? "bg-[#39FF14]/60" : "bg-[#7fb8ff]/70";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors duration-200",
        disabled
          ? "cursor-not-allowed border-white/8 bg-white/[0.02] opacity-60"
          : "cursor-pointer border-white/10 bg-white/[0.02] hover:border-white/20",
      )}
    >
      <span className="min-w-0">
        <span className="block text-xs text-white/85">{label}</span>
        {hint && <span className="mt-0.5 block text-[10px] leading-snug text-white/45">{hint}</span>}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
          checked ? on : "bg-white/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all duration-200",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/* ── Chip seleccionable ── */

export function Chip({
  active,
  onClick,
  children,
  title,
  tone = "azure",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  tone?: "azure" | "lime" | "amber";
}) {
  const activeCls =
    tone === "lime"
      ? "border-[#39FF14]/50 bg-[#39FF14]/10 text-white"
      : tone === "amber"
        ? "border-[#FFBF00]/50 bg-[#FFBF00]/10 text-white"
        : "border-[#7fb8ff]/50 bg-[#7fb8ff]/12 text-white";
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200",
        active ? activeCls : "border-white/10 bg-white/[0.02] text-white/60 hover:border-white/25 hover:text-white/85",
      )}
    >
      {children}
    </button>
  );
}

/* ── Aviso honesto (info / preferencia / ok) ── */

export function Note({
  kind = "info",
  children,
}: {
  kind?: "info" | "warn" | "ok";
  children: React.ReactNode;
}) {
  const map = {
    info: { I: Info, cls: "border-[#7fb8ff]/25 bg-[#7fb8ff]/[0.06] text-[#bcd9ff]" },
    warn: { I: TriangleAlert, cls: "border-[#FFBF00]/25 bg-[#FFBF00]/[0.06] text-[#ffe6a8]" },
    ok: { I: CircleCheck, cls: "border-[#39FF14]/25 bg-[#39FF14]/[0.06] text-[#c6ffc0]" },
  } as const;
  const { I, cls } = map[kind];
  return (
    <p className={cn("flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10.5px] leading-snug", cls)}>
      <I className="mt-[1px] h-3 w-3 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Insignia de estado real de una función ("operativo" vs "sólo preferencia"). */
export function StatusBadge({ status }: { status: "operativo" | "preferencia" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide",
        status === "operativo"
          ? "border-[#39FF14]/30 bg-[#39FF14]/10 text-[#a8f59c]"
          : "border-[#FFBF00]/30 bg-[#FFBF00]/10 text-[#ffdf99]",
      )}
    >
      {status === "operativo" ? "Operativo" : "Sólo preferencia"}
    </span>
  );
}
