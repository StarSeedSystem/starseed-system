"use client";

/**
 * AuroraVoiceFallbackPanel — Ajustes → (Aurora / Sentidos)
 * ============================================================================
 * Panel del "Reconocimiento de voz alternativo (open-source)". Para navegadores
 * SIN reconocimiento de voz nativo (Firefox, algunos WebView), donde la Web
 * Speech API no existe y Aurora queda en 'text-only'.
 *
 * Es HONESTO sobre el coste:
 *   · Descarga un modelo (~40-80 MB) la PRIMERA vez; luego funciona sin conexión.
 *   · Consume más batería/CPU que el motor nativo → por eso es opt-in explícito.
 *
 * Flujo:
 *   1) Selector de modelo (tiny/base).
 *   2) "Activar y descargar modelo" → loadModel(onProgress) con barra de progreso.
 *   3) "Escuchar (open-source)" → startOssStt + pipeOssSttToAurora (envía el texto
 *      final a Aurora por el puente global, sin tocar su motor).
 *
 * No se monta en el layout: es sólo el componente. Ver el reporte para dónde
 * montarlo (ajustes de Aurora / Sentidos). Estilo Crystal Liquid Glass.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Radio,
  Square,
  ShieldCheck,
  BatteryWarning,
  WifiOff,
  Languages,
  Volume2,
  Play,
  Speech,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  isOssSttSupported,
  loadModel,
  isModelReady,
  stopOssStt,
  pipeOssSttToAurora,
  isOssSttEnabled,
  setOssSttEnabled,
  getOssSttModel,
  setOssSttModel,
  getOssSttLang,
  setOssSttLang,
  subscribeOssStt,
  OSS_STT_MODELS,
  OSS_STT_LANGS,
  type OssSttModelId,
  type OssSttLang,
  type OssSttLoadProgress,
  type OssSttSession,
} from "@/lib/aurora/stt-oss";
import {
  isOssTtsSupported,
  loadTtsModel,
  isTtsModelReady,
  speakOss,
  stopOssTts,
  isOssTtsEnabled,
  setOssTtsEnabled,
  getOssTtsVoice,
  setOssTtsVoice,
  subscribeOssTts,
  OSS_TTS_VOICES,
  KOKORO_APPROX_SIZE,
  type OssTtsLoadProgress,
} from "@/lib/aurora/tts-oss";

type UiState = "checking" | "unsupported" | "idle" | "downloading" | "ready" | "error";

export function AuroraVoiceFallbackPanel({ className }: { className?: string }) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState<OssSttModelId>("tiny");
  const [lang, setLang] = useState<OssSttLang>("es");
  const [ui, setUi] = useState<UiState>("checking");
  const [progress, setProgress] = useState<OssSttLoadProgress | null>(null);
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const sessionRef = useRef<OssSttSession | null>(null);

  // Estado inicial + suscripción a cambios del opt-in/modelo/idioma (SSR-safe).
  useEffect(() => {
    const sync = () => {
      const ok = isOssSttSupported();
      setSupported(ok);
      setEnabled(isOssSttEnabled());
      setModel(getOssSttModel());
      setLang(getOssSttLang());
      if (!ok) {
        setUi("unsupported");
      } else {
        setUi((prev) =>
          prev === "downloading" || prev === "error"
            ? prev
            : isModelReady(getOssSttModel())
              ? "ready"
              : "idle",
        );
      }
    };
    sync();
    const off = subscribeOssStt(sync);
    return () => {
      off();
      // Al desmontar, detenemos cualquier captura activa (no dejamos el mic abierto).
      try {
        sessionRef.current?.stop();
      } catch {
        /* */
      }
      sessionRef.current = null;
    };
  }, []);

  const onChooseModel = useCallback((m: OssSttModelId) => {
    // Cambiar de modelo invalida el "listo" (habrá que descargar el nuevo).
    setModel(m);
    setOssSttModel(m);
    if (!isModelReady(m)) setUi(isOssSttSupported() ? "idle" : "unsupported");
  }, []);

  const onChooseLang = useCallback((l: OssSttLang) => {
    // Cambiar el idioma NO invalida el modelo (Whisper es multilingüe); sólo
    // ajusta la preferencia usada en la próxima transcripción.
    setLang(l);
    setOssSttLang(l);
  }, []);

  const handleActivate = useCallback(async () => {
    setErrorMsg("");
    setUi("downloading");
    setProgress({ status: "loading", progress: 1, message: "Preparando…" });
    const ok = await loadModel((p) => setProgress(p), getOssSttModel());
    if (ok) {
      setOssSttEnabled(true);
      setEnabled(true);
      setUi("ready");
    } else {
      setUi(isOssSttSupported() ? "error" : "unsupported");
      setErrorMsg(progress?.message || "No se pudo preparar el modelo.");
    }
    // `progress` se lee de forma diferida; el estado ya refleja el final.
  }, [progress?.message]);

  const handleListen = useCallback(async () => {
    setErrorMsg("");
    if (listening) {
      try {
        sessionRef.current?.stop();
      } catch {
        /* */
      }
      stopOssStt();
      sessionRef.current = null;
      setListening(false);
      return;
    }
    // Arranca captura + puente a Aurora. Reflejamos el texto final en la UI.
    const session = await pipeOssSttToAurora({
      onResult: (text) => setLastHeard(text),
      onInterim: () => {
        /* señal de energía; no mostramos texto parcial (Whisper no lo da) */
      },
      onError: (message) => {
        setErrorMsg(message);
        setListening(false);
      },
    });
    sessionRef.current = session;
    setListening(session.isActive());
    if (!session.isActive()) {
      // startOssStt devolvió una sesión "noop" (fallo temprano); ya hay onError.
    }
  }, [listening]);

  const handleDisable = useCallback(() => {
    try {
      sessionRef.current?.stop();
    } catch {
      /* */
    }
    stopOssStt();
    sessionRef.current = null;
    setListening(false);
    setOssSttEnabled(false);
    setEnabled(false);
  }, []);

  const spec = OSS_STT_MODELS[model] ?? OSS_STT_MODELS.tiny;
  const pct = progress?.progress ?? 0;

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4",
        "backdrop-blur-xl",
        className,
      )}
    >
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Mic className="w-4 h-4 text-cyan-300" />
            Reconocimiento de voz alternativo
            <Badge
              variant="outline"
              className="text-emerald-300 border-emerald-300/40 text-[9px] uppercase tracking-wider"
            >
              open-source
            </Badge>
          </h3>
          <p className="text-[11px] leading-snug text-muted-foreground max-w-prose">
            Para navegadores sin reconocimiento de voz nativo (Firefox, algunos
            WebView). Corre en tu dispositivo con un modelo Whisper; no envía tu
            voz a ningún servidor.
          </p>
        </div>
        <StatusChip ui={ui} listening={listening} />
      </div>

      {/* Coste honesto */}
      <ul className="grid gap-1.5 sm:grid-cols-3 text-[11px] text-muted-foreground">
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <Download className="w-3.5 h-3.5 text-cyan-300 mt-0.5 shrink-0" />
          <span>
            Descarga <b className="text-foreground/80">{spec.approxSize}</b> la
            primera vez.
          </span>
        </li>
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <WifiOff className="w-3.5 h-3.5 text-cyan-300 mt-0.5 shrink-0" />
          <span>Después funciona <b className="text-foreground/80">sin conexión</b>.</span>
        </li>
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <BatteryWarning className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
          <span>Consume <b className="text-foreground/80">más batería/CPU</b> que el nativo.</span>
        </li>
      </ul>

      {/* No soportado */}
      {ui === "unsupported" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-[11px] text-amber-200/90">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Este navegador no reúne los requisitos (WebAssembly y micrófono). El
            chat de texto con Aurora sigue disponible con normalidad.
          </span>
        </div>
      )}

      {/* Selector de modelo */}
      {ui !== "unsupported" && (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Modelo
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(OSS_STT_MODELS) as OssSttModelId[]).map((id) => {
              const m = OSS_STT_MODELS[id];
              const active = model === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChooseModel(id)}
                  aria-pressed={active}
                  disabled={ui === "downloading" || listening}
                  className={cn(
                    "text-left rounded-xl border p-3 transition-all cursor-pointer",
                    "bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-60 disabled:cursor-not-allowed",
                    active ? "border-cyan-400/60 ring-1 ring-cyan-400/30" : "border-white/10",
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

          {/* Selector de idioma (mejora la precisión frente a autodetección) */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              <Languages className="w-3.5 h-3.5 text-cyan-300" /> Idioma
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(OSS_STT_LANGS) as OssSttLang[]).map((id) => {
                const l = OSS_STT_LANGS[id];
                const active = lang === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChooseLang(id)}
                    aria-pressed={active}
                    disabled={listening}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] transition-all cursor-pointer",
                      "hover:bg-white/[0.06] disabled:opacity-60 disabled:cursor-not-allowed",
                      active
                        ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100 ring-1 ring-cyan-400/30"
                        : "border-white/10 text-muted-foreground",
                    )}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
            <p className="w-full text-[10.5px] leading-snug text-muted-foreground/80">
              Fijar el idioma mejora la precisión frente a “Automático”, sobre todo
              en frases cortas.
            </p>
          </div>
        </div>
      )}

      {/* Barra de progreso de descarga */}
      {ui === "downloading" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
              {progress?.message || "Descargando modelo…"}
            </span>
            <span className="tabular-nums text-foreground/70">{pct}%</span>
          </div>
          <Progress
            value={pct}
            className="h-2 bg-white/10"
            indicatorClassName="bg-gradient-to-r from-cyan-400 to-emerald-400"
          />
        </div>
      )}

      {/* Error */}
      {ui === "error" && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-[11px] text-rose-200/90">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg || "No se pudo preparar el modelo. Revisa tu conexión e inténtalo de nuevo."}</span>
        </div>
      )}

      {/* Acciones */}
      {ui !== "unsupported" && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {ui !== "ready" ? (
            <Button
              onClick={handleActivate}
              disabled={ui === "downloading"}
              className="gap-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-100 border border-cyan-400/40"
            >
              {ui === "downloading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {ui === "downloading" ? "Descargando…" : "Activar y descargar modelo"}
            </Button>
          ) : (
            <>
              <Button
                onClick={handleListen}
                className={cn(
                  "gap-2 border",
                  listening
                    ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-100 border-rose-400/40"
                    : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 border-emerald-400/40",
                )}
              >
                {listening ? (
                  <>
                    <Square className="w-4 h-4" /> Detener
                  </>
                ) : (
                  <>
                    <Radio className="w-4 h-4" /> Escuchar (open-source)
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={handleDisable}
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <MicOff className="w-4 h-4" /> Desactivar
              </Button>
            </>
          )}
          {enabled && ui === "ready" && (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-300/90">
              <CheckCircle2 className="w-3.5 h-3.5" /> Listo y activo
            </span>
          )}
        </div>
      )}

      {/* Estado de escucha / último texto oído */}
      {listening && (
        <div className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] p-3 text-[11px] text-cyan-100/90">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
          </span>
          Escuchando… habla y haz una pausa; transcribiré la frase y se la pasaré a
          Aurora.
        </div>
      )}
      {lastHeard && (
        <p className="text-[11px] text-muted-foreground">
          Última frase enviada a Aurora:{" "}
          <span className="text-foreground/80 italic">“{lastHeard}”</span>
        </p>
      )}

      {/* Privacidad */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 pt-1 border-t border-white/5">
        <ShieldCheck className="w-3 h-3 text-emerald-300/70" />
        El reconocimiento ocurre en tu dispositivo. Tu voz no sale de este
        navegador.
      </div>

      {/* ── Segunda sección: VOZ de Aurora (open-source / Kokoro) ─────────── */}
      <AuroraVoiceKokoroSection />
    </div>
  );
}

