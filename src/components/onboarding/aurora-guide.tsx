"use client";

/**
 * AuroraGuide — guía dinámica de bienvenida y AYUDA de StarSeed OS.
 *
 * Complementa (NO reemplaza) al OnboardingWizard: mientras el wizard crea la
 * CUENTA (identidad/@handle/correo/recuperación), esta guía es un TOUR VIVO de
 * la interfaz — presenta y RESALTA cada capacidad clave del sistema operativo
 * social: el Orbe de Aurora, los cuatro menús Trinity, el Escritorio, el
 * Dashboard, Astraura (agente + memorias de cerebros), el Perfil, los
 * Cerebros/Servidores y la Librería. Explica el FUNCIONAMIENTO de cada zona en
 * español y, en cada paso, ofrece "Ir/mostrar" (te lleva o abre esa superficie)
 * y "Hazlo por mí" (dispara la acción real), sin tocar el motor de Aurora.
 *
 * PREGUNTA INICIAL (elección de modo)
 *   · Antes de empezar, una pantalla pregunta cómo quieres la guía:
 *       (a) Con la voz de Aurora + micrófono → Aurora narra cada paso con
 *           speak() y queda escuchando para avanzar por voz ("siguiente").
 *       (b) Solo la guía, sin voz ni micrófono → silenciosa, mismo sistema
 *           pero sin TTS/STT (nunca llama speak).
 *     La elección se guarda (localStorage 'starseed.guide.mode.v1').
 *
 * SIN AUTO-AVANCE
 *   · La guía NO avanza sola de paso. Solo avanza al pulsar "Siguiente" o —en
 *     modo voz— al decir "siguiente"/"continúa" (comandos por polling defensivo
 *     de getState().transcript). Anterior / Siguiente / Saltar siempre visibles.
 *
 * SILENCIAR AURORA
 *   · Un botón (Volumen/VolumenX) SIEMPRE visible en la guía pausa/reanuda la
 *     narración por voz manteniendo la conversación/guía en TEXTO.
 *
 * DINAMISMO POR PASO
 *   · Cada paso muestra automáticamente un EJEMPLO ANIMADO (mini-demostración
 *     framer-motion) de lo que enseña. Las animaciones dentro del paso corren en
 *     bucle suave; sólo el CAMBIO de paso es manual. Respeta reduced-motion.
 *
 * DISPONIBILIDAD
 *   · Cuentas nuevas / primera visita → arranca sola (marca
 *     localStorage 'starseed.guide.seen.v1'); no reaparece si ya se vio.
 *   · Existentes / bajo demanda        → escucha el CustomEvent
 *     'starseed:open-guide' y expone window.openStarseedGuide(); además pinta un
 *     acceso flotante discreto "Guía" (abajo-izquierda) siempre reabrible.
 *
 * INTEGRACIÓN CON AURORA (sin tocar su motor)
 *   · Sólo por el puente global window.STARSEED_AURORA (helpers en
 *     ./aurora-guide-voice). El motor de voz ya arranca solo; aquí NO se
 *     reinicia. Cada paso trae además una frase "Pídeselo a Aurora: '…'".
 *
 * SPOTLIGHT DEFENSIVO
 *   · Cada paso puede apuntar a un selector (p. ej. [data-guide="orbe"] o el
 *     fallback [aria-label="Aurora"]). Si el objetivo no existe en la ruta
 *     actual, el paso se muestra CENTRADO sin recorte — nunca rompe.
 *
 * SSR-safe y fail-open: todo acceso a window/document/localStorage está
 * guardado; ante cualquier error la guía simplemente no aparece y la app sigue.
 *
 * Sigue Crystal Liquid Glass (tarjetas cristalinas, tintes aurora) y respeta
 * prefers-reduced-motion. Adaptable a smartphone / tablet / desktop.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Sparkles,
  X,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  Compass,
  LayoutGrid,
  Layout,
  Settings2,
  MonitorSmartphone,
  Gauge,
  Brain,
  BookOpen,
  Server,
  UserCircle,
  MessageCircle,
  MousePointerClick,
  Hand,
  Move,
  LifeBuoy,
  Wand2,
  ArrowRight,
  Volume2,
  VolumeX,
  Mic,
  Radio,
  EarOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePerimeter, type PerimeterEdge } from "@/context/perimeter-context";
import { StepDemo } from "./aurora-guide-demos";
import {
  auroraSpeak,
  auroraStopSpeaking,
  auroraSetEnabled,
  auroraEnsureListening,
  auroraTranscript,
  parseVoiceCommand,
} from "./aurora-guide-voice";
import {
  getGuideButtonVisible,
  subscribeGuideButtonVisible,
} from "@/lib/onboarding/guide-visibility";

// ── contratos externos (solo strings/constantes; sin importar el motor) ──────
const GUIDE_SEEN_KEY = "starseed.guide.seen.v1";
const GUIDE_MODE_KEY = "starseed.guide.mode.v1";
export const OPEN_GUIDE_EVENT = "starseed:open-guide";
const AURORA_EXOCORTEX_OPEN_EVENT = "starseed:open-aurora-exocortex";
const AURORA_SUGGEST_EVENT = "aurora:suggest";

/** Modo de la guía: elegido por el usuario en la pantalla inicial. */
type GuideMode = "voice" | "silent";

/** Emite un CustomEvent de forma defensiva (no lanza nunca). */
function emit(name: string, detail?: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(name, detail === undefined ? undefined : { detail }));
  } catch {
    /* fail-open */
  }
}

/** Navega de forma defensiva (router → fallback a location).
 * (Adenda 192) Con VERIFICACIÓN: un diálogo modal abierto encima (p. ej. los
 * popups de primera ejecución) cancela `router.push` EN SILENCIO — visto en
 * vivo con «Ir a Cerebros». Si la ruta no cambió tras un momento, navegación
 * dura con location.assign: los vínculos de la guía funcionan SIEMPRE. */
