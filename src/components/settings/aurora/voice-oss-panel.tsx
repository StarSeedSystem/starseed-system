"use client";

/**
 * VoiceOssPanel — Ajustes → Experiencia (Aurora & Sentidos)
 * ============================================================================
 * Panel "Motor de voz de Aurora". Aurora puede hablar con distintos motores de
 * texto-a-voz, todos GRATIS:
 *
 *   · Navegador     → Web Speech API. Siempre disponible, cero descargas.
 *   · Kokoro (local)→ 82M, Apache-2.0. MEJOR español, corre 100% en el navegador
 *                     (WASM/WebGPU). Descarga ~80 MB la 1ª vez; luego offline.
 *   · Kitten (beta) → inglés, próximamente. Se muestra deshabilitado (honesto).
 *
 * La elección (motor + voz) se guarda en `starseed.aurora.voice.v1` y VIAJA con
 * la cuenta soberana (misma voz en cualquier dispositivo). El engine de Aurora
 * lee esta config y delega en el motor elegido de forma no invasiva; si algo
 * falla, cae a la voz del navegador sin que se note.
 *
 * Botón "Probar voz": sintetiza una frase con el motor/voz elegidos, mostrando
 * una barra de descarga la 1ª vez (Kokoro). Estilo Crystal Liquid Glass, en
 * coherencia con VisionPanel y el panel de reconocimiento de voz.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Volume2,
  Mic,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  WifiOff,
  Sparkles,
  Square,
  Play,
  Cpu,
  Languages,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  getVoiceConfig,
  setVoiceConfig,
  subscribeVoiceConfig,
  type AuroraVoiceEngine,
} from "@/lib/aurora/tts-oss/voice-config";
import {
  kokoroAvailable,
  kokoroModelReady,
  kokoroSpeak,
  stopKokoro,
  KOKORO_SPANISH_VOICES,
  KOKORO_DEFAULT_SPANISH_VOICE,
} from "@/lib/aurora/tts-oss/kokoro";
import { KITTEN_STATUS } from "@/lib/aurora/tts-oss/kitten";
import {
  OSS_TTS_VOICES,
  KOKORO_APPROX_SIZE,
  type OssTtsLoadProgress,
} from "@/lib/aurora/tts-oss";

/** Frase de prueba (español, para lucir el mejor acento de Kokoro). */
const SAMPLE_ES = "Hola, soy Aurora. Esta es mi voz local, gratuita y privada.";

type UiState = "idle" | "downloading" | "speaking" | "ready" | "error";

interface EngineOption {
  id: AuroraVoiceEngine;
  label: string;
  hint: string;
  disabled?: boolean;
}

