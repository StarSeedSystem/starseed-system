"use client";

// [fix #310] real code marker so the production chunk hash changes and
// browsers re-fetch the react-server-dom-client collision-free build.
const __VOICE_ONBOARDING_310_FIX__ = "v310-fixed-final-9e8d7c6b-adenda98-a1b2c3d";

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
import { Check, ChevronDown, Cloud, Gauge, Languages, Plus, Search, Sparkles, X, Zap } from "lucide-react";
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
  VOICE_UPDATE_NOTES,
  type NeuronVoiceMode,
  type NeuronVoiceChoice,
  readNeuronVoiceChoice,
  neuronVoiceChoiceIsStale,
  writeNeuronVoiceChoice,
  forceReopenNeuronVoiceWindow,
  probeLocalDaemon,
} from "@/lib/aurora/tts-oss/neuron-voice-constants";
// (Adenda 98) Capacidades del dispositivo → recomendación de motor por neurona.
import { detectTier } from "@/lib/perf/device-tier";
// Catálogo de voces (Adenda 96): módulo liviano, seguro importar estático.
import { getVoicesByGender, getVoiceById, type CatalogVoice } from "@/lib/aurora/tts-oss/voice-catalog";

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
  // Abre en el PRIMER render (no depende de setOpen desde un effect, que en
  // este grafo no propaga el re-render del portal). Decide leyendo la elección
  // guardada: si no hay elección válida o está desactualizada (versión 97),
  // abre solo al entrar.
  // (Adenda 219) ESTA VENTANA YA NO NACE ABIERTA. Antes arrancaba en `open =
  // true` cuando la neurona no tenía elección de voz; la red de cortesía la
  // plegaba mientras el rito estaba delante y la REABRÍA en cuanto la ventana
  // de perfil liberaba el primer plano — por eso aparecía «OmniVoice: la voz
  // de Astraura en esta neurona» justo después de los datos del perfil. La
  // configuración de voz vive en la sección VoiceMorphic de «Configuración de
  // sistemas de Astraura», que viene DESPUÉS en el mismo flujo. Esta ventana
  // solo se abre ya a mano (evento de reapertura desde Ajustes).
  const [open, setOpen] = useState<boolean>(() => false);
  const [localVivo, setLocalVivo] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");
  // ¿La ventana se abrió porque el sistema de voz se ACTUALIZÓ? (Adenda 88.)
  const [updated, setUpdated] = useState(false);
  // (Adenda 94) Vista previa de audio + jerarquía de la cadena de voz.
  const [previewing, setPreviewing] = useState(false);
  const [previewMsg, setPreviewMsg] = useState("");
  // (Adenda 98) Frase de ejemplo EDITABLE para probar la voz de cada neurona.
  const [samplePhrase, setSamplePhrase] = useState(
    "Hola, soy tu asistente Astraura. Esta es la voz de tu sistema OmniVoice.",
  );
  // Capacidad del dispositivo (device-tier) → recomendación de motor por neurona.
  const [deviceTier, setDeviceTier] = useState<"high" | "mid" | "low">("mid");
  const [previewPersona, setPreviewPersona] = useState<string | null>(null);
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
  // (Adenda 96) Voces por personalidad: sección ampliable dentro del modal.
  const [showPersonas, setShowPersonas] = useState(true);
  const [personas, setPersonas] = useState<
    Array<{ id: string; name: string; gender: "f" | "m" | "o"; voiceId?: string; refKind?: string }>
  >([{ id: "aurora", name: "Aurora", gender: "f" }]);
  const [personaMsg, setPersonaMsg] = useState("");
  const [recState, setRecState] = useState<"idle" | "recording">("idle");

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
    const matches = new Set((L.searchLocales?.(q) ?? []).map((l: { code: string }) => l.code));
    return groups
      .map((g) => ({ ...g, locales: g.locales.filter((l: { code: string }) => matches.has(l.code)) }))
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
    // (Adenda 193) ESTA VENTANA YA NO SE AUTO-ABRE. Aparecía ANTES de
    // «Configuración de sistemas de Astraura», que ya trae dentro su sección
    // OmniVoice: eran dos ventanas para la misma decisión, y la primera tapaba
    // al rito. La elección de voz vive ahora en esa pestaña; aquí solo queda la
    // reapertura MANUAL desde Ajustes (evento NEURON_VOICE_REOPEN_EVENT).
    if (typeof window === "undefined") return;
    return;
    // eslint-disable-next-line no-unreachable
    let alive = true;
    let cancelaEspera: (() => void) | null = null;
    const t = setTimeout(async () => {
      const choice = readNeuronVoiceChoice();
      // Adenda 88: si el sistema de voz se ACTUALIZÓ desde que esta neurona eligió
      // (versión guardada ≠ VOICE_SYSTEM_VERSION), reabrimos para reconfigurar —
      // aun para quienes ya habían elegido local/nube. Al elegir se re-sella.
      const stale = neuronVoiceChoiceIsStale(choice);
      if (choice && choice.mode !== "later" && !stale) return; // ya elegido y al día
      if (choice?.mode === "later" && !stale && Date.now() - choice.at < LATER_RETRY_MS) return;
      // ── GATE CRUZADO con la ventana 149 (Adenda 149 · quick win 10) ────────
      // La ventana de arranque «Sistemas de Astraura en esta neurona»
      // (`StartupUpdatesModal`) se abre ANTES que esta (a ~1200 ms, z-[120]) y
      // ya explica voz/LLM/cerebro/señales de la neurona. Si va a mostrarse en
      // ESTA sesión, esta ventana NO se auto-abre encima (z-[10000] tapaba a la
      // otra sin que existiera ningún gate entre ambas): se deja para el
      // siguiente arranque, cuando el catálogo ya esté visto. Se consulta por
      // import PEREZOSO para no arrastrar el catálogo de modelos/integraciones
      // al chunk de este componente, montado en el layout raíz (ver #310).
      // NO afecta a la apertura MANUAL ni al evento de reapertura desde
      // Ajustes (`NEURON_VOICE_REOPEN_EVENT`), que siguen abriendo siempre.
      // (Adenda 181 · integración pedida por Alex) SIN SESIÓN (ruta /login con la
      // Bienvenida) esta ventana NO se auto-abre: la voz se configura en la
      // ventana UNIFICADA post-login (paso OmniVoice del wizard Astraura, con el
      // 1.58 al frente). La reapertura manual desde Ajustes sigue funcionando.
      if (window.location.pathname.startsWith("/login")) return;
      const updatesWillShow = await import("@/lib/astraura/startup-updates")
        .then((m) => {
          try { return m.shouldShowUpdates(); } catch { return false; }
        })
        .catch(() => false);
      if (!alive) return;
      if (updatesWillShow) return;
      // (Adenda 192) Cortesía con el RITO y la GUÍA de bienvenida: si están en
      // primer plano, esta ventana ESPERA a que terminen — abierta encima los
      // enterraba y su modal cancelaba la navegación de los vínculos de la guía.
      const { alLiberarsePrimerPlano } = await import("@/lib/ui/fullscreen-modal");
      if (!alive) return;
      // (Adenda 209) YA NO SE ABRE SOLA. Alex la vio colarse justo después de
      // crear la cuenta —«la ventana anterior de openvoice obsoleta»— y su
      // contenido vive desde la Adenda 193 en la sección OmniVoice de
      // «Configuración de sistemas de Astraura». Dos ventanas para lo mismo
      // sobran, y ésta se colaba encima del rito. Sigue disponible a demanda:
      // el evento de reapertura de abajo la abre desde Ajustes.
      void alLiberarsePrimerPlano;
      void stale;
      return;
    }, 3500); // deja que la app respire antes de saludar
    return () => {
      alive = false;
      clearTimeout(t);
      cancelaEspera?.();
    };
  }, []);

  // Reapertura a demanda (desde los Ajustes: «cambiar la voz de esta neurona»).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onReopen = (e: Event) => {
      const detail = (e as CustomEvent<{ reopen?: boolean }>).detail;
      if (!detail?.reopen) return; // los avisos "silent" (guardado inline) no abren
      manualRef.current = true; // apertura MANUAL: la cortesía del rito no aplica
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

  // (Adenda 192) RED DE CORTESÍA FINAL con el rito/guía de bienvenida: esta
  // ventana tiene VARIAS vías de auto-apertura (timer, instancias anidadas del
  // provider…). Si quedó abierta por CUALQUIERA de ellas mientras el rito o la
  // guía están en primer plano, se repliega y espera su turno — abierta encima
  // los enterraba y su modal cancelaba router.push de los vínculos de la guía.
  const manualRef = useRef(false);
  const esperaRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { esperaRef.current?.(); }, []); // solo al desmontar
  useEffect(() => {
    if (!open || manualRef.current) return;
    let offSub: (() => void) | null = null;
    void import("@/lib/ui/fullscreen-modal")
      .then((m) => {
        const replegar = () => {
          if (manualRef.current || !m.primerPlanoOcupado()) return;
          setOpen(false);
          esperaRef.current?.();
          esperaRef.current = m.alLiberarsePrimerPlano(() => {
            esperaRef.current = null;
            // (Adenda 219) Solo se reabre si la abrió el usuario a mano.
            if (manualRef.current) setOpen(true);
          });
        };
        replegar();
        offSub = m.subscribeFullscreenModal(replegar);
      })
      .catch(() => { /* sin cortesía disponible: mejor abierta que rota */ });
    return () => { offSub?.(); };
  }, [open]);

  // (Adenda 181 · fix «Rendered fewer hooks») El return temprano vivía AQUÍ, con
  // ~10 hooks declarados más abajo (vbKey, mounted, useCallbacks…): al cerrar la
  // ventana, React veía menos hooks y CRASHEABA la página entera. El gate se
  // movió DESPUÉS de todos los hooks, justo antes del portal.

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
  // Capacidad del dispositivo al montar (recomendación de motor por neurona).
  useEffect(() => {
    try {
      setDeviceTier(detectTier());
    } catch {
      /* */
    }
  }, []);

  const previewVoice = async () => {
    setPreviewing(true);
    setPreviewMsg("Generando muestra con OpenVoice…");
    try {
      const { omnivoiceWebSynthesize } = await import(
        "@/lib/aurora/tts-oss/omnivoice-web-router"
      );
      const blob = await omnivoiceWebSynthesize(
        (samplePhrase || "Hola, soy tu asistente Astraura.").slice(0, 240),
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
        setPreviewMsg("▶ Muestra reproducida.");
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

  // (Adenda 96) Carga las personalidades para asignarles voz por defecto.
  const loadPersonas = useCallback(async () => {
    try {
      const [{ listPersonalityProfiles }] = await Promise.all([import("@/lib/aurora/personalities")]);
      const list = listPersonalityProfiles();
      const norm = list.map((p) => ({
        id: p.id,
        name: p.name || "Personalidad",
        gender: "f" as "f" | "m" | "o",
        voiceId: p.voiceStyle?.audioRef?.voiceId,
        refKind: p.voiceStyle?.audioRef?.kind,
      }));
      if (norm.length === 0) {
        // Personalidad implícita de Aurora si no hay ninguna guardada.
        norm.push({ id: "aurora", name: "Aurora", gender: "f", voiceId: undefined, refKind: undefined });
      }
      setPersonas(norm);
    } catch {
      setPersonas([{ id: "aurora", name: "Aurora", gender: "f", voiceId: undefined, refKind: undefined }]);
    }
  }, []);

  // (Adenda 96) Asigna una voz del catálogo a una personalidad y la persiste.
  const setPersonaVoice = useCallback(async (id: string, voiceId: string) => {
    try {
      const [{ patchPersonalityVoice }] = await Promise.all([import("@/lib/aurora/personalities")]);
      const v = getVoiceById(voiceId);
      const ok = patchPersonalityVoice(id, {
        audioRef: { kind: "builtin", voiceId, label: v?.label, engine: v?.engine, at: Date.now() },
      });
      setPersonas((prev) => prev.map((p) => (p.id === id ? { ...p, voiceId } : p)));
      setPersonaMsg(ok ? `Voz «${v?.label ?? voiceId}» asignada.` : "No se pudo guardar la voz.");
    } catch {
      setPersonaMsg("No se pudo guardar la voz.");
    }
  }, []);

  // (Adenda 98) EJEMPLO FUNCIONAL por personalidad: sintetiza la frase editable
  // con la voz elegida de esa persona (catálogo → estilo/motor de su voz) y la
  // reproduce por el mixer. Best-effort: si su voz no está lista, avisa honesto.
  const previewPersonaVoice = useCallback(
    async (id: string, name: string, voiceId?: string) => {
      setPreviewPersona(id);
      setPersonaMsg(`Generando ejemplo de ${name}…`);
      try {
        const text = (samplePhrase || `Hola, soy ${name}.`).slice(0, 240);
        const cat = voiceId ? getVoiceById(voiceId) : undefined;
        const { omnivoiceWebSynthesize } = await import("@/lib/aurora/tts-oss/omnivoice-web-router");
        // El estilo/semilla de la voz del catálogo guía el timbre por persona.
        const blob = await omnivoiceWebSynthesize(text, {
          lang: "es",
          ...(cat?.id ? { style: cat.id } : {}),
        });
        if (blob && typeof window !== "undefined") {
          try {
            const { mixerPlayBlob, mixerSupported } = await import("@/lib/aurora/tts-oss/omnivoice-mixer");
            if (mixerSupported() && (await mixerPlayBlob(blob, { neuronId: id }))) {
              setPersonaMsg(`▶ Ejemplo de ${name} reproducido.`);
              return;
            }
          } catch {
            /* cae a HTMLAudio */
          }
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => {
            try { URL.revokeObjectURL(url); } catch { /* */ }
          };
          await audio.play().catch(() => null);
          setPersonaMsg(`▶ Ejemplo de ${name} reproducido.`);
        } else {
          setPersonaMsg("No se pudo generar el ejemplo (el motor puede estar despertando).");
        }
      } catch {
        setPersonaMsg("No se pudo generar el ejemplo ahora.");
      } finally {
        setPreviewPersona(null);
      }
    },
    [samplePhrase],
  );

  // (Adenda 96) Graba un audio de referencia para clonar la voz de una personalidad.
  const recordForPersona = useCallback(async (id: string) => {
    if (recState === "recording") return;
    setRecState("recording");
    setPersonaMsg("Grabando… habla durante unos segundos.");
    try {
      const { recordReferenceAudio, makeRecordedRef } = await import("@/lib/aurora/tts-oss/voice-recorder");
      const dataUrl = await recordReferenceAudio(15000);
      if (dataUrl) {
        const [{ patchPersonalityVoice }] = await Promise.all([import("@/lib/aurora/personalities")]);
        const ok = patchPersonalityVoice(id, { audioRef: makeRecordedRef(dataUrl, "Grabación") });
        setPersonas((prev) => prev.map((p) => (p.id === id ? { ...p, refKind: "recorded" } : p)));
        setPersonaMsg(ok ? "Grabación guardada como voz de referencia." : "No se pudo guardar la grabación.");
      } else {
        setPersonaMsg("No se capturó audio (permiso de micrófono denegado).");
      }
    } catch {
      setPersonaMsg("Error al grabar.");
    } finally {
      setRecState("idle");
    }
  }, [recState]);

  // (Adenda 96) Importa un audio de la Biblioteca/dispositivo como referencia.
  const uploadForPersona = useCallback(async (id: string) => {
    try {
      const { importReferenceAudio, makeLibraryRef } = await import("@/lib/aurora/tts-oss/voice-recorder");
      const dataUrl = await importReferenceAudio();
      if (dataUrl) {
        const [{ patchPersonalityVoice }] = await Promise.all([import("@/lib/aurora/personalities")]);
        const ok = patchPersonalityVoice(id, { audioRef: makeLibraryRef(dataUrl, "Biblioteca") });
        setPersonas((prev) => prev.map((p) => (p.id === id ? { ...p, refKind: "library" } : p)));
        setPersonaMsg(ok ? "Audio de la Biblioteca guardado como referencia." : "No se pudo guardar.");
      }
    } catch {
      setPersonaMsg("Error al importar audio.");
    }
  }, []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // (Adenda 181) Gate de render DESPUÉS de todos los hooks (ver nota arriba).
  if (!open || typeof document === "undefined") return null;
  // [fix hydration] El portal solo existe en el cliente (document.body no existe
  // en SSR). Devolver null en SSR y en el primer render cliente evita el mismatch
  // de hydration (el servidor serializaba <script>, el cliente <div>).
  if (!mounted) return null;

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

          {/* (Adenda 98) NOVEDADES cuando la ventana reaparece por actualización. */}
          {updated && VOICE_UPDATE_NOTES.length > 0 && (
            <div className="rounded-xl border border-sky-400/25 bg-sky-500/[0.07] p-3">
              <p className="text-[12px] font-medium text-sky-100">Novedades de esta actualización de OmniVoice</p>
              <ul className="mt-1.5 space-y-1">
                {VOICE_UPDATE_NOTES.map((n, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-white/70">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-sky-300" />
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* (Adenda 98) RECOMENDACIÓN por capacidades del dispositivo. */}
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] px-3 py-2 text-[11px] leading-snug text-emerald-100/90">
            {deviceTier === "high" &&
              "Tu dispositivo es potente: el motor OpenVoice local dará la voz más realista sin depender de internet (instálalo abajo)."}
            {deviceTier === "mid" &&
              "Dispositivo equilibrado: OpenVoice por la nube gratuita es lo recomendado; el motor local también rinde bien si lo instalas."}
            {deviceTier === "low" &&
              "Dispositivo modesto: OpenVoice por la nube (sin carga local) o los motores web rápidos mantienen la voz fluida sin exigir al equipo."}
          </div>

          {/* (Adenda 94/98) MUESTRA DE AUDIO EDITABLE + JERARQUÍA de la cadena */}
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
            {/* (Adenda 98) Frase de ejemplo EDITABLE: prueba la voz con tu propio texto. */}
            <textarea
              value={samplePhrase}
              onChange={(e) => setSamplePhrase(e.target.value)}
              rows={2}
              maxLength={240}
              placeholder="Escribe la frase que quieres oír…"
              className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-white/85 outline-none placeholder:text-white/30 focus:border-sky-400/40"
            />
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
                        {g.locales.map((l: { code: string; label: string; native: string }) => {
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

            {/* (Adenda 96) Voces por personalidad: cada personalidad puede tener
                su propia voz (catálogo amplio + grabación/subida de referencia). */}
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <button
                type="button"
                onClick={() => { setShowPersonas((s) => !s); if (!showPersonas) void loadPersonas(); }}
                className="flex w-full cursor-pointer items-center justify-between text-left"
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-white/90">
                  <Sparkles className="h-4 w-4 text-fuchsia-300" />
                  Voces por personalidad
                </span>
                <ChevronDown className={cn("h-4 w-4 text-white/50 transition-transform duration-150", showPersonas && "rotate-180")} />
              </button>
              {showPersonas && (
                <div className="mt-3 space-y-2">
                  {personas.map((p) => (
                    <div key={p.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[12px] font-medium text-white/85">{p.name}</span>
                        <span className="text-[10px] text-white/40">
                          {p.refKind === "recorded" ? "Ref. grabada" : p.refKind === "library" ? "Ref. biblioteca" : p.voiceId ? "Voz catálogo" : "Sin voz"}
                        </span>
                      </div>
                      <select
                        value={p.voiceId ?? ""}
                        onChange={(e) => void setPersonaVoice(p.id, e.target.value)}
                        className="w-full cursor-pointer rounded-md border border-white/12 bg-white/[0.05] px-2 py-1.5 text-[12px] text-white/85 outline-none focus:border-fuchsia-400/40"
                      >
                        <option value="">— Elegir voz —</option>
                        {getVoicesByGender(p.gender).map((c: CatalogVoice) => (
                          <option key={c.id} value={c.id}>{c.label}{c.premium ? " · xAI" : ""}</option>
                        ))}
                      </select>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={previewPersona === p.id}
                          onClick={() => void previewPersonaVoice(p.id, p.name, p.voiceId)}
                          className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-sky-400/30 bg-sky-500/10 px-2 text-[11px] text-sky-100 hover:bg-sky-500/20 disabled:opacity-40"
                        >
                          {previewPersona === p.id ? "Generando…" : "▶ Probar"}
                        </button>
                        <button
                          type="button"
                          disabled={recState === "recording"}
                          onClick={() => void recordForPersona(p.id)}
                          className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 text-[11px] text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:opacity-40"
                        >
                          {recState === "recording" ? "Grabando…" : "Grabar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void uploadForPersona(p.id)}
                          className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-white/12 bg-white/[0.05] px-2 text-[11px] text-white/75 hover:bg-white/[0.1]"
                        >
                          Subir audio
                        </button>
                      </div>
                    </div>
                  ))}
                  {personaMsg && <p className="text-[11px] text-white/55">{personaMsg}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default VoiceNeuronOnboarding;
