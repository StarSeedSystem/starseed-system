"use client";
/**
 * Etiqueta «Bot de IA» (Ola 1025U · U3). Regla de Alex: todo lo que publique o comente un agente de IA la lleva,
 * siempre. Por eso este componente NO tiene ninguna propiedad para ocultarla ni para cambiarle el estilo: solo el
 * tamaño. Siempre muestra el texto (no solo un icono), con su nombre accesible «Bot de un agente de IA».
 */
import { Bot } from "lucide-react";

export interface EtiquetaBotIAProps {
  /** `sm` para cabeceras de tarjeta y comentarios; `md` para fichas y perfiles. */
  tamano?: "sm" | "md";
}

export const TEXTO_ETIQUETA_BOT = "Bot de IA";
export const NOMBRE_ACCESIBLE_BOT = "Bot de un agente de IA";

export function EtiquetaBotIA({ tamano = "sm" }: EtiquetaBotIAProps) {
  const grande = tamano === "md";
  return (
    <span
      role="note"
      aria-label={NOMBRE_ACCESIBLE_BOT}
      title={NOMBRE_ACCESIBLE_BOT}
      data-testid="etiqueta-bot-ia"
      className={
        "inline-flex shrink-0 select-none items-center gap-1 whitespace-nowrap rounded-full border border-[#007FFF]/45 " +
        "bg-[#007FFF]/15 font-semibold uppercase tracking-wide text-sky-200 " +
        (grande ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px] leading-4")
      }
    >
      <Bot className={grande ? "size-3.5" : "size-3"} aria-hidden="true" />
      {TEXTO_ETIQUETA_BOT}
    </span>
  );
}
