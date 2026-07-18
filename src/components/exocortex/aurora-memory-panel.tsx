"use client";

/**
 * StarSeed OS — Exocórtex × Aurora
 * ----------------------------------------------------------------------------
 * Entrada "Preguntar a Aurora" DENTRO del Exocórtex. NO instancia una segunda
 * Aurora: abre la Aurora GLOBAL (montada en el layout) a través del puente
 * `openAurora()` / `askAuroraAboutMemory()` y le pasa el contexto de memoria /
 * bóveda para que pueda ACTUAR sobre tus memorias (buscarlas, leerlas, etc.).
 *
 * Es 100% aditivo y defensivo: si Aurora aún no montó, avisa con elegancia y no
 * rompe nada. Pensado para reutilizarse en cualquier superficie del Exocórtex
 * (ExocortexBrain, MemoryHub, paneles de bóveda…).
 */

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Send, Loader2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  askAuroraAboutMemory,
  isAuroraReady,
  openAurora,
} from "@/lib/aurora/open-aurora";

export interface AuroraMemoryPanelProps {
  /**
   * Contexto de memoria/bóveda que se antepone al prompt para que Aurora pueda
   * razonar/actuar sobre ello. Puede ser un resumen del grafo, una memoria
   * concreta, etc. Se trunca de forma segura en el puente.
   */
  memoryContext?: string;
  /** Texto de ayuda bajo el título. */
  hint?: string;
  /** Sugerencias rápidas (chips) que rellenan el prompt al pulsarlas. */
  suggestions?: string[];
  /** Compacto: oculta el textarea y deja solo un botón "Preguntar a Aurora". */
  compact?: boolean;
  /** Clase extra para el contenedor. */
  className?: string;
}

const DEFAULT_SUGGESTIONS = [
  "Resume mis memorias más relevantes",
  "¿Qué sabes de mí en el Exocórtex?",
  "Busca en mis memorias y actúa",
];

export function AuroraMemoryPanel({
  memoryContext,
  hint = "Abre a Aurora con el contexto de tu Exocórtex para que actúe sobre tus memorias.",
  suggestions = DEFAULT_SUGGESTIONS,
  compact = false,
  className,
}: AuroraMemoryPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Sondea si la Aurora global está disponible (puente montado).
  useEffect(() => {
    let alive = true;
    const check = () => { if (alive) setReady(isAuroraReady()); };
    check();
    const t = window.setInterval(check, 1500);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const handleAsk = useCallback(
    async (text?: string) => {
      const q = (text ?? prompt).trim();
      setSending(true);
      setNote(null);
      try {
        const ok = q
          ? await askAuroraAboutMemory(q, memoryContext)
          : await openAurora({ reveal: true });
        if (ok) {
          setNote("Aurora está procesando con el contexto de tu Exocórtex.");
          if (text === undefined) setPrompt("");
        } else {
          setNote(
            "Aurora aún no está disponible. Actívala desde su botón flotante e inténtalo de nuevo.",
          );
        }
      } catch {
        setNote("No se pudo contactar con Aurora. Inténtalo de nuevo.");
      } finally {
        setSending(false);
      }
    },
    [prompt, memoryContext],
  );

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void handleAsk()}
        disabled={sending}
        title="Abrir Astraura IA con el contexto de tus memorias"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-400/30",
          "bg-gradient-to-r from-fuchsia-500/15 to-cyan-500/15 px-3 py-1.5 text-xs",
          "text-fuchsia-100 hover:from-fuchsia-500/25 hover:to-cyan-500/25 transition cursor-pointer",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          className,
        )}
      >
        {sending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        Preguntar a Aurora
      </button>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-fuchsia-600 to-cyan-500 shadow-md">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">Preguntar a Aurora</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
        </div>
        <span
          className={cn(
            "ml-auto mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide shrink-0",
            ready
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-white/5 text-white/40 border border-white/10",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              ready ? "bg-emerald-400 animate-pulse" : "bg-white/30",
            )}
          />
          {ready ? "Conectada" : "En espera"}
        </span>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPrompt(s)}
              className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-white/60 hover:bg-white/10 hover:text-white/90 transition cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <textarea
        placeholder="Pídele algo a Aurora con tus memorias: «resume lo que sabes de X», «crea una memoria con…», «busca y abre…»"
        className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-fuchsia-400/40 min-h-[72px]"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void handleAsk();
          }
        }}
        disabled={sending}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleAsk()}
          disabled={sending}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition cursor-pointer",
            "bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-white hover:brightness-110",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          {sending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando a Aurora…
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" /> Preguntar a Aurora
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => void openAurora({ reveal: true })}
          title="Solo abrir el panel de Aurora"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition cursor-pointer"
        >
          <Wand2 className="h-3.5 w-3.5" /> Abrir
        </button>
      </div>

      {note && (
        <p className="text-[10px] leading-relaxed text-cyan-300/70">{note}</p>
      )}
      <p className="text-[9px] text-muted-foreground/40">
        Ctrl/⌘ + Enter para enviar · usa la Aurora global del sistema
      </p>
    </div>
  );
}

export default AuroraMemoryPanel;