function safeGoto(router: ReturnType<typeof useRouter>, path: string) {
  try {
    router.push(path);
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      // 4 s: margen para compilaciones en dev y RSC lentos — en esos casos el
      // push SÍ llega y el recambio duro nunca dispara (mantiene viva la guía);
      // con un modal bloqueando, el push muere al instante y el rescate entra.
      window.setTimeout(() => {
        try { if (window.location.pathname !== path) window.location.assign(path); } catch { /* */ }
      }, 4000);
    }
  } catch {
    if (typeof window !== "undefined") {
      try { window.location.assign(path); } catch { /* */ }
    }
  }
}

/**
 * usePerimeter defensivo: el árbol RAÍZ ya monta PerimeterProvider, pero si por
 * cualquier motivo no estuviera, no queremos que la guía tumbe la app. Devuelve
 * un no-op en vez de lanzar.
 */
function useSafePerimeter(): { setActiveEdge: (edge: PerimeterEdge) => void } {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const p = usePerimeter();
    return { setActiveEdge: (edge) => { try { p.setActiveEdge(edge); } catch { /* */ } } };
  } catch {
    return { setActiveEdge: () => {} };
  }
}

// ── modelo de un paso de la guía ─────────────────────────────────────────────
type GuideAction = {
  /** Texto del botón "Ir/mostrar" (acompañar). */
  label: string;
  /** Ejecuta la acción de ACOMPAÑAR (navegar / resaltar / abrir suavemente). */
  run: (ctx: GuideCtx) => void;
};

type GuideCtx = {
  router: ReturnType<typeof useRouter>;
  setActiveEdge: (edge: PerimeterEdge) => void;
};

type GuideStep = {
  key: string;
  title: string;
  /** Explicación clara y útil (2-4 frases). */
  body: string;
  /** Texto compacto que Aurora NARRA por voz (modo voz). Cae al body si falta. */
  say?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; // color de acento (var CSS o hex Trinity)
  /** Selectores candidatos para el spotlight (se usa el primero que exista). */
  targets?: string[];
  /** "Ir/mostrar" — acompañar sin ejecutar la acción disruptiva. */
  go?: GuideAction;
  /** "Hazlo por mí" — dispara la ACCIÓN REAL de este paso. */
  doIt?: { label: string; run: (ctx: GuideCtx) => void };
  /** Frase equivalente por voz (se sugiere a Aurora). */
  ask?: string;
};

// Rutas confirmadas del OS.
const R = {
  escritorios: "/escritorios",
  dashboard: "/dashboard",
  agent: "/agent",
  cerebros: "/cerebros",
  library: "/library",
  profile: "/profile/me",
} as const;

/**
 * Pasos del tour. El orden lleva de lo más presente (el Orbe, siempre visible)
 * a las grandes superficies del sistema. Cada uno explica el FUNCIONAMIENTO.
 */
