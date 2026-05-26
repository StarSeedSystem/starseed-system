"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Sun, Zap, Sparkle, Leaf, Square, Diamond, Gem, Feather,
  Wand, Flame, Hexagon, Cloud, Check,
} from "lucide-react";
import { useAppearance } from "@/context/appearance-context";
import { curatedPresets, MOOD_LABELS, type CuratedPresetMood, type CuratedPreset } from "@/lib/themes/curated-presets";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Sun, Zap, Sparkle, Leaf, Square, Diamond, Gem, Feather, Wand, Flame, Hexagon, Cloud,
};

/**
 * Galería de **Estilos** (antes "Temas curados") — 12 estilos coordinados
 * que aplican un AppearanceConfig completo: tipografía, colores, glass,
 * fondo, botones, animaciones. Cada elemento de la red (widgets, perfiles,
 * páginas, mensajes, posts, menús, botones, fondos) se adapta al estilo
 * seleccionado mediante los tokens del AppearanceContext.
 *
 * El layout de las cards respeta los límites de espacio para evitar
 * superposiciones y desbordamientos de texto (texto truncado, badges
 * envueltas, swatches con espaciado mínimo garantizado).
 */
export function CuratedThemesGallery() {
  const { setTheme } = useTheme();
  const { updateConfig, updateSection, config } = useAppearance();
  const [filter, setFilter] = useState<CuratedPresetMood | "all">("all");
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const moods = useMemo<("all" | CuratedPresetMood)[]>(
    () => ["all", "cyberdelico", "solarpunk", "minimal", "brutalist", "futurista", "organico", "luxury"],
    []
  );

  const visible = useMemo(() => {
    if (filter === "all") return curatedPresets;
    return curatedPresets.filter((p) => p.mood === filter);
  }, [filter]);

  function applyPreset(p: CuratedPreset) {
    setTheme(p.baseTheme);
    updateConfig(p.config);
    updateSection("themeStore", { activeTemplateId: p.id });
    setAppliedId(p.id);
    setTimeout(() => setAppliedId(null), 2000);
    toast.success(`Tema aplicado: ${p.name}`);
  }

  return (
    <div className="space-y-4">
      {/* Filtros por mood */}
      <div className="flex flex-wrap gap-1.5">
        {moods.map((m) => {
          const active = filter === m;
          const label = m === "all" ? "Todos" : MOOD_LABELS[m as CuratedPresetMood];
          return (
            <button
              key={m}
              onClick={() => setFilter(m)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all cursor-pointer",
                active
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "bg-foreground/[0.03] text-muted-foreground border-border/40 hover:bg-foreground/[0.06] hover:text-foreground/80"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Grid de presets — layout reorganizado para evitar superposiciones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((p) => {
          const Icon = ICONS[p.iconName] ?? Sparkle;
          const isActive = config.themeStore?.activeTemplateId === p.id;
          const justApplied = appliedId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border text-left transition-all duration-300 cursor-pointer flex flex-col",
                "hover:scale-[1.02] hover:shadow-xl",
                isActive
                  ? "border-emerald-500/50 ring-1 ring-emerald-500/30"
                  : "border-border/50 hover:border-primary/40"
              )}
            >
              {/* Cabecera: SOLO swatches + check */}
              <div
                className="h-20 relative shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${p.swatch[0]} 0%, ${p.swatch[1]} 33%, ${p.swatch[2]} 66%, ${p.swatch[3]} 100%)`,
                }}
              >
                <div className="absolute inset-0 bg-black/10" />
                {/* Indicador "activo" en esquina superior derecha — sin overlap con label */}
                {(isActive || justApplied) && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg ring-2 ring-white/20">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>

              {/* Cuerpo: icono + nombre + mood en línea de cabecera, tagline + swatches en línea de pie */}
              <div className="p-3 bg-foreground/[0.02] flex-1 flex flex-col gap-2 min-w-0">
                {/* Fila: icono, nombre (truncado), badge mood compacto */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 shrink-0 rounded-lg bg-foreground/[0.06] flex items-center justify-center border border-border/40">
                    <Icon className="w-3.5 h-3.5 text-foreground/80" />
                  </div>
                  <p className="text-sm font-semibold text-foreground/90 truncate flex-1">{p.name}</p>
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-foreground/[0.06] text-muted-foreground shrink-0 max-w-[80px] truncate">
                    {MOOD_LABELS[p.mood]}
                  </span>
                </div>
                {/* Tagline en 2 líneas máximo */}
                <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 break-words">
                  {p.tagline}
                </p>
                {/* Swatches al pie — espaciado garantizado */}
                <div className="flex gap-1 mt-auto pt-1">
                  {p.swatch.map((c, i) => (
                    <div
                      key={i}
                      className="w-3.5 h-3.5 rounded-full border border-foreground/15 shadow-sm shrink-0"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-12">
          No hay temas en esta categoría todavía.
        </div>
      )}
    </div>
  );
}
