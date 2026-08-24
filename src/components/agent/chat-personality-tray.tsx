"use client";

/**
 * ChatPersonalityTray — bandeja de PERSONALIDADES ACTIVAS del proveedor
 * Astraura 1.58-bit (Tarea 3 de la adenda de voz-en-vivo/regenerar/bifurcar).
 * ============================================================================
 * El original permitía "elegir cuáles personalidades estarán activas" en el
 * diálogo. Esta bandeja, colocada sobre el cuadro de escritura del chat,
 * reconstruye eso: chips para activar/desactivar personalidades del catálogo
 * 1.58 (`ASTRAURA_158_PERSONAS` — Hermione, Hephaestus, Atenea…) y un selector
 * para los tres modos REALES del backend (`Astraura158MultiMode`).
 *
 * CÓMO LLEGA la selección al proveedor (sin tocar `astraura-158.ts`): ese
 * proveedor ya sabe leer `@menciones` y la palabra "coral" del ÚLTIMO mensaje
 * del usuario y traducirlas a `preferences.selected_personalities` /
 * `multi_personality_mode` (`detectMentions158`/`applyMentions158`). Es el
 * ÚNICO canal que de verdad llega hasta esos campos de la petición sin editar
 * el proveedor, así que `astraura158MentionHint()` reconstruye exactamente lo
 * que un usuario escribiría a mano ("@hermione @hephaestus coral") a partir de
 * la selección de esta bandeja. `chat-surface.tsx` la usa para anotar (solo en
 * la petición al modelo, nunca en lo que se guarda o se muestra) el último
 * turno de usuario — y SOLO cuando el proveedor activo es 1.58.
 *
 * PERSISTENCIA: por conversación, no global — mismo mecanismo que el resto de
 * ajustes por chat (`getChatConfig`/`patchChatConfig`, meta.config del chat).
 * Antes de que el usuario toque la bandeja NO hay nada "elegido": el chat
 * sigue el mecanismo de siempre (personalidad activa del OS → 1.58 vía
 * `persona158For`), así que esta bandeja no interfiere con nadie que no la
 * abra. `readAstraura158Selection` devuelve `null` en ese caso — chat-surface
 * lo respeta y NO inyecta nada.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getChatConfig } from "@/lib/aurora/turn";
import { patchChatConfig } from "@/lib/aurora/config-change";
import { AI_CONV_CHANGE_EVENT } from "@/lib/aurora/conversations";
import type { ChatConfig } from "@/components/aurora/chat-config-menu";
import { ASTRAURA_158_PERSONAS, type Astraura158MultiMode } from "@/ai/providers/astraura-158";

/** Selección EFECTIVA (persistida o por defecto) de personalidades + modo. */
export interface Astraura158Selection {
  personas: string[];
  mode: Astraura158MultiMode;
}

/**
 * Campos que esta bandeja añade a `meta.config` del chat. NO existen en
 * `ChatConfig` (chat-config-menu.tsx, fuera del alcance de esta adenda) — se
 * leen/escriben como una extensión ESTRUCTURAL del mismo JSON libre, igual
 * que ya hacen otros ajustes por chat (voice/log/senses…): el backend los
 * persiste sin más porque `meta` es JSON; sólo hace falta esta intersección
 * para que TypeScript tipe el acceso sin recurrir a `any`.
 */
export interface Astraura158ChatConfigExtra {
  astr158Personas?: string[];
  astr158Mode?: Astraura158MultiMode;
}

const VALID_IDS = new Set(ASTRAURA_158_PERSONAS.map((p) => p.id));

const MODE_OPTIONS: { id: Astraura158MultiMode; label: string }[] = [
  { id: "single", label: "Individual" },
  { id: "multi_dialogue", label: "Diálogo grupal" },
  { id: "coral_synthesis", label: "Síntesis coral" },
];

/**
 * Selección EXPLÍCITA guardada para el chat, o `null` si el usuario aún no ha
 * tocado la bandeja (nada que transportar: el turno sigue el mecanismo de
 * siempre). Filtra ids que ya no existan en el catálogo (defensivo).
 */
export function readAstraura158Selection(convId: string | null | undefined): Astraura158Selection | null {
  const cfg = getChatConfig(convId) as ChatConfig & Astraura158ChatConfigExtra;
  const personas = (cfg.astr158Personas ?? []).filter((id) => VALID_IDS.has(id));
  if (!personas.length) return null;
  return { personas, mode: cfg.astr158Mode ?? "single" };
}

/**
 * Traduce la selección al MISMO lenguaje que ya entiende el proveedor 1.58:
 * menciones `@id` (+ la palabra "coral" en síntesis coral). En modo
 * "individual" se menciona SOLO la primera — mencionar ≥2 reclasificaría el
 * turno como diálogo grupal aunque el modo elegido fuera otro
 * (`detectMentions158`: ≥2 menciones ⇒ `multi_dialogue`). En diálogo/coral se
 * mencionan TODAS las activas.
 */
