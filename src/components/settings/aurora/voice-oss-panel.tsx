"use client";

/**
 * VoiceOssPanel — Ajustes → Experiencia (Aurora & Sentidos)
 * ============================================================================
 * Panel "Motor de voz de Aurora". Aurora puede hablar con distintos motores de
 * texto-a-voz, todos GRATIS (Adenda voz de Aurora, jul-2026 · SOP §10):
 *
 *   · Navegador     → Web Speech API. Siempre disponible, cero descargas. La voz
 *                     por defecto es la MEJOR RANKEADA del dispositivo
 *                     (neurales/premium primero, es-* preferente) — "Automática".
 *   · Kokoro (local)→ 82M, Apache-2.0. MEJOR español, corre 100% en el navegador
 *                     (WASM/WebGPU). Descarga ~80 MB la 1ª vez; luego offline.
 *   · Kitten (beta) → inglés, próximamente. Se muestra deshabilitado (honesto).
 *   · Bark          → suno-ai/bark por ENDPOINT (servidor Python en una neurona
 *                     propia/CasaOS u hospedado). Generativo y expresivo.
 *   · GPT-SoVITS    → clonación few-shot por ENDPOINT (refAudio ~5 s + refText).
 *                     Simbiótico con Bark (puede clonar/refinar su referencia).
 *   · OmniVoice     → k2-fsa, voz neural multilingüe por ENDPOINT.
 *
 * TODO se guarda DENTRO de `starseed.aurora.voice.v1` (motor, voz, endpoints,
 * estilo emocional, voz del navegador, modo simbiótico) y VIAJA con la cuenta
 * soberana. El engine de Aurora delega en el motor elegido con la cadena de
 * fallback SIEMPRE-HABLA: motor elegido → Kokoro → mejor voz del navegador.
 *
 * ESTILO EMOCIONAL: sliders de velocidad/tono/energía + emoción por defecto.
 * Persisten vía `emitVoiceStyle` (mismo evento vivo 'starseed:aurora-voice-style'
 * que emiten Personalidades y la herramienta hablada `ajustar_voz`): la
 * siguiente frase de Aurora ya sale modulada, en cualquier motor.
 *
 * Botón "Probar voz": sintetiza una frase con el motor/voz elegidos, mostrando
 * una barra de descarga la 1ª vez (Kokoro) o llamando al endpoint (neurales).
 * Estilo Crystal Liquid Glass, en coherencia con VisionPanel y el panel de
 * reconocimiento de voz. SSR-safe y defensivo: nunca lanza.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Server,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Drama,
  Link2,
  Cloud,
  Zap,
  Waves,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LocalEngineInstaller } from "@/components/settings/aurora/local-engine-installer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  getVoiceConfig,
  setVoiceConfig,
  subscribeVoiceConfig,
  getEngineSettings,
  setEngineSettings,
  resetVoiceStyle,
  isNeuralEngine,
  NEURAL_VOICE_ENGINES,
  VOICE_PRESETS,
  AURORA_ORGANIC_PRESET_ID,
  applyVoicePreset,
  getOmniConfig,
  setOmniConfig,
  type AuroraVoiceEngine,
  type AuroraVoiceEmotion,
  type NeuralVoiceEngine,
  type NeuralEngineSettings,
  type AstrauraVoiceConfig,
} from "@/lib/aurora/tts-oss/voice-config";
import {
  synthesizeOmniVoiceHybrid,
  getOmniVoiceRouteState,
  refreshOmniRoute,
  type OmniRoute,
} from "@/lib/aurora/tts-oss/omnivoice-hybrid";
import {
  synthesizeOpenVoice2,
  getOpenVoice2State,
  OPENVOICE2_SPACE,
  type OpenVoice2State,
} from "@/lib/aurora/tts-oss/openvoice2";
import {
  VOICE_EMOTIONS,
  emitVoiceStyle,
  resolveVoiceParams,
} from "@/lib/aurora/tts-oss/voice-style";
import {
  NEURAL_ENGINE_META,
  pingNeuralEngine,
  neuralSpeak,
  stopNeural,
  normalizeEndpoint,
  type NeuralPingState,
} from "@/lib/aurora/tts-oss/neural-tts";
import {
  listBrowserVoices,
  rankBrowserVoices,
  resolveBrowserVoice,
} from "@/lib/aurora/tts-oss/browser-voices";
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

/** Frase de prueba (español, para lucir el mejor acento de cada motor). */
const SAMPLE_ES = "Hola, soy Aurora. Esta es mi voz local, gratuita y privada.";
/** Frase de prueba para motores por endpoint (un pelín más expresiva). */
const SAMPLE_NEURAL_ES =
  "¡Hola! Soy Aurora. Así suena mi voz neural, generada en tu propia neurona.";

type UiState = "idle" | "downloading" | "speaking" | "ready" | "error";
/** Estado de disponibilidad mostrado por motor de endpoint. */
type PingUi = NeuralPingState | "checking";

interface EngineOption {
  id: AuroraVoiceEngine;
  label: string;
  hint: string;
  disabled?: boolean;
  /** Punto de estado (solo motores por endpoint). */
  dot?: "ok" | "warn" | "bad" | "checking";
}

