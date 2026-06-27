"use client";

/**
 * <TriSourceConfig /> — primitivo reutilizable del modelo "proveedor tri-fuente".
 *
 * Para un `domain` dado (p.ej. "ai", "storage", "mail"…) muestra TRES tarjetas
 * de fuente —Servidor propio · Servidor StarSeed · Servidor externo— cada una
 * con un interruptor de activación (las tres pueden estar ON a la vez), campos
 * por fuente (endpoint, parámetros, referencia de clave) y un peso. Encima, un
 * selector de MODULACIÓN (prioridad / balanceo / fusión / failover) define cómo
 * se interconectan/mezclan las fuentes habilitadas. Persiste vía
 * `@/lib/services/service-routes` y escucha cambios en Realtime.
 *
 * Privacidad: el campo de clave guarda SÓLO una referencia (`key_ref`), nunca
 * el secreto en claro. La referencia apunta a la bóveda cifrada del navegador
 * (ver Ajustes → IA & Modelos, AES-GCM + PBKDF2).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ServerCog,
  Sparkles,
  Globe,
  KeyRound,
  Link2,
  Save,
  Layers,
  ArrowDownUp,
  Scale,
  GitMerge,
  ShieldAlert,
  Network,
  Loader2,
  Info,
  RotateCcw,
} from "lucide-react";

import {
  loadRoute,
  saveRoute,
  onRouteChange,
  defaultRoute,
  type ServiceRoute,
  type ServiceSource,
  type SourceKind,
  type ModulationMode,
} from "@/lib/services/service-routes";

// ── Metadatos de presentación por fuente ─────────────────────────────────────

const KIND_META: Record<
  SourceKind,
  {
    label: string;
    blurb: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string; // clases de color/borde
    chip: string;
  }
> = {
  propio: {
    label: "Servidor propio",
    blurb:
      "Tu propia instancia autoalojada. Máxima soberanía: tú controlas el endpoint y las credenciales.",
    icon: ServerCog,
    accent: "border-emerald-500/30 bg-emerald-950/15",
    chip: "text-emerald-300 border-emerald-400/40",
  },
  starseed: {
    label: "Servidor StarSeed",
    blurb:
      "La infraestructura de la red StarSeed. Listo para usar, sin configuración. Activado por defecto.",
    icon: Sparkles,
    accent: "border-violet-500/30 bg-violet-950/15",
    chip: "text-violet-300 border-violet-400/40",
  },
  externo: {
    label: "Servidor externo",
    blurb:
      "Un proveedor de terceros (API/servicio). Conéctalo con su endpoint y una referencia a tu clave.",
    icon: Globe,
    accent: "border-cyan-500/30 bg-cyan-950/15",
    chip: "text-cyan-300 border-cyan-400/40",
  },
};

const KIND_ORDER: SourceKind[] = ["propio", "starseed", "externo"];

// ── Metadatos de modulación ──────────────────────────────────────────────────

const MODULATIONS: {
  mode: ModulationMode;
  label: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    mode: "prioridad",
    label: "Prioridad",
    blurb:
      "Se usa la fuente activa de mayor peso; las demás quedan como respaldo manual.",
    icon: ArrowDownUp,
  },
  {
    mode: "balanceo",
    label: "Balanceo",
    blurb: "La carga se reparte entre las fuentes activas según su peso.",
    icon: Scale,
  },
  {
    mode: "fusion",
    label: "Fusión",
    blurb:
      "Se consultan varias fuentes y sus resultados se combinan/fusionan en uno.",
    icon: GitMerge,
  },
  {
    mode: "failover",
    label: "Failover",
    blurb:
      "Se intenta la primaria; si falla, se cae automáticamente a la siguiente.",
    icon: ShieldAlert,
  },
];

// ── Props ────────────────────────────────────────────────────────────────────

export interface TriSourceConfigProps {
  /** Dominio funcional (p.ej. "ai", "storage", "mail"). */
  domain: string;
  /** Título visible de la sección. */
  title: string;
  /** Subtítulo/explicación corta opcional. */
  description?: string;
  /** Parámetros sugeridos por fuente (claves de `config`) para este dominio. */
  paramHints?: { key: string; label: string; placeholder?: string }[];
  /** Endpoint de ejemplo para "propio"/"externo". */
  endpointPlaceholder?: string;
  className?: string;
}

// ── Componente ───────────────────────────────────────────────────────────────

