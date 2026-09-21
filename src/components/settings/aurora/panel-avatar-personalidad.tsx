"use client";

/**
 * PanelAvatarPersonalidad — Ajustes → Experiencia (Aurora & Avatares)
 * ============================================================================
 * Permite configurar el avatar (GLB, imagen o procedural), el nivel de movimiento
 * con Kimodo (vivo, fluido, ligero, quieto) y el acompañante flotante por personalidad.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  User,
  Sparkles,
  Move,
  Layers,
  RotateCcw,
  CheckCircle2,
  Image as ImageIcon,
  Sliders,
  ShieldCheck,
  Bot,
  Play,
  Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  listPersonalityProfiles,
  getActivePersonality,
  PERSONALITY_CHANGED_EVENT,
  type PersonalityProfile,
} from "@/lib/aurora/personalities";
import { proceduralAvatarSvg } from "@/lib/aurora/persona-avatar";
import { AvatarVivo, type FuenteAvatar } from "@/components/avatares/avatar-vivo";
import {
  avatarDePersonalidad,
  guardarAvatarPersonalidad,
  restablecerAvatarPersonalidad,
  AVATAR_PERSONALIDAD_EVENT,
  type AvatarPersonalidad,
  type EsquinaAcompanante,
} from "@/lib/aurora/persona-avatar-vivo";
import { NIVELES_MOVIMIENTO, type NivelMovimiento } from "@/lib/avatares/movimiento/niveles";
import type { Gesto } from "@/lib/avatares/movimiento/motor";

export interface PanelAvatarPersonalidadProps {
  className?: string;
  personalidadIdInicial?: string;
}

/** Transforma la configuración local en la fuente universal de AvatarVivo. */
function fuenteParaConfig(
  config: AvatarPersonalidad,
  perfil: PersonalityProfile | null
): FuenteAvatar {
  if (config.fuente.tipo === "glb" && config.fuente.url) {
    return { tipo: "glb", url: config.fuente.url };
  }
  if (config.fuente.tipo === "imagen" && config.fuente.url) {
    return { tipo: "imagen", url: config.fuente.url };
  }
  return {
    tipo: "procedural",
    svg: perfil ? proceduralAvatarSvg(perfil, 256) : "",
  };
}

