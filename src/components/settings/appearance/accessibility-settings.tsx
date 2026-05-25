"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Accessibility, Contrast, Eye, EyeOff, Type, Hand, Volume2,
  ZoomIn, Activity, ShieldCheck, RotateCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";

/**
 * Panel dedicado a accesibilidad. Mantiene el principio constitucional de
 * inclusión: la libertad estética no puede ir en contra de la libertad de
 * uso. Persiste en localStorage independiente para que sobreviva a cambios
 * de tema, y aplica clases CSS a <html> para que cualquier componente pueda
 * reaccionar.
 */

const STORAGE_KEY = "starseed.a11y.settings";

interface A11ySettings {
  highContrast: boolean;
  reduceMotion: "auto" | "always" | "never";
  largeText: number; // multiplicador 0.9..1.5
  cursorSize: "default" | "large" | "huge";
  colorBlindMode: "none" | "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia";
  focusRingIntensity: number; // 0..3
  targetSize: "comfortable" | "large" | "huge"; // WCAG 2.5.5
  underlineLinks: boolean;
  pauseAnimations: boolean;
}

const DEFAULT: A11ySettings = {
  highContrast: false,
  reduceMotion: "auto",
  largeText: 1,
  cursorSize: "default",
  colorBlindMode: "none",
  focusRingIntensity: 1,
  targetSize: "comfortable",
  underlineLinks: false,
  pauseAnimations: false,
};