export function TriSourceConfig({
  domain,
  title,
  description,
  paramHints,
  endpointPlaceholder = "https://mi-servidor.ejemplo/api",
  className,
}: TriSourceConfigProps) {
  const [route, setRoute] = useState<ServiceRoute>(() => defaultRoute(domain));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Evita que un eco de Realtime de nuestro propio guardado pise ediciones.
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  // Carga inicial.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadRoute(domain).then((r) => {
      if (!alive) return;
      setRoute(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [domain]);

  // Realtime: aplica cambios entrantes salvo que haya ediciones sin guardar.
  useEffect(() => {
    const unsub = onRouteChange(domain, (r) => {
      if (dirtyRef.current) return; // no pisar ediciones locales en curso
      setRoute(r);
    });
    return unsub;
  }, [domain]);

  const sources = route.sources;

  const patchSource = useCallback(
    (kind: SourceKind, patch: Partial<ServiceSource>) => {
      setRoute((prev) => ({
        ...prev,
        sources: prev.sources.map((s) =>
          s.kind === kind ? { ...s, ...patch } : s,
        ),
      }));
      setDirty(true);
    },
    [],
  );

  const patchConfig = useCallback(
    (kind: SourceKind, key: string, value: string) => {
      setRoute((prev) => ({
        ...prev,
        sources: prev.sources.map((s) =>
          s.kind === kind
            ? { ...s, config: { ...s.config, [key]: value } }
            : s,
        ),
      }));
      setDirty(true);
    },
    [],
  );

  const setMode = useCallback((mode: ModulationMode) => {
    setRoute((prev) => ({ ...prev, modulation: { ...prev.modulation, mode } }));
    setDirty(true);
  }, []);

  const setNote = useCallback((note: string) => {
    setRoute((prev) => ({ ...prev, modulation: { ...prev.modulation, note } }));
    setDirty(true);
  }, []);

  async function persist() {
    setSaving(true);
    try {
      const saved = await saveRoute(domain, route.sources, route.modulation);
      if (saved) setRoute(saved);
      setDirty(false);
      toast.success("Fuentes y modulación guardadas");
    } catch {
      toast.error("No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setRoute(defaultRoute(domain));
    setDirty(true);
    toast.message("Restablecido a valores por defecto (recuerda guardar)");
  }

  const enabledCount = useMemo(
    () => sources.filter((s) => s.enabled).length,
    [sources],
  );
  const totalWeight = useMemo(
    () =>
      sources
        .filter((s) => s.enabled)
        .reduce((acc, s) => acc + (s.weight || 0), 0),
    [sources],
  );

  const mode = route.modulation.mode;
  const showWeights = mode === "balanceo" || mode === "fusion";

  return (
    <div className={cn("space-y-5", className)}>
      {/* Cabecera + explicación de interconexión */}
      <Card className="bg-gradient-to-br from-primary/10 via-background/40 to-accent/10 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="h-5 w-5 text-primary" />
            {title}
            <Badge
              variant="outline"
              className="ml-auto border-primary/30 text-primary text-[10px]"
            >
              {enabledCount} de 3 activas
            </Badge>
          </CardTitle>
          <CardDescription className="leading-relaxed">
            {description ??
              "Elige una o varias fuentes para esta función. Las tres pueden convivir a la vez."}{" "}
            La <strong>modulación</strong> de abajo define cómo se interconectan
            y mezclan las fuentes habilitadas.
          </CardDescription>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
        </div>
      ) : (
        <>
          {/* Tarjetas de fuente */}
          <div className="grid gap-3 lg:grid-cols-3">
            {KIND_ORDER.map((kind) => {
              const s = sources.find((x) => x.kind === kind)!;
              const meta = KIND_META[kind];
              const Icon = meta.icon;
              const isStarseed = kind === "starseed";
              return (
                <Card
                  key={kind}
                  className={cn(
                    "backdrop-blur-sm transition",
                    s.enabled
                      ? meta.accent
                      : "border-white/5 bg-background/40 opacity-80",
                  )}
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{meta.label}</span>
                      </CardTitle>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.enabled && (
                          <Badge
                            variant="outline"
                            className={cn("text-[9px]", meta.chip)}
                          >
                            Activa
                          </Badge>
                        )}
                        {isStarseed && (
                          <Badge
                            variant="outline"
                            className="text-[9px] text-violet-300/80 border-violet-400/30"
                          >
                            Por defecto
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={(v) =>
                        patchSource(kind, {
                          enabled: v,
                          // al activar por primera vez, da peso 1 si estaba a 0
                          weight: v && s.weight === 0 ? 1 : s.weight,
                        })
                      }
                    />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {meta.blurb}
                    </p>

                    {/* Endpoint: StarSeed gestionado; propio/externo editable */}
                    <div className="space-y-1">
                      <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <Link2 className="h-3 w-3" /> Endpoint
                      </label>
                      {isStarseed ? (
                        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-muted-foreground">
                          Gestionado por StarSeed (no requiere endpoint)
                        </div>
                      ) : (
                        <Input
                          value={s.endpoint}
                          onChange={(e) =>
                            patchSource(kind, { endpoint: e.target.value })
                          }
                          placeholder={endpointPlaceholder}
                          disabled={!s.enabled}
                          className="bg-background/60 border-white/10 font-mono text-xs"
                        />
                      )}
                    </div>

                    {/* Referencia de clave (NO el secreto) */}
                    {!isStarseed && (
                      <div className="space-y-1">
                        <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <KeyRound className="h-3 w-3 text-amber-400" />
                          Referencia de clave
                        </label>
                        <Input
                          value={s.key_ref}
                          onChange={(e) =>
                            patchSource(kind, { key_ref: e.target.value })
                          }
                          placeholder="p.ej. mi-api-key (alias en la bóveda)"
                          disabled={!s.enabled}
                          className="bg-background/60 border-white/10 font-mono text-xs"
                        />
                        <p className="text-[9px] leading-snug text-amber-300/60">
                          Sólo un alias. El secreto se cifra en tu navegador; no
                          se guarda aquí en claro.
                        </p>
                      </div>
                    )}

                    {/* Parámetros sugeridos por dominio */}
                    {paramHints && paramHints.length > 0 && (
                      <div className="space-y-2">
                        {paramHints.map((p) => (
                          <div key={p.key} className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {p.label}
                            </label>
                            <Input
                              value={
                                (s.config?.[p.key] as string | undefined) ?? ""
                              }
                              onChange={(e) =>
                                patchConfig(kind, p.key, e.target.value)
                              }
                              placeholder={p.placeholder}
                              disabled={!s.enabled}
                              className="bg-background/60 border-white/10 text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Peso (cuando la modulación lo usa) */}
                    {showWeights && s.enabled && (
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                          <span>Peso</span>
                          <span className="font-mono text-foreground">
                            {s.weight}
                            {totalWeight > 0 && (
                              <span className="ml-1 text-muted-foreground">
                                ({Math.round((s.weight / totalWeight) * 100)}%)
                              </span>
                            )}
                          </span>
                        </div>
                        <Slider
                          value={[s.weight]}
                          min={0}
                          max={10}
                          step={1}
                          onValueChange={(v) =>
                            patchSource(kind, { weight: v[0] ?? 0 })
                          }
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Modulación */}
          <Card className="bg-background/40 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Layers className="h-4 w-4 text-primary" /> Modulación
              </CardTitle>
              <CardDescription>
                Cómo se combinan las fuentes activas para esta función.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {MODULATIONS.map((m) => {
                  const MIcon = m.icon;
                  const active = mode === m.mode;
                  return (
                    <button
                      key={m.mode}
                      onClick={() => setMode(m.mode)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition",
                        active
                          ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                          : "border-white/10 bg-black/20 hover:border-primary/30 hover:bg-primary/5",
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <MIcon
                          className={cn(
                            "h-4 w-4",
                            active ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <span className="text-sm font-semibold">{m.label}</span>
                      </div>
                      <p className="text-[10px] leading-snug text-muted-foreground">
                        {m.blurb}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Aviso contextual según el modo + nº de fuentes */}
              <div className="flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-950/15 px-3 py-2 text-[11px] leading-relaxed text-cyan-100/85">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                <span>
                  {enabledCount === 0
                    ? "No hay fuentes activas: esta función no tiene proveedor. Activa al menos una."
                    : enabledCount === 1
                      ? "Con una sola fuente activa, la modulación es irrelevante hasta que añadas otra."
                      : mode === "prioridad"
                        ? "La fuente activa de mayor peso atiende; el resto queda como respaldo manual."
                        : mode === "balanceo"
                          ? "La carga se reparte entre las fuentes activas proporcionalmente a su peso."
                          : mode === "fusion"
                            ? "Se consultan varias fuentes y sus respuestas se fusionan en un resultado."
                            : "Se prueba la primaria; ante un fallo, se cae automáticamente a la siguiente."}
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Notas de dinámica (opcional)
                </label>
                <Textarea
                  value={route.modulation.note ?? ""}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Describe cómo quieres que se comporte el enrutado entre fuentes…"
                  className="min-h-[60px] bg-background/60 border-white/10 text-xs"
                />
              </div>
            </CardContent>
          </Card>

          {/* Barra de acciones */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={persist}
              disabled={saving || !dirty}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar configuración
            </Button>
            <Button variant="outline" onClick={reset} className="gap-2">
              <RotateCcw className="h-4 w-4" /> Restablecer
            </Button>
            {dirty && (
              <span className="text-[11px] text-amber-300/80">
                Cambios sin guardar
              </span>
            )}
            {route.updated_at && !dirty && (
              <span className="text-[11px] text-muted-foreground">
                Sincronizado · {new Date(route.updated_at).toLocaleString()}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default TriSourceConfig;