export function astraura158MentionHint(sel: Astraura158Selection | null): string {
  if (!sel || !sel.personas.length) return "";
  const ids = sel.mode === "single" ? sel.personas.slice(0, 1) : sel.personas;
  if (!ids.length) return "";
  const coral = sel.mode === "coral_synthesis" ? " coral" : "";
  return `${ids.map((id) => `@${id}`).join(" ")}${coral}`;
}

export interface ChatPersonalityTrayProps {
  /** Chat activo (persistencia por conversación). */
  convId: string | null;
  /** Id del proveedor activo — sólo informativo (nota de "se aplicará cuando…"). */
  activeProviderId?: string | null;
  /**
   * Personalidad 1.58 que se usaría hoy SIN tocar esta bandeja (deriva de la
   * personalidad activa del OS vía `persona158For`). Es lo que se muestra
   * activo mientras el usuario no haya elegido nada explícito, para que el
   * primer toque parta de lo que ya está pasando — no de cero ni de todo.
   */
  defaultPersonaId?: string;
  className?: string;
}

export function ChatPersonalityTray({
  convId,
  activeProviderId,
  defaultPersonaId = "astraura_prime",
  className,
}: ChatPersonalityTrayProps) {
  const [open, setOpen] = useState(false);
  const [personas, setPersonas] = useState<string[]>([]);
  const [mode, setMode] = useState<Astraura158MultiMode>("single");

  // Refleja la selección guardada (menú, otro dispositivo, config-change).
  const read = useCallback(() => {
    const sel = readAstraura158Selection(convId);
    setPersonas(sel?.personas ?? []);
    setMode(sel?.mode ?? "single");
  }, [convId]);

  useEffect(() => {
    read();
    if (typeof window === "undefined") return;
    window.addEventListener(AI_CONV_CHANGE_EVENT, read);
    return () => window.removeEventListener(AI_CONV_CHANGE_EVENT, read);
  }, [read]);

  // Lo REALMENTE activo ahora mismo: lo explícito, o si aún no hay nada
  // explícito, la personalidad que ya se usaría de todos modos.
  const effective = personas.length ? personas : [defaultPersonaId];

  const persist = useCallback(
    (nextPersonas: string[], nextMode: Astraura158MultiMode) => {
      setPersonas(nextPersonas); // optimista
      setMode(nextMode);
      const patch: Partial<ChatConfig> & Astraura158ChatConfigExtra = {
        astr158Personas: nextPersonas,
        astr158Mode: nextMode,
      };
      void patchChatConfig(convId, patch);
    },
    [convId],
  );

  const toggle = useCallback(
    (id: string) => {
      const has = effective.includes(id);
      const next = has ? effective.filter((x) => x !== id) : [...effective, id];
      // Nunca puede quedar vacía: si el resultado se queda en 0, se conserva
      // (re-activa) la última — el toggle simplemente no hace nada.
      if (!next.length) {
        toast.info("Debe quedar al menos una personalidad activa.");
        return;
      }
      persist(next, mode);
    },
    [effective, mode, persist],
  );

  const changeMode = useCallback(
    (next: Astraura158MultiMode) => {
      persist(effective, next);
    },
    [effective, persist],
  );

  return (
    <div className={cn("rounded-lg border border-white/10 bg-white/[0.02]", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Ocultar personalidades activas" : "Mostrar personalidades activas"}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/60">
          <Users className="h-3.5 w-3.5 text-fuchsia-300/80" />
          Personalidades activas
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-normal text-white/50">
            {effective.length}
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-white/40" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-white/10 px-2.5 py-2">
          {activeProviderId && activeProviderId !== "astraura-158" && (
            <p className="text-[10px] leading-relaxed text-amber-200/70">
              Se aplica cuando el proveedor activo es Astraura 1.58-bit (ahora: {activeProviderId}).
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {ASTRAURA_158_PERSONAS.map((p) => {
              const active = effective.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  aria-pressed={active}
                  aria-label={`${active ? "Desactivar" : "Activar"} personalidad ${p.label}`}
                  title={p.organ}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    active
                      ? "border-white/25 bg-white/10 text-white"
                      : "border-white/10 bg-transparent text-white/40 hover:border-white/20 hover:text-white/70",
                  )}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => changeMode(m.id)}
                aria-pressed={mode === m.id}
                aria-label={`Modo ${m.label}`}
                title={m.label}
                className={cn(
                  "cursor-pointer rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors",
                  mode === m.id
                    ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                    : "border-white/10 bg-transparent text-white/40 hover:border-white/20 hover:text-white/70",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatPersonalityTray;