export function VoiceOssPanel({ className }: { className?: string }) {
  const [engine, setEngine] = useState<AuroraVoiceEngine>("browser");
  const [voice, setVoice] = useState<string>(KOKORO_DEFAULT_SPANISH_VOICE);
  const [ui, setUi] = useState<UiState>("idle");
  const [progress, setProgress] = useState<OssTtsLoadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [kokoroOk, setKokoroOk] = useState<boolean>(false);
  const [modelReady, setModelReady] = useState<boolean>(false);

  const mountedRef = useRef(true);

  // Estado inicial + suscripción a la config (SSR-safe). También refleja cambios
  // que lleguen por sincronización de cuenta (otra pestaña / otro dispositivo).
  useEffect(() => {
    mountedRef.current = true;
    const sync = () => {
      const cfg = getVoiceConfig();
      setEngine(cfg.engine);
      setVoice(cfg.voice || KOKORO_DEFAULT_SPANISH_VOICE);
      setKokoroOk(kokoroAvailable());
      setModelReady(kokoroModelReady());
    };
    sync();
    const off = subscribeVoiceConfig(sync);
    return () => {
      mountedRef.current = false;
      off();
      try {
        stopKokoro();
      } catch {
        /* */
      }
    };
  }, []);

  const engineOptions: EngineOption[] = [
    { id: "browser", label: "Navegador", hint: "Siempre disponible · sin descargas" },
    {
      id: "kokoro",
      label: "Kokoro (local)",
      hint: kokoroOk
        ? `Mejor español · ${KOKORO_APPROX_SIZE} la 1ª vez`
        : "No soportado en este navegador",
      disabled: !kokoroOk,
    },
    {
      id: "kitten",
      label: "Kitten (beta)",
      hint: "Inglés · próximamente",
      disabled: true, // stub honesto: aún no activo
    },
  ];

  const onChooseEngine = useCallback((id: AuroraVoiceEngine, disabled?: boolean) => {
    if (disabled) return;
    setEngine(id);
    setErrorMsg("");
    setUi("idle");
    // Persiste el motor. Para Kokoro, arrastra la voz elegida.
    if (id === "kokoro") {
      setVoiceConfig({ engine: id, voice });
    } else {
      setVoiceConfig({ engine: id });
    }
  }, [voice]);

  const onChooseVoice = useCallback((id: string) => {
    setVoice(id);
    // Sólo tiene efecto real para Kokoro; se guarda igualmente.
    setVoiceConfig({ engine: "kokoro", voice: id });
    setEngine("kokoro");
  }, []);

  const handleTest = useCallback(async () => {
    setErrorMsg("");

    // Navegador: prueba con la Web Speech API (sin descargas).
    if (engine === "browser") {
      if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") {
        setErrorMsg("Este navegador no expone síntesis de voz.");
        setUi("error");
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(SAMPLE_ES);
        u.lang = "es-ES";
        const all = window.speechSynthesis.getVoices() || [];
        const v =
          all.find((x) => (x.lang || "").toLowerCase().startsWith("es")) || null;
        if (v) u.voice = v;
        setUi("speaking");
        u.onend = () => mountedRef.current && setUi("ready");
        u.onerror = () => mountedRef.current && setUi("ready");
        window.speechSynthesis.speak(u);
      } catch {
        setErrorMsg("No se pudo probar la voz del navegador.");
        setUi("error");
      }
      return;
    }

    // Kitten: honesto — aún no disponible.
    if (engine === "kitten") {
      setErrorMsg(KITTEN_STATUS.message);
      setUi("error");
      return;
    }

    // Kokoro: descarga (si hace falta) + sintetiza + reproduce.
    if (!kokoroAvailable()) {
      setErrorMsg("Kokoro no está soportado en este navegador.");
      setUi("error");
      return;
    }
    setUi(kokoroModelReady() ? "speaking" : "downloading");
    setProgress({ status: "loading", progress: 1, message: "Preparando la voz…" });
    const audio = await kokoroSpeak(SAMPLE_ES, {
      voice,
      autoDownload: true, // la prueba SÍ puede descargar (gesto explícito del usuario)
      onProgress: (p) => mountedRef.current && setProgress(p),
      onStart: () => mountedRef.current && setUi("speaking"),
      onEnd: () => {
        if (!mountedRef.current) return;
        setModelReady(kokoroModelReady());
        setUi("ready");
      },
      onError: (m) => {
        if (!mountedRef.current) return;
        setErrorMsg(m);
        setUi("error");
      },
    });
    if (!audio && mountedRef.current) {
      setModelReady(kokoroModelReady());
      // onError ya habrá puesto el mensaje; garantizamos un estado no colgado.
      setUi((prev) => (prev === "downloading" || prev === "speaking" ? "error" : prev));
    }
  }, [engine, voice]);

  const handleStop = useCallback(() => {
    try {
      if (typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined") {
        window.speechSynthesis.cancel();
      }
    } catch {
      /* */
    }
    try {
      stopKokoro();
    } catch {
      /* */
    }
    setUi("ready");
  }, []);

  const spanishVoices = KOKORO_SPANISH_VOICES;
  const otherVoices = OSS_TTS_VOICES.filter((v) => v.lang !== "es");
  const isBusy = ui === "downloading";
  const isSpeaking = ui === "speaking";

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4 backdrop-blur-xl",
        className,
      )}
    >
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-sky-300" />
            Motor de voz de Aurora
            <Badge
              variant="outline"
              className="text-sky-300 border-sky-300/40 text-[9px] uppercase tracking-wider"
            >
              gratis
            </Badge>
          </h3>
          <p className="text-[11px] leading-snug text-muted-foreground max-w-prose">
            Elige con qué voz habla Aurora.{" "}
            <b className="text-foreground/80">Kokoro</b> suena mucho mejor en
            español y corre 100% en tu dispositivo;{" "}
            <b className="text-foreground/80">Navegador</b> siempre está disponible.
            Tu elección viaja con tu cuenta StarSeed.
          </p>
        </div>
      </div>

      {/* Ventajas honestas */}
      <ul className="grid gap-1.5 sm:grid-cols-3 text-[11px] text-muted-foreground">
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <ShieldCheck className="w-3.5 h-3.5 text-sky-300 mt-0.5 shrink-0" />
          <span>
            <b className="text-foreground/80">Privado</b>: el texto no sale de tu
            equipo.
          </span>
        </li>
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <WifiOff className="w-3.5 h-3.5 text-sky-300 mt-0.5 shrink-0" />
          <span>
            Kokoro funciona <b className="text-foreground/80">sin conexión</b> tras
            la 1ª descarga.
          </span>
        </li>
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <Cpu className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
          <span>
            Kokoro descarga <b className="text-foreground/80">{KOKORO_APPROX_SIZE}</b>{" "}
            la 1ª vez.
          </span>
        </li>
      </ul>

      {/* Selector de motor */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-foreground/70 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-sky-300" /> Motor
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {engineOptions.map((opt) => {
            const active = engine === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={opt.disabled}
                onClick={() => onChooseEngine(opt.id, opt.disabled)}
                className={cn(
                  "text-left rounded-xl border p-3 transition-colors duration-200",
                  opt.disabled
                    ? "cursor-not-allowed border-white/5 bg-black/10 opacity-50"
                    : "cursor-pointer",
                  active
                    ? "border-sky-300/60 bg-sky-300/[0.08] ring-1 ring-sky-300/30"
                    : !opt.disabled && "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {opt.label}
                  </span>
                  {active && <CheckCircle2 className="w-3.5 h-3.5 text-sky-300" />}
                  {opt.id === "kitten" && (
                    <Badge
                      variant="outline"
                      className="text-amber-300 border-amber-300/40 text-[8px] uppercase tracking-wider"
                    >
                      beta
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-[10px] leading-snug text-muted-foreground">
                  {opt.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selector de voz (relevante para Kokoro) */}
      {engine === "kokoro" && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-foreground/70 flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5 text-sky-300" /> Voz
          </div>
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Español (recomendado)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {spanishVoices.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChooseVoice(v.id)}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-[11px] transition-colors duration-200",
                    voice === v.id
                      ? "border-sky-300/60 bg-sky-300/[0.12] text-foreground"
                      : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.06]",
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {otherVoices.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground pt-1">
                  Inglés
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {otherVoices.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => onChooseVoice(v.id)}
                      className={cn(
                        "cursor-pointer rounded-full border px-3 py-1 text-[11px] transition-colors duration-200",
                        voice === v.id
                          ? "border-sky-300/60 bg-sky-300/[0.12] text-foreground"
                          : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.06]",
                      )}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Barra de descarga (sólo Kokoro, 1ª vez) */}
      {engine === "kokoro" && (isBusy || (progress && progress.status === "loading")) && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Download className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            <span className="truncate">
              {progress?.message || "Descargando la voz…"}
            </span>
          </div>
          <Progress value={progress?.progress ?? 0} className="h-1.5" />
        </div>
      )}

      {/* Error honesto */}
      {ui === "error" && errorMsg && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-[11px] text-amber-200/90">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleTest}
          disabled={isBusy || isSpeaking}
          className="cursor-pointer gap-1.5"
        >
          {isBusy ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Descargando…
            </>
          ) : isSpeaking ? (
            <>
              <Volume2 className="w-3.5 h-3.5 animate-pulse" /> Sonando…
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" /> Probar voz
            </>
          )}
        </Button>

        {(isSpeaking || isBusy) && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleStop}
            className="cursor-pointer gap-1.5"
          >
            <Square className="w-3.5 h-3.5" /> Detener
          </Button>
        )}

        {engine === "kokoro" && modelReady && !isBusy && (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300/80">
            <CheckCircle2 className="w-3 h-3" /> Voz lista (offline)
          </span>
        )}
      </div>

      {/* Nota fina */}
      <p className="text-[10px] leading-snug text-muted-foreground/70 flex items-start gap-1.5">
        <Mic className="w-3 h-3 mt-0.5 shrink-0" />
        Si el motor local no está listo cuando Aurora habla, usa la voz del
        navegador automáticamente. Puedes cambiar de motor cuando quieras.
      </p>
    </div>
  );
}

export default VoiceOssPanel;
