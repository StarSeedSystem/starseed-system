"use client";

// [fix #310] real code marker so the production chunk hash changes and
// browsers re-fetch the react-server-dom-client collision-free build.
const __VOICE_ONBOARDING_310_FIX__ = "v310-fixed-final-9e8d7c6b-chf8i5pnn-ffad553";

/**
 * [cache-bust #310] force fresh chunk hash so browsers re-fetch the
 * react-server-dom-client collision-free build (prod-only stale HTTP cache).
 *
 * VENTANA DE VOZ POR NEURONA (Adenda 82 · petición de Alex).
 *
 * Al entrar a la cuenta desde CUALQUIER neurona (dispositivo), el OS comprueba
 * si esta neurona ya eligió su modo de voz (nube gratis u motor local). Si no,
 * abre SOLA una ventana — una vez, con inteligencia:
 *
 *   · Si detecta el daemon local vivo (127.0.0.1:4444) → marca "local" en
 *     silencio y NO molesta (ya está configurado de facto).
 *   · Si no hay elección → ventana con las dos opciones + "más tarde"
 *     (reaparece pasadas 24 h, nunca antes).
 *   · La elección es POR DISPOSITIVO (localStorage, no viaja con la cuenta:
 *     cada neurona tiene su hardware).
 *
 * La voz FUNCIONA desde el primer segundo igualmente (OpenVoice por la nube
 * gratis de HF): esta ventana solo informa y ofrece la mejora local.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Cloud, Gauge, Languages, Plus, Search, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { safeGet, safeSet } from "@/lib/safe-storage";
import { cn } from "@/lib/utils";
// NOTA (fix Adenda 95 · #310): los módulos pesados de tts-oss (omnivoice-hybrid,
// voice-config, locales, local-engine-installer, omnivoice-web-router) se cargan
// de forma PEREZOSA (dynamic import) dentro de efectos/handlers, NO a nivel de
// módulo. Este componente se monta en el ROOT LAYOUT (todas las rutas); importar
// todo el grafo tts-oss en su top-level provocaba que Webpack lo dividiera en un
// chunk asíncrono cuyo binding de React a veces no estaba listo al evaluarse →
// "Minified React error #310" (intermitente, solo en producción).
const LocalEngineInstaller = lazy(
  () => import("@/components/settings/aurora/local-engine-installer").then((m) => ({
    default: m.LocalEngineInstaller,
  })),
);

// v2 (Adenda 86): el ajuste de preferencia CAMBIÓ (ahora ordena la cadena de
// voz de la neurona), así que la ventana se RELANZA una vez para todos — aun
// para quienes ya habían elegido en v1.
// ── Constantes/tipos/helpers de la elección de voz POR NEURONA ──────────────
// Extraídos a neuron-voice-constants.ts (módulo liviano, SIN react ni el grafo
// de voz pesado) para EVITAR que los consumidores asíncronos (p.ej.
// neuron-voice-choice.tsx en ajustes) fuercen a este componente a un chunk
// COMPARTIDO asíncrono → carrera de init de React (#310, intermitente en prod).
import {
  NEURON_VOICE_LS_KEY,
  NEURON_VOICE_REOPEN_EVENT,
  VOICE_SYSTEM_VERSION,
  type NeuronVoiceMode,
  type NeuronVoiceChoice,
  readNeuronVoiceChoice,
  neuronVoiceChoiceIsStale,
  writeNeuronVoiceChoice,
  forceReopenNeuronVoiceWindow,
  probeLocalDaemon,
} from "@/lib/aurora/tts-oss/neuron-voice-constants";

// Re-export para los consumidores existentes que importan desde este archivo.
export {
  NEURON_VOICE_LS_KEY,
  NEURON_VOICE_REOPEN_EVENT,
  VOICE_SYSTEM_VERSION,
  type NeuronVoiceMode,
  type NeuronVoiceChoice,
  readNeuronVoiceChoice,
  neuronVoiceChoiceIsStale,
  writeNeuronVoiceChoice,
  forceReopenNeuronVoiceWindow,
  probeLocalDaemon,
} from "@/lib/aurora/tts-oss/neuron-voice-constants";

// Etiqueta legible de cada motor para la UI de jerarquía (Adenda 94).
const CHAIN_LABELS: Record<string, string> = {
  omnivoice: "OmniVoice · híbrido local/nube",
  openvoice2: "OpenVoice · nube gratis (por defecto)",
  kokoro: "Kokoro · respaldo local",
  voxcpm: "VoxCPM · endpoint propio",
  voicebox: "Voicebox · estudio local",
  bark: "Bark · expresivo",
  "gpt-sovits": "GPT-SoVITS · clonación",
  kitten: "Kitten · beta",
  browser: "Voz del navegador (suelo)",
};

const LATER_RETRY_MS = 24 * 60 * 60_000;

export function VoiceNeuronOnboarding() {
  const [open, setOpen] = useState(false);
  const [localVivo, setLocalVivo] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");
  // ¿La ventana se abrió porque el sistema de voz se ACTUALIZÓ? (Adenda 88.)
  const [updated, setUpdated] = useState(false);
  // (Adenda 94) Vista previa de audio + jerarquía de la cadena de voz.
  const [previewing, setPreviewing] = useState(false);
  const [previewMsg, setPreviewMsg] = useState("");
  const [priority, setPriorityState] = useState<string[]>([
    "omnivoice",
    "openvoice2",
    "kokoro",
    "voxcpm",
    "voicebox",
    "bark",
    "gpt-sovits",
    "kitten",
    "browser",
  ]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { getVoiceChainPriority } = await import(
          "@/lib/aurora/tts-oss/omnivoice-web-router"
        );
        if (alive) setPriorityState(getVoiceChainPriority());
      } catch {
        /* */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // (fix #310) Librerías pesadas de tts-oss cargadas PEREZOSAMENTE tras el mount,
  // para no arrastrar todo el grafo en el chunk inicial del layout (causa del
  // race de init de React → #310 en producción). Se usan vía `libsRef.current`.
  const libsRef = useRef<{
    ensureLocalKeepAlive?: () => void;
    getPreferredLocale?: () => string;
    getVoiceConfig?: () => any;
    setVoiceConfig?: (p: any) => void;
    findLocale?: (code: string) => any;
    localesByBase?: () => any[];
    searchLocales?: (q: string) => any[];
    suggestLocalesFromEnvironment?: () => string[];
  }>({});
  const [libsReady, setLibsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ ensureLocalKeepAlive }, vc, loc] = await Promise.all([
          import("@/lib/aurora/tts-oss/omnivoice-hybrid"),
          import("@/lib/aurora/tts-oss/voice-config"),
          import("@/lib/aurora/tts-oss/locales"),
        ]);
        if (!alive) return;
        libsRef.current = {
          ensureLocalKeepAlive,
          getPreferredLocale: vc.getPreferredLocale,
          getVoiceConfig: vc.getVoiceConfig,
          setVoiceConfig: vc.setVoiceConfig,
          findLocale: loc.findLocale,
          localesByBase: loc.localesByBase,
          searchLocales: loc.searchLocales,
          suggestLocalesFromEnvironment: loc.suggestLocalesFromEnvironment,
        };
        setLibsReady(true);
      } catch {
        /* la sección de idioma queda con sus defaults defensivos */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── Idioma de la voz (selección explícita + sugerencia por ubicación) ──────
  // Vive en voice-config.ts (`primaryLocale`/`preferredLocales`); esta ventana
  // solo lee/escribe esos campos. NO decide síntesis: el motor sigue usando el
  // idioma base ya auto-detectado; esto añade la PREFERENCIA del usuario.
  const [primaryLocale, setPrimaryLocaleState] = useState<string>("es-ES");
  const [preferredLocales, setPreferredLocalesState] = useState<string[]>([]);
  const [envSuggestions, setEnvSuggestions] = useState<string[]>([]);
  const [localeQuery, setLocaleQuery] = useState("");
  const [localePickerOpen, setLocalePickerOpen] = useState(false);

  useEffect(() => {
    const L = libsRef.current;
    try {
      setPrimaryLocaleState(L.getPreferredLocale?.() ?? "es-ES");
      setPreferredLocalesState(L.getVoiceConfig?.()?.preferredLocales ?? []);
      setEnvSuggestions(L.suggestLocalesFromEnvironment?.() ?? []);
    } catch {
      /* defensivo: la sección de idioma simplemente queda con sus defaults */
    }
  }, [libsReady]);

  const choosePrimaryLocale = useCallback((code: string) => {
    const clean = libsRef.current.findLocale?.(code)?.code;
    if (!clean) return;
    setPrimaryLocaleState(clean);
    libsRef.current.setVoiceConfig?.({ primaryLocale: clean });
    setLocalePickerOpen(false);
  }, []);

  const togglePreferredLocale = useCallback((code: string) => {
    const clean = libsRef.current.findLocale?.(code)?.code;
    if (!clean) return;
    setPreferredLocalesState((prev) => {
      const next = prev.includes(clean) ? prev.filter((c) => c !== clean) : [...prev, clean];
      libsRef.current.setVoiceConfig?.({ preferredLocales: next });
      return next;
    });
  }, []);

  const localeFilteredGroups = useMemo(() => {
    const L = libsRef.current;
    const groups = L.localesByBase?.() ?? [];
    const q = localeQuery.trim();
    if (!q) return groups;
    const matches = new Set((L.searchLocales?.(q) ?? []).map((l) => l.code));
    return groups
      .map((g) => ({ ...g, locales: g.locales.filter((l) => matches.has(l.code)) }))
      .filter((g) => g.locales.length > 0);
  }, [localeQuery, libsReady]);

  // Adenda 88: en cuanto carga la app, si esta neurona eligió voz LOCAL, arranca
  // el keep-alive que mantiene el daemon caliente (precalienta cada ~7 min). Así
  // la primera síntesis del turno ya encuentra el modelo en caché (~22 s) en vez
  // de en frío (~40 s) y NUNCA cae a la nube robótica por agotar el presupuesto.
  useEffect(() => {
    libsRef.current.ensureLocalKeepAlive?.();
  }, [libsReady]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const choice = readNeuronVoiceChoice();
      // Adenda 88: si el sistema de voz se ACTUALIZÓ desde que esta neurona eligió
      // (versión guardada ≠ VOICE_SYSTEM_VERSION), reabrimos para reconfigurar —
      // aun para quienes ya habían elegido local/nube. Al elegir se re-sella.
      const stale = neuronVoiceChoiceIsStale(choice);
      if (choice && choice.mode !== "later" && !stale) return; // ya elegido y al día
      if (choice?.mode === "later" && !stale && Date.now() - choice.at < LATER_RETRY_MS) return;
      if (stale) setUpdated(true);
      // ABRIMOS YA (sin esperar al daemon): el fetch a 127.0.0.1:4444
      // puede colgarse en entornos sin el daemon local (p.ej. el navegador
      // del usuario, o Browserbase), y dejaría la ventana nunca abierta. El
      // estado del daemon se carga EN PARALELO.
      setOpen(true);
      void probeLocalDaemon().then((local) => {
        if (alive) setLocalVivo(local);
      });
    }, 3500); // deja que la app respire antes de saludar
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  // Reapertura a demanda (desde los Ajustes: «cambiar la voz de esta neurona»).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onReopen = (e: Event) => {
      const detail = (e as CustomEvent<{ reopen?: boolean }>).detail;
      if (!detail?.reopen) return; // los avisos "silent" (guardado inline) no abren
      setOpen(true); // abrir YA; el daemon se carga en paralelo
      void probeLocalDaemon().then((local) => {
        setLocalVivo(local);
        setInstalling(false);
        setCheckMsg("");
        setUpdated(false); // reapertura manual desde ajustes: no es "actualización"
      });
    };
    window.addEventListener(NEURON_VOICE_REOPEN_EVENT, onReopen as EventListener);
    return () => window.removeEventListener(NEURON_VOICE_REOPEN_EVENT, onReopen as EventListener);
  }, []);

  // (diag) marca de montaje real en el cuerpo del componente
  try { if (typeof window !== "undefined") (window as any).__voice_body_ran = Date.now(); } catch {}
  if (!open || typeof document === "undefined") return null;

  const choose = (mode: NeuronVoiceMode) => {
    writeNeuronVoiceChoice(mode);
    setOpen(false);
  };

  const verifyInstall = async () => {
    setChecking(true);
    setCheckMsg("Buscando OpenVoice local en 127.0.0.1:4444…");
    const ok = await probeLocalDaemon();
    setChecking(false);
    if (ok) {
      setCheckMsg("¡OpenVoice local detectado y listo! Esta neurona hablará en local.");
      setTimeout(() => choose("local"), 1200);
    } else {
      setCheckMsg(
        "Aún no encuentro OpenVoice local. Si acabas de instalarlo, dale unos segundos (o revisa la Terminal) y vuelve a comprobar.",
      );
    }
  };

  // (Adenda 94) MUESTRA DE AUDIO: sintetiza un fragmento con la configuración
  // actual (OpenVoice web por defecto) y lo reproduce antes de confirmar.
  const previewVoice = async () => {
    setPreviewing(true);
    setPreviewMsg("Generando muestra con OpenVoice…");
    try {
      const { omnivoiceWebSynthesize } = await import(
        "@/lib/aurora/tts-oss/omnivoice-web-router"
      );
      const blob = await omnivoiceWebSynthesize(
        "Hola, soy tu asistente Astraura. Esta es la voz de tu sistema OmniVoice.",
        { lang: "es" },
      );
      if (blob && typeof window !== "undefined") {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          try {
            URL.revokeObjectURL(url);
          } catch {
            /* */
          }
        };
        await audio.play().catch(() => null);
        setPreviewMsg("▶️ Muestra reproducida.");
      } else {
        setPreviewMsg("No se pudo generar la muestra ahora (el Space puede estar despertando).");
      }
    } catch {
      setPreviewMsg("No se pudo generar la muestra ahora.");
    } finally {
      setPreviewing(false);
    }
  };

  // (Adenda 94) Reordena la jerarquía de la cadena de voz (sube/baja un motor).
  const movePriority = (mode: string, dir: -1 | 1) => {
    setPriorityState((prev) => {
      const idx = prev.indexOf(mode);
      const next = [...prev];
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      void (async () => {
        try {
          const { setVoiceChainPriority } = await import(
            "@/lib/aurora/tts-oss/omnivoice-web-router"
          );
          setVoiceChainPriority(next);
        } catch {
          /* */
        }
      })();
      return next;
    });
  };

  // (Adenda 95) Voicebox: vincula la API Key del usuario (variante WEB) por
  // Cerebro/Usuario. La app LOCAL no necesita key; la nube sí (suscripción).
  const [vbKey, setVbKey] = useState("");
  const [vbKeySaved, setVbKeySaved] = useState(false);
  const saveVbKey = async () => {
    try {
      const { BrainApiManager } = await import("@/lib/aurora/tts-oss/brain-api-manager");
      const { resolveVoiceboxPersonality } = await import(
        "@/lib/aurora/tts-oss/voicebox-engine",
      );
      const p = await resolveVoiceboxPersonality();
      const ok = BrainApiManager.linkKey(p.brainId ?? null, p.userId ?? null, vbKey);
      setVbKeySaved(ok);
    } catch {
      setVbKeySaved(false);
    }
  };

  return createPortal(
    <div
      data-v310={__VOICE_ONBOARDING_310_FIX__}
      className="fixed inset-0 z-[10000] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Voz OmniVoice de Astraura en esta neurona"
    >
      {/* Velo */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        onClick={() => choose("later")}
        aria-hidden
      />
      {/* Ventana Crystal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/12 bg-[#0b0f1c]/95 shadow-[0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(0,127,255,0.22),transparent_70%)]"
        />
        <button
          type="button"
          onClick={() => choose("later")}
          aria-label="Cerrar (recordar más tarde)"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative flex max-h-[85vh] flex-col gap-3 overflow-y-auto p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10">
              <Zap className="h-4.5 w-4.5 text-sky-300" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white/95">
                {updated ? "OmniVoice se ha actualizado" : "OmniVoice: la voz de Astraura en esta neurona"}
              </h2>
              <p className="text-[11px] text-white/50">
                {updated
                  ? "Mejoramos el sistema de voz OmniVoice · reconfigura esta neurona"
                  : "Primera vez en este dispositivo · elige cómo quieres que suene con OmniVoice"}
              </p>
            </div>
          </div>

          <p className="text-[12px] leading-relaxed text-white/70">
            Elige cómo prefiere hablar esta neurona con <span className="text-white/90">OmniVoice</span>,
            el sistema de voz de Astraura — tu elección ORDENA su cadena de voz (la otra vía
            queda siempre de respaldo): con <span className="text-sky-200">OpenVoice</span>, su voz
            realista predeterminada, por la nube gratuita (sin instalar nada) o por el{" "}
            <span className="text-emerald-200">motor local</span> instalado en este equipo (privado
            y sin internet).
            {localVivo && (
              <span className="mt-1 block text-emerald-200/90">
                ⚡ OpenVoice local detectado y vivo en este equipo — recomendado.
              </span>
            )}
          </p>

          {/* (Adenda 94) MUESTRA DE AUDIO + JERARQUÍA de la cadena de voz */}
          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-white/80">Prueba de voz (OpenVoice)</span>
              <Button
                type="button"
                variant="secondary"
                disabled={previewing}
                onClick={previewVoice}
                className="h-8 cursor-pointer gap-1.5 bg-sky-500/15 px-3 text-[12px] text-sky-100 hover:bg-sky-500/25"
              >
                {previewing ? "Generando…" : "▶ Probar voz"}
              </Button>
            </div>
            {previewMsg && <p className="text-[11px] text-white/45">{previewMsg}</p>}
            <div className="mt-1">
              <p className="mb-1 text-[11px] text-white/50">Preferencias de jerarquización (orden de la cadena):</p>
              <div className="flex flex-col gap-1">
                {priority.map((mode, i) => {
                  const label = CHAIN_LABELS[mode] ?? mode;
                  return (
                    <div
                      key={mode}
                      className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.04] px-2 py-1 text-[12px] text-white/80"
                    >
                      <span className="w-4 text-white/40">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <button
                        type="button"
                        aria-label="Subir"
                        disabled={i === 0}
                        onClick={() => movePriority(mode, -1)}
                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-white/60 hover:bg-white/10 disabled:opacity-25"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label="Bajar"
                        disabled={i === priority.length - 1}
                        onClick={() => movePriority(mode, 1)}
                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-white/60 hover:bg-white/10 disabled:opacity-25"
                      >
                        ▼
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* (Adenda 95) Voicebox — motor PRINCIPAL recomendado (Local/Web) */}
          <div className="flex flex-col gap-2 rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-white/85">Voicebox · motor recomendado</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/50">
                local si la app está viva · nube con tu API Key
              </span>
            </div>
            <p className="text-[11px] text-white/45">
              La app de escritorio (macOS/Windows/Linux) funciona sin claves. Para la
              variante en la nube necesitas tu propia API Key de Voicebox (suscripción
              externa). Gratis por defecto: OpenVoice web sigue como respaldo.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={vbKey}
                onChange={(e) => {
                  setVbKey(e.target.value);
                  setVbKeySaved(false);
                }}
                placeholder="Pega tu API Key de Voicebox (nube)"
                className="h-8 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 text-[12px] text-white/85 outline-none placeholder:text-white/30 focus:border-sky-400/40"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={saveVbKey}
                className="h-8 cursor-pointer bg-sky-500/15 px-3 text-[12px] text-sky-100 hover:bg-sky-500/25"
              >
                Guardar
              </Button>
            </div>
            {vbKeySaved && <p className="text-[11px] text-emerald-200/90">✓ API Key vinculada a este cerebro.</p>}
          </div>

          {!installing ? (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="h-10 w-full cursor-pointer justify-start gap-2 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25"
                variant="secondary"
                onClick={() => choose("cloud")}
              >
                <Cloud className="h-4 w-4 text-sky-300" />
                <span className="min-w-0 truncate text-[12.5px]">
                  Seguir con OpenVoice por la nube gratis (recomendado para empezar)
                </span>
              </Button>
              <Button
                type="button"
                className="h-10 w-full cursor-pointer justify-start gap-2 bg-emerald-500/12 text-emerald-100 hover:bg-emerald-500/22"
                variant="secondary"
                onClick={() => (localVivo ? choose("local") : setInstalling(true))}
              >
                <Zap className="h-4 w-4 text-emerald-300" />
                <span className="min-w-0 truncate text-[12.5px]">
                  {localVivo
                    ? "Usar OpenVoice local en este equipo (ya instalado) — recomendado"
                    : "Instalar OpenVoice local en este equipo (rápido y privado)"}
                </span>
              </Button>
              <button
                type="button"
                onClick={() => choose("fastweb")}
                className="flex w-full cursor-pointer items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-left transition-colors duration-200 hover:bg-amber-500/20"
              >
                <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-amber-100">
                    Usar otros motores de OmniVoice (más rápidos, menos realistas)
                  </span>
                  <span className="block text-[10.5px] text-amber-100/60">
                    Respaldos de OmniVoice que priorizan velocidad sobre naturalidad — suenan menos realistas que OpenVoice
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => choose("later")}
                className="cursor-pointer self-center pt-0.5 text-[11px] text-white/40 underline-offset-2 transition-colors hover:text-white/65 hover:underline"
              >
                Recordármelo más tarde
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Suspense fallback={null}>
                <LocalEngineInstaller />
              </Suspense>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 cursor-pointer text-[11px]"
                  disabled={checking}
                  onClick={() => void verifyInstall()}
                >
                  {checking ? "Comprobando…" : "Ya lo instalé — comprobar"}
                </Button>
                <button
                  type="button"
                  onClick={() => choose("cloud")}
                  className="cursor-pointer text-[11px] text-white/40 underline-offset-2 hover:text-white/65 hover:underline"
                >
                  Mejor sigo con OpenVoice en la nube
                </button>
              </div>
              {checkMsg && <p className="text-[11px] text-white/55">{checkMsg}</p>}
            </div>
          )}

          {/* Idioma de la voz (selección explícita + sugerencia por ubicación).
              El acento regional fino depende del soporte del motor (hoy limitado),
              pero la preferencia queda guardada y el idioma BASE se respeta siempre. */}
          <div className="mt-1 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2">
              <Languages className="h-3.5 w-3.5 text-[#7fb8ff]" />
              <span className="text-xs font-medium text-white/85">Idioma de la voz</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-white/45">
              Idioma principal en que hablará Aurora en esta neurona. Te sugerimos
              opciones según tu navegador y tu zona horaria.
            </p>

            {envSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {envSuggestions.slice(0, 5).map((code) => {
                  const loc = libsRef.current.findLocale?.(code);
                  if (!loc) return null;
                  const active = code === primaryLocale;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => choosePrimaryLocale(code)}
                      title={loc.native}
                      className={cn(
                        "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200",
                        active
                          ? "border-sky-400/50 bg-sky-500/20 text-sky-100"
                          : "border-white/12 bg-white/[0.04] text-white/65 hover:bg-white/[0.09] hover:text-white",
                      )}
                    >
                      {loc.label}
                    </button>
                  );
                })}
              </div>
            )}

            <Popover open={localePickerOpen} onOpenChange={setLocalePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="mt-2 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[11.5px] text-white/80 transition-colors duration-200 hover:bg-white/[0.08]"
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                    <Search className="h-3 w-3 shrink-0 text-white/40" />
                    {libsRef.current.findLocale?.(primaryLocale)?.label ?? "Elegir idioma…"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="z-[10001] w-[320px] max-w-[85vw] rounded-xl border border-white/12 bg-[#0b0f1c]/98 p-2 text-white shadow-[0_16px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl"
              >
                <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5">
                  <Search className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  <input
                    value={localeQuery}
                    onChange={(e) => setLocaleQuery(e.target.value)}
                    placeholder="Buscar idioma o país…"
                    className="w-full bg-transparent text-[12px] text-white/85 outline-none placeholder:text-white/30"
                  />
                </div>
                <div className="mt-2 max-h-[280px] overflow-y-auto pr-1">
                  {localeFilteredGroups.length === 0 ? (
                    <p className="px-1 py-2 text-[11px] text-white/40">Sin coincidencias.</p>
                  ) : (
                    localeFilteredGroups.map((g) => (
                      <div key={g.base} className="mb-1.5">
                        <p className="px-1 py-1 text-[10px] font-medium uppercase tracking-wide text-white/35">
                          {g.label}
                        </p>
                        {g.locales.map((l) => {
                          const isPrimary = l.code === primaryLocale;
                          const isPreferred = preferredLocales.includes(l.code);
                          return (
                            <div
                              key={l.code}
                              className={cn(
                                "flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 transition-colors duration-150",
                                isPrimary ? "bg-sky-500/15" : "hover:bg-white/[0.06]",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => choosePrimaryLocale(l.code)}
                                className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                                title={`Usar ${l.native} como idioma principal`}
                              >
                                {isPrimary ? (
                                  <Check className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                                ) : (
                                  <span className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <span className="min-w-0 truncate text-[12px] text-white/85">{l.label}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => togglePreferredLocale(l.code)}
                                title={isPreferred ? "Quitar de preferidos" : "Añadir a preferidos"}
                                className={cn(
                                  "shrink-0 cursor-pointer rounded-full border p-1 transition-colors duration-150",
                                  isPreferred
                                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                                    : "border-white/10 bg-white/[0.03] text-white/40 hover:text-white/70",
                                )}
                              >
                                {isPreferred ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {preferredLocales.length > 0 && (
              <p className="mt-1.5 text-[10px] text-white/35">
                Preferidos: {preferredLocales.map((c) => libsRef.current.findLocale?.(c)?.label ?? c).join(" · ")}
              </p>
            )}

            <p className="mt-1.5 text-[10px] text-white/30">
              El acento regional fino depende del soporte del motor de voz (hoy limitado); el idioma
              base y tu preferencia quedan siempre guardados.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default VoiceNeuronOnboarding;
