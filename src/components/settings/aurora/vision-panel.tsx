"use client";

/**
 * VisionPanel — Ajustes → Experiencia (Aurora & Sentidos)
 * ============================================================================
 * Panel "Visión de Aurora (local)". Aurora puede VER imágenes, la pantalla o la
 * cámara 100% en tu dispositivo con SmolVLM2 (HuggingFace, Apache-2.0) vía
 * Transformers.js + WebGPU: gratis, privado, sin enviar nada a ningún servidor.
 *
 * Es HONESTO sobre el coste: la 1ª vez descarga el modelo (~250 MB el 256M) y
 * requiere WebGPU. Es opt-in: el toggle "permitir visión" se guarda en
 * localStorage ("starseed.aurora.vision.v1") junto al modelo elegido.
 *
 * Botones de prueba: "Ver mi pantalla", "Ver cámara" y subir una imagen →
 * muestran la descripción y una barra de progreso de la descarga la 1ª vez.
 *
 * Estilo Crystal Liquid Glass (mismo lenguaje visual que el panel de voz).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Eye,
  Camera,
  Monitor,
  Image as ImageIcon,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  WifiOff,
  Cpu,
  Sparkles,
  Upload,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  getVisionPrefs,
  setVisionPrefs,
  visionSenseAvailable,
  auroraSee,
} from "@/lib/aurora/senses/vision-sense";
import { VISION_MODELS, type VisionModelKey, type VisionProgress } from "@/ai/astraura/vision";

type UiState = "checking" | "unsupported" | "idle" | "busy" | "error";

export function VisionPanel({ className }: { className?: string }) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState<VisionModelKey>("256M");
  const [ui, setUi] = useState<UiState>("checking");
  const [progress, setProgress] = useState<VisionProgress | null>(null);
  const [busySource, setBusySource] = useState<null | "screen" | "camera" | "image">(null);
  const [description, setDescription] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);

  // Estado inicial (SSR-safe): disponibilidad + opt-in + modelo guardado.
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      const prefs = getVisionPrefs();
      if (!cancelled) {
        setEnabled(prefs.enabled);
        setModel(prefs.model);
      }
      const ok = await visionSenseAvailable();
      if (cancelled) return;
      setSupported(ok);
      setUi(ok ? "idle" : "unsupported");
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  const onToggleEnabled = useCallback((v: boolean) => {
    setEnabled(v);
    setVisionPrefs({ enabled: v });
  }, []);

  const onChooseModel = useCallback((m: VisionModelKey) => {
    setModel(m);
    setVisionPrefs({ model: m });
  }, []);

  // Ejecuta una prueba de visión (pantalla/cámara/imagen) y refleja el resultado.
  const runSee = useCallback(
    async (source: "screen" | "camera" | "image", payload?: string) => {
      if (busySource) return;
      setErrorMsg("");
      setDescription("");
      setBusySource(source);
      setUi("busy");
      setProgress(null);
      try {
        const desc = await auroraSee(source, payload as any, {
          model,
          prompt:
            source === "camera"
              ? "Describe lo que ves por la cámara, en español, con detalle."
              : source === "screen"
                ? "Describe lo que ves en la pantalla, en español, con detalle."
                : "Describe esta imagen con detalle, en español.",
          onProgress: (p) => { if (mountedRef.current) setProgress(p); },
        });
        if (!mountedRef.current) return;
        setDescription(desc);
        setUi("idle");
      } catch (e: any) {
        if (!mountedRef.current) return;
        setErrorMsg((e?.message ? String(e.message) : "").trim() || "No pude completar la visión.");
        setUi("error");
      } finally {
        if (mountedRef.current) {
          setBusySource(null);
          setProgress(null);
        }
      }
    },
    [busySource, model],
  );

  // Subir imagen → dataURL → describir. Muestra vista previa.
  const onPickFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      try {
        const fr = new FileReader();
        fr.onload = () => {
          const url = String(fr.result || "");
          setPreviewUrl(url);
          void runSee("image", url);
        };
        fr.onerror = () => setErrorMsg("No pude leer la imagen.");
        fr.readAsDataURL(file);
      } catch {
        setErrorMsg("No pude leer la imagen.");
      }
    },
    [runSee],
  );

  const spec = VISION_MODELS[model] ?? VISION_MODELS["256M"];
  const pct = progress?.progress ?? 0;
  const isBusy = ui === "busy" || !!busySource;

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4 backdrop-blur-xl",
        className,
      )}
    >
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-300" />
            Visión de Aurora
            <Badge
              variant="outline"
              className="text-emerald-300 border-emerald-300/40 text-[9px] uppercase tracking-wider"
            >
              local
            </Badge>
          </h3>
          <p className="text-[11px] leading-snug text-muted-foreground max-w-prose">
            Aurora puede ver <b className="text-foreground/80">imágenes</b>, tu{" "}
            <b className="text-foreground/80">pantalla</b> o tu{" "}
            <b className="text-foreground/80">cámara</b> 100% en tu dispositivo con
            SmolVLM2 (Apache-2.0) sobre WebGPU. Gratis, privado y sin enviar nada a
            ningún servidor. Solo dile “¿qué ves en mi pantalla?”.
          </p>
        </div>
        <StatusChip ui={ui} busy={isBusy} />
      </div>

      {/* Coste honesto */}
      <ul className="grid gap-1.5 sm:grid-cols-3 text-[11px] text-muted-foreground">
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <Download className="w-3.5 h-3.5 text-emerald-300 mt-0.5 shrink-0" />
          <span>
            Descarga <b className="text-foreground/80">{spec.approxSize}</b> la
            primera vez.
          </span>
        </li>
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <WifiOff className="w-3.5 h-3.5 text-emerald-300 mt-0.5 shrink-0" />
          <span>Después funciona <b className="text-foreground/80">sin conexión</b>.</span>
        </li>
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <Cpu className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
          <span>Requiere <b className="text-foreground/80">WebGPU</b> (Chrome/Edge de escritorio).</span>
        </li>
      </ul>

      {/* No soportado */}
      {ui === "unsupported" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-[11px] text-amber-200/90">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Este navegador no tiene WebGPU, así que la visión local no está
            disponible aquí. Prueba en Chrome o Edge de escritorio. El chat con
            Aurora sigue funcionando con normalidad.
          </span>
        </div>
      )}

      {/* Toggle "permitir visión" */}
      {ui !== "unsupported" && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Permitir que Aurora vea</p>
              <p className="text-[11px] text-muted-foreground">
                Cuando está activo, Aurora responde a “¿qué ves?” capturando la
                pantalla o la cámara (siempre te pide permiso al navegador).
              </p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={onToggleEnabled} />
        </div>
      )}

      {/* Selector de modelo */}
      {ui !== "unsupported" && (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Modelo
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(VISION_MODELS) as VisionModelKey[]).map((id) => {
              const m = VISION_MODELS[id];
              const active = model === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChooseModel(id)}
                  aria-pressed={active}
                  disabled={isBusy}
                  className={cn(
                    "text-left rounded-xl border p-3 transition-all cursor-pointer",
                    "bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-60 disabled:cursor-not-allowed",
                    active ? "border-emerald-400/60 ring-1 ring-emerald-400/30" : "border-white/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground">{m.label}</span>
                    <span className="text-[10px] text-muted-foreground">{m.approxSize}</span>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">{m.note}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Barra de progreso de descarga (1ª vez) */}
      {ui === "busy" && progress && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
              {progress.message || "Preparando el modelo de visión…"}
            </span>
            <span className="tabular-nums text-foreground/70">{pct}%</span>
          </div>
          <Progress
            value={pct}
            className="h-2 bg-white/10"
            indicatorClassName="bg-gradient-to-r from-emerald-400 to-cyan-400"
          />
        </div>
      )}

      {/* Botones de prueba */}
      {ui !== "unsupported" && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            onClick={() => runSee("screen")}
            disabled={isBusy}
            className="gap-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 border border-emerald-400/40"
          >
            {busySource === "screen" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Monitor className="w-4 h-4" />}
            Ver mi pantalla
          </Button>
          <Button
            onClick={() => runSee("camera")}
            disabled={isBusy}
            className="gap-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-100 border border-cyan-400/40"
          >
            {busySource === "camera" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            Ver cámara
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            variant="outline"
            className="gap-2 border-white/15 hover:bg-white/[0.06]"
          >
            {busySource === "image" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Subir imagen
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              onPickFile(f);
              // Permite volver a elegir el mismo archivo (resetea el input).
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* Error */}
      {ui === "error" && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-[11px] text-rose-200/90">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg || "No se pudo completar la visión. Inténtalo de nuevo."}</span>
        </div>
      )}

      {/* Vista previa de la imagen subida */}
      {previewUrl && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-2 max-w-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Imagen a analizar"
            className="rounded-lg max-h-48 w-auto mx-auto object-contain"
          />
        </div>
      )}

      {/* Descripción (resultado) */}
      {description && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-emerald-300/90">
            <ImageIcon className="w-3.5 h-3.5" /> Lo que ve Aurora
          </div>
          <p className="text-[13px] leading-relaxed text-foreground/90">{description}</p>
        </div>
      )}

      {/* Privacidad */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 pt-1 border-t border-white/5">
        <ShieldCheck className="w-3 h-3 text-emerald-300/70" />
        Todo ocurre en tu dispositivo. Las imágenes, tu pantalla y tu cámara no
        salen de este navegador.
      </div>
    </div>
  );
}

// ── Chip de estado (compacto, honesto) ───────────────────────────────────────

function StatusChip({ ui, busy }: { ui: UiState; busy: boolean }) {
  if (busy) {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-200 border border-emerald-400/40 text-[10px] gap-1">
        <Eye className="w-3 h-3" /> viendo
      </Badge>
    );
  }
  switch (ui) {
    case "checking":
      return (
        <Badge variant="outline" className="text-muted-foreground text-[10px] gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> comprobando
        </Badge>
      );
    case "unsupported":
      return (
        <Badge variant="outline" className="text-amber-300 border-amber-300/40 text-[10px] gap-1">
          <AlertTriangle className="w-3 h-3" /> no soportado
        </Badge>
      );
    case "error":
      return (
        <Badge variant="outline" className="text-rose-300 border-rose-300/40 text-[10px] gap-1">
          <AlertTriangle className="w-3 h-3" /> error
        </Badge>
      );
    case "idle":
    default:
      return (
        <Badge variant="outline" className="text-emerald-300 border-emerald-300/40 text-[10px] gap-1">
          <CheckCircle2 className="w-3 h-3" /> lista
        </Badge>
      );
  }
}

export default VisionPanel;
