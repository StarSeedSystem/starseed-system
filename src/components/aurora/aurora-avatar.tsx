"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * StarSeed OS — AVATAR DE AURORA (orbe animado mejorado + Live2D opcional)
 * ============================================================================
 * Inspirado en el CONCEPTO de Open-LLM-VTuber (un cuerpo visual sincronizado
 * al estado/voz de un asistente) — SIN reutilizar ni una línea de su código.
 * Implementación propia y ligera, en dos capas:
 *
 *   · Modo "orbe" (DEFAULT, SIEMPRE disponible, cero dependencias nuevas):
 *     envuelve el `AuroraOrb` YA EXISTENTE (mismo lenguaje visual Crystal ·
 *     Trinity, ya reactivo al nivel de audio real vía `aurora-orb-bus.ts`) en
 *     un marco algo mayor con una ETIQUETA DE ESTADO legible (idle ·
 *     escuchando · hablando · pensando). "Pensando" es nuevo aquí: `AuroraOrb`
 *     no lo expone, así que se dibuja un anillo propio adicional.
 *   · Modo "live2d" (OPCIONAL — solo si el usuario aporta una URL de modelo):
 *     carga PIXI.js + el plugin `pixi-live2d-display` por CDN mediante
 *     `<script>` perezoso (NUNCA en SSR, NUNCA como dependencia npm) — si
 *     falla la carga, el modelo o la red, DEGRADA al modo "orbe" sin romper
 *     nada ni dejar una pantalla rota.
 *   · Modo "none": no renderiza nada — comportamiento de hoy, sin cambios.
 *
 * Config persistida en `@/ai/astraura/avatar-config.ts` (clave
 * `starseed.aurora.avatar.v1`, local por dispositivo). Este archivo expone:
 *   · <AuroraAvatar />              — el avatar en sí (móntalo junto al chat).
 *   · <AuroraAvatarSettingsCard />  — tarjeta de ajustes, pensada para el
 *     panel de Inteligencia de Aurora (modo/URL/tamaño/posición).
 *
 * Voz: NO reimplementa TTS ni reconocimiento — lee el estado YA existente del
 * motor de Aurora (`useAurora()` con fallback defensivo al puente global,
 * igual que el resto del Exocórtex) y se lo pasa tal cual a `AuroraOrb`.
 *
 * SSR-safe y defensivo en todo punto: nunca lanza, nunca deja recursos (app
 * PIXI / canvas / listeners) sin limpiar.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "@/components/aurora/aurora-provider";
import { getAuroraState, subscribeAurora, type AuroraStateSnapshot } from "@/lib/aurora/open-aurora";
import { AuroraOrb } from "@/components/aurora/aurora-orb";
import {
  getAvatarConfig,
  setAvatarConfig,
  subscribeAvatarConfig,
  resetAvatarConfig,
  type AuroraAvatarConfig,
  type AuroraAvatarMode,
  type AuroraAvatarPosition,
} from "@/ai/astraura/avatar-config";

/** El puente global (v4+) añade `voiceUnavailable` a la instantánea (aditivo,
 *  mismo patrón que `aurora-chat-section.tsx::SnapshotPlus`) — no está en el
 *  tipo base `AuroraStateSnapshot` porque no todas las superficies lo usan. */
type SnapshotPlus = AuroraStateSnapshot & { voiceUnavailable?: boolean };

/* ── Estado reactivo de Aurora (contexto real, con fallback al puente) ────── */
function useAuroraLikeState() {
  const aurora = useAurora();
  const [snap, setSnap] = useState<SnapshotPlus | null>(() => (aurora ? null : (getAuroraState() as SnapshotPlus | null)));

  useEffect(() => {
    if (aurora) return;
    const refresh = () => setSnap(getAuroraState() as SnapshotPlus | null);
    const unsub = subscribeAurora(refresh);
    refresh();
    return unsub;
  }, [aurora]);

  return {
    speaking: aurora?.speaking ?? snap?.speaking ?? false,
    listening: aurora?.listening ?? snap?.listening ?? false,
    paused: aurora?.paused ?? snap?.paused ?? false,
    // `thinking` solo lo expone el motor real (contexto); el puente global no
    // lo lleva en su instantánea — degrada honestamente a `false`.
    thinking: aurora?.thinking ?? false,
    supported: aurora?.supported ?? snap?.supported ?? false,
    unavailable: aurora?.voiceUnavailable ?? !!snap?.voiceUnavailable,
  };
}