const STEPS: GuideStep[] = [
  {
    key: "orbe",
    title: "El Orbe de Aurora",
    body:
      "Aurora vive en el orbe flotante, presente en todas las pantallas. Un TOQUE activa o para su voz; MANTENER pulsado abre el menú Trinity centrado y, sin soltar, DESLIZAS hacia una opción para abrirla; ARRASTRA el orbe para moverlo (o llévalo arriba para ocultarlo). Con clic derecho abres su chat completo en el Exocórtex.",
    say:
      "Este es mi orbe. Tócame para activar o parar mi voz; mantén pulsado para abrir el menú Trinity y desliza hacia una opción; arrástrame para moverme.",
    icon: Sparkles,
    accent: "#C9A8FF",
    targets: ['[data-guide="orbe"]', '[aria-label="Aurora"]'],
    doIt: {
      label: "Abrir el chat de Aurora",
      run: ({ setActiveEdge }) => { setActiveEdge("zenith"); emit(AURORA_EXOCORTEX_OPEN_EVENT); },
    },
    ask: "Aurora, abre tu chat en el Exocórtex",
  },
  {
    key: "trinity-zenith",
    title: "Trinity · Zenith (arriba)",
    body:
      "Zenith es tu guía de IA y el Exocórtex: la cortina superior donde Aurora piensa contigo, con acceso a su chat, sentidos y contexto. Es el nodo azul del norte. Ábrelo desde el menú Trinity del orbe o deslizando desde el borde superior.",
    say:
      "Arriba está Zenith, el nodo azul: mi Exocórtex, donde pienso contigo. Ábrelo desde el menú Trinity o deslizando desde el borde superior.",
    icon: Sparkles,
    accent: "#007FFF",
    targets: ['[data-guide="trinity-zenith"]', '[data-trinity-edge-handle="zenith"]', '[data-trinity-petal="zenith"]'],
    go: {
      label: "Abrir Zenith",
      run: ({ setActiveEdge }) => setActiveEdge("zenith"),
    },
    doIt: {
      label: "Abrir Exocórtex",
      run: ({ setActiveEdge }) => { setActiveEdge("zenith"); emit(AURORA_EXOCORTEX_OPEN_EVENT); },
    },
    ask: "Aurora, abre Zenith",
  },
  {
    key: "trinity-horizon",
    title: "Trinity · Horizon (izquierda)",
    body:
      "Horizon es el lienzo de Creación: el nodo verde del oeste. Desde aquí generas y das forma a ideas, contenidos y espacios. Ábrelo desde el menú Trinity del orbe o deslizando desde el borde izquierdo.",
    say:
      "A la izquierda, Horizon, el nodo verde: tu lienzo de creación para dar forma a ideas y contenidos. Ábrelo desde el borde izquierdo.",
    icon: Layout,
    accent: "#39FF14",
    targets: ['[data-guide="trinity-horizon"]', '[data-trinity-edge-handle="horizon"]', '[data-trinity-petal="horizon"]'],
    go: {
      label: "Abrir Horizon",
      run: ({ setActiveEdge }) => setActiveEdge("horizon"),
    },
    ask: "Aurora, abre Horizon",
  },
  {
    key: "trinity-logic",
    title: "Trinity · Logic (derecha)",
    body:
      "Logic es el control del sistema: el nodo ámbar del este. Reúne ajustes, paneles y el mando de lo que ocurre en el OS. Ábrelo desde el menú Trinity del orbe o deslizando desde el borde derecho.",
    say:
      "A la derecha, Logic, el nodo ámbar: el control del sistema, con ajustes y paneles. Ábrelo desde el borde derecho.",
    icon: Settings2,
    accent: "#FFBF00",
    targets: ['[data-guide="trinity-logic"]', '[data-trinity-edge-handle="logic"]', '[data-trinity-petal="logic"]'],
    go: {
      label: "Abrir Logic",
      run: ({ setActiveEdge }) => setActiveEdge("logic"),
    },
    ask: "Aurora, abre Logic",
  },
  {
    key: "trinity-anchor",
    title: "Trinity · Anchor (abajo)",
    body:
      "Anchor es tu dock y acceso raíz: el nodo carmesí del sur. Desde el OmniDock saltas entre las apps y secciones del sistema. Ábrelo desde el menú Trinity del orbe o deslizando desde el borde inferior.",
    say:
      "Abajo, Anchor, el nodo carmesí: tu dock y acceso raíz para saltar entre apps y secciones. Ábrelo desde el borde inferior.",
    icon: LayoutGrid,
    accent: "#DC143C",
    targets: ['[data-guide="trinity-anchor"]', '[data-trinity-edge-handle="anchor"]', '[data-trinity-petal="anchor"]'],
    go: {
      label: "Abrir el Dock",
      run: ({ setActiveEdge }) => setActiveEdge("anchor"),
    },
    ask: "Aurora, abre el dock",
  },
  {
    key: "escritorio",
    title: "El Escritorio",
    body:
      "El Escritorio es tu página principal: un espacio soberano con iconos y ventanas que organizas a tu gusto, como un sistema operativo. Aquí conviven tus apps, accesos y contenidos. Aurora puede navegar y actuar sobre él por voz.",
    say:
      "El Escritorio es tu página principal: un espacio soberano con iconos y ventanas que organizas a tu gusto, como un sistema operativo.",
    icon: MonitorSmartphone,
    accent: "#6FE6D6",
    targets: ['[data-guide="escritorio"]'],
    go: {
      label: "Ir al Escritorio",
      run: ({ router }) => safeGoto(router, R.escritorios),
    },
    doIt: {
      label: "Llévame al Escritorio",
      run: ({ router }) => safeGoto(router, R.escritorios),
    },
    ask: "Aurora, llévame al escritorio",
  },
  {
    key: "dashboard",
    title: "El Dashboard",
    body:
      "El Dashboard reúne tus widgets en una rejilla que puedes reordenar arrastrando: un vistazo vivo a tu red, tus datos y tus herramientas. Personalízalo para tener a mano lo que más usas.",
    say:
      "El Dashboard reúne tus widgets en una rejilla que reordenas arrastrando: un vistazo vivo a tu red, tus datos y tus herramientas.",
    icon: Gauge,
    accent: "#9FE870",
    targets: ['[data-guide="dashboard"]'],
    go: {
      label: "Ir al Dashboard",
      run: ({ router }) => safeGoto(router, R.dashboard),
    },
    ask: "Aurora, abre el dashboard",
  },
  {
    key: "astraura",
    title: "Astraura · IA (Agente)",
    body:
      "Astraura es la mente de Aurora: aquí configuras su cerebro (el modelo de IA), sus memorias, sus skills y sus sentidos, y hablas con ella por voz o texto. Es tu Exocórtex — propiedad tuya, leal a ti. Ajusta qué modelos usa y qué recuerda.",
    say:
      "Astraura es mi mente: aquí configuras mi cerebro, mis memorias, mis skills y mis sentidos. Soy tu Exocórtex, propiedad tuya y leal a ti.",
    icon: Brain,
    accent: "#E879F9",
    targets: ['[data-guide="astraura"]'],
    go: {
      label: "Abrir Astraura",
      run: ({ router }) => safeGoto(router, R.agent),
    },
    doIt: {
      label: "Llévame a Astraura",
      run: ({ router }) => safeGoto(router, R.agent),
    },
    ask: "Aurora, abre tu configuración de agente",
  },
  {
    key: "perfil",
    title: "Tu Perfil",
    body:
      "Tu Perfil es tu cara pública en la red: nombre, @handle, avatar, biografía y lo que compartes. Recuerda que tu Cuenta (privada) es el ancla soberana y puedes tener varios perfiles (cívico, artístico, profesional) sobre ella.",
    say:
      "Tu Perfil es tu cara pública: nombre, arroba, avatar y lo que compartes. Tu Cuenta privada es el ancla, y puedes tener varios perfiles sobre ella.",
    icon: UserCircle,
    accent: "#F0ABFC",
    targets: ['[data-guide="perfil"]'],
    go: {
      label: "Ver mi Perfil",
      run: ({ router }) => safeGoto(router, R.profile),
    },
    ask: "Aurora, muéstrame mi perfil",
  },
  {
    key: "cerebros",
    title: "Cerebros y Servidores",
    body:
      "En Cerebros enlazas servidores y las memorias de cada cerebro en un grafo vivo: conectas fuentes de conocimiento, máquinas y recuerdos para que Aurora piense con más contexto. Es donde tu Exocórtex gana profundidad.",
    say:
      "En Cerebros enlazas servidores y memorias en un grafo vivo: fuentes de conocimiento, máquinas y recuerdos para que yo piense con más contexto.",
    icon: Server,
    accent: "#22D3EE",
    targets: ['[data-guide="cerebros"]'],
    go: {
      label: "Ir a Cerebros",
      run: ({ router }) => safeGoto(router, R.cerebros),
    },
    ask: "Aurora, abre los cerebros",
  },
  {
    key: "libreria",
    title: "La Librería",
    body:
      "La Librería es el catálogo unificado de la red: apps, widgets, recursos y saberes que puedes abrir, instalar o vincular. Es tu puerta a lo que el ecosistema StarSeed pone en común.",
    say:
      "La Librería es el catálogo unificado de la red: apps, widgets, recursos y saberes que puedes abrir, instalar o vincular. Es tu puerta a lo común.",
    icon: BookOpen,
    accent: "#FBBF24",
    targets: ['[data-guide="libreria"]'],
    go: {
      label: "Abrir la Librería",
      run: ({ router }) => safeGoto(router, R.library),
    },
    ask: "Aurora, abre la librería",
  },
];

