"use client";

/**
 * EgoContextOption — opción ADITIVA "Agente Aurora (ego.md) para este contexto".
 *
 * Componente reutilizable para enganchar en los flujos de creación de entidades
 * (composer de publicaciones, lienzo/pizarra, hub, la red…). Muestra un toggle:
 * si se activa, al crear la entidad se crea/adjunta un ego.md personalizado para
 * ese contexto (con su configuración + integración Aurora↔Astraura).
 *
 * Dos modos de uso:
 *  1) CONTROLADO: pasa `value`/`onChange` y `name`/`onName`, y crea el ego tú
 *     mismo tras crear la entidad con `createEgoForContext(...)` (helper exportado).
 *  2) AUTÓNOMO: pasa `attachment` (kind+ref+label) y un botón "Crear ahora" que
 *     crea el ego inmediatamente para ese contexto ya existente.
 *
 * SSR-safe, defensivo, en español, estética Aurora (fucsia/cian).
 */

import { useState } from "react";
import { Sparkles, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  createEgoForContext,
  EGO_CONTEXT_KINDS,
  type EgoContextKind,
  type EgoAttachment,
} from "@/lib/aurora/ego";

export interface EgoContextOptionProps {
  /** Etiqueta del contexto, p.ej. "esta publicación", "este grupo". */
  contextLabel?: string;
  /** Tipo de contexto (para el adjunto). */
  kind?: EgoContextKind;
  /** id/slug del contexto si ya existe (modo autónomo). */
  refId?: string;
  /** Nombre legible del contexto para el adjunto. */
  refLabel?: string;
  // ── Modo controlado (el padre decide cuándo crear) ──
  value?: boolean;
  onChange?: (enabled: boolean) => void;
  egoName?: string;
  onEgoName?: (name: string) => void;
  /** Si true, muestra un botón "Crear ahora" (modo autónomo). */
  allowImmediate?: boolean;
  className?: string;
}

export default function EgoContextOption({
  contextLabel = "este contexto",
  kind = "publicacion",
  refId,
  refLabel,
  value,
  onChange,
  egoName,
  onEgoName,
  allowImmediate = false,
  className,
}: EgoContextOptionProps) {
  const controlled = typeof value === "boolean" && typeof onChange === "function";
  const [localOn, setLocalOn] = useState(false);
  const enabled = controlled ? (value as boolean) : localOn;
  const setEnabled = (v: boolean) => (controlled ? onChange!(v) : setLocalOn(v));

  const [localName, setLocalName] = useState("");
  const name = typeof egoName === "string" ? egoName : localName;
  const setName = (v: string) => (typeof onEgoName === "function" ? onEgoName(v) : setLocalName(v));

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const def = EGO_CONTEXT_KINDS.find((k) => k.id === kind);

  async function onCreateNow() {
    setCreating(true);
    const attachment: EgoAttachment = {
      kind,
      ref: refId,
      label: refLabel || def?.label,
    };
    const ego = await createEgoForContext({
      name: name.trim() || `Agente · ${refLabel || def?.label || "Aurora"}`,
      summary: `Agente Aurora (ego.md) para ${contextLabel}. Integración Aurora ↔ Astraura.`,
      attachment,
    });
    setCreating(false);
    if (ego) {
      setCreated(true);
      toast.success(`Agente Aurora creado para ${contextLabel}.`);
    } else {
      toast.error("No se pudo crear el agente Aurora. ¿Has iniciado sesión?");
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-fuchsia-400/25 bg-gradient-to-r from-fuchsia-950/20 to-cyan-950/10 p-3 space-y-2",
        className,
      )}
    >
      <label className="flex items-start gap-2.5 cursor-pointer">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={cn(
            "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition",
            enabled ? "bg-fuchsia-600" : "bg-white/15",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition",
              enabled ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </button>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-fuchsia-50">
            <Sparkles className="w-3.5 h-3.5 text-fuchsia-300" />
            Agente Aurora (ego.md) para {contextLabel}
          </span>
          <span className="block text-[11px] text-white/50 mt-0.5">
            Crea un ego.md personalizado (personalidad, voz, sentidos, emociones, carácter…) que actúa como agente
            integral en {contextLabel}, con su configuración + integración Aurora ↔ Astraura.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="pl-11 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Nombre del agente (por defecto: Agente · ${refLabel || def?.label || "Aurora"})`}
            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
          />
          {allowImmediate && (
            <button
              type="button"
              onClick={onCreateNow}
              disabled={creating || created}
              className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/15 px-3 py-1.5 text-xs text-fuchsia-100 hover:bg-fuchsia-500/25 disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : created ? (
                <Check className="w-3.5 h-3.5 text-emerald-300" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {created ? "Agente creado" : "Crear agente ahora"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