/* ── Runtime Live2D por CDN (perezoso, vía <script>, jamás en SSR) ────────── */
/**
 * pixi-live2d-display NO es un paquete ESM-friendly: espera un PIXI GLOBAL
 * (`window.PIXI`) al que se cuelga (`PIXI.live2d = {...}`). Un `import()`
 * dinámico de un build ESM devolvería un namespace object CONGELADO (no se le
 * puede colgar nada) — por eso aquí usamos <script> clásicos (la forma
 * documentada de integrar esta librería), cargados perezosamente y una sola
 * vez por URL.
 */
function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") return reject(new Error("Sin document (SSR)."));
    const existing = document.querySelector(`script[data-starseed-cdn="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.getAttribute("data-loaded") === "1") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`No se pudo cargar ${src}`)));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.starseedCdn = src;
    s.onload = () => {
      s.setAttribute("data-loaded", "1");
      resolve();
    };
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

const PIXI_CDN_URL = "https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/pixi.min.js";
const LIVE2D_CDN_URL = "https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/index.min.js";

/** Asegura PIXI + el plugin Live2D en `window`. Devuelve el PIXI global o null. Nunca lanza. */
async function ensureLive2DRuntime(): Promise<any | null> {
  if (typeof window === "undefined") return null;
  const w = window as any;
  try {
    if (!w.PIXI) await loadScriptOnce(PIXI_CDN_URL);
    if (!w.PIXI) return null;
    if (!w.PIXI.live2d) await loadScriptOnce(LIVE2D_CDN_URL);
    return w.PIXI?.live2d?.Live2DModel ? w.PIXI : null;
  } catch {
    return null;
  }
}

type Live2DStatus = "idle" | "loading" | "ready" | "error";

/** Carga (perezosa) y monta un modelo Live2D en un contenedor propio. Nunca lanza; siempre limpia. */
function useLive2D(modeloUrl: string | undefined, active: boolean, size: number) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Live2DStatus>("idle");
  const appRef = useRef<any>(null);
  const modelRef = useRef<any>(null);

  useEffect(() => {
    if (!active || !modeloUrl) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");

    const cleanup = () => {
      try {
        modelRef.current?.destroy?.();
      } catch {
        /* */
      }
      try {
        appRef.current?.destroy?.(true, { children: true });
      } catch {
        /* */
      }
      modelRef.current = null;
      appRef.current = null;
      if (containerRef.current) {
        try {
          containerRef.current.innerHTML = "";
        } catch {
          /* */
        }
      }
    };

    (async () => {
      try {
        const PIXI = await ensureLive2DRuntime();
        if (cancelled) return;
        if (!PIXI || !containerRef.current) throw new Error("runtime Live2D no disponible");

        const app = new PIXI.Application({
          width: size,
          height: size,
          backgroundAlpha: 0,
          antialias: true,
        });
        if (cancelled) {
          try {
            app.destroy(true);
          } catch {
            /* */
          }
          return;
        }
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(app.view as HTMLCanvasElement);
        appRef.current = app;

        const model = await PIXI.live2d.Live2DModel.from(modeloUrl);
        if (cancelled) {
          try {
            app.destroy(true);
          } catch {
            /* */
          }
          return;
        }
        modelRef.current = model;
        app.stage.addChild(model);
        const w = model.width || size;
        const h = model.height || size;
        const scale = Math.min(size / w, size / h) * 0.92;
        model.scale.set(scale);
        if (model.anchor?.set) model.anchor.set(0.5, 0.5);
        model.x = size / 2;
        model.y = size / 2;
        setStatus("ready");
      } catch {
        if (!cancelled) {
          cleanup();
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, modeloUrl, size]);

  return { containerRef, status };
}

/* ── Etiqueta de estado legible ────────────────────────────────────────────── */
function stateLabel(opts: {
  unavailable: boolean;
  speaking: boolean;
  paused: boolean;
  listening: boolean;
  thinking: boolean;
}): string {
  if (opts.unavailable) return "Voz no disponible";
  if (opts.speaking) return opts.paused ? "En pausa" : "Hablando…";
  if (opts.listening) return "Escuchando…";
  if (opts.thinking) return "Pensando…";
  return "En reposo";
}

/* ── El avatar en sí ───────────────────────────────────────────────────────── */
export interface AuroraAvatarProps {
  className?: string;
  /** Fuerza la posición (ignora la config) — útil para la vista previa de ajustes. */
  forcePosition?: AuroraAvatarPosition;
}

export function AuroraAvatar({ className, forcePosition }: AuroraAvatarProps) {
  const [config, setConfig] = useState<AuroraAvatarConfig>(() => getAvatarConfig());
  useEffect(() => {
    setConfig(getAvatarConfig());
    return subscribeAvatarConfig(() => setConfig(getAvatarConfig()));
  }, []);

  const { speaking, listening, paused, thinking, supported, unavailable } = useAuroraLikeState();

  const wantsLive2d = config.mode === "live2d" && !!config.modeloUrl;
  const { containerRef, status: live2dStatus } = useLive2D(config.modeloUrl, wantsLive2d, config.size);

  if (config.mode === "none") return null;

  const showLive2d = wantsLive2d && live2dStatus === "ready";
  const showLive2dLoading = wantsLive2d && live2dStatus === "loading";
  const position = forcePosition ?? config.position;
  const label = stateLabel({ unavailable, speaking, paused, listening, thinking });
  // Tamaño real del orbe dentro del marco (deja aire coherente glass alrededor).
  const orbSize = Math.round(config.size * 0.78);

  return (
    <div
      className={cn(
        position === "floating" ? "fixed bottom-4 right-4 z-40" : "relative",
        "flex flex-col items-center gap-1.5 pointer-events-none select-none",
        className,
      )}
    >
      <div
        className="relative grid place-items-center rounded-[28px] border border-white/10 bg-black/30 backdrop-blur-md overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
        style={{ width: config.size, height: config.size }}
        aria-hidden
      >
        {showLive2d ? (
          <div ref={containerRef} className="h-full w-full" />
        ) : (
          <>
            {/* Halo suave centrado tras el orbe (lectura de cristal-luz coherente). */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(201,168,255,0.16), rgba(127,184,255,0.07) 55%, transparent 78%)",
              }}
            />
            {showLive2dLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
                <Loader2 className="h-5 w-5 animate-spin text-white/50" />
              </div>
            )}
            {/* El orbe (raíz `position:absolute; inset:0`) DEBE ir en un
                contenedor `relative` de su tamaño exacto para quedar centrado
                horizontal y verticalmente; sin él quedaba anclado arriba-izq. */}
            <div className="relative z-[1]" style={{ width: orbSize, height: orbSize }}>
              <AuroraOrb
                size={orbSize}
                speaking={speaking}
                listening={listening}
                paused={paused}
                supported={supported}
                unavailable={unavailable}
              />
            </div>
            {thinking && !speaking && !listening && (
              <span
                className="absolute inset-3 z-[2] rounded-full border-2 border-dashed border-[#7fb8ff]/50"
                style={{ animation: "starseed-avatar-spin 3s linear infinite" }}
              />
            )}
          </>
        )}
      </div>
      <span className="font-mono text-[10px] uppercase tracking-widest text-white/45">{label}</span>
      <style>{`@keyframes starseed-avatar-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      @media (prefers-reduced-motion: reduce){ [style*="starseed-avatar-spin"]{ animation: none !important; } }`}</style>
    </div>
  );
}

/* ── Tarjeta de ajustes (pensada para el panel de Inteligencia) ───────────── */
const MODE_OPTIONS: Array<{ id: AuroraAvatarMode; label: string; hint: string }> = [
  { id: "none", label: "Ninguno", hint: "Sin avatar visual (solo el orbe habitual)." },
  { id: "orbe", label: "Orbe animado", hint: "Por defecto — sin descargas ni dependencias." },
  { id: "live2d", label: "Live2D", hint: "Requiere un modelo propio (URL); se carga por CDN." },
];

export function AuroraAvatarSettingsCard() {
  const [config, setConfig] = useState<AuroraAvatarConfig>(() => getAvatarConfig());
  useEffect(() => {
    setConfig(getAvatarConfig());
    return subscribeAvatarConfig(() => setConfig(getAvatarConfig()));
  }, []);

  const patch = useCallback((p: Partial<AuroraAvatarConfig>) => setAvatarConfig(p), []);

  return (
    <Card className="bg-background/40 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4 text-primary" /> Avatar de Aurora
        </CardTitle>
        <CardDescription>
          Un cuerpo visual opcional junto al chat de Aurora: orbe animado (siempre disponible) o, si aportas un
          modelo propio, Live2D (carga por CDN; degrada al orbe si falla o no hay red).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {MODE_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => patch({ mode: m.id })}
              className={cn(
                "text-left rounded-xl border p-2.5 transition-colors cursor-pointer",
                config.mode === m.id
                  ? "border-primary/50 bg-primary/10"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20",
              )}
            >
              <div className="text-sm font-medium">{m.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{m.hint}</div>
            </button>
          ))}
        </div>

        {config.mode === "live2d" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">URL del modelo Live2D (.model3.json)</span>
            <Input
              value={config.modeloUrl ?? ""}
              onChange={(e) => patch({ modeloUrl: e.target.value })}
              placeholder="https://tu-servidor/modelo/modelo.model3.json"
              className="h-9 border-white/15 bg-black/30 text-white placeholder:text-white/30"
              spellCheck={false}
            />
            <span className="text-[10px] text-white/35">
              Tu modelo, tu servidor. Sin URL (o si falla la carga), el avatar cae al orbe animado sin romper nada.
            </span>
          </label>
        )}

        {config.mode !== "none" && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50 shrink-0">Tamaño</span>
              <input
                type="range"
                min={72}
                max={320}
                step={4}
                value={config.size}
                onChange={(e) => patch({ size: Number(e.target.value) })}
                className="w-full accent-primary cursor-pointer"
              />
              <span className="font-mono text-[10px] text-white/40 w-10 text-right">{config.size}px</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-white/50">Posición:</span>
              {(["inline", "floating"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => patch({ position: p })}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 cursor-pointer transition-colors",
                    config.position === p
                      ? "border-primary/50 bg-primary/10 text-white"
                      : "border-white/10 text-white/50 hover:border-white/20",
                  )}
                >
                  {p === "inline" ? "Junto al chat" : "Flotante"}
                </button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto gap-1 text-white/50"
                onClick={() => resetAvatarConfig()}
              >
                <RotateCcw className="h-3 w-3" /> Restaurar
              </Button>
            </div>

            <div className="flex justify-center pt-1">
              <AuroraAvatar forcePosition="inline" className="pointer-events-auto" />
            </div>
          </>
        )}

        <p className="text-[10px] text-white/35 leading-relaxed">
          Ajuste guardado solo en este dispositivo (no viaja con el sync de cuenta — es una preferencia de
          pantalla, no de identidad). Ver{" "}
          <Link href="/aurora" className="text-primary hover:underline">
            la sección completa de Aurora
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

export default AuroraAvatar;