function load(): A11ySettings {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

function save(s: A11ySettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function applyToDocument(s: A11ySettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // High contrast
  root.classList.toggle("a11y-high-contrast", s.highContrast);

  // Reduce motion
  const prefersReduced =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const reduceNow =
    s.reduceMotion === "always" || (s.reduceMotion === "auto" && prefersReduced);
  root.classList.toggle("a11y-reduce-motion", reduceNow);

  // Pause all animations entirely
  root.classList.toggle("a11y-pause-animations", s.pauseAnimations);

  // Large text scale
  root.style.setProperty("--a11y-text-scale", String(s.largeText));

  // Cursor size (svg-based or class-based)
  root.classList.remove("a11y-cursor-large", "a11y-cursor-huge");
  if (s.cursorSize === "large") root.classList.add("a11y-cursor-large");
  if (s.cursorSize === "huge") root.classList.add("a11y-cursor-huge");

  // Color-blind filter (SVG filter applied to body)
  root.classList.remove(
    "a11y-cb-protanopia",
    "a11y-cb-deuteranopia",
    "a11y-cb-tritanopia",
    "a11y-cb-achromatopsia"
  );
  if (s.colorBlindMode !== "none") root.classList.add(`a11y-cb-${s.colorBlindMode}`);

  // Focus ring
  root.style.setProperty("--a11y-focus-ring", String(s.focusRingIntensity));

  // Touch target size
  root.classList.remove("a11y-target-large", "a11y-target-huge");
  if (s.targetSize === "large") root.classList.add("a11y-target-large");
  if (s.targetSize === "huge") root.classList.add("a11y-target-huge");

  // Underline links
  root.classList.toggle("a11y-underline-links", s.underlineLinks);
}

export function AccessibilitySettings() {
  const [settings, setSettings] = useState<A11ySettings>(DEFAULT);
  const { config, updateSection } = useAppearance();

  useEffect(() => {
    const loaded = load();
    setSettings(loaded);
    applyToDocument(loaded);
    injectGlobalA11yStyles();
  }, []);

  function update<K extends keyof A11ySettings>(key: K, value: A11ySettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    save(next);
    applyToDocument(next);
  }

  function resetAll() {
    setSettings(DEFAULT);
    save(DEFAULT);
    applyToDocument(DEFAULT);
    toast.success("Ajustes de accesibilidad reseteados");
  }

  // Cuenta cuántos overrides están activos vs default
  const activeOverrides = Object.entries(settings).filter(
    ([k, v]) => v !== (DEFAULT as Record<string, unknown>)[k]
  ).length;

  return (
    <div className="space-y-5">
      <Card className="bg-gradient-to-br from-emerald-500/10 via-background/40 to-primary/10 border-emerald-500/20">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Accessibility className="h-5 w-5 text-emerald-400" />
              Accesibilidad universal
            </CardTitle>
            <CardDescription className="leading-relaxed">
              La estética y la libertad de uso son inseparables. Ajusta el sistema
              a tu cuerpo, tu visión y tu ritmo. Todo guardado solo en tu equipo.
            </CardDescription>
          </div>
          {activeOverrides > 0 && (
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
              {activeOverrides} ajuste{activeOverrides > 1 ? "s" : ""} activo
              {activeOverrides > 1 ? "s" : ""}
            </Badge>
          )}
        </CardHeader>
      </Card>

      {/* Visual */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-background/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Contrast className="h-4 w-4 text-amber-400" /> Alto contraste
              </span>
              <Switch
                checked={settings.highContrast}
                onCheckedChange={(v) => update("highContrast", v)}
              />
            </CardTitle>
            <CardDescription className="text-xs">
              Aumenta el contraste de texto y bordes (WCAG AAA).
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-background/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-400" /> Reducir movimiento
              </span>
            </CardTitle>
            <CardDescription className="text-xs space-y-2">
              <span>Minimiza animaciones, parallax y transiciones.</span>
              <Select
                value={settings.reduceMotion}
                onValueChange={(v) => update("reduceMotion", v as A11ySettings["reduceMotion"])}
              >
                <SelectTrigger className="w-full mt-2 bg-background/60 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (sistema)</SelectItem>
                  <SelectItem value="always">Siempre reducir</SelectItem>
                  <SelectItem value="never">Nunca reducir</SelectItem>
                </SelectContent>
              </Select>
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-background/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <ZoomIn className="h-4 w-4 text-cyan-400" /> Tamaño de texto
              </span>
              <span className="text-xs text-muted-foreground">{settings.largeText.toFixed(2)}×</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Escala adicional independiente del zoom del navegador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Slider
              value={[settings.largeText]}
              min={0.9}
              max={1.5}
              step={0.05}
              onValueChange={(v) => update("largeText", v[0])}
            />
          </CardContent>
        </Card>

        <Card className="bg-background/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Hand className="h-4 w-4 text-blue-400" /> Tamaño táctil mínimo
              </span>
            </CardTitle>
            <CardDescription className="text-xs space-y-2">
              <span>Tamaño mínimo de botones e iconos clicables.</span>
              <Select
                value={settings.targetSize}
                onValueChange={(v) => update("targetSize", v as A11ySettings["targetSize"])}
              >
                <SelectTrigger className="w-full mt-2 bg-background/60 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comfortable">Estándar (24×24)</SelectItem>
                  <SelectItem value="large">Grande (44×44)</SelectItem>
                  <SelectItem value="huge">Enorme (60×60)</SelectItem>
                </SelectContent>
              </Select>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Daltonismo */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Eye className="h-4 w-4 text-pink-400" /> Simulación / corrección visual
          </CardTitle>
          <CardDescription className="text-xs">
            Aplica un filtro de adaptación cromática para distintos tipos de
            visión. Ayuda tanto a usuarios con daltonismo como a diseñadores
            que quieran probar su interfaz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(["none", "protanopia", "deuteranopia", "tritanopia", "achromatopsia"] as const).map((mode) => {
              const isActive = settings.colorBlindMode === mode;
              const labels: Record<typeof mode, string> = {
                none: "Sin filtro",
                protanopia: "Protanopia",
                deuteranopia: "Deuteranopia",
                tritanopia: "Tritanopia",
                achromatopsia: "Acromatopsia",
              };
              return (
                <button
                  key={mode}
                  onClick={() => update("colorBlindMode", mode)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition cursor-pointer",
                    isActive
                      ? "bg-primary/10 border-primary/40"
                      : "bg-foreground/[0.02] border-border/50 hover:border-primary/30"
                  )}
                >
                  <p className="text-[11px] font-medium">{labels[mode]}</p>
                  <div className="flex gap-0.5 mt-2">
                    {["#ef4444", "#f59e0b", "#22c55e", "#06b6d4", "#a855f7"].map((c) => (
                      <div key={c} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Otros toggles */}
      <div className="grid md:grid-cols-3 gap-3">
        <Card className="bg-background/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <EyeOff className="h-4 w-4 text-rose-400" /> Pausar animaciones
              </span>
              <Switch
                checked={settings.pauseAnimations}
                onCheckedChange={(v) => update("pauseAnimations", v)}
              />
            </CardTitle>
            <CardDescription className="text-xs">
              Detiene cualquier movimiento (incl. fondos WebGL).
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-background/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Type className="h-4 w-4 text-blue-400" /> Subrayar enlaces
              </span>
              <Switch
                checked={settings.underlineLinks}
                onCheckedChange={(v) => update("underlineLinks", v)}
              />
            </CardTitle>
            <CardDescription className="text-xs">
              Subraya todos los enlaces para identificarlos fácil.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-background/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> Anillo de foco
              </span>
              <span className="text-xs text-muted-foreground">
                {settings.focusRingIntensity}
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              Intensidad del indicador de teclado (0–3).
              <Slider
                value={[settings.focusRingIntensity]}
                min={0}
                max={3}
                step={1}
                onValueChange={(v) => update("focusRingIntensity", v[0])}
                className="mt-3"
              />
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <p className="text-[11px] text-muted-foreground">
          Tu sistema operativo respeta <code className="px-1 rounded bg-foreground/[0.05]">prefers-reduced-motion</code>{" "}
          y <code className="px-1 rounded bg-foreground/[0.05]">prefers-contrast</code> por defecto.
        </p>
        <Button variant="outline" onClick={resetAll} className="gap-2 text-xs">
          <RotateCw className="h-3 w-3" /> Resetear todo
        </Button>
      </div>
    </div>
  );
}

/** Inyecta estilos CSS globales que usan las clases a11y- en <html>. */
function injectGlobalA11yStyles() {
  if (typeof document === "undefined") return;
  const id = "starseed-a11y-styles";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    :root { --a11y-text-scale: 1; --a11y-focus-ring: 1; }

    /* Alto contraste */
    html.a11y-high-contrast {
      filter: contrast(1.18);
    }
    html.a11y-high-contrast :where(p, span, h1, h2, h3, h4, label, a, button) {
      color: white !important;
      text-shadow: 0 0 1px rgba(0,0,0,0.45);
    }

    /* Reducir movimiento */
    html.a11y-reduce-motion *,
    html.a11y-reduce-motion *::before,
    html.a11y-reduce-motion *::after {
      animation-duration: 0.001ms !important;
      transition-duration: 0.05ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
    }

    /* Pausar animaciones (más agresivo) */
    html.a11y-pause-animations *,
    html.a11y-pause-animations *::before,
    html.a11y-pause-animations *::after {
      animation-play-state: paused !important;
      transition: none !important;
    }
    html.a11y-pause-animations canvas {
      animation-play-state: paused !important;
    }

    /* Tamaño de texto */
    html { font-size: calc(16px * var(--a11y-text-scale, 1)); }

    /* Tamaño táctil mínimo */
    html.a11y-target-large button, html.a11y-target-large [role="button"], html.a11y-target-large a {
      min-height: 44px; min-width: 44px;
    }
    html.a11y-target-huge button, html.a11y-target-huge [role="button"], html.a11y-target-huge a {
      min-height: 60px; min-width: 60px;
    }

    /* Subrayar enlaces */
    html.a11y-underline-links a { text-decoration: underline !important; text-underline-offset: 2px; }

    /* Cursor */
    html.a11y-cursor-large body { cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><polygon points='4,4 4,28 12,21 17,30 21,28 16,19 24,19' fill='white' stroke='black' stroke-width='2'/></svg>") 4 4, auto; }
    html.a11y-cursor-huge body { cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 32 32'><polygon points='4,4 4,28 12,21 17,30 21,28 16,19 24,19' fill='white' stroke='black' stroke-width='2'/></svg>") 6 6, auto; }

    /* Anillo de foco */
    html :focus-visible {
      outline: calc(var(--a11y-focus-ring, 1) * 2px) solid hsl(var(--ring, 215 100% 60%)) !important;
      outline-offset: 2px !important;
    }
    html[style*="--a11y-focus-ring: 0"] :focus-visible { outline: revert !important; }

    /* Daltonismo — filtros inline para no requerir SVG externo */
    html.a11y-cb-protanopia body { filter: url(#cb-protanopia); }
    html.a11y-cb-deuteranopia body { filter: url(#cb-deuteranopia); }
    html.a11y-cb-tritanopia body { filter: url(#cb-tritanopia); }
    html.a11y-cb-achromatopsia body { filter: grayscale(1); }
  `;
  document.head.appendChild(style);

  // SVG con filtros para daltonismo (matrices estándar)
  const svgId = "starseed-a11y-svg";
  if (!document.getElementById(svgId)) {
    const svgWrap = document.createElement("div");
    svgWrap.style.position = "absolute";
    svgWrap.style.width = "0";
    svgWrap.style.height = "0";
    svgWrap.style.overflow = "hidden";
    svgWrap.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" id="${svgId}">
        <defs>
          <filter id="cb-protanopia">
            <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0"/>
          </filter>
          <filter id="cb-deuteranopia">
            <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"/>
          </filter>
          <filter id="cb-tritanopia">
            <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0"/>
          </filter>
        </defs>
      </svg>
    `;
    document.body.appendChild(svgWrap);
  }
}
