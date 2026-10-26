"use client";
/**
 * Piezas visuales compartidas de la ficha del agente (Ola 1025U · U2). Cristal líquido StarSeed, iconos de Lucide,
 * objetivos táctiles de 44 px y nada que desborde a 360 px. Solo presentan: la lógica vive en `lib/avatares/agente`.
 */
import * as React from "react";
import { Bot, Check, Save } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** La chapa que acompaña a todo habitante del mundo: todos son IAs. */
export function InsigniaBotIA({ className }: { className?: string }) {
  return (
    <span
      data-testid="insignia-bot-ia"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-100",
        className,
      )}
    >
      <Bot className="h-3.5 w-3.5" aria-hidden="true" />
      Bot de IA
    </span>
  );
}

/** Dice con honestidad si un ajuste ya lo lee un motor del OS o solo queda guardado en la ficha. */
export function InsigniaEstado({ tipo, detalle }: { tipo: "aplicado" | "ficha"; detalle?: string }) {
  const aplicado = tipo === "aplicado";
  const Icono = aplicado ? Check : Save;
  return (
    <span
      data-estado={tipo}
      title={detalle ?? (aplicado ? "Un motor del OS ya lo lee." : "Queda guardado en la ficha; lo lee quien responda por el agente.")}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        aplicado ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" : "border-white/15 bg-white/5 text-muted-foreground",
      )}
    >
      <Icono className="h-3 w-3" aria-hidden="true" />
      {aplicado ? "Aplicado" : "Guardado en la ficha"}
    </span>
  );
}

export interface BloqueProps {
  icono: LucideIcon;
  titulo: string;
  estado?: "aplicado" | "ficha";
  detalleEstado?: string;
  ayuda?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export function Bloque({ icono: Icono, titulo, estado, detalleEstado, ayuda, children, className, id }: BloqueProps) {
  return (
    <section
      id={id}
      aria-label={titulo}
      className={cn("min-w-0 rounded-2xl border border-white/10 bg-black/20 p-3 shadow-lg backdrop-blur-md sm:p-4", className)}
    >
      <header className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Icono className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="min-w-0 font-headline text-sm font-semibold tracking-wide text-foreground">{titulo}</h3>
        {estado && <InsigniaEstado tipo={estado} detalle={detalleEstado} />}
      </header>
      {ayuda && <p className="mb-3 break-words text-xs leading-relaxed text-muted-foreground">{ayuda}</p>}
      {children}
    </section>
  );
}

export interface FilaInterruptorProps {
  id: string;
  etiqueta: string;
  ayuda?: React.ReactNode;
  marcado: boolean;
  alCambiar: (marcado: boolean) => void;
  deshabilitado?: boolean;
}

/** Toda la fila es el objetivo táctil (≥ 44 px): el interruptor solo, de 24 px, sería pequeño. */
export function FilaInterruptor({ id, etiqueta, ayuda, marcado, alCambiar, deshabilitado }: FilaInterruptorProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-[44px] w-full min-w-0 items-center justify-between gap-3 rounded-xl px-2 py-1.5 transition-colors duration-200",
        deshabilitado ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-white/5",
      )}
    >
      <span className="min-w-0">
        <span className="block break-words text-sm text-foreground">{etiqueta}</span>
        {ayuda && <span className="block break-words text-xs text-muted-foreground">{ayuda}</span>}
      </span>
      <Switch id={id} aria-label={etiqueta} checked={marcado} onCheckedChange={alCambiar} disabled={deshabilitado} />
    </label>
  );
}

export interface DeslizadorProps {
  id: string;
  etiqueta: string;
  ayuda?: React.ReactNode;
  valor: number;
  alCambiar: (v: number) => void;
  min?: number;
  max?: number;
  paso?: number;
  formato?: (v: number) => string;
  deshabilitado?: boolean;
}

export function Deslizador({ id, etiqueta, ayuda, valor, alCambiar, min = 0, max = 1, paso = 0.05, formato, deshabilitado }: DeslizadorProps) {
  const texto = formato ? formato(valor) : String(valor);
  return (
    <div className="min-w-0 py-1">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <label htmlFor={id} className="min-w-0 break-words text-sm text-foreground">{etiqueta}</label>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{texto}</span>
      </div>
      {ayuda && <p className="break-words text-xs text-muted-foreground">{ayuda}</p>}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        disabled={deshabilitado}
        aria-valuetext={texto}
        onChange={(e) => alCambiar(Number(e.target.value))}
        className="block h-11 w-full min-w-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

type VarianteBoton = "primario" | "suave" | "peligro";

const CLASES_BOTON: Record<VarianteBoton, string> = {
  primario: "border-primary/50 bg-primary/20 text-foreground hover:bg-primary/30",
  suave: "border-white/15 bg-white/5 text-foreground hover:bg-white/10",
  peligro: "border-red-400/40 bg-red-500/10 text-red-100 hover:bg-red-500/20",
};

export interface BotonFichaProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  icono?: LucideIcon;
}

export const BotonFicha = React.forwardRef<HTMLButtonElement, BotonFichaProps>(function BotonFicha(
  { variante = "suave", icono: Icono, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50",
        CLASES_BOTON[variante],
        className,
      )}
      {...rest}
    >
      {Icono && <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
});

export const CLASE_CAMPO =
  "min-h-[44px] w-full min-w-0 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-60";

export const CLASE_SELECT = `${CLASE_CAMPO} cursor-pointer`;

/** Una opción de un grupo de opciones excluyentes (role=radiogroup). */
export interface OpcionRadio<T extends string> {
  valor: T;
  titulo: string;
  ayuda?: string;
  icono?: LucideIcon;
  deshabilitada?: boolean;
}

export function GrupoRadio<T extends string>({
  etiqueta, opciones, valor, alCambiar,
}: { etiqueta: string; opciones: readonly OpcionRadio<T>[]; valor: T; alCambiar: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid min-w-0 gap-2 sm:grid-cols-2">
      {opciones.map((o) => {
        const activa = o.valor === valor;
        const Icono = o.icono;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activa}
            disabled={o.deshabilitada}
            onClick={() => alCambiar(o.valor)}
            className={cn(
              "flex min-h-[44px] min-w-0 cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-left outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50",
              activa ? "border-primary/50 bg-primary/15" : "border-white/10 bg-white/5 hover:bg-white/10",
            )}
          >
            {Icono && <Icono className={cn("mt-0.5 h-4 w-4 shrink-0", activa ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />}
            <span className="min-w-0">
              <span className="block break-words text-sm font-medium text-foreground">{o.titulo}</span>
              {o.ayuda && <span className="block break-words text-xs text-muted-foreground">{o.ayuda}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Mensaje de error o aviso, anunciado a lectores de pantalla. */
export function Aviso({ children, tono = "aviso" }: { children: React.ReactNode; tono?: "aviso" | "error" }) {
  return (
    <p
      role={tono === "error" ? "alert" : "status"}
      className={cn(
        "break-words rounded-xl border px-3 py-2 text-xs",
        tono === "error" ? "border-red-400/40 bg-red-500/10 text-red-100" : "border-amber-400/30 bg-amber-500/10 text-amber-100",
      )}
    >
      {children}
    </p>
  );
}

/** Número con coma decimal, como se lee en español. */
export const num = (x: number, dec = 2): string => x.toFixed(dec).replace(".", ",");
export const porcentaje = (x: number): string => `${Math.round(x * 100)} %`;
