"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Accessibility, Contrast, Eye, EyeOff, Type, Hand, Volume2,
  ZoomIn, Activity, ShieldCheck, RotateCw, Music2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";
import {
  DEFAULT_A11Y,
  loadA11ySettings,
  saveA11ySettings,
  applyA11yToDocument,
  injectGlobalA11yStyles,
  type A11ySettings,
} from "@/lib/a11y/apply";
// Sonificación sutil de los sistemas de Astraura (Adenda 149 · ola 3): vive
// fuera de A11ySettings (es una preferencia de Astraura, no del documento),
// pero su interruptor va AQUÍ, junto a los ajustes de movimiento, porque
// comparte el mismo gate: quien reduce movimiento tampoco oye el chime.
import { chimeEnabled, setChimeEnabled, playSystemChime, CHIME_EVENT } from "@/lib/astraura/system-chime";

/**
 * Panel dedicado a accesibilidad. Mantiene el principio constitucional de
 * inclusión: la libertad estética no puede ir en contra de la libertad de
 * uso. Persiste en localStorage independiente para que sobreviva a cambios
 * de tema, y aplica clases CSS a <html> para que cualquier componente pueda
 * reaccionar.
 */

// Los ajustes de accesibilidad (tipo, defaults, carga/guardado, aplicación al
// documento y estilos globales) viven ahora en `@/lib/a11y/apply` (Adenda 118),
// para poder aplicarlos también en el ARRANQUE (A11yBoot), no solo en este panel.

export function AccessibilitySettings() {
  const [settings, setSettings] = useState<A11ySettings>(DEFAULT_A11Y);
  const [chime, setChime] = useState(false);
  const { config, updateSection } = useAppearance();

  useEffect(() => {
    const loaded = loadA11ySettings();
    setSettings(loaded);
    applyA11yToDocument(loaded);
    injectGlobalA11yStyles();
  }, []);

  // Estado del chime (off por defecto) + sincronía si otra superficie lo cambia.
  useEffect(() => {
    setChime(chimeEnabled());
    const sync = () => setChime(chimeEnabled());
    try { window.addEventListener(CHIME_EVENT, sync); } catch { /* */ }
    return () => { try { window.removeEventListener(CHIME_EVENT, sync); } catch { /* */ } };
  }, []);

  function update<K extends keyof A11ySettings>(key: K, value: A11ySettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveA11ySettings(next);
    applyA11yToDocument(next);
  }

  function resetAll() {
    setSettings(DEFAULT_A11Y);
    saveA11ySettings(DEFAULT_A11Y);
    applyA11yToDocument(DEFAULT_A11Y);
    toast.success("Ajustes de accesibilidad reseteados");
  }

  // Cuenta cuántos overrides están activos vs default
  const activeOverrides = (Object.keys(DEFAULT_A11Y) as (keyof A11ySettings)[]).filter(
    (k) => settings[k] !== DEFAULT_A11Y[k]
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
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
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
                <Music2 className="h-4 w-4 text-fuchsia-400" /> Sonidos sutiles del sistema (Astraura)
              </span>
              <Switch
                checked={chime}
                aria-label="Sonidos sutiles del sistema (Astraura)"
                onCheckedChange={(v) => {
                  setChime(v);
                  setChimeEnabled(v);
                  // Muestra inmediata de lo que se acaba de activar (una nota).
                  if (v) playSystemChime("astraura", "set");
                }}
              />
            </CardTitle>
            <CardDescription className="text-xs">
              Una nota brevísima al guardar un ajuste de los sistemas de Astraura
              (descendente al volver a automático). Apagado por defecto y mudo si
              reduces el movimiento o la pestaña no está a la vista.
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