export function PanelAvatarPersonalidad({
  className,
  personalidadIdInicial,
}: PanelAvatarPersonalidadProps) {
  const [perfiles, setPerfiles] = useState<PersonalityProfile[]>([]);
  const [personalidadActivaId, setPersonalidadActivaId] = useState<string>("");
  const [personalidadId, setPersonalidadId] = useState<string>(
    personalidadIdInicial || "preset-aurora"
  );
  const [config, setConfig] = useState<AvatarPersonalidad>(() =>
    avatarDePersonalidad(personalidadIdInicial || "preset-aurora")
  );
  const [gestoPrueba, setGestoPrueba] = useState<Gesto | null>(null);
  const [guardadoExito, setGuardadoExito] = useState(false);

  // Carga la lista de personalidades y la activa
  const refrescarPerfiles = useCallback(() => {
    try {
      const lista = listPersonalityProfiles();
      setPerfiles(lista);
      const activa = getActivePersonality();
      if (activa) setPersonalidadActivaId(activa.id);
    } catch {
      /* noop defensivo */
    }
  }, []);

  // Carga la configuración del avatar cuando cambia la personalidad seleccionada
  const cargarConfig = useCallback((id: string) => {
    try {
      setConfig(avatarDePersonalidad(id));
    } catch {
      /* noop defensivo */
    }
  }, []);

  useEffect(() => {
    refrescarPerfiles();
    cargarConfig(personalidadId);

    const alCambiarPersona = () => refrescarPerfiles();
    const alCambiarAvatar = (ev: Event) => {
      const custom = ev as CustomEvent<{ personalidadId?: string }>;
      if (custom.detail?.personalidadId === personalidadId) {
        cargarConfig(personalidadId);
      }
    };

    window.addEventListener(PERSONALITY_CHANGED_EVENT, alCambiarPersona);
    window.addEventListener(AVATAR_PERSONALIDAD_EVENT, alCambiarAvatar);
    return () => {
      window.removeEventListener(PERSONALITY_CHANGED_EVENT, alCambiarPersona);
      window.removeEventListener(AVATAR_PERSONALIDAD_EVENT, alCambiarAvatar);
    };
  }, [personalidadId, refrescarPerfiles, cargarConfig]);

  const perfilActual = useMemo(
    () => perfiles.find((p) => p.id === personalidadId) || null,
    [perfiles, personalidadId]
  );

  /* Guardar los cambios en el almacenamiento local y espejo de Supabase */
  const alGuardar = useCallback(() => {
    try {
      guardarAvatarPersonalidad(config);
      setGuardadoExito(true);
      setTimeout(() => setGuardadoExito(false), 2500);
    } catch {
      /* noop defensivo */
    }
  }, [config]);

  /* Restablecer la configuración por defecto de la personalidad */
  const alRestablecer = useCallback(() => {
    try {
      restablecerAvatarPersonalidad(personalidadId);
      setConfig(avatarDePersonalidad(personalidadId));
      setGestoPrueba(null);
    } catch {
      /* noop defensivo */
    }
  }, [personalidadId]);

  /* Actualizadores de estado de parches */
  const patchFuente = useCallback((patch: Partial<AvatarPersonalidad["fuente"]>) => {
    setConfig((prev) => ({ ...prev, fuente: { ...prev.fuente, ...patch } }));
  }, []);

  const patchMovimiento = useCallback(
    (patch: Partial<AvatarPersonalidad["movimiento"]>) => {
      setConfig((prev) => ({ ...prev, movimiento: { ...prev.movimiento, ...patch } }));
    },
    []
  );

  const patchAcompanante = useCallback(
    (patch: Partial<AvatarPersonalidad["acompanante"]>) => {
      setConfig((prev) => ({ ...prev, acompanante: { ...prev.acompanante, ...patch } }));
    },
    []
  );

  const fuenteUniversal = useMemo(
    () => fuenteParaConfig(config, perfilActual),
    [config, perfilActual]
  );

  const probarGesto = useCallback((prompt: string, duracionMs = 3200) => {
    setGestoPrueba({
      prompt,
      duracionMs,
      energia: config.movimiento.energia,
      bucle: false,
    });
  }, [config.movimiento.energia]);

  const pararGesto = useCallback(() => {
    setGestoPrueba(null);
  }, []);

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4 backdrop-blur-xl",
        className
      )}
    >
      {/* Cabecera del Panel */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bot className="w-4 h-4 text-purple-400" />
            Avatar y Movimiento por Personalidad
            <Badge
              variant="outline"
              className="text-purple-300 border-purple-300/40 text-[9px] uppercase tracking-wider"
            >
              Kimodo &amp; SOMA
            </Badge>
          </h3>
          <p className="text-[11px] leading-snug text-muted-foreground max-w-prose">
            Configura el aspecto visual (GLB, imagen o procedural), la expresividad del movimiento
            en 2,5D y el acompañante flotante en pantalla para cada personalidad de Aurora.
          </p>
        </div>
      </div>

      {/* Selector de Personalidad */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-foreground/70 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-purple-300" /> Personalidad a configurar
        </label>
        <div className="flex flex-wrap gap-1.5">
          {perfiles.map((p) => {
            const activa = p.id === personalidadActivaId;
            const seleccionada = p.id === personalidadId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPersonalidadId(p.id);
                  setGestoPrueba(null);
                }}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-[11px] transition-all duration-200 flex items-center gap-1.5",
                  seleccionada
                    ? "border-purple-400/60 bg-purple-400/15 text-foreground font-medium ring-1 ring-purple-400/30"
                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.06]"
                )}
              >
                <span>{p.name}</span>
                {activa && (
                  <span className="rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] px-1.5 py-0.2 border border-emerald-500/30">
                    activa
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bloque principal: Vista previa + Ajustes */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] font-medium text-foreground/80 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-300" /> Vista Previa en Vivo
          </p>
          <div className="flex flex-col items-center justify-center p-4 bg-white/[0.02] rounded-xl border border-white/5">
            <AvatarVivo
              fuente={fuenteUniversal}
              gesto={
                gestoPrueba ||
                (config.movimiento.automatico
                  ? {
                      prompt: "presencia tranquila",
                      energia: config.movimiento.energia,
                      bucle: true,
                      duracionMs: 3200,
                    }
                  : null)
              }
              tamano={160}
              personalidadId={personalidadId}
            />
            <p className="mt-2 text-xs font-semibold text-foreground">
              {perfilActual?.name || personalidadId}
            </p>
            <p className="text-[10px] text-muted-foreground text-center max-w-[200px]">
              {config.fuente.tipo === "procedural"
                ? "Avatar procedural SVG determinista"
                : config.fuente.tipo === "glb"
                ? "Modelo 3D GLB"
                : "Imagen raster"}
            </p>
          </div>

          {/* Pruebas de gestos */}
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Probar gestos de movimiento
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[10px] gap-1 cursor-pointer"
                onClick={() => probarGesto("saludo amable con la mano")}
              >
                <Play className="w-3 h-3 text-purple-300" /> Saludo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[10px] gap-1 cursor-pointer"
                onClick={() => probarGesto("explicación entusiasta con las manos")}
              >
                <Play className="w-3 h-3 text-purple-300" /> Explicación
              </Button>
              {gestoPrueba && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[10px] gap-1 cursor-pointer text-amber-300 hover:text-amber-200"
                  onClick={pararGesto}
                >
                  <Pause className="w-3 h-3" /> Detener
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Formularios de configuración a la derecha */}
        <div className="lg:col-span-7 space-y-4">
          {/* 1. Fuente del Avatar */}
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[11px] font-medium text-foreground/80 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-purple-300" /> Tipo de Avatar
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(["procedural", "glb", "imagen"] as const).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => patchFuente({ tipo })}
                  className={cn(
                    "cursor-pointer rounded-lg border py-1.5 text-center text-[11px] transition-colors",
                    config.fuente.tipo === tipo
                      ? "border-purple-400/50 bg-purple-400/10 text-foreground font-medium"
                      : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05]"
                  )}
                >
                  {tipo === "procedural" ? "Procedural SVG" : tipo === "glb" ? "Modelo 3D" : "Imagen"}
                </button>
              ))}
            </div>

            {(config.fuente.tipo === "glb" || config.fuente.tipo === "imagen") && (
              <div className="space-y-1 pt-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  URL del recurso ({config.fuente.tipo.toUpperCase()})
                </label>
                <Input
                  value={config.fuente.url || ""}
                  onChange={(e) => patchFuente({ url: e.target.value })}
                  placeholder={
                    config.fuente.tipo === "glb"
                      ? "https://ejemplo.com/avatar.glb"
                      : "https://ejemplo.com/avatar.png"
                  }
                  className="h-8 rounded-lg border-white/10 bg-black/25 text-[11px]"
                />
              </div>
            )}
          </div>

          {/* 2. Ajustes de Movimiento */}
          <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-foreground/80 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-purple-300" /> Movimiento &amp; Expresividad
              </p>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                <span>Respiración automática</span>
                <Switch
                  checked={config.movimiento.automatico}
                  onCheckedChange={(automatico) => patchMovimiento({ automatico })}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Energía / Amplitud</span>
                  <span className="font-mono text-foreground">
                    {Math.round(config.movimiento.energia * 100)}%
                  </span>
                </div>
                <Slider
                  value={[config.movimiento.energia]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={([val]) => patchMovimiento({ energia: val })}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Expresividad</span>
                  <span className="font-mono text-foreground">
                    {Math.round(config.movimiento.expresividad * 100)}%
                  </span>
                </div>
                <Slider
                  value={[config.movimiento.expresividad]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={([val]) => patchMovimiento({ expresividad: val })}
                />
              </div>
            </div>

            <div className="space-y-1 pt-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Nivel de motor deseado
              </label>
              <select
                value={config.movimiento.nivel || "auto"}
                onChange={(e) =>
                  patchMovimiento({
                    nivel: e.target.value as NivelMovimiento | "auto",
                  })
                }
                className="w-full cursor-pointer rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[11px] text-foreground focus:outline-none"
              >
                <option value="auto">Automático (el hardware decide el nivel óptimo)</option>
                <option value="vivo">Vivo — Kimodo local (30 articulaciones)</option>
                <option value="fluido">Fluido — Kimodo precalculado (30 articulaciones)</option>
                <option value="ligero">Ligero — Clips procedurales (22 articulaciones)</option>
                <option value="quieto">Quieto — Micro-movimiento CSS (0 articulaciones)</option>
              </select>
            </div>
          </div>

          {/* 3. Acompañante Flotante */}
          <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-foreground/80 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-300" /> Acompañante Flotante en Pantalla
              </p>
              <Switch
                checked={config.acompanante.mostrar}
                onCheckedChange={(mostrar) => patchAcompanante({ mostrar })}
              />
            </div>

            {config.acompanante.mostrar && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Esquina de pantalla por defecto
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        ["inferior-derecha", "Inferior Derecha"],
                        ["inferior-izquierda", "Inferior Izquierda"],
                        ["superior-derecha", "Superior Derecha"],
                        ["superior-izquierda", "Superior Izquierda"],
                      ] as const
                    ).map(([esq, label]) => (
                      <button
                        key={esq}
                        type="button"
                        onClick={() => patchAcompanante({ esquina: esq as EsquinaAcompanante })}
                        className={cn(
                          "cursor-pointer rounded-lg border py-1 px-2 text-center text-[10px] transition-colors",
                          config.acompanante.esquina === esq
                            ? "border-purple-400/50 bg-purple-400/10 text-foreground font-medium"
                            : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05]"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Tamaño</span>
                      <span className="font-mono text-foreground">
                        {config.acompanante.tamano}px
                      </span>
                    </div>
                    <Slider
                      value={[config.acompanante.tamano]}
                      min={56}
                      max={240}
                      step={4}
                      onValueChange={([val]) => patchAcompanante({ tamano: val })}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Opacidad</span>
                      <span className="font-mono text-foreground">
                        {Math.round(config.acompanante.opacidad * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[config.acompanante.opacidad]}
                      min={0.2}
                      max={1}
                      step={0.05}
                      onValueChange={([val]) => patchAcompanante({ opacidad: val })}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={alRestablecer}
          className="h-8 gap-1.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Restablecer por defecto
        </Button>

        <div className="flex items-center gap-2">
          {guardadoExito && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
          <Button
            type="button"
            size="sm"
            onClick={alGuardar}
            className="h-8 gap-1.5 bg-purple-500/20 text-purple-100 hover:bg-purple-500/30 border border-purple-400/40 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Guardar Ajustes
          </Button>
        </div>
      </div>

      {/* Nota de privacidad */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 pt-1">
        <ShieldCheck className="w-3 h-3 text-purple-300/70" />
        Configuración guardada en esta neurona con espejo cifrado en tu cuenta soberana StarSeed.
      </div>
    </div>
  );
}

export default PanelAvatarPersonalidad;
