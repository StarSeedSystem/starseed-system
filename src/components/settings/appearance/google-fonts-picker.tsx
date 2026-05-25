"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Type, Search, Check, ExternalLink, Plus, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useAppearance } from "@/context/appearance-context";
import {
  GOOGLE_FONTS,
  fontCssUrl,
  fontCssFamily,
  FONT_CATEGORY_LABELS,
  type FontCategory,
  type GoogleFont,
} from "@/lib/themes/google-fonts";
import { cn } from "@/lib/utils";

/**
 * Picker de Google Fonts: catálogo curado, previsualización en vivo, instala
 * la fuente como customFont y la fija como tipografía activa con un clic.
 *
 * Las fuentes se cargan dinámicamente inyectando <link> en <head>. La preview
 * se ve con la fuente real en el panel.
 */
export function GoogleFontsPicker() {
  const { config, updateSection, addCustomFont } = useAppearance();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<FontCategory | "all">("all");
  const [previewText, setPreviewText] = useState("StarSeed — Soberanía consciente");
  const [loaded, setLoaded] = useState<Set<string>>(new Set());

  const currentFont = config.typography?.fontFamily ?? "Inter";
  const fontScale = config.typography?.scale ?? 1;

  // Cargar dinámicamente las fuentes visibles para que la preview sea real.
  const filtered = useMemo(() => {
    let list = GOOGLE_FONTS;
    if (category !== "all") list = list.filter((f) => f.category === category);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) => f.family.toLowerCase().includes(q) || f.tags.some((t) => t.includes(q))
      );
    }
    return list;
  }, [search, category]);

  // Inyecta <link> para cada fuente visible que aún no se haya cargado.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const newlyLoaded: string[] = [];
    filtered.forEach((font) => {
      if (loaded.has(font.family)) return;
      const linkId = `gfont-preview-${font.family.replace(/\s+/g, "-")}`;
      if (document.getElementById(linkId)) {
        newlyLoaded.push(font.family);
        return;
      }
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = fontCssUrl(font.family, font.weights);
      document.head.appendChild(link);
      newlyLoaded.push(font.family);
    });
    if (newlyLoaded.length) {
      setLoaded((prev) => new Set([...prev, ...newlyLoaded]));
    }
  }, [filtered, loaded]);

  function installAndActivate(font: GoogleFont) {
    // Registra como customFont (estructura ya esperada por AppearanceContext)
    addCustomFont({
      name: font.family,
      url: fontCssUrl(font.family, font.weights),
      family: fontCssFamily(font.family),
    });
    // Activa como tipografía
    updateSection("typography", { fontFamily: font.family });
    toast.success(`Tipografía activa: ${font.family}`);
  }

  const categories: ("all" | FontCategory)[] = [
    "all",
    "sans",
    "serif",
    "display",
    "mono",
    "handwriting",
  ];

  return (
    <div className="space-y-4">
      {/* Hero / preview activo */}
      <Card className="bg-gradient-to-br from-primary/10 via-background/40 to-accent/10 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Type className="w-4 h-4 text-primary" /> Tipografía activa
          </CardTitle>
          <CardDescription>
            <span className="font-semibold">{currentFont}</span> · escala {fontScale.toFixed(2)}× ·{" "}
            <a
              href={`https://fonts.google.com/specimen/${encodeURIComponent(currentFont)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Ver en Google Fonts <ExternalLink className="w-3 h-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            placeholder="Texto para previsualizar..."
            className="bg-background/60 border-white/10"
          />
          <div
            className="rounded-xl border border-white/5 bg-black/20 p-5 leading-snug"
            style={{ fontFamily: fontCssFamily(currentFont), fontSize: `${fontScale * 1.75}rem` }}
          >
            {previewText || "Hola, soy una fuente."}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">
              Escala global de fuentes
            </label>
            <Slider
              value={[fontScale]}
              min={0.8}
              max={1.3}
              step={0.05}
              onValueChange={(v) => updateSection("typography", { scale: v[0] })}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0.8×</span><span>1.0×</span><span>1.3×</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar fuente o estilo (geometric, mono, retro...)"
            className="pl-9 bg-background/60 border-white/10"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const active = category === c;
            const label = c === "all" ? "Todas" : FONT_CATEGORY_LABELS[c as FontCategory];
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all cursor-pointer",
                  active
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "bg-foreground/[0.03] text-muted-foreground border-border/40 hover:bg-foreground/[0.06]"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[560px] overflow-y-auto pr-1">
        {filtered.map((font) => {
          const isActive = currentFont === font.family;
          return (
            <button
              key={font.family}
              onClick={() => installAndActivate(font)}
              className={cn(
                "rounded-xl border text-left p-4 transition-all hover:scale-[1.02] cursor-pointer",
                isActive
                  ? "bg-primary/10 border-primary/40"
                  : "bg-foreground/[0.02] border-border/50 hover:border-primary/30"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{font.family}</p>
                  <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                    {FONT_CATEGORY_LABELS[font.category]}
                  </Badge>
                </div>
                {isActive ? (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                ) : (
                  <Plus className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                )}
              </div>
              <div
                className="text-[22px] leading-tight text-foreground/90"
                style={{ fontFamily: fontCssFamily(font.family) }}
              >
                {previewText.slice(0, 40) || "Aa Bb Cc 123"}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {font.tags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-foreground/[0.04] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-8">
          Sin coincidencias. Prueba con otra búsqueda.
        </div>
      )}

      {/* Footer info */}
      <Card className="bg-background/20 border-white/5">
        <CardContent className="pt-4 text-[11px] text-muted-foreground flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <span>
            Las fuentes se cargan dinámicamente desde Google Fonts. Para usar fuentes
            propias (TTF/OTF/WOFF), súbelas a un host accesible y añádelas como CustomFont
            desde el editor avanzado de tipografía.
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