/** Máximo de voces del navegador listadas en el selector (mejores primero). */
const MAX_BROWSER_VOICES = 60;

export function VoiceOssPanel({ className }: { className?: string }) {
  const [engine, setEngine] = useState<AuroraVoiceEngine>("browser");
  const [voice, setVoice] = useState<string>(KOKORO_DEFAULT_SPANISH_VOICE);
  const [ui, setUi] = useState<UiState>("idle");
  const [progress, setProgress] = useState<OssTtsLoadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [kokoroOk, setKokoroOk] = useState<boolean>(false);
  const [modelReady, setModelReady] = useState<boolean>(false);

  // ── Voz del navegador (ranking + elección fija) ──
  const [browserVoiceURI, setBrowserVoiceURI] = useState<string>("");
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);

  // ── Motores por endpoint ──
  const [pings, setPings] = useState<Partial<Record<NeuralVoiceEngine, PingUi>>>({});
  const [symbiotic, setSymbiotic] = useState<boolean>(false);
  /** Borradores de campos por motor mientras se escriben (persisten al salir). */
  const [drafts, setDrafts] = useState<
    Partial<Record<NeuralVoiceEngine, Partial<NeuralEngineSettings>>>
  >({});

  // ── Estilo emocional (sliders + emoción por defecto) ──
  const [styleRate, setStyleRate] = useState<number>(1);
  const [stylePitch, setStylePitch] = useState<number>(1);
  const [styleEnergy, setStyleEnergy] = useState<number>(50);
  const [styleEmotion, setStyleEmotion] = useState<AuroraVoiceEmotion | undefined>(undefined);

  // ── OmniVoice híbrido (Adenda 77-voz): config de cuenta + estado de ruta ──
  const [omni, setOmni] = useState<AstrauraVoiceConfig>(() => getOmniConfig());
  const [omniRoute, setOmniRoute] = useState<OmniRoute>("off");
  const [omniTesting, setOmniTesting] = useState(false);
  const [omniStatus, setOmniStatus] = useState<string>("");

  // ── OpenVoice V2 (web, sin instalar): estado del Space + prueba honesta ──
  const [ov2State, setOv2State] = useState<OpenVoice2State>(() => {
    try {
      return getOpenVoice2State();
    } catch {
      return "dormido";
    }
  });
  const [ov2Testing, setOv2Testing] = useState(false);
  const [ov2Status, setOv2Status] = useState<string>("");
  const [ov2Buscando, setOv2Buscando] = useState(false);
  const [ov2Descubierto, setOv2Descubierto] = useState<string>("");

  const mountedRef = useRef(true);

  /**
   * BUSCAR ACTUALIZACIÓN (Adenda 79): fuerza el descubrimiento en Hugging Face
   * (Spaces con API OpenVoice gratis + versión del repo oficial de modelos) y
   * registra los recursos en Hugging Bay — la red de la Librería del OS — para
   * que aparezcan como candidatos versionados. La versión INSTALADA (daemon
   * nativo) se actualiza con su autosync inteligente de 7 días.
   */
  const buscarActualizacionOpenVoice = useCallback(async () => {
    if (ov2Buscando) return;
    setOv2Buscando(true);
    setOv2Descubierto("Buscando Spaces, modelos y datasets de OpenVoice en Hugging Face…");
    try {
      const disc = await import("@/lib/aurora/tts-oss/openvoice-discovery");
      const snap = await disc.discoverOpenVoiceEndpoints({ force: true });
      const info = disc.getOpenVoiceDiscoveryInfo();
      // Registro en la red de la Librería (Hugging Bay) — idempotente por id.
      try {
        const bay = await import("@/ai/astraura/installed-models");
        bay.registerHuggingBayCandidate({
          id: "openvoice-v2-modelos",
          name: "OpenVoice V2 · modelos oficiales",
          repo: disc.OPENVOICE_MODEL_REPO,
          tool: "openvoice",
          command: `huggingface-cli download ${disc.OPENVOICE_MODEL_REPO}`,
        });
        for (const ep of snap.endpoints) {
          bay.registerHuggingBayCandidate({
            id: `openvoice-space-${ep.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
            name: `OpenVoice · API web gratis (${ep.kind === "v2-design" ? "V2" : "V1 emociones"})`,
            repo: ep.id,
            tool: "space",
            command: ep.base,
          });
        }
      } catch {
        /* la Librería no está disponible aquí: el descubrimiento sigue valiendo */
      }
      const fecha = snap.modelUpdatedAt ? new Date(snap.modelUpdatedAt).toLocaleDateString() : "—";
      setOv2Descubierto(
        `${snap.endpoints.length} endpoints (${info.healthy} sanos) · modelos ${disc.OPENVOICE_MODEL_REPO}` +
          (snap.modelSha ? ` @ ${snap.modelSha.slice(0, 7)} (${fecha})` : ""),
      );
      setOv2State(getOpenVoice2State());
    } catch {
      setOv2Descubierto("No se pudo completar la búsqueda ahora mismo (la caché anterior sigue activa).");
    } finally {
      setOv2Buscando(false);
    }
  }, [ov2Buscando]);

  const probarOpenVoice2 = useCallback(async () => {
    if (ov2Testing) return;
    setOv2Testing(true);
    setOv2Status("Despertando OpenVoice V2 en la web…");
    try {
      const blob = await synthesizeOpenVoice2(
        "Hola, soy Aurora. Esta es mi voz OpenVoice versión dos, en la web y sin instalar nada.",
        { lang: "es", personalityId: "preset-aurora", onStatus: (m) => setOv2Status(m) },
      );
      const st = getOpenVoice2State();
      setOv2State(st);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          try { URL.revokeObjectURL(url); } catch { /* */ }
        };
        await audio.play().catch(() => {});
        setOv2Status("Sonando desde la nube gratis (OpenVoice V2).");
      } else {
        setOv2Status(
          st === "fuera"
            ? "El Space de OpenVoice V2 no responde ahora mismo; Aurora usa el respaldo (la cadena sigue)."
            : "OpenVoice V2 está despertando o sin semilla; Aurora usa el respaldo mientras tanto.",
        );
      }
    } catch {
      setOv2Status("No se pudo probar OpenVoice V2.");
    } finally {
      setOv2Testing(false);
    }
  }, [ov2Testing]);

  // Refresca la RUTA de OmniVoice (local ↔ nube) al montar y tras probar.
  useEffect(() => {
    let alive = true;
    void refreshOmniRoute().then((r) => {
      if (alive) setOmniRoute(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const patchOmni = useCallback((patch: Partial<AstrauraVoiceConfig>) => {
    setOmni((prev) => {
      const next = { ...prev, ...patch } as AstrauraVoiceConfig;
      setOmniConfig(patch);
      return next;
    });
  }, []);
  const patchOmniPlayback = useCallback(
    (patch: Partial<AstrauraVoiceConfig["playback_parameters"]>) => {
      setOmni((prev) => {
        const playback = { ...prev.playback_parameters, ...patch };
        setOmniConfig({ playback_parameters: playback });
        return { ...prev, playback_parameters: playback };
      });
    },
    [],
  );

  const probarOmni = useCallback(async () => {
    if (omniTesting) return;
    setOmniTesting(true);
    setOmniStatus("Preparando la voz…");
    try {
      const blob = await synthesizeOmniVoiceHybrid(
        "Hola, soy Aurora. Esta es mi voz OmniVoice, gratuita e híbrida.",
        { onStatus: (m) => setOmniStatus(m) },
      );
      const route = getOmniVoiceRouteState();
      setOmniRoute(route);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          try { URL.revokeObjectURL(url); } catch { /* */ }
        };
        await audio.play().catch(() => {});
        setOmniStatus(route === "local" ? "Voz local activa ⚡" : "Sonando desde la nube gratis");
      } else {
        setOmniStatus("OmniVoice no respondió; Aurora usará el respaldo del navegador.");
      }
    } catch {
      setOmniStatus("No se pudo probar OmniVoice.");
    } finally {
      setOmniTesting(false);
    }
  }, [omniTesting]);

  // Estado inicial + suscripción a la config (SSR-safe). También refleja cambios
  // que lleguen por sincronización de cuenta (otra pestaña / otro dispositivo),
  // por la herramienta hablada `ajustar_voz` o por el evento de Personalidades.
  useEffect(() => {
    mountedRef.current = true;
    const sync = () => {
      const cfg = getVoiceConfig();
      setEngine(cfg.engine);
      setVoice(cfg.voice || KOKORO_DEFAULT_SPANISH_VOICE);
      setKokoroOk(kokoroAvailable());
      setModelReady(kokoroModelReady());
      setBrowserVoiceURI(cfg.browserVoiceURI || "");
      setSymbiotic(cfg.symbiotic === true);
      try {
        const p = resolveVoiceParams();
        setStyleRate(p.rate);
        setStylePitch(p.pitch);
        setStyleEnergy(p.energy);
        setStyleEmotion(p.emotion);
      } catch {
        /* estilo no disponible → neutro */
      }
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
      try {
        stopNeural();
      } catch {
        /* */
      }
    };
  }, []);

  // Voces del navegador: lista inicial + evento `voiceschanged` (Chrome las
  // carga async). Nunca lanza.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return;
    const load = () => {
      try {
        setBrowserVoices(listBrowserVoices());
      } catch {
        /* */
      }
    };
    load();
    try {
      window.speechSynthesis.addEventListener("voiceschanged", load);
    } catch {
      /* */
    }
    return () => {
      try {
        window.speechSynthesis.removeEventListener("voiceschanged", load);
      } catch {
        /* */
      }
    };
  }, []);

  // Ping de disponibilidad de UN motor por endpoint (caché 60 s en neural-tts).
  const refreshPing = useCallback(async (id: NeuralVoiceEngine, force = false) => {
    const s = getEngineSettings(id);
    if (!normalizeEndpoint(s.endpoint)) {
      setPings((prev) => ({ ...prev, [id]: "no-endpoint" }));
      return;
    }
    setPings((prev) => ({ ...prev, [id]: "checking" }));
    const state = await pingNeuralEngine(id, { force }).catch(
      (): NeuralPingState => "unreachable",
    );
    if (mountedRef.current) setPings((prev) => ({ ...prev, [id]: state }));
  }, []);

  // Al montar (y cuando cambia el motor activo): comprueba los endpoints
  // configurados para pintar el estado en las tarjetas. Barato (caché 60 s).
  useEffect(() => {
    for (const id of NEURAL_VOICE_ENGINES) void refreshPing(id);
    // `engine` en deps: al volver a este panel tras elegir motor, re-pinta.
  }, [engine, refreshPing]);

  // ── Opciones del selector de motor (con estado de disponibilidad) ──
  const engineOptions: EngineOption[] = [
    {
      id: "browser",
      label: "Navegador",
      hint: "Siempre disponible · mejor voz rankeada automática",
    },
    {
      id: "kokoro",
      label: "Kokoro (local)",
      hint: kokoroOk
        ? modelReady
          ? "Mejor español · voz lista (offline)"
          : `Mejor español · ${KOKORO_APPROX_SIZE} la 1ª vez`
        : "No soportado en este navegador",
      disabled: !kokoroOk,
    },
    {
      id: "kitten",
      label: "Kitten (beta)",
      hint: "Inglés · próximamente",
      disabled: true, // stub honesto: aún no activo
    },
    ...NEURAL_VOICE_ENGINES.map((id): EngineOption => {
      const ping = pings[id];
      const meta = NEURAL_ENGINE_META[id];
      let hint = meta.hint;
      let dot: EngineOption["dot"];
      // OpenVoice V2 (web, sin instalar): no es un endpoint. Su estado viene del
      // cliente ('listo' | 'dormido' | 'fuera'), no de un ping a un servidor.
      if (id === "openvoice2") {
        hint =
          ov2State === "listo"
            ? "Web · lista, sin instalar nada"
            : ov2State === "fuera"
              ? "Web · el Space no responde ahora · hablará el respaldo"
              : "Web · sin instalar (semilla de identidad sintética)";
        dot = ov2State === "listo" ? "ok" : ov2State === "fuera" ? "bad" : "warn";
        return { id, label: meta.label, hint, dot };
      }
      if (ping === "ok") {
        hint = "Endpoint conectado · " + meta.hint;
        dot = "ok";
      } else if (ping === "unreachable") {
        hint = "El endpoint no responde · hablará el respaldo";
        dot = "bad";
      } else if (ping === "checking") {
        hint = "Comprobando endpoint…";
        dot = "checking";
      } else {
        hint = "Servidor Python · sin endpoint aún";
        dot = "warn";
      }
      return { id, label: meta.label, hint, dot };
    }),
  ];

  const onChooseEngine = useCallback(
    (id: AuroraVoiceEngine, disabled?: boolean) => {
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
      if (isNeuralEngine(id)) void refreshPing(id);
    },
    [voice, refreshPing],
  );

  const onChooseVoice = useCallback((id: string) => {
    setVoice(id);
    // Sólo tiene efecto real para Kokoro; se guarda igualmente.
    setVoiceConfig({ engine: "kokoro", voice: id });
    setEngine("kokoro");
  }, []);

  // ── Campos de los motores por endpoint (borrador → persistir al salir) ──

  /** Valor visible de un campo: borrador si se está escribiendo, si no el guardado. */
  const fieldValue = useCallback(
    (id: NeuralVoiceEngine, key: keyof NeuralEngineSettings): string => {
      const draft = drafts[id]?.[key];
      if (typeof draft === "string") return draft;
      const saved = getEngineSettings(id)[key];
      return typeof saved === "string" ? saved : "";
    },
    [drafts],
  );

  const onFieldChange = useCallback(
    (id: NeuralVoiceEngine, key: keyof NeuralEngineSettings, value: string) => {
      setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: value } }));
    },
    [],
  );

  /** Persiste el campo en la clave unificada y limpia el borrador. */
  const onFieldCommit = useCallback(
    (id: NeuralVoiceEngine, key: keyof NeuralEngineSettings) => {
      const draft = drafts[id]?.[key];
      if (typeof draft !== "string") return;
      try {
        // "" borra el campo (el saneado de voice-config lo descarta).
        setEngineSettings(id, { [key]: draft.trim() } as Partial<NeuralEngineSettings>);
      } catch {
        /* */
      }
      setDrafts((prev) => {
        const mine = { ...(prev[id] ?? {}) };
        delete mine[key];
        return { ...prev, [id]: mine };
      });
      if (key === "endpoint") void refreshPing(id, true);
    },
    [drafts, refreshPing],
  );

  // ── Estilo emocional ──

  const commitStyle = useCallback((patch: { rate?: number; pitch?: number; energy?: number; emotion?: AuroraVoiceEmotion }) => {
    try {
      // Persiste en `starseed.aurora.voice.v1` Y dispara el evento vivo: la
      // siguiente frase de Aurora ya sale modulada (cualquier motor).
      emitVoiceStyle(patch);
    } catch {
      /* */
    }
  }, []);

  const onResetStyle = useCallback(() => {
    try {
      resetVoiceStyle();
    } catch {
      /* */
    }
  }, []);

  // ── Probar / detener ──

  const handleTest = useCallback(async () => {
    setErrorMsg("");

    // Navegador: prueba con la Web Speech API (sin descargas), usando la voz
    // elegida o la MEJOR RANKEADA (automática) + el estilo emocional vivo.
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
        const v = resolveBrowserVoice(browserVoiceURI || undefined, browserVoices, "es");
        if (v) u.voice = v;
        try {
          const p = resolveVoiceParams();
          u.rate = p.rate;
          u.pitch = p.pitch;
          u.volume = p.volume;
        } catch {
          /* estilo no disponible → entrega neutra */
        }
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

    // Motores por ENDPOINT (Bark · GPT-SoVITS · OmniVoice): frase de muestra
    // contra el servidor configurado. El estilo emocional viaja solo
    // (neural-tts lo resuelve: etiquetas Bark / passthrough SoVITS-Omni).
    if (isNeuralEngine(engine)) {
      const s = getEngineSettings(engine);
      if (!normalizeEndpoint(s.endpoint)) {
        setErrorMsg(
          `${NEURAL_ENGINE_META[engine].label} necesita un endpoint. Instala su servidor en una neurona propia o CasaOS (Cerebro → Neuronas) y pega aquí su URL.`,
        );
        setUi("error");
        return;
      }
      setUi("speaking");
      const audio = await neuralSpeak(engine, SAMPLE_NEURAL_ES, {
        onStart: () => mountedRef.current && setUi("speaking"),
        onEnd: () => mountedRef.current && setUi("ready"),
        onError: (m) => {
          if (!mountedRef.current) return;
          setErrorMsg(m);
        },
      });
      if (mountedRef.current) {
        void refreshPing(engine, true);
        if (!audio) setUi("error");
      }
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
  }, [engine, voice, browserVoiceURI, browserVoices, refreshPing]);

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
    try {
      stopNeural();
    } catch {
      /* */
    }
    setUi("ready");
  }, []);

  // ── Derivados ──

  const spanishVoices = KOKORO_SPANISH_VOICES;
  const otherVoices = OSS_TTS_VOICES.filter((v) => v.lang !== "es");
  const isBusy = ui === "downloading";
  const isSpeaking = ui === "speaking";

  /** Ranking de voces del navegador (mejores primero), limitado para el select. */
  const rankedBrowserVoices = useMemo(
    () => rankBrowserVoices(browserVoices, "es").slice(0, MAX_BROWSER_VOICES),
    [browserVoices],
  );
  /** La voz que sonaría AHORA con la elección actual (fijada o automática). */
  const effectiveBrowserVoice = useMemo(
    () => resolveBrowserVoice(browserVoiceURI || undefined, browserVoices, "es"),
    [browserVoiceURI, browserVoices],
  );

  const neuralSelected = isNeuralEngine(engine) ? engine : null;
  const barkConfigured = !!normalizeEndpoint(getEngineSettings("bark").endpoint);
  const sovitsConfigured = !!normalizeEndpoint(getEngineSettings("gpt-sovits").endpoint);

  const pingBadge = (state: PingUi | undefined) => {
    if (state === "ok")
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300/90">
          <CheckCircle2 className="w-3 h-3" /> Disponible
        </span>
      );
    if (state === "unreachable")
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-red-300/90">
          <AlertTriangle className="w-3 h-3" /> No responde
        </span>
      );
    if (state === "checking")
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Comprobando…
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-300/90">
        <Server className="w-3 h-3" /> Sin endpoint
      </span>
    );
  };

  const DOT_CLASS: Record<NonNullable<EngineOption["dot"]>, string> = {
    ok: "bg-emerald-400",
    warn: "bg-amber-300",
    bad: "bg-red-400",
    checking: "bg-sky-300 animate-pulse",
  };

  const inputClass =
    "h-8 rounded-lg border-white/10 bg-black/25 px-2.5 text-[11px] placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-sky-300/40 focus-visible:ring-offset-0";

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
            Elige con qué voz habla Aurora. Sin configurar nada, usa la{" "}
            <b className="text-foreground/80">mejor voz natural</b> de tu navegador
            (automática). <b className="text-foreground/80">Kokoro</b> corre 100% en
            tu dispositivo; <b className="text-foreground/80">Bark</b>,{" "}
            <b className="text-foreground/80">GPT-SoVITS</b> y{" "}
            <b className="text-foreground/80">OmniVoice</b> se conectan por endpoint
            desde una neurona propia. Si un motor falla, Aurora sigue hablando por
            la cadena de respaldo. Tu elección viaja con tu cuenta StarSeed.
          </p>
        </div>
      </div>

      {/* Ventajas honestas */}
      <ul className="grid gap-1.5 sm:grid-cols-3 text-[11px] text-muted-foreground">
        <li className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-black/20 p-2">
          <ShieldCheck className="w-3.5 h-3.5 text-sky-300 mt-0.5 shrink-0" />
          <span>
            <b className="text-foreground/80">Privado</b>: navegador y Kokoro no
            sacan el texto de tu equipo; los endpoints son{" "}
            <b className="text-foreground/80">tuyos</b>.
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

      {/* ── OmniVoice · voz por defecto (motor híbrido · CERO config) ───────── */}
      <div className="rounded-xl border border-[#7fb8ff]/25 bg-[#7fb8ff]/[0.05] p-3 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Waves className="w-4 h-4 text-[#7fb8ff]" />
          <span className="text-sm font-medium text-foreground/90">OmniVoice</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
            voz por defecto · nube gratis o local
          </span>
          {/* Chip de RUTA (Adenda 77-voz · getOmniVoiceRouteState) */}
          {omniRoute === "local" ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
              <Zap className="w-3 h-3" /> Voz local activa
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300">
              <Cloud className="w-3 h-3" /> Voz en la nube
            </span>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground leading-snug">
          Aurora ya habla con OmniVoice sin configurar nada: usa la nube gratis y,
          si instalas el <span className="text-foreground/80">motor local</span>,
          salta solo a él (más rápido y 100% privado).
        </p>

        <LocalEngineInstaller installed={omniRoute === "local"} />

        {/* Privacidad + reproducción (config de CUENTA; el diseño va por personalidad) */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Privacidad</span>
            <select
              className="h-8 rounded-lg border border-white/10 bg-white/[0.05] px-2 text-xs text-foreground/90"
              value={omni.privacy_mode}
              onChange={(e) => patchOmni({ privacy_mode: e.target.value as AstrauraVoiceConfig["privacy_mode"] })}
            >
              <option value="hybrid_allow_cloud">Híbrido (local o nube)</option>
              <option value="local_only">Solo local</option>
              <option value="cloud_only">Solo nube</option>
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Velocidad · {omni.playback_parameters.speed.toFixed(2)}
            </span>
            <Slider
              value={[omni.playback_parameters.speed]}
              min={0.5}
              max={1.5}
              step={0.05}
              onValueChange={(vals) => patchOmniPlayback({ speed: vals[0] ?? omni.playback_parameters.speed })}
              aria-label="Velocidad OmniVoice"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-[11px] text-foreground/75 cursor-pointer">
            <input
              type="checkbox"
              className="accent-[#7fb8ff]"
              checked={omni.playback_parameters.normalize_text !== false}
              onChange={(e) => patchOmniPlayback({ normalize_text: e.target.checked })}
            />
            Normalizar texto
          </label>
          <label className="flex items-center gap-2 text-[11px] text-foreground/75 cursor-pointer">
            <input
              type="checkbox"
              className="accent-[#7fb8ff]"
              checked={omni.playback_parameters.allow_non_verbal_symbols !== false}
              onChange={(e) => patchOmniPlayback({ allow_non_verbal_symbols: e.target.checked })}
            />
            Símbolos no verbales
          </label>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={omniTesting} onClick={probarOmni}>
            {omniTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Probar OmniVoice
          </Button>
          <span className="text-[11px] text-muted-foreground">
            El diseño de voz (género, edad, tono…) se ajusta por personalidad.
          </span>
        </div>
        {omniStatus && <p className="text-[11px] text-foreground/60">{omniStatus}</p>}
      </div>

      {/* ── OpenVoice V2 · voz de nube (web, sin instalar · Adenda V2-VOZ) ────── */}
      <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-sky-300" />
          <span className="text-sm font-medium text-foreground/90">OpenVoice V2 (web)</span>
          {/* Chip de estado honesto del Space */}
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
              ov2State === "listo"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : ov2State === "fuera"
                  ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                  : "border-sky-400/30 bg-sky-500/10 text-sky-200",
            )}
          >
            {ov2State === "listo" ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : ov2State === "fuera" ? (
              <WifiOff className="w-3 h-3" />
            ) : (
              <Waves className="w-3 h-3" />
            )}
            {ov2State === "listo" ? "Lista" : ov2State === "fuera" ? "Fuera de servicio" : "Dormida"}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Voz de nube gratis, sin instalar nada. Clona el <b className="text-foreground/80">timbre</b>{" "}
          desde una semilla de identidad sintética (inspirada en el arquetipo del personaje, nunca
          audio real) o desde tu propio audio. Va justo detrás de OmniVoice: si el Space duerme o
          falla, la cadena sigue y Aurora nunca calla.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5"
            onClick={probarOpenVoice2}
            disabled={ov2Testing}
          >
            {ov2Testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Probar OpenVoice V2
          </Button>
          {ov2Testing && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-sky-200">
              <span className="ssvp-mini-eq" aria-hidden>
                <i /><i /><i />
              </span>
              procesando…
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 cursor-pointer text-[11px]"
            disabled={ov2Buscando}
            onClick={buscarActualizacionOpenVoice}
          >
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", ov2Buscando && "animate-spin")} />
            Buscar actualización
          </Button>
          <a
            href={OPENVOICE2_SPACE}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-sky-300/80 hover:text-sky-200 underline underline-offset-2"
          >
            Ver el Space
          </a>
        </div>
        {ov2Status && <p className="text-[11px] text-foreground/60">{ov2Status}</p>}
        {ov2Descubierto && (
          <p className="text-[11px] text-foreground/50">
            {ov2Descubierto}
            <span className="ml-1 text-foreground/35">
              · la versión instalada (daemon nativo) se actualiza sola cada 7 días con la red de la Librería
            </span>
          </p>
        )}
        <style jsx>{`
          .ssvp-mini-eq {
            display: inline-flex;
            align-items: center;
            gap: 2px;
            height: 12px;
          }
          .ssvp-mini-eq i {
            width: 2.5px;
            height: 40%;
            border-radius: 2px;
            background: linear-gradient(180deg, rgba(150, 220, 255, 0.95), rgba(0, 127, 255, 0.85));
            animation: ssvp-mini 0.9s ease-in-out infinite;
          }
          .ssvp-mini-eq i:nth-child(2) {
            animation-delay: 0.15s;
          }
          .ssvp-mini-eq i:nth-child(3) {
            animation-delay: 0.3s;
          }
          @keyframes ssvp-mini {
            0%,
            100% {
              height: 30%;
              opacity: 0.7;
            }
            50% {
              height: 100%;
              opacity: 1;
            }
          }
        `}</style>
      </div>

      {/* Selector de motor (con estado de disponibilidad) */}
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
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    {opt.dot && (
                      <span
                        aria-hidden
                        className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", DOT_CLASS[opt.dot])}
                      />
                    )}
                    {opt.label}
                  </span>
                  {active && <CheckCircle2 className="w-3.5 h-3.5 text-sky-300 shrink-0" />}
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
        <p className="text-[10px] leading-snug text-muted-foreground/70">
          Bark, GPT-SoVITS y OmniVoice son servidores Python gratuitos: instálalos
          en una <b className="text-foreground/70">neurona propia o CasaOS</b>{" "}
          (Cerebro → Neuronas) y conecta aquí su endpoint.
        </p>
      </div>

      {/* Voz del navegador: Automática (recomendada) o una fija del dispositivo */}
      {engine === "browser" && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-foreground/70 flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5 text-sky-300" /> Voz del navegador
          </div>
          <select
            value={browserVoiceURI}
            onChange={(e) => {
              const uri = e.target.value;
              setBrowserVoiceURI(uri);
              setVoiceConfig({ browserVoiceURI: uri || undefined });
            }}
            className="w-full cursor-pointer rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-sky-300/40"
          >
            <option value="">Automática (recomendada) — la mejor voz natural</option>
            {rankedBrowserVoices.map((r) => (
              <option key={r.voice.voiceURI} value={r.voice.voiceURI}>
                {r.voice.name} ({r.voice.lang})
                {r.reasons.length ? ` · ${r.reasons.slice(0, 2).join(" · ")}` : ""}
              </option>
            ))}
          </select>
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            {effectiveBrowserVoice
              ? `Ahora mismo sonará: ${effectiveBrowserVoice.name} (${effectiveBrowserVoice.lang}).`
              : "Este dispositivo aún no expone voces (se usará la del sistema)."}{" "}
            El ranking automático prefiere voces neurales/premium en español.
          </p>
        </div>
      )}

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

      {/* Motor por ENDPOINT seleccionado: conexión + voz/preset + clonación */}
      {neuralSelected && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-black/15 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-foreground/70 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-sky-300" />
              {NEURAL_ENGINE_META[neuralSelected].label} — conexión
            </div>
            <div className="flex items-center gap-2">
              {pingBadge(pings[neuralSelected])}
              <button
                type="button"
                title="Volver a comprobar el endpoint"
                aria-label="Volver a comprobar el endpoint"
                onClick={() => void refreshPing(neuralSelected, true)}
                className="grid size-6 place-items-center rounded-lg text-muted-foreground/70 transition-colors duration-200 hover:bg-white/10 hover:text-foreground cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Endpoint (neurona / CasaOS u hospedado)
              </label>
              <Input
                value={fieldValue(neuralSelected, "endpoint")}
                onChange={(e) => onFieldChange(neuralSelected, "endpoint", e.target.value)}
                onBlur={() => onFieldCommit(neuralSelected, "endpoint")}
                placeholder="http://192.168.1.40:8880"
                className={inputClass}
                spellCheck={false}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Voz / preset (opcional)
              </label>
              <Input
                value={fieldValue(neuralSelected, "voice")}
                onChange={(e) => onFieldChange(neuralSelected, "voice", e.target.value)}
                onBlur={() => onFieldCommit(neuralSelected, "voice")}
                placeholder={NEURAL_ENGINE_META[neuralSelected].voicePlaceholder}
                className={inputClass}
                spellCheck={false}
              />
            </div>
          </div>

          {/* Clonación few-shot (solo GPT-SoVITS): referencia ~5 s + transcripción */}
          {neuralSelected === "gpt-sovits" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Audio de referencia (~5 s, URL o ruta del servidor)
                </label>
                <Input
                  value={fieldValue("gpt-sovits", "refAudio")}
                  onChange={(e) => onFieldChange("gpt-sovits", "refAudio", e.target.value)}
                  onBlur={() => onFieldCommit("gpt-sovits", "refAudio")}
                  placeholder="refs/aurora.wav (puede ser una muestra de Bark)"
                  className={inputClass}
                  spellCheck={false}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Texto de la referencia (transcripción)
                </label>
                <Input
                  value={fieldValue("gpt-sovits", "refText")}
                  onChange={(e) => onFieldChange("gpt-sovits", "refText", e.target.value)}
                  onBlur={() => onFieldCommit("gpt-sovits", "refText")}
                  placeholder="Lo que dice la muestra, palabra por palabra"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {/* Modo simbiótico Bark + SoVITS (cuando ambos tienen endpoint) */}
          {(neuralSelected === "bark" || neuralSelected === "gpt-sovits") &&
            barkConfigured &&
            sovitsConfigured && (
              <button
                type="button"
                onClick={() => {
                  const next = !symbiotic;
                  setSymbiotic(next);
                  setVoiceConfig({ symbiotic: next });
                }}
                className={cn(
                  "w-full text-left rounded-lg border p-2.5 transition-colors duration-200 cursor-pointer",
                  symbiotic
                    ? "border-sky-300/50 bg-sky-300/[0.08]"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
                )}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                  <Link2 className="w-3.5 h-3.5 text-sky-300" />
                  Modo simbiótico Bark + SoVITS
                  {symbiotic && <CheckCircle2 className="w-3.5 h-3.5 text-sky-300 ml-auto" />}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                  SoVITS habla primero clonando la referencia elegida (puede ser una
                  muestra generada por Bark) y Bark queda como siguiente voz expresiva.
                </span>
              </button>
            )}

          <p className="text-[10px] leading-snug text-muted-foreground/70">
            Instala el servidor en tu neurona o CasaOS (Cerebro → Neuronas) y pega
            su URL. Cualquier respuesta del servidor cuenta como vivo; si no
            responde al hablar, Aurora sigue con Kokoro o la voz del navegador.{" "}
            <a
              href={NEURAL_ENGINE_META[neuralSelected].repo}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-foreground/80 cursor-pointer"
            >
              Repositorio del motor
            </a>
            .
          </p>
        </div>
      )}

      {/* Estilo de la entrega: sliders + emoción por defecto (todos los motores) */}
      <div className="space-y-2 rounded-xl border border-white/10 bg-black/15 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium text-foreground/70 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-300" /> Estilo de la voz
          </div>
          <button
            type="button"
            onClick={onResetStyle}
            title="Restablecer velocidad, tono, energía y emoción"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground/80 transition-colors duration-200 hover:bg-white/10 hover:text-foreground cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Restablecer
          </button>
        </div>

        {/* Presets de un toque — el primero, "Aurora · orgánica", es el de fábrica */}
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Presets</div>
          <div className="flex flex-wrap gap-1.5">
            {VOICE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.hint}
                onClick={() => applyVoicePreset(p.id)}
                className="cursor-pointer rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-[11px] text-muted-foreground transition-colors duration-200 hover:border-sky-300/50 hover:bg-sky-300/[0.08] hover:text-foreground"
              >
                {p.id === AURORA_ORGANIC_PRESET_ID ? "★ " : ""}{p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Velocidad</span>
              <span className="tabular-nums text-foreground/80">×{styleRate.toFixed(2)}</span>
            </div>
            <Slider
              value={[styleRate]}
              min={0.5}
              max={2}
              step={0.05}
              onValueChange={(v) => setStyleRate(v[0] ?? 1)}
              onValueCommit={(v) => commitStyle({ rate: v[0] ?? 1 })}
              aria-label="Velocidad de la voz"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Tono</span>
              <span className="tabular-nums text-foreground/80">×{stylePitch.toFixed(2)}</span>
            </div>
            <Slider
              value={[stylePitch]}
              min={0.5}
              max={2}
              step={0.05}
              onValueChange={(v) => setStylePitch(v[0] ?? 1)}
              onValueCommit={(v) => commitStyle({ pitch: v[0] ?? 1 })}
              aria-label="Tono de la voz"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Energía</span>
              <span className="tabular-nums text-foreground/80">{Math.round(styleEnergy)}</span>
            </div>
            <Slider
              value={[styleEnergy]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => setStyleEnergy(v[0] ?? 50)}
              onValueCommit={(v) => commitStyle({ energy: v[0] ?? 50 })}
              aria-label="Energía de la voz"
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Drama className="w-3 h-3 text-sky-300" /> Emoción por defecto
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VOICE_EMOTIONS.map((e) => (
              <button
                key={e.id}
                type="button"
                title={e.hint}
                onClick={() => commitStyle({ emotion: e.id })}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-[11px] transition-colors duration-200",
                  styleEmotion === e.id
                    ? "border-sky-300/60 bg-sky-300/[0.12] text-foreground"
                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.06]",
                )}
              >
                {e.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            La emoción modula la entrega en todos los motores (en Bark añade
            etiquetas expresivas con moderación). Si mueves los sliders, tus números
            mandan sobre la emoción. También puedes pedírselo hablando: «habla más
            dulce», «más despacio», «usa bark».
          </p>
        </div>
      </div>

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
        Aurora nunca se queda muda: si el motor elegido no está listo cuando habla,
        cae solo a Kokoro y después a la mejor voz del navegador. Puedes cambiar de
        motor cuando quieras.
      </p>
    </div>
  );
}

export default VoiceOssPanel;
