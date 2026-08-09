"use client";

/**
 * StarSeed OS — Aurora · RouteChip (transparencia del modelo)
 * ============================================================================
 * Chip pequeño que muestra QUÉ inteligencia usó Aurora en la última respuesta
 * (registro del router Astraura): «✦ Fuente · Modelo» + badge gratis/de pago.
 * Al pulsarlo se despliega una tarjeta con el porqué de la elección, la tarea
 * detectada, las alternativas gratuitas listas, las sugerencias de pago (con
 * enlace para obtener clave) y el acceso a Ajustes → Inteligencia.
 *
 * · Escucha ROUTE_EVENT en vivo y lee lastRoute() al montar.
 * · Si aún no hay ninguna ruta registrada, NO renderiza nada.
 * · `compact` → versión mínima para cabeceras estrechas / mini-reproductor.
 * · `inlinePanel` → el detalle se abre EN FLUJO (para contenedores con
 *   overflow:hidden, como la tarjeta del mini-reproductor).
 * · Sin dependencias nuevas: estado local + cierre al pulsar fuera.
 * · Defensivo (nunca lanza) y SSR-safe (todo lo de window va en efectos).
 */

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Settings2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTE_EVENT, lastRoute, type RouteRecord } from "@/ai/astraura/router";
import { llmSourceAccessClass, type ModelAccessClass } from "@/lib/astraura/model-preferences";

/**
 * LEYENDA DE COLOR compartida con el ORBE (Adenda 149 · ola 3 · idea 2.13:178):
 * el orbe se tiñe con estos mismos cardinales Trinity según la clase de acceso
 * de la fuente que respondió. Repetir aquí la leyenda —con etiqueta y tooltip—
 * es lo que hace que el mapa de color se APRENDA sin abrir ningún panel.
 */
const ACCESS_LEGEND: Record<ModelAccessClass, { color: string; label: string; hint: string }> = {
  local: { color: "#39FF14", label: "local", hint: "En tu dispositivo (Horizon · verde): máxima soberanía y privacidad." },
  starseed: { color: "#007FFF", label: "StarSeed", hint: "Servidor StarSeed / OmniVoice automático (Zenith · azul)." },
  "api-free": { color: "#FFBF00", label: "API gratis", hint: "API en la nube gratis y sin coste (Logic · ámbar)." },
  "api-external": { color: "#DC143C", label: "API externa", hint: "API externa con clave o de pago (Anchor · rojo)." },
};

function accessOf(sourceId: string): { color: string; label: string; hint: string } {
  try {
    return ACCESS_LEGEND[llmSourceAccessClass(sourceId)] ?? ACCESS_LEGEND["api-free"];
  } catch {
    return ACCESS_LEGEND["api-free"];
  }
}

export interface RouteChipProps {
  /** Versión reducida (cabeceras estrechas / mini-reproductor). */
  compact?: boolean;
  /** Despliega el detalle en flujo en vez de popover absoluto. */
  inlinePanel?: boolean;
  className?: string;
}