// Frase de bienvenida que Aurora narra al empezar en modo voz.
const INTRO_SAY =
  "Hola, soy Aurora. Te acompaño por StarSeed. Iré explicando cada zona; cuando quieras avanzar, di siguiente o pulsa el botón. Empecemos.";

export function AuroraGuide() {
  const router = useRouter();
  const { setActiveEdge } = useSafePerimeter();
  const reduceMotion = useReducedMotion() ?? false;

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  // Modo elegido en la pantalla inicial (null = aún no elegido → pregunta).
  const [mode, setMode] = useState<GuideMode | null>(null);
  // Silenciar la narración por voz (sólo TTS; el texto se mantiene). true = mute.
  const [muted, setMuted] = useState(false);
  // Rectángulo del spotlight (si el target existe en la ruta actual).
  const [spot, setSpot] = useState<DOMRect | null>(null);
  // Pista visual de "comando de voz reconocido" (efímera).
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  // Visibilidad del botón flotante de guía (preferencia de Ajustes → Personalización).
  // Se aplica EN VIVO en todas las rutas: el botón se resuscribe a los cambios.
  const [buttonVisible, setButtonVisible] = useState(true);
  useEffect(() => {
    setButtonVisible(getGuideButtonVisible());
    return subscribeGuideButtonVisible(() => setButtonVisible(getGuideButtonVisible()));
  }, []);

  const step = STEPS[index];
  const ctx = useMemo<GuideCtx>(() => ({ router, setActiveEdge }), [router, setActiveEdge]);

  // (Adenda 192) Señal de primer plano: mientras la guía está abierta, los
  // popups de primera ejecución (OmniVoice, sistemas de Astraura…) ESPERAN —
  // abiertos encima enterraban la guía y sus modales cancelaban router.push
  // de los vínculos («Ir a Cerebros» no navegaba). Ver lib/ui/fullscreen-modal.
  useEffect(() => {
    if (typeof document === "undefined") return;
    try {
      if (open) document.body.dataset.ssGuia = "1";
      else delete document.body.dataset.ssGuia;
    } catch { /* defensivo */ }
    return () => { try { delete document.body.dataset.ssGuia; } catch { /* */ } };
  }, [open]);
  const isLast = index >= STEPS.length - 1;
  const isFirst = index <= 0;
  // ¿Estamos ya en el tour (modo elegido)? Si no, se muestra la pregunta inicial.
  const inTour = open && mode !== null;

  // ── montaje + decisión de primera ejecución ────────────────────────────────
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    let seen = false;
    try { seen = window.localStorage.getItem(GUIDE_SEEN_KEY) === "1"; } catch { /* */ }
    // No competir con la presentación breve de Aurora (AuroraIntro): el tour de
    // interfaz solo arranca solo DESPUÉS de que el intro se haya completado, para
    // no solapar dos ventanas la primera vez. El tour sigue disponible a demanda.
    let introDone = false;
    try { introDone = window.localStorage.getItem("starseed.aurora.intro.v1") === "1"; } catch { /* */ }
    if (!seen && introDone) {
      // Primera visita (tras el intro): arranca sola tras un instante.
      const t = setTimeout(() => setOpen(true), 900);
      return () => clearTimeout(t);
    }
  }, []);

  // ── reabrir bajo demanda: evento + helper global ───────────────────────────
  const openGuide = useCallback((startAt = 0) => {
    setIndex(Math.max(0, Math.min(STEPS.length - 1, startAt)));
    // Reabrir SIEMPRE vuelve a preguntar el modo (respeta la elección del momento).
    setMode(null);
    setMuted(false);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = (e: Event) => {
      const at = (e as CustomEvent<{ step?: number }>)?.detail?.step;
      openGuide(typeof at === "number" ? at : 0);
    };
    window.addEventListener(OPEN_GUIDE_EVENT, onOpen);
    // Helper global reutilizable desde cualquier parte (menús, ayuda, Aurora).
    try {
      (window as unknown as Record<string, unknown>).openStarseedGuide = (at?: number) =>
        openGuide(typeof at === "number" ? at : 0);
    } catch { /* */ }
    // (Adenda 192) Relevo tras navegación completa: si el rito de iniciación
    // terminó sobre /login, salta al OS dejando esta marca — al montar aquí
    // (ya dentro del perfil) la guía arranca sola, una única vez.
    try {
      if (window.sessionStorage.getItem("starseed.guide.launch") === "1") {
        window.sessionStorage.removeItem("starseed.guide.launch");
        window.setTimeout(() => openGuide(0), 900);
      }
      // (Adenda 194) Cierre del rito: el usuario acaba de ver su perfil recién
      // creado. Se le deja mirarlo un momento y el recorrido arranca YA en el
      // Escritorio, que es donde empieza el tour.
      if (window.sessionStorage.getItem("starseed.guia.tras.perfil") === "1") {
        window.sessionStorage.removeItem("starseed.guia.tras.perfil");
        window.setTimeout(() => {
          try {
            if (!window.location.pathname.startsWith("/escritorios")) {
              window.sessionStorage.setItem("starseed.guide.launch", "1");
              window.location.assign("/escritorios");
              return;
            }
          } catch { /* seguimos aquí */ }
          openGuide(0);
        }, 3200);
      }
    } catch { /* sin sessionStorage: la guía queda en Ajustes */ }
    return () => {
      window.removeEventListener(OPEN_GUIDE_EVENT, onOpen);
      try { delete (window as unknown as Record<string, unknown>).openStarseedGuide; } catch { /* */ }
    };
  }, [openGuide]);

  // Al cerrar, marca visto (no reaparece sola). Reabrible siempre por evento.
  const markSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(GUIDE_SEEN_KEY, "1"); } catch { /* */ }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    markSeen();
    // Cortesía: al cerrar, calla cualquier narración en curso.
    try { auroraStopSpeaking(); } catch { /* */ }
  }, [markSeen]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(STEPS.length - 1, i + 1)), []);

  // Elegir modo (arranca el tour). En modo voz: pide micrófono + narra la intro.
  const chooseMode = useCallback((m: GuideMode) => {
    // Persistimos la elección (memoria ligera; no bloquea si falla).
    try { window.localStorage.setItem(GUIDE_MODE_KEY, m); } catch { /* */ }
    setMuted(false);
    setIndex(0);
    setMode(m);
    if (m === "voice") {
      // Gesto de usuario: momento válido para pedir micrófono y arrancar escucha.
      auroraEnsureListening();
      // Aurora saluda; el paso 0 narrará su explicación vía el efecto de abajo.
      auroraSpeak(INTRO_SAY);
    }
  }, []);

  // ── narración por voz de cada paso (solo modo voz + no muteado) ─────────────
  // Se dispara al cambiar de paso; el motor de voz YA está arrancado (no se
  // reinicia). En modo silencioso o muteado NUNCA llama speak.
  const lastSpokenRef = useRef<string>("");
  useEffect(() => {
    if (!inTour || mode !== "voice" || muted || !step) return;
    // Evita re-narrar el mismo paso (p. ej. por re-render).
    if (lastSpokenRef.current === step.key) return;
    lastSpokenRef.current = step.key;
    // Pequeño respiro para no pisar la intro / la transición.
    const t = setTimeout(() => {
      auroraSpeak(step.say || step.body);
    }, 260);
    return () => clearTimeout(t);
  }, [inTour, mode, muted, step]);

  // Al mutear en modo voz: corta lo que se esté diciendo. Al desmutear: no
  // re-narramos automáticamente (evita sorpresas); el usuario avanza o repite.
  useEffect(() => {
    if (muted) {
      try { auroraStopSpeaking(); } catch { /* */ }
    }
  }, [muted]);

  // ── comandos de voz simples: polling defensivo del transcript ──────────────
  // Solo en modo voz y sin mute. Lee getState().transcript por el puente y, si
  // detecta "siguiente"/"anterior"/"cerrar", actúa. Defensivo: si no hay puente,
  // no hace nada (degrada al botón).
  const lastCmdTsRef = useRef<number>(0);
  const lastTranscriptRef = useRef<string>("");
  useEffect(() => {
    if (!inTour || mode !== "voice" || muted) return;
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      let tx = "";
      try { tx = auroraTranscript(); } catch { tx = ""; }
      if (!tx || tx === lastTranscriptRef.current) return;
      lastTranscriptRef.current = tx;
      const cmd = parseVoiceCommand(tx);
      if (!cmd) return;
      // Anti-rebote: máx. un comando por ~1.4s.
      const now = Date.now();
      if (now - lastCmdTsRef.current < 1400) return;
      lastCmdTsRef.current = now;
      if (cmd === "next") {
        setVoiceHint("siguiente");
        setIndex((i) => Math.min(STEPS.length - 1, i + 1));
      } else if (cmd === "prev") {
        setVoiceHint("anterior");
        setIndex((i) => Math.max(0, i - 1));
      } else if (cmd === "close") {
        setVoiceHint("cerrar");
        close();
      }
    }, 550);
    return () => window.clearInterval(id);
  }, [inTour, mode, muted, close]);

  // La pista de "comando reconocido" se desvanece sola.
  useEffect(() => {
    if (!voiceHint) return;
    const t = setTimeout(() => setVoiceHint(null), 1500);
    return () => clearTimeout(t);
  }, [voiceHint]);

  // Escape cierra la guía; flechas navegan (siempre disponible en el tour).
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (inTour && e.key === "ArrowRight") setIndex((i) => Math.min(STEPS.length - 1, i + 1));
      else if (inTour && e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, inTour, close]);

  // ── localizar el objetivo del spotlight (defensivo; recalcula por paso) ─────
  const locateTarget = useCallback(() => {
    if (typeof document === "undefined") { setSpot(null); return; }
    if (!inTour) { setSpot(null); return; }
    const selectors = step?.targets || [];
    let el: Element | null = null;
    for (const sel of selectors) {
      try { el = document.querySelector(sel); } catch { el = null; }
      if (el) break;
    }
    if (!el) { setSpot(null); return; }
    try {
      const r = el.getBoundingClientRect();
      // Si el elemento no es visible (0x0 u oculto), no dibujamos recorte.
      if (r.width < 2 || r.height < 2) { setSpot(null); return; }
      setSpot(r);
    } catch { setSpot(null); }
  }, [step, inTour]);

  useEffect(() => {
    if (!inTour) { setSpot(null); return; }
    // Reintenta un par de veces por si el target aparece con animación.
    locateTarget();
    const t1 = setTimeout(locateTarget, 180);
    const t2 = setTimeout(locateTarget, 520);
    const onResize = () => locateTarget();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      clearTimeout(t1); clearTimeout(t2);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [inTour, index, locateTarget]);

  // Sugerir a Aurora la frase de voz equivalente (integración ligera).
  const askAurora = useCallback(() => {
    if (!step?.ask) return;
    emit(AURORA_SUGGEST_EVENT, { text: step.ask, context: "guide" });
  }, [step]);

  // Silenciar / reactivar la narración (mantiene la guía en texto).
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (next) {
        // Mute: corta la voz ahora mismo.
        try { auroraStopSpeaking(); } catch { /* */ }
      } else {
        // Reactivar: permite volver a narrar este paso al instante.
        lastSpokenRef.current = "";
        if (mode === "voice" && step) auroraSpeak(step.say || step.body);
      }
      return next;
    });
  }, [mode, step]);

  // ── acceso flotante discreto (siempre reabrible) ───────────────────────────
  // Se oculta mientras la guía está abierta, o si el usuario lo desactivó en
  // Ajustes → Personalización ("Botón de guía"). El tour por primera visita y el
  // helper global window.openStarseedGuide() siguen disponibles igualmente.
  const FloatingAccess = !open && buttonVisible ? (
    <button
      type="button"
      onClick={() => openGuide(0)}
      aria-label="Abrir la guía de StarSeed"
      title="Guía y ayuda de StarSeed"
      className={cn(
        "fixed bottom-4 left-4 z-[70] inline-flex items-center gap-2 rounded-full",
        "border border-white/12 px-3 py-2 text-[12px] font-medium text-white/85",
        "backdrop-blur-2xl shadow-lg shadow-black/40 cursor-pointer",
        "transition-transform hover:scale-[1.04] active:scale-95",
      )}
      style={{
        background:
          "radial-gradient(120% 90% at 20% 0%, rgba(159,232,112,0.14), transparent 60%), radial-gradient(140% 90% at 110% 10%, rgba(201,168,255,0.16), transparent 55%), rgba(9,13,18,0.82)",
      }}
    >
      <LifeBuoy className="h-4 w-4 text-[#9FE870]" />
      <span className="hidden sm:inline">Guía</span>
    </button>
  ) : null;

  if (!mounted) return null;

  const StepIcon = step?.icon || Compass;

  // Transiciones respetando reduced-motion.
  const panelInit = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 };
  const panelIn = reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };
  const panelOut = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 };
  const contentInit = reduceMotion ? { opacity: 0 } : { opacity: 0, x: 20 };
  const contentIn = reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 };
  const contentOut = reduceMotion ? { opacity: 0 } : { opacity: 0, x: -20 };

  return (
    <>
      {FloatingAccess}

      <AnimatePresence>
        {open && (
          <motion.div
            key="aurora-guide-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22 }}
            className="fixed inset-0 z-[95]"
            aria-modal="true"
            role="dialog"
            aria-label="Guía de StarSeed"
          >
            {/* ── Backdrop + recorte del spotlight ──────────────────────────
                Si hay objetivo, oscurecemos todo MENOS su rectángulo (recorte
                con box-shadow gigante) y dibujamos un anillo. Si no, backdrop
                cristalino uniforme y la tarjeta queda centrada. */}
            <button
              type="button"
              aria-label="Cerrar la guía"
              onClick={close}
              className="absolute inset-0 h-full w-full cursor-default backdrop-blur-[3px]"
              style={{
                background:
                  "radial-gradient(120% 120% at 50% 40%, rgba(8,12,20,0.42) 0%, rgba(4,7,13,0.7) 100%)",
              }}
            />

            {spot && inTour && (
              <>
                {/* Máscara con recorte: oscurece el resto mediante box-shadow. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute rounded-2xl"
                  style={{
                    left: spot.left - 8,
                    top: spot.top - 8,
                    width: spot.width + 16,
                    height: spot.height + 16,
                    boxShadow: "0 0 0 9999px rgba(4,7,13,0.72)",
                    borderRadius: 18,
                  }}
                />
                {/* Anillo luminoso (glow del acento del paso). */}
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute rounded-2xl"
                  initial={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
                  animate={{
                    opacity: 1,
                    scale: reduceMotion ? 1 : [1, 1.03, 1],
                  }}
                  transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    left: spot.left - 8,
                    top: spot.top - 8,
                    width: spot.width + 16,
                    height: spot.height + 16,
                    borderRadius: 18,
                    border: `2px solid ${step.accent}`,
                    boxShadow: `0 0 0 2px color-mix(in srgb, ${step.accent} 35%, transparent), 0 0 34px color-mix(in srgb, ${step.accent} 65%, transparent)`,
                  }}
                />
              </>
            )}

            {/* ════════════════ PANTALLA INICIAL — PREGUNTA DE MODO ═══════════ */}
            {!inTour && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-3">
                <motion.div
                  key="guide-mode-picker"
                  initial={panelInit}
                  animate={panelIn}
                  exit={panelOut}
                  transition={{ type: reduceMotion ? "tween" : "spring", stiffness: 300, damping: 28, duration: reduceMotion ? 0.15 : undefined }}
                  className={cn(
                    "pointer-events-auto relative w-full max-w-[30rem] overflow-hidden rounded-[24px]",
                    "border border-white/12 shadow-2xl shadow-black/60 backdrop-blur-2xl",
                  )}
                  style={{
                    background:
                      "radial-gradient(150% 80% at 12% -10%, rgba(159,232,112,0.10), transparent 58%), radial-gradient(160% 90% at 112% 0%, rgba(201,168,255,0.12), transparent 55%), rgba(9,13,18,0.92)",
                  }}
                >
                  <div
                    aria-hidden
                    className="h-[2px] w-full bg-gradient-to-r from-[#9FE870] via-[#6FE6D6] to-[#C9A8FF] opacity-85 shadow-[0_0_14px_rgba(111,230,214,0.55)]"
                  />
                  <div className="p-5 sm:p-6">
                    {/* Cerrar (arriba-derecha) */}
                    <button
                      type="button"
                      onClick={close}
                      aria-label="Cerrar la guía"
                      className="absolute right-3 top-3 rounded-lg p-1 text-white/45 transition hover:bg-white/10 hover:text-white cursor-pointer"
                    >
                      <X className="h-4.5 w-4.5" />
                    </button>

                    {/* Orbe latiendo como bienvenida */}
                    <div className="flex flex-col items-center text-center">
                      <motion.div
                        className="mb-3 grid h-16 w-16 place-items-center rounded-full"
                        style={{
                          background:
                            "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95), #C9A8FF 55%, #4c1d95 100%)",
                          boxShadow: "0 0 30px rgba(201,168,255,0.6)",
                        }}
                        animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
                        transition={reduceMotion ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <Sparkles className="h-7 w-7 text-white" />
                      </motion.div>
                      <h2 className="text-[19px] font-bold text-white">¿Cómo quieres la guía?</h2>
                      <p className="mt-1.5 max-w-[24rem] text-[13px] leading-relaxed text-white/70">
                        Soy Aurora y te acompaño a conocer StarSeed. Elige cómo prefieres el
                        recorrido. Podrás cambiar el silencio en cualquier momento.
                      </p>
                    </div>

                    {/* Opciones de modo */}
                    <div className="mt-5 grid gap-2.5">
                      {/* Con voz + micrófono */}
                      <button
                        type="button"
                        onClick={() => chooseMode("voice")}
                        className="group flex items-start gap-3 rounded-2xl border border-[#C9A8FF]/30 p-3.5 text-left transition hover:border-[#C9A8FF]/60 cursor-pointer"
                        style={{
                          background:
                            "radial-gradient(120% 90% at 12% 0%, rgba(201,168,255,0.14), transparent 60%), rgba(255,255,255,0.03)",
                        }}
                      >
                        <div
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border"
                          style={{
                            color: "#C9A8FF",
                            borderColor: "color-mix(in srgb, #C9A8FF 45%, transparent)",
                            background: "color-mix(in srgb, #C9A8FF 16%, rgba(8,12,18,0.7))",
                          }}
                        >
                          <Mic className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold text-white">
                              Con la voz de Aurora + micrófono
                            </span>
                            <Radio className="h-3.5 w-3.5 text-[#C9A8FF] opacity-80" />
                          </div>
                          <p className="mt-0.5 text-[11.5px] leading-snug text-white/60">
                            Narro cada paso en voz alta y me quedo escuchando: di
                            <span className="text-white/80"> “siguiente” </span>
                            o <span className="text-white/80">“continúa”</span> para avanzar.
                          </p>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/80" />
                      </button>

                      {/* Solo la guía, sin voz */}
                      <button
                        type="button"
                        onClick={() => chooseMode("silent")}
                        className="group flex items-start gap-3 rounded-2xl border border-white/12 p-3.5 text-left transition hover:border-white/25 cursor-pointer"
                        style={{ background: "rgba(255,255,255,0.03)" }}
                      >
                        <div
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 text-white/70"
                          style={{ background: "rgba(255,255,255,0.05)" }}
                        >
                          <EarOff className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[14px] font-semibold text-white">
                            Solo la guía, sin voz ni micrófono
                          </span>
                          <p className="mt-0.5 text-[11.5px] leading-snug text-white/60">
                            Recorrido silencioso, con los mismos pasos y ejemplos animados.
                            Avanzas con los botones. No uso micrófono ni hablo.
                          </p>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/80" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={close}
                      className="mt-4 inline-flex w-full items-center justify-center gap-1 text-[11px] text-white/40 transition hover:text-white/70 cursor-pointer"
                    >
                      <SkipForward className="h-3 w-3" /> Ahora no, saltar la guía
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {/* ════════════════════════ TARJETA DEL TOUR ══════════════════════
                Centrada por defecto; si hay spotlight, se ancla al lado con más
                espacio (abajo si el target está arriba, y viceversa). */}
            {inTour && step && (
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 flex justify-center px-3",
                  spot
                    ? spot.top > (typeof window !== "undefined" ? window.innerHeight : 800) / 2
                      ? "top-4 sm:top-8"       // target abajo → tarjeta arriba
                      : "bottom-4 sm:bottom-8" // target arriba → tarjeta abajo
                    : "top-1/2 -translate-y-1/2",
                )}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step.key}
                    initial={panelInit}
                    animate={panelIn}
                    exit={panelOut}
                    transition={{ type: reduceMotion ? "tween" : "spring", stiffness: 320, damping: 30, duration: reduceMotion ? 0.15 : undefined }}
                    className={cn(
                      "pointer-events-auto relative w-full max-w-[30rem] overflow-hidden rounded-[24px]",
                      "border border-white/12 shadow-2xl shadow-black/60 backdrop-blur-2xl",
                    )}
                    style={{
                      background:
                        "radial-gradient(150% 80% at 12% -10%, rgba(159,232,112,0.10), transparent 58%), radial-gradient(160% 90% at 112% 0%, rgba(201,168,255,0.12), transparent 55%), rgba(9,13,18,0.92)",
                    }}
                  >
                    {/* Filo aurora superior (lenguaje del Café). */}
                    <div
                      aria-hidden
                      className="h-[2px] w-full bg-gradient-to-r from-[#9FE870] via-[#6FE6D6] to-[#C9A8FF] opacity-85 shadow-[0_0_14px_rgba(111,230,214,0.55)]"
                    />

                    <div className="p-4 sm:p-5">
                      {/* Cabecera: icono + título + índice + [mute] + cerrar */}
                      <div className="flex items-start gap-3">
                        <div
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border"
                          style={{
                            color: step.accent,
                            borderColor: `color-mix(in srgb, ${step.accent} 45%, transparent)`,
                            background: `radial-gradient(120% 95% at 30% 18%, rgba(255,255,255,0.22), transparent 55%), color-mix(in srgb, ${step.accent} 16%, rgba(8,12,18,0.7))`,
                          }}
                        >
                          <StepIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h2 className="truncate text-[16px] font-bold text-white">{step.title}</h2>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
                            <Compass className="h-3 w-3" />
                            Paso {index + 1} de {STEPS.length}
                            {mode === "voice" && (
                              <span className="inline-flex items-center gap-1 text-[#C9A8FF]/80">
                                · {muted ? <VolumeX className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
                                {muted ? "silencio" : "voz"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Botón SILENCIAR (siempre visible en el tour) */}
                        <button
                          type="button"
                          onClick={toggleMute}
                          aria-label={muted ? "Reactivar la voz de Aurora" : "Silenciar la voz de Aurora"}
                          title={muted ? "Reactivar la voz de Aurora" : "Silenciar la voz de Aurora (la guía sigue en texto)"}
                          className={cn(
                            "shrink-0 rounded-lg border p-1.5 transition cursor-pointer",
                            muted
                              ? "border-white/12 bg-white/[0.03] text-white/50 hover:text-white"
                              : "border-[#C9A8FF]/30 bg-[#C9A8FF]/10 text-[#C9A8FF] hover:bg-[#C9A8FF]/20",
                          )}
                        >
                          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </button>

                        <button
                          type="button"
                          onClick={close}
                          aria-label="Cerrar la guía"
                          className="shrink-0 rounded-lg p-1 text-white/45 transition hover:bg-white/10 hover:text-white cursor-pointer"
                        >
                          <X className="h-4.5 w-4.5" />
                        </button>
                      </div>

                      {/* ── EJEMPLO ANIMADO del paso (mini-demostración) ── */}
                      <div className="mt-3.5">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={`${step.key}-demo`}
                            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                            transition={{ duration: reduceMotion ? 0.12 : 0.3 }}
                          >
                            <StepDemo stepKey={step.key} accent={step.accent} reduce={reduceMotion} />
                          </motion.div>
                        </AnimatePresence>
                      </div>

                      {/* Cuerpo animado por paso */}
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={`${step.key}-body`}
                          initial={contentInit}
                          animate={contentIn}
                          exit={contentOut}
                          transition={{ duration: reduceMotion ? 0.12 : 0.28 }}
                          className="mt-3 text-[13.5px] leading-relaxed text-white/75"
                        >
                          {step.body}
                        </motion.p>
                      </AnimatePresence>

                      {/* Chips de gestos (solo en el paso del orbe) */}
                      {step.key === "orbe" && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {[
                            { Icon: MousePointerClick, t: "Tocar · voz" },
                            { Icon: Hand, t: "Mantener · Trinity" },
                            { Icon: Move, t: "Arrastrar · mover" },
                          ].map(({ Icon, t }) => (
                            <span
                              key={t}
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-white/65"
                            >
                              <Icon className="h-3 w-3 text-[#C9A8FF]" /> {t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Acciones del paso: "Ir/mostrar" (acompañar) + "Hazlo por mí" */}
                      {(step.go || step.doIt) && (
                        <div className="mt-3.5 flex flex-wrap gap-2">
                          {step.go && (
                            <button
                              type="button"
                              onClick={() => step.go?.run(ctx)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 transition hover:bg-white/[0.09] cursor-pointer"
                              title="Acompañar: te muestro o abro esta zona"
                            >
                              <ArrowRight className="h-3.5 w-3.5" style={{ color: step.accent }} />
                              {step.go.label}
                            </button>
                          )}
                          {step.doIt && (
                            <button
                              type="button"
                              onClick={() => step.doIt?.run(ctx)}
                              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-white transition cursor-pointer"
                              style={{
                                background: `linear-gradient(90deg, color-mix(in srgb, ${step.accent} 55%, #6d28d9), color-mix(in srgb, ${step.accent} 35%, #0891b2))`,
                              }}
                              title="Hazlo por mí: disparo la acción real de este paso"
                            >
                              <Wand2 className="h-3.5 w-3.5" />
                              {step.doIt.label}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Pídeselo a Aurora (integración ligera) */}
                      {step.ask && (
                        <button
                          type="button"
                          onClick={askAurora}
                          className="mt-3 flex w-full items-start gap-2 rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/15 px-3 py-2 text-left transition hover:bg-fuchsia-950/25 cursor-pointer"
                          title="Sugerir esta frase a Aurora"
                        >
                          <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-300" />
                          <span className="text-[11.5px] leading-snug text-fuchsia-100/85">
                            <span className="text-fuchsia-300/70">Pídeselo a Aurora: </span>
                            <span className="italic">“{step.ask}”</span>
                          </span>
                        </button>
                      )}

                      {/* Barra de PROGRESO (posición del tour; NO auto-avanza) */}
                      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#9FE870] to-[#C9A8FF]"
                          animate={{ width: `${Math.round(((index + 1) / STEPS.length) * 100)}%` }}
                          transition={{ duration: reduceMotion ? 0 : 0.35, ease: "easeOut" }}
                        />
                      </div>

                      {/* Controles: Anterior · Siguiente/Terminar · Saltar */}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={goPrev}
                            disabled={isFirst}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                          </button>
                          {/* Indicador de escucha por voz (solo modo voz activo) */}
                          {mode === "voice" && !muted && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-[#C9A8FF]/25 bg-[#C9A8FF]/10 px-2 py-1 text-[10px] font-medium text-[#C9A8FF]"
                              title="Puedes decir “siguiente” o “continúa” para avanzar"
                            >
                              <motion.span
                                className="h-1.5 w-1.5 rounded-full bg-[#C9A8FF]"
                                animate={reduceMotion ? undefined : { opacity: [1, 0.3, 1] }}
                                transition={reduceMotion ? undefined : { duration: 1.4, repeat: Infinity }}
                              />
                              Escuchando
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={close}
                            className="inline-flex items-center gap-1 text-[11px] text-white/40 transition hover:text-white/70 cursor-pointer"
                          >
                            <SkipForward className="h-3 w-3" /> Saltar
                          </button>
                          {isLast ? (
                            <button
                              type="button"
                              onClick={close}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:from-emerald-500 hover:to-cyan-500 cursor-pointer"
                            >
                              Entendido
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={goNext}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:from-fuchsia-500 hover:to-cyan-500 cursor-pointer"
                            >
                              Siguiente <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Puntos de navegación por paso */}
                      <div className="mt-3 flex items-center justify-center gap-1.5">
                        {STEPS.map((s, i) => (
                          <button
                            key={s.key}
                            type="button"
                            onClick={() => setIndex(i)}
                            aria-label={`Ir al paso ${i + 1}: ${s.title}`}
                            title={s.title}
                            className={cn(
                              "h-1.5 rounded-full transition-all cursor-pointer",
                              i === index ? "w-6 bg-gradient-to-r from-[#9FE870] to-[#C9A8FF]" : "w-1.5 bg-white/20 hover:bg-white/40",
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Pista efímera de "comando de voz reconocido" */}
                <AnimatePresence>
                  {voiceHint && (
                    <motion.div
                      key="voice-hint"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-[#C9A8FF]/30 bg-[#1a1030]/90 px-3 py-1 text-[11px] font-medium text-[#C9A8FF] backdrop-blur-md"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Mic className="h-3 w-3" /> “{voiceHint}”
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default AuroraGuide;
