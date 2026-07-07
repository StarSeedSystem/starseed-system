"use client";

/**
 * StarSeed OS — Aurora · "Invocar agente aquí" (punto de enganche reutilizable)
 * ============================================================================
 * Botón/acción PEQUEÑO y reutilizable para incrustar en cualquier página,
 * grupo, comunidad, publicación, archivo o mensaje: abre el chat COMPLETO de
 * Aurora (Exocórtex) con el CONTEXTO del lugar ya precargado (tipo + id +
 * título + ruta), usando `context.ts::describeArea()` para que Aurora sepa de
 * inmediato qué se puede hacer ahí y si puede actuar como agente.
 *
 * NO abre un chat nuevo ni instancia otra Aurora: reutiliza el puente global
 * (`openAurora()` de `lib/aurora/open-aurora.ts`), que revela el panel/Exocórtex
 * YA montado y le envía el prompt como si el usuario lo hubiera escrito.
 *
 * Uso mínimo:
 *   <InvokeAgentButton place={{ kind: "publicacion", id: post.id, title: post.title }} />
 *
 * También se expone `buildPlaceContext()` y `invokeAgentAt()` por si un lugar
 * quiere lanzar la invocación desde su propio botón/acción sin usar este UI.
 */

import { useCallback, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeArea } from "@/ai/astraura/context";
import { openAurora } from "@/lib/aurora/open-aurora";

/** Identifica el "lugar" desde el que se invoca a Aurora como agente. */
export interface AgentPlace {
  /** Tipo de lugar (es-ES, libre pero consistente): "pagina" · "grupo" ·
   *  "comunidad" · "publicacion" · "comentario" · "mensaje" · "archivo" · … */
  kind: string;
  /** Identificador del lugar (id de la entidad), si existe. */
  id?: string;
  /** Título/nombre legible del lugar, si existe. */
  title?: string;
  /** Ruta del OS donde vive este lugar (por defecto, la actual del navegador). */
  route?: string;
  /** Instrucción inicial opcional (si no se pasa, Aurora solo recibe el contexto
   *  y pregunta en qué ayudar). */
  prompt?: string;
}

function currentRoute(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.location?.pathname || "";
  } catch {
    return "";
  }
}

/**
 * Construye el bloque de contexto (tipo + id + título + área) listo para
 * anteponer al prompt del usuario. Defensivo: nunca lanza.
 */
export function buildPlaceContext(place: AgentPlace): string {
  const route = place.route || currentRoute();
  const area = route ? describeArea(route) : null;
  const parts: string[] = [];
  parts.push(`Lugar actual: ${place.kind}${place.title ? ` «${place.title}»` : ""}${place.id ? ` (id: ${place.id})` : ""}.`);
  if (area) parts.push(area.summary);
  else if (route) parts.push(`Ruta: ${route}.`);
  return parts.join(" ");
}

/**
 * Invoca a Aurora en el contexto de un lugar concreto: abre el chat completo
 * (Exocórtex) con el contexto precargado + la instrucción (si la hay). Devuelve
 * `true` si se pudo entregar. Defensivo: nunca lanza; si Aurora aún no montó,
 * igualmente intenta revelar el panel.
 */
export async function invokeAgentAt(place: AgentPlace): Promise<boolean> {
  const ctx = buildPlaceContext(place);
  const ask = (place.prompt ?? "").trim();
  const framed = ask ? `${ctx}\n\n${ask}` : `${ctx}\n\n¿En qué puedo ayudarte aquí?`;
  return openAurora({ prompt: framed, reveal: true });
}

export interface InvokeAgentButtonProps {
  place: AgentPlace;
  /** Texto del botón. Por defecto "Invocar agente". */
  label?: string;
  /** Versión reducida (icono + texto corto), para barras de acción estrechas. */
  compact?: boolean;
  className?: string;
}

/**
 * Botón "Invocar agente aquí": abre el chat de Aurora con el contexto de este
 * lugar (tipo + id + título) ya precargado. Estética Crystal Liquid Glass,
 * cursor-pointer, transición 200ms. Defensivo y SSR-safe.
 */
export function InvokeAgentButton({ place, label, compact = false, className }: InvokeAgentButtonProps) {
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await invokeAgentAt(place);
    } finally {
      setBusy(false);
    }
  }, [place, busy]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={`Invocar a Aurora aquí (${place.kind}${place.title ? ` · ${place.title}` : ""})`}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur-md transition-colors duration-200 hover:bg-white/10 hover:text-white/95 disabled:cursor-wait disabled:opacity-60",
        compact && "px-2 py-0.5 text-[10px]",
        className,
      )}
    >
      {busy ? (
        <Loader2 className={cn("shrink-0 animate-spin", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
      ) : (
        <Bot className={cn("shrink-0 text-[#7fb8ff]", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
      )}
      {label ?? (compact ? "Agente" : "Invocar agente")}
    </button>
  );
}

export default InvokeAgentButton;