export function RouteChip({ compact = false, inlinePanel = false, className }: RouteChipProps) {
  const [route, setRoute] = useState<RouteRecord | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Última ruta al montar + actualización en vivo con cada respuesta.
  useEffect(() => {
    try { setRoute(lastRoute()); } catch { /* silencioso */ }
    const onRoute = (e: Event) => {
      try {
        const rec = (e as CustomEvent<RouteRecord>).detail;
        setRoute(rec ?? lastRoute());
      } catch { /* silencioso */ }
    };
    try { window.addEventListener(ROUTE_EVENT, onRoute); } catch { /* */ }
    return () => {
      try { window.removeEventListener(ROUTE_EVENT, onRoute); } catch { /* */ }
    };
  }, []);

  // Cierre al pulsar fuera de la tarjeta desplegada.
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent | TouchEvent) => {
      try {
        const el = rootRef.current;
        const t = ev.target;
        if (el && t instanceof Node && !el.contains(t)) setOpen(false);
      } catch { /* silencioso */ }
    };
    try {
      window.addEventListener("mousedown", onDown);
      window.addEventListener("touchstart", onDown);
    } catch { /* */ }
    return () => {
      try {
        window.removeEventListener("mousedown", onDown);
        window.removeEventListener("touchstart", onDown);
      } catch { /* */ }
    };
  }, [open]);

  // Sin ruta registrada todavía → nada que mostrar.
  if (!route) return null;

  const access = accessOf(route.sourceId);
  /** Punto del tono con el que el ORBE se tiñe ahora mismo (misma leyenda). */
  const accessDot = (
    <span
      className={cn("shrink-0 rounded-full", compact ? "h-1.5 w-1.5" : "h-2 w-2")}
      style={{ backgroundColor: access.color, boxShadow: `0 0 6px -1px ${access.color}` }}
      title={`${access.label} — ${access.hint}`}
      aria-hidden="true"
    />
  );

  const badge = (
    <span
      className={cn(
        "shrink-0 rounded-full border px-1.5 py-px font-mono uppercase tracking-wide",
        compact ? "text-[8px]" : "text-[9px]",
        route.free
          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
          : "border-amber-400/30 bg-amber-500/15 text-amber-300",
      )}
    >
      {route.free ? "gratis" : "de pago"}
    </span>
  );

  return (
    <div ref={rootRef} className={cn("relative min-w-0", inlinePanel ? "w-full" : "inline-block", className)}>
      {/* ── Chip ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={`${route.sourceLabel} · ${route.modelLabel} — ${access.hint} Toca para ver el porqué y las alternativas.`}
        className={cn(
          "inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md transition-colors duration-200 hover:bg-white/10",
          compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[11px]",
          route.ok ? "text-white/75 hover:text-white/95" : "text-white/50",
        )}
      >
        <Sparkles className={cn("shrink-0 text-[#7fb8ff]", compact ? "h-2.5 w-2.5" : "h-3 w-3")} />
        {accessDot}
        <span className={cn("truncate", compact ? "max-w-[120px]" : "max-w-[220px]")}>
          {route.sourceLabel} · {route.modelLabel}
        </span>
        <span className="sr-only"> — fuente {access.label}</span>
        {badge}
      </button>

      {/* ── Tarjeta de detalle (popover o en flujo) ── */}
      {open && (
        <div
          className={cn(
            "rounded-xl border border-white/10 bg-[#0b0f16]/95 p-3 text-left shadow-2xl backdrop-blur-xl",
            inlinePanel ? "mt-1.5 w-full" : "absolute right-0 top-full z-[90] mt-1.5 w-64",
          )}
        >
          {/* Cabecera: qué se usó + cerrar */}
          <div className="mb-1.5 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/40">
                Transparencia · {route.taskLabel}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-white/90">
                <span className="min-w-0 truncate">{route.sourceLabel} · {route.modelLabel}</span>
                {badge}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar detalle"
              title="Cerrar"
              className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-full text-white/45 transition-colors duration-200 hover:bg-white/10 hover:text-white/85"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Leyenda de color: el mismo tono con el que se tiñe el orbe */}
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-white/55" title={access.hint}>
            {accessDot}
            <span>
              <span className="text-white/75">{access.label}</span> — el orbe se tiñe con este tono
            </span>
          </div>

          {/* Por qué se eligió */}
          <p className="text-[11px] leading-relaxed text-white/65">{route.reason}</p>
          {!route.ok && (
            <p className="mt-1 text-[10px] text-[#ff9aa5]">
              El último intento con esta fuente falló; Aurora probará otra.
            </p>
          )}

          {/* Alternativas gratuitas listas para usar */}
          {route.alternatives.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.16em] text-emerald-300/70">
                Alternativas gratis
              </div>
              <ul className="space-y-0.5">
                {route.alternatives.map((a, i) => (
                  <li key={`${a.sourceId}-${i}`} className="truncate text-[11px] text-white/70">
                    <span className="text-white/85">{a.label}</span>
                    <span className="text-white/45"> · {a.model}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sugerencias de pago (informativas, con enlace a la clave) */}
          {route.paidSuggestions.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.16em] text-amber-300/70">
                Si quieres más potencia (de pago)
              </div>
              <ul className="space-y-0.5">
                {route.paidSuggestions.map((p, i) => (
                  <li key={`${p.label}-${i}`} className="flex items-center gap-1.5 text-[11px] text-white/70">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-white/85">{p.label}</span>
                      <span className="text-white/45"> · {p.model}</span>
                    </span>
                    {p.getKeyUrl && (
                      <a
                        href={p.getKeyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px] text-amber-300/80 transition-colors duration-200 hover:text-amber-200"
                        title={`Obtener clave de ${p.label}`}
                      >
                        clave <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Acceso directo a los ajustes de inteligencia */}
          <a
            href="/settings"
            className="mt-2.5 flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-[#7fb8ff] transition-colors duration-200 hover:bg-white/10 hover:text-white"
            title="Elegir manualmente la fuente y el modelo"
          >
            <Settings2 className="h-3.5 w-3.5 shrink-0" />
            Cambiar en Ajustes → Inteligencia
          </a>
        </div>
      )}
    </div>
  );
}

export default RouteChip;