// ── Segunda sección: VOZ de Aurora open-source (Kokoro TTS) ───────────────────

type TtsUiState = "checking" | "unsupported" | "idle" | "downloading" | "ready" | "error";

/** Frase de demostración para el botón "Probar voz". */
const TTS_DEMO_TEXT =
  "Hola, soy Aurora. Esta es mi voz alternativa, generada en tu dispositivo.";

function AuroraVoiceKokoroSection() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [voice, setVoice] = useState<string>(OSS_TTS_VOICES[0]?.id ?? "");
  const [ui, setUi] = useState<TtsUiState>("checking");
  const [progress, setProgress] = useState<OssTtsLoadProgress | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Estado inicial + suscripción a cambios del opt-in/voz (SSR-safe).
  useEffect(() => {
    const sync = () => {
      const ok = isOssTtsSupported();
      setSupported(ok);
      setEnabled(isOssTtsEnabled());
      setVoice(getOssTtsVoice());
      if (!ok) {
        setUi("unsupported");
      } else {
        setUi((prev) =>
          prev === "downloading" || prev === "error"
            ? prev
            : isTtsModelReady()
              ? "ready"
              : "idle",
        );
      }
    };
    sync();
    const off = subscribeOssTts(sync);
    return () => {
      off();
      // Al desmontar, cortamos cualquier reproducción (no dejamos audio colgado).
      try {
        stopOssTts();
      } catch {
        /* */
      }
    };
  }, []);

  const onChooseVoice = useCallback((id: string) => {
    setVoice(id);
    setOssTtsVoice(id);
  }, []);

  const handleActivate = useCallback(async () => {
    setErrorMsg("");
    setUi("downloading");
    setProgress({ status: "loading", progress: 1, message: "Preparando la voz…" });
    const ok = await loadTtsModel((p) => setProgress(p));
    if (ok) {
      setOssTtsEnabled(true);
      setEnabled(true);
      setUi("ready");
    } else {
      setUi(isOssTtsSupported() ? "error" : "unsupported");
      setErrorMsg(progress?.message || "No se pudo preparar la voz.");
    }
  }, [progress?.message]);

  const handleTest = useCallback(async () => {
    setErrorMsg("");
    if (speaking) {
      try {
        stopOssTts();
      } catch {
        /* */
      }
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    await speakOss(TTS_DEMO_TEXT, {
      voice: getOssTtsVoice(),
      onEnd: () => setSpeaking(false),
      onError: (message) => {
        setErrorMsg(message);
        setSpeaking(false);
      },
    });
    // speakOss resuelve al terminar; onEnd ya puso speaking=false.
  }, [speaking]);

  const handleDisable = useCallback(() => {
    try {
      stopOssTts();
    } catch {
      /* */
    }
    setSpeaking(false);
    setOssTtsEnabled(false);
    setEnabled(false);
  }, []);

  const pct = progress?.progress ?? 0;

  return (
    <div className="pt-4 mt-2 border-t border-white/10 space-y-4">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Speech className="w-4 h-4 text-fuchsia-300" />
            Voz de Aurora
            <Badge
              variant="outline"
              className="text-fuchsia-300 border-fuchsia-300/40 text-[9px] uppercase tracking-wider"
            >
              open-source
            </Badge>
          </h3>
          <p className="text-[11px] leading-snug text-muted-foreground max-w-prose">
            Una voz más natural para Aurora con Kokoro TTS, generada en tu
            dispositivo. Es opcional: si no la activas, Aurora sigue hablando con
            la voz del navegador.
          </p>
        </div>
        <TtsStatusChip ui={ui} speaking={speaking} />
      </div>

      {/* Coste honesto */}
      <ul className="grid gap-1.5 sm:grid-cols-3 text-[11px] text-muted-foreground">
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <Download className="w-3.5 h-3.5 text-fuchsia-300 mt-0.5 shrink-0" />
          <span>
            Descarga <b className="text-foreground/80">{KOKORO_APPROX_SIZE}</b> la
            primera vez.
          </span>
        </li>
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <WifiOff className="w-3.5 h-3.5 text-fuchsia-300 mt-0.5 shrink-0" />
          <span>Después funciona <b className="text-foreground/80">sin conexión</b>.</span>
        </li>
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <BatteryWarning className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
          <span>Consume <b className="text-foreground/80">más batería/CPU</b> que la voz nativa.</span>
        </li>
      </ul>

      {/* No soportado */}
      {ui === "unsupported" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-[11px] text-amber-200/90">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Este navegador no reúne los requisitos (WebAssembly y audio). Aurora
            seguirá hablando con la voz del navegador.
          </span>
        </div>
      )}

      {/* Selector de voz */}
      {ui !== "unsupported" && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
            <Volume2 className="w-3.5 h-3.5 text-fuchsia-300" /> Voz
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {OSS_TTS_VOICES.map((v) => {
              const active = voice === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChooseVoice(v.id)}
                  aria-pressed={active}
                  disabled={ui === "downloading" || speaking}
                  className={cn(
                    "text-left rounded-xl border p-2.5 transition-all cursor-pointer",
                    "bg-white/[0.03] hover:bg-white/[0.06] disabled:opacity-60 disabled:cursor-not-allowed",
                    active
                      ? "border-fuchsia-400/60 ring-1 ring-fuchsia-400/30"
                      : "border-white/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{v.label}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {v.lang}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Barra de progreso de descarga */}
      {ui === "downloading" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-300" />
              {progress?.message || "Descargando la voz…"}
            </span>
            <span className="tabular-nums text-foreground/70">{pct}%</span>
          </div>
          <Progress
            value={pct}
            className="h-2 bg-white/10"
            indicatorClassName="bg-gradient-to-r from-fuchsia-400 to-cyan-400"
          />
        </div>
      )}

      {/* Error */}
      {ui === "error" && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-[11px] text-rose-200/90">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg || "No se pudo preparar la voz. Revisa tu conexión e inténtalo de nuevo. Aurora sigue con la voz del navegador."}</span>
        </div>
      )}

      {/* Acciones */}
      {ui !== "unsupported" && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {ui !== "ready" ? (
            <Button
              onClick={handleActivate}
              disabled={ui === "downloading"}
              className="gap-2 bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-100 border border-fuchsia-400/40"
            >
              {ui === "downloading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {ui === "downloading" ? "Descargando…" : "Activar y descargar voz"}
            </Button>
          ) : (
            <>
              <Button
                onClick={handleTest}
                className={cn(
                  "gap-2 border",
                  speaking
                    ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-100 border-rose-400/40"
                    : "bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-100 border-fuchsia-400/40",
                )}
              >
                {speaking ? (
                  <>
                    <Square className="w-4 h-4" /> Detener
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" /> Probar voz
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={handleDisable}
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <MicOff className="w-4 h-4" /> Desactivar
              </Button>
              {enabled && (
                <span className="flex items-center gap-1.5 text-[11px] text-fuchsia-300/90">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Voz activa
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* Nota honesta de uso */}
      {ui === "ready" && (
        <p className="text-[11px] leading-snug text-muted-foreground/85">
          Al activarla, Aurora usará esta voz cuando esté disponible. La primera
          frase puede tardar un instante en sintetizarse; luego es fluida.
        </p>
      )}

      {/* Privacidad */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 pt-1 border-t border-white/5">
        <ShieldCheck className="w-3 h-3 text-emerald-300/70" />
        La síntesis ocurre en tu dispositivo. El texto no sale de este navegador.
      </div>
    </div>
  );
}

function TtsStatusChip({ ui, speaking }: { ui: TtsUiState; speaking: boolean }) {
  if (speaking) {
    return (
      <Badge className="bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-400/40 text-[10px] gap-1">
        <Volume2 className="w-3 h-3" /> hablando
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
    case "downloading":
      return (
        <Badge variant="outline" className="text-fuchsia-300 border-fuchsia-300/40 text-[10px] gap-1">
          <Download className="w-3 h-3" /> descargando
        </Badge>
      );
    case "ready":
      return (
        <Badge variant="outline" className="text-fuchsia-300 border-fuchsia-300/40 text-[10px] gap-1">
          <CheckCircle2 className="w-3 h-3" /> lista
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
        <Badge variant="outline" className="text-muted-foreground text-[10px] gap-1">
          <MicOff className="w-3 h-3" /> inactiva
        </Badge>
      );
  }
}

// ── Chip de estado (compacto, honesto) ────────────────────────────────────────

function StatusChip({ ui, listening }: { ui: UiState; listening: boolean }) {
  if (listening) {
    return (
      <Badge className="bg-cyan-500/15 text-cyan-200 border border-cyan-400/40 text-[10px] gap-1">
        <Radio className="w-3 h-3" /> escuchando
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
    case "downloading":
      return (
        <Badge variant="outline" className="text-cyan-300 border-cyan-300/40 text-[10px] gap-1">
          <Download className="w-3 h-3" /> descargando
        </Badge>
      );
    case "ready":
      return (
        <Badge variant="outline" className="text-emerald-300 border-emerald-300/40 text-[10px] gap-1">
          <CheckCircle2 className="w-3 h-3" /> listo
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
        <Badge variant="outline" className="text-muted-foreground text-[10px] gap-1">
          <MicOff className="w-3 h-3" /> inactivo
        </Badge>
      );
  }
}

export default AuroraVoiceFallbackPanel;
