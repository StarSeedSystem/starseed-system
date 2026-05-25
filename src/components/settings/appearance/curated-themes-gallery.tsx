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
 * Galería ampliada de 12+ temas curados, con filtros por mood y aplicación con
 * un clic. Se complementa con la Galería existente; los presets aquí inyectan
 * un AppearanceConfig completo coordinado.
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

      {/* Grid de presets */}
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
                "group relative overflow-hidden rounded-2xl border text-left transition-all duration-300 cursor-pointer",
                "hover:scale-[1.02] hover:shadow-xl",
                isActive
                  ? "border-emerald-500/50 ring-1 ring-emerald-500/30"
                  : "border-border/50 hover:border-primary/40"
              )}
            >
              {/* Cabecera con gradiente de swatches */}
              <div
                className="h-24 relative"
                style={{
                  background: `linear-gradient(135deg, ${p.swatch[0]} 0%, ${p.swatch[1]} 33%, ${p.swatch[2]} 66%, ${p.swatch[3]} 100%)`,
                }}
              >
                <div className="absolute inset-0 bg-black/10" />
                <div className="absolute top-3 left-3 w-9 h-9 rounded-xl bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10">
                  <Icon className="w-4 h-4 text-white" />
                </div>
                {/* Swatches */}
                <div className="absolute bottom-2 left-2 flex gap-1">
                  {p.swatch.map((c, i) => (
                    <div key={i} className="w-3 h-3 rounded-full border border-white/30 shadow-sm" style={{ backgroundColor: c }} />
                  ))}
                </div>
                {/* Activo */}
                {(isActive || justApplied) && (
                  <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/40 text-[9px] text-white/80 uppercase tracking-wider">
                  {MOOD_LABELS[p.mood]}
                </div>
              </div>

              {/* Info */}
              <div className="p-3 bg-foreground/[0.02]">
                <p className="text-sm font-semibold text-foreground/90 truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{p.tagline}</p>
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
