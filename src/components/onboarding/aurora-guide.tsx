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
 *     localStorage 'starseed.guide.seen.v1' + marca de la CUENTA `guia.bienvenida`, ver
 *     lib/onboarding/guia-vista.ts); no reaparece si ya se vio en ningún medio.
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
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import {
  Sparkles,
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
  Atom,
  Network,
  Layers,
  Landmark,
  GraduationCap,
  Palette,
  Hammer,
  ShieldCheck,
  UserPlus,
  LogIn,
  Lock,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePerimeter, type PerimeterEdge } from "@/context/perimeter-context";
import { DemoPaso } from "./demo-paso";
import { BarraCapitulos, IndiceGuia, PuntosPaso, RazonesCuenta, TarjetasPaso } from "./guia-completa-ui";
import { IconoStarSeed } from "./icono-starseed";
import {
  auroraBridge,
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
import { esMiTurno, terminarEtapa, suscribirRito, navegarSuave } from "@/lib/onboarding/director-rito";
import { cuandoCuentaFiable } from "@/lib/sync/realtime-sync";
import { GUIA_VERSION, copiarGuiaLocalACuenta, marcarGuiaVista, temasNuevosPara, versionGuiaVistaEnCuenta } from "@/lib/onboarding/guia-vista";
import {
  ACENTOS_TRINITY,
  PASOS_GUIA,
  acotarIndice,
  capituloDeIndice,
  etiquetaProgreso,
  indiceInicial,
  irNecesitaCuenta,
  textoDelPaso,
  vozDelPaso,
  type PasoGuia,
} from "@/lib/onboarding/guia-completa";
import { borrarProgresoGuia, guardarProgresoGuia, leerProgresoGuia } from "@/lib/onboarding/guia-progreso";
import { pedirAccesoDesdeGuia, type AccionGuia, type OrigenGuia } from "@/lib/onboarding/guia-acceso";
import { abrirPrimerArranque } from "@/lib/onboarding/primer-arranque";
import { explorarSinCuenta } from "@/lib/onboarding/explorar-sin-cuenta";
import { useHaySesion } from "@/hooks/use-hay-sesion";
import { esRutaConsola } from "@/components/layout/solo-fuera-de-consola";
import { BotonCerrar } from "@/components/ui/boton-cerrar";
import { usePerfilDispositivo } from "@/hooks/use-perfil-dispositivo";
import { useNivelMovimiento } from "@/hooks/use-nivel-movimiento";
import { useDeslizarPasos } from "@/hooks/use-deslizar-pasos";
import { useDireccionPaso } from "@/components/movimiento/paso-animado";
import { transicionPaso, variantesPaso, type Direccion } from "@/lib/movimiento/transiciones";

// ── contratos externos (solo strings/constantes; sin importar el motor) ──────
const GUIDE_MODE_KEY = "starseed.guide.mode.v1";
export const OPEN_GUIDE_EVENT = "starseed:open-guide";
const AURORA_EXOCORTEX_OPEN_EVENT = "starseed:open-aurora-exocortex";
const AURORA_SUGGEST_EVENT = "aurora:suggest";

/** Modo de la guía: elegido por el usuario en la pantalla inicial. */
type GuideMode = "voice" | "silent";

/**
 * (GUI1021J) Capa del panel de la guía: por encima de la pantalla de acceso (`AuthGate` z 200,
 * `WelcomeWindow` z 210) cuando la guía se abre desde ella; en cualquier otra, la capa de siempre.
 */
export function zGuia(desde?: OrigenGuia): number {
  return desde === "login" || desde === "bienvenida" ? 240 : 95;
}

/** Aviso que se muestra cuando el modo voz se pasa a texto por falta del puente de Aurora. */
const AVISO_SIN_PUENTE =
  "El puente de Aurora no está disponible ahora mismo: la guía sigue en texto.";

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
// (Ola 1025U · GUIA1025U) Los pasos YA NO se definen aquí: salen del catálogo único
// `lib/onboarding/guia-completa.ts`, el mismo que recorre la introducción de la ventana de acceso. Este
// archivo solo les pone lo que es de la interfaz: el icono, el objetivo que se ilumina, «Ir» y «Hazlo por mí».
type GuideAction = {
  /** Texto del botón "Ir/mostrar" (acompañar). */
  label: string;
  /** Ejecuta la acción de ACOMPAÑAR (navegar / resaltar / abrir suavemente). */
  run: (ctx: GuideCtx) => void;
  /** Sin cuenta se sustituye por «Disponible al entrar» (lleva a una zona que la pide). */
  cuenta?: boolean;
};

type GuideCtx = {
  router: ReturnType<typeof useRouter>;
  setActiveEdge: (edge: PerimeterEdge) => void;
};

type GuideStep = {
  key: string;
  /** El paso del catálogo del que sale todo lo demás. */
  paso: PasoGuia;
  title: string;
  /** Explicación clara y útil. */
  body: string;
  /** Texto compacto que Aurora NARRA por voz (modo voz). */
  say: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; // color de acento (hex Trinity)
  /** Selectores candidatos para el spotlight (se usa el primero que exista). */
  targets?: string[];
  /** "Ir/mostrar" — acompañar sin ejecutar la acción disruptiva. */
  go?: GuideAction;
  /** "Hazlo por mí" — dispara la ACCIÓN REAL de este paso. */
  doIt?: GuideAction;
  /** Frase equivalente por voz (se sugiere a Aurora). */
  ask?: string;
};

/** El icono de cada paso (los que no estén aquí usan la brújula). */
const ICONOS: Record<string, React.ComponentType<{ className?: string }>> = {
  bienvenida: Sparkles,
  "que-es": LayoutGrid,
  orbe: Sparkles,
  "trinity-zenith": Sparkles,
  "trinity-horizon": Layout,
  "trinity-logic": Settings2,
  "trinity-anchor": LayoutGrid,
  "gestos-hibridos": Move,
  protomolecula: Atom,
  malla: Network,
  "capas-conciencia": Layers,
  "neuronas-cerebro": Brain,
  "pilar-politica": Landmark,
  "pilar-educacion": GraduationCap,
  "pilar-cultura": Palette,
  "libreria-biblioteca": BookOpen,
  genesis: Hammer,
  "personalizacion-segura": ShieldCheck,
  escritorio: MonitorSmartphone,
  dashboard: Gauge,
  astraura: Brain,
  perfil: UserCircle,
  cerebros: Server,
  cuenta: UserPlus,
};

/** Selectores del objetivo que se ilumina en cada paso (si no existe en la ruta, el paso va centrado). */
const OBJETIVOS: Record<string, string[]> = {
  orbe: ['[data-guide="orbe"]', '[aria-label="Aurora"]'],
  "trinity-zenith": ['[data-guide="trinity-zenith"]', '[data-trinity-edge-handle="zenith"]', '[data-trinity-petal="zenith"]'],
  "trinity-horizon": ['[data-guide="trinity-horizon"]', '[data-trinity-edge-handle="horizon"]', '[data-trinity-petal="horizon"]'],
  "trinity-logic": ['[data-guide="trinity-logic"]', '[data-trinity-edge-handle="logic"]', '[data-trinity-petal="logic"]'],
  "trinity-anchor": ['[data-guide="trinity-anchor"]', '[data-trinity-edge-handle="anchor"]', '[data-trinity-petal="anchor"]'],
  "gestos-hibridos": ['[data-trinity-edge-handle="horizon"]', '[data-trinity-sensor="horizon"]'],
  escritorio: ['[data-guide="escritorio"]', '[data-guide="dock-escritorios"]'],
  dashboard: ['[data-guide="dashboard"]', '[data-guide="dock-dashboard"]'],
  astraura: ['[data-guide="astraura"]', '[data-guide="dock-ai-studio"]', '[data-guide="dock-apps-ia"]'],
  perfil: ['[data-guide="perfil"]', '[data-guide="dock-profile"]'],
  cerebros: ['[data-guide="cerebros"]', '[data-guide="dock-cerebros"]', '[data-guide="dock-cerebro"]'],
  "libreria-biblioteca": ['[data-guide="libreria"]', '[data-guide="dock-mylib"]', '[data-guide="dock-netlib"]'],
};

// Rutas confirmadas del OS (la de los escritorios es también adonde lleva «Explorar sin cuenta»).
const R = {
  escritorios: "/escritorios",
  agent: "/agent",
} as const;

/** «Hazlo por mí»: la acción REAL de los pasos que la tienen. */
const HAZLO_POR_MI: Record<string, GuideAction> = {
  orbe: {
    label: "Abrir el chat de Aurora",
    run: ({ setActiveEdge }) => { setActiveEdge("zenith"); emit(AURORA_EXOCORTEX_OPEN_EVENT); },
  },
  "trinity-zenith": {
    label: "Abrir Exocórtex",
    run: ({ setActiveEdge }) => { setActiveEdge("zenith"); emit(AURORA_EXOCORTEX_OPEN_EVENT); },
  },
  escritorio: {
    label: "Llévame al Escritorio",
    run: ({ router }) => safeGoto(router, R.escritorios),
    cuenta: false,
  },
  astraura: {
    label: "Llévame a Astraura",
    run: ({ router }) => safeGoto(router, R.agent),
    cuenta: true,
  },
};

/** Un paso del catálogo con lo que le pone esta interfaz. */
function decorar(paso: PasoGuia): GuideStep {
  const go: GuideAction | undefined = paso.borde
    ? { label: paso.irEtiqueta ?? "Abrir", run: ({ setActiveEdge }) => setActiveEdge(paso.borde as PerimeterEdge) }
    : paso.ruta
      ? {
          label: paso.irEtiqueta ?? "Abrir",
          run: ({ router }) => safeGoto(router, paso.ruta as string),
          cuenta: irNecesitaCuenta(paso),
        }
      : undefined;
  return {
    key: paso.id,
    paso,
    title: paso.titulo,
    body: paso.texto,
    say: paso.voz,
    icon: ICONOS[paso.id] ?? Compass,
    accent: ACENTOS_TRINITY[paso.acento],
    targets: OBJETIVOS[paso.id],
    go,
    doIt: HAZLO_POR_MI[paso.id],
    ask: paso.pregunta,
  };
}

/** Los pasos del recorrido: los del catálogo único, en su orden. */
const STEPS: GuideStep[] = PASOS_GUIA.map(decorar);

// Frase de bienvenida que Aurora narra al empezar en modo voz.
const INTRO_SAY =
  "Hola, soy Aurora. Te acompaño por StarSeed. Iré explicando cada zona; cuando quieras avanzar, di siguiente o pulsa el botón. Empecemos.";

export function AuroraGuide() {
  const router = useRouter();
  const pathname = usePathname();
  const { setActiveEdge } = useSafePerimeter();
  const reduceMotion = useReducedMotion() ?? false;
  // Qué punteros hay (dedo, ratón o ambos): la guía explica el gesto que la
  // persona puede hacer en ESTE dispositivo, y cambia en vivo si conecta un ratón.
  const { entrada } = usePerfilDispositivo();
  const nivelMovimiento = useNivelMovimiento();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  // Aviso único de novedades para quien ya vio una versión anterior de la guía (`guia-vista.ts`).
  const [novedades, setNovedades] = useState<readonly string[] | null>(null);
  const [index, setIndex] = useState(0);
  // (Ola 1025U) De dónde se abrió (decide qué hace el final sin cuenta) y si se retomó por donde se quedó.
  const [origen, setOrigen] = useState<OrigenGuia | undefined>(undefined);
  const [reanudadoEn, setReanudadoEn] = useState<number | null>(null);
  // Modo elegido en la pantalla inicial (null = aún no elegido → pregunta).
  const [mode, setMode] = useState<GuideMode | null>(null);
  // (GUI1021J) El modo voz pasó a texto por falta del puente de Aurora: se le dice aquí.
  const [avisoVoz, setAvisoVoz] = useState<string | null>(null);
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
  // ¿Con cuenta o sin ella? (`null` = aún no se sabe: no se quita nada). Solo se averigua con la guía abierta.
  const haySesion = useHaySesion(open);
  const sinCuenta = haySesion === false;
  // (GUI1021J) Al iniciar sesión después de haberla visto sin cuenta, lo visto del aparato
  // pasa a la marca de la cuenta (`unirVistas`): los demás medios dejan de pedirle la guía nueva.
  const unirVistas = useCallback(() => {
    try { copiarGuiaLocalACuenta(); } catch { /* */ }
  }, []);
  useEffect(() => {
    if (haySesion === true) unirVistas();
  }, [haySesion, unirVistas]);
  // Texto y narración adaptados al dispositivo (caen al texto común si no hay variante) y a la sesión
  // (el último paso termina distinto con cuenta).
  const conSesion = haySesion === true ? step?.paso.conSesion : undefined;
  const titulo = conSesion?.titulo ?? step?.title ?? "";
  const cuerpo = step ? (conSesion?.texto ?? textoDelPaso(step.paso, entrada)) : "";
  const narracion = step ? (conSesion?.voz ?? vozDelPaso(step.paso, entrada)) : "";
  // Sentido del cambio de paso: la tarjeta entra girando desde el lado hacia el que se avanza.
  const direccion = useDireccionPaso(index);

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
    // (2026-09-29 · persistencia entre medios) «Ya la vi» es un dato de la CUENTA: la decisión
    // espera a que el pull inicial haya traído las marcas (y el intro de Aurora, que también
    // viaja con la cuenta). Sin esa espera, un medio recién abierto no sabía nada y abría la guía
    // «por primera vez» en cada medio. Si la cuenta no responde, no se abre sola (se puede
    // abrir a demanda), y en cuanto responda se decide.
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const decidir = () => {
      // Una marca local antigua se respeta y se copia a la cuenta para los demás medios.
      const seen = copiarGuiaLocalACuenta();
      // Ya la vio, pero en una versión anterior: UNA vez, el aviso discreto de novedades.
      if (seen) {
        const pendientes = temasNuevosPara(versionGuiaVistaEnCuenta());
        if (pendientes.length > 0) setNovedades(pendientes);
      }
      // No competir con la presentación breve de Aurora (AuroraIntro): el tour de
      // interfaz solo arranca solo DESPUÉS de que el intro se haya completado, para
      // no solapar dos ventanas la primera vez. El tour sigue disponible a demanda.
      let introDone = false;
      try { introDone = window.localStorage.getItem("starseed.aurora.intro.v1") === "1"; } catch { /* */ }
      if (!seen && introDone) {
        // Primera visita (tras el intro): arranca sola tras un instante.
        temporizador = setTimeout(() => setOpen(true), 900);
      }
    };
    const cancelarEspera = cuandoCuentaFiable(decidir, 4000);
    return () => {
      cancelarEspera();
      if (temporizador) clearTimeout(temporizador);
    };
  }, []);

  // ── reabrir bajo demanda: evento + helper global ───────────────────────────
  // `inicio`: una posición, el id de un paso o de un tema; sin él, la guía RETOMA por donde se quedó
  // (`guia-progreso.ts`, compartido con la introducción de la ventana de acceso) o empieza por el principio.
  const openGuide = useCallback((inicio?: number | string | null, desde?: OrigenGuia) => {
    setNovedades(null);
    const explicito = inicio !== undefined && inicio !== null;
    const retomado = explicito ? null : leerProgresoGuia();
    setIndex(explicito ? indiceInicial(inicio) : (retomado ?? 0));
    setReanudadoEn(retomado);
    setOrigen(desde);
    // Reabrir SIEMPRE vuelve a preguntar el modo (respeta la elección del momento).
    setMode(null);
    setAvisoVoz(null);
    setMuted(false);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ step?: number; temaInicial?: string; desde?: OrigenGuia } | undefined>)?.detail;
      // `step`: posición (la forma de siempre); `temaInicial`: el id de cualquier paso de la guía.
      openGuide(typeof d?.step === "number" ? d.step : d?.temaInicial, d?.desde);
    };
    window.addEventListener(OPEN_GUIDE_EVENT, onOpen);
    // Helper global reutilizable desde cualquier parte (menús, ayuda, Aurora).
    try {
      (window as unknown as Record<string, unknown>).openStarseedGuide = (at?: number) =>
        openGuide(typeof at === "number" ? at : undefined);
    } catch { /* */ }
    return () => {
      window.removeEventListener(OPEN_GUIDE_EVENT, onOpen);
      try { delete (window as unknown as Record<string, unknown>).openStarseedGuide; } catch { /* */ }
    };
  }, [openGuide]);

  // (Ola 247 · 2026-09-05) TURNO DE LA GUÍA, por el DIRECTOR del rito y no por
  // marcas sueltas (`starseed.guide.launch` / `starseed.guia.tras.perfil`).
  // Cuando `esMiTurno("guia")`:
  //   · si aún no estamos en /escritorios, se navega SUAVE y se re-comprueba al
  //     cambiar la ruta (usePathname);
  //   · ya en /escritorios, abre la guía una sola vez (ref de etapa atendida)
  //     tras 900 ms de respiro.
  // (Ola 250 · 2026-09-06) PRIMERO el turno y SOLO se navega desde rutas del
  // propio rito. Antes se comprobaba el pathname ANTES que `esMiTurno`, así que
  // cualquier página que monta la guía navegaba al escritorio aunque no hubiera
  // rito (Genesis redirigía y secuestraba la sesión). Ahora, fuera del rito
  // (consola /mando, /voces o cualquier página del OS) la guía ESPERA: el efecto
  // se re-ejecuta con usePathname y abrirá cuando la persona llegue a /escritorios.
  const etapaGuiaAtendidaRef = useRef(false);
  useEffect(() => {
    const atenderGuia = () => {
      if (etapaGuiaAtendidaRef.current) return;
      // El turno decide primero: sin rito en «guia», no hacemos nada.
      if (!esMiTurno("guia")) return;
      if (pathname && !pathname.startsWith("/escritorios")) {
        // Nunca en consola de trabajo: el operador no debe ser secuestrado.
        if (esRutaConsola(pathname)) return;
        // Solo navegamos desde rutas del propio rito (bienvenida, login o el
        // perfil); en cualquier otra página del OS la guía se queda esperando.
        const esRutaDelRito =
          pathname === "/bienvenida" || pathname === "/login" || pathname.startsWith("/profile/");
        if (esRutaDelRito) navegarSuave(router, "/escritorios");
        return;
      }
      etapaGuiaAtendidaRef.current = true;
      const t = setTimeout(() => openGuide(0), 900);
      return () => clearTimeout(t);
    };
    atenderGuia();
    return suscribirRito(atenderGuia);
  }, [pathname, router, openGuide]);

  // Al cerrar, marca visto (no reaparece sola). Reabrible siempre por evento.
  const markSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    marcarGuiaVista(); // este medio + la cuenta (los demás medios ya no la abren sola)
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    markSeen();
    // (Ola 247 · 2026-09-05) Cerrar o terminar la guía cierra el rito: «guia»
    // → «hecho». Antes las ventanas no sabían cuándo terminaba la cadena.
    terminarEtapa("guia");
    // Cortesía: al cerrar, calla cualquier narración en curso.
    try { auroraStopSpeaking(); } catch { /* */ }
  }, [markSeen]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(STEPS.length - 1, i + 1)), []);
  const goTo = useCallback((i: number) => setIndex(acotarIndice(i)), []);

  // Retomar donde se quedó: el paso que se está leyendo se apunta (el último, la cuenta, lo borra).
  useEffect(() => {
    if (inTour) guardarProgresoGuia(index);
  }, [inTour, index]);

  /** «Empezar de nuevo» tras retomar. */
  const empezarDeNuevo = useCallback(() => {
    borrarProgresoGuia();
    setReanudadoEn(null);
    setIndex(0);
  }, []);

  // ── el final de la guía sin cuenta: crear cuenta, entrar o explorar ──────────
  // En /login y /bienvenida el formulario ya está detrás: se le pide que vaya a la pestaña que toca.
  // Desde cualquier otro sitio se abre LA ventana de acceso (la misma que el primer arranque).
  const irAlAcceso = useCallback(
    (accion: AccionGuia) => {
      close();
      if (origen === "login" || origen === "bienvenida") pedirAccesoDesdeGuia(accion);
      else abrirPrimerArranque("acceso", accion === "crear-cuenta" ? "signup" : "signin");
    },
    [close, origen],
  );
  const explorar = useCallback(() => {
    close();
    explorarSinCuenta(router);
  }, [close, router]);
  const irAMiEspacio = useCallback(() => {
    close();
    safeGoto(router, R.escritorios);
  }, [close, router]);
  // Deslizar la tarjeta en horizontal pasa de paso (como pasar páginas), con
  // dedo, ratón o lápiz; tocar sus botones sigue siendo un clic.
  const deslizar = useDeslizarPasos({ alSiguiente: goNext, alAnterior: goPrev, habilitado: open && mode !== null });

  // Elegir modo (arranca el tour). En modo voz: pide micrófono + narra la intro.
  const chooseMode = useCallback((m: GuideMode) => {
    // Persistimos la elección (memoria ligera; no bloquea si falla).
    try { window.localStorage.setItem(GUIDE_MODE_KEY, m); } catch { /* */ }
    setMuted(false);
    // (GUI1021J) Sin el puente de Aurora no hay narración ni escucha: honestidad radical, el
    // modo voz pasa a TEXTO y se lo dice, en vez de prometer una voz que no va a sonar.
    if (m === "voice" && !auroraBridge()) {
      setMode("silent");
      setAvisoVoz(AVISO_SIN_PUENTE);
      return;
    }
    setAvisoVoz(null);
    // (2026-09-25) Ya no se vuelve al paso 0: `openGuide(paso)` fija el paso
    // pedido (p. ej. «starseed:open-guide» con { step }) y elegir el modo lo
    // respetaba solo hasta aquí. Abrir la guía sin paso sigue empezando en 0.
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
      auroraSpeak(narracion);
    }, 260);
    return () => clearTimeout(t);
  }, [inTour, mode, muted, step, narracion]);

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
      // El índice cierra su lista con Escape (y lo marca): entonces la guía se queda abierta.
      if (e.defaultPrevented) return;
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
      // Un icono del dock fuera del carril visible no se puede iluminar: se trae a la vista
      // (el carril del dock es desplazable) y se recalcula el rectángulo en la siguiente vuelta.
      try { (el as HTMLElement).scrollIntoView?.({ block: "nearest", inline: "center", behavior: reduceMotion ? "auto" : "smooth" }); } catch { /* */ }
      const r = el.getBoundingClientRect();
      // Si el elemento no es visible (0x0 u oculto), no dibujamos recorte.
      if (r.width < 2 || r.height < 2) { setSpot(null); return; }
      setSpot(r);
    } catch { setSpot(null); }
  }, [step, inTour, reduceMotion]);

  useEffect(() => {
    if (!inTour) { setSpot(null); return; }
    // Reintenta varias veces: el dock y las cortinas aparecen con animación y el
    // desplazamiento suave del carril tarda unos cientos de ms en dejar el icono quieto.
    locateTarget();
    const temporizadores = [180, 520, 900, 1400].map((ms) => setTimeout(locateTarget, ms));
    const onResize = () => locateTarget();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      temporizadores.forEach(clearTimeout);
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
        if (mode === "voice" && step) auroraSpeak(narracion);
      }
      return next;
    });
  }, [mode, step, narracion]);

  // ── aviso único de novedades (cuentas que ya vieron una versión anterior) ──
  // «Ver ahora» abre el tour en el PRIMER tema nuevo; «Más tarde» lo descarta. Las dos cosas
  // guardan la versión en la marca de la cuenta, así que no vuelve a salir en ningún medio.
  const verNovedades = useCallback(() => {
    const primero = novedades?.[0];
    setNovedades(null);
    marcarGuiaVista(GUIA_VERSION);
    if (primero) openGuide(primero, "aviso");
  }, [novedades, openGuide]);
  const descartarNovedades = useCallback(() => {
    setNovedades(null);
    marcarGuiaVista(GUIA_VERSION);
  }, []);

  const AvisoNovedades = !open && novedades && novedades.length > 0 ? (
    <motion.div
      role="region"
      aria-label="Novedades de la guía"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      className={cn(
        "fixed bottom-20 left-4 z-[71] w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/12",
        "p-3 text-[12px] text-white/85 shadow-lg shadow-black/40 backdrop-blur-2xl",
      )}
      style={{
        background:
          "radial-gradient(120% 90% at 20% 0%, rgba(159,232,112,0.12), transparent 60%), radial-gradient(140% 90% at 110% 10%, rgba(201,168,255,0.14), transparent 55%), rgba(9,13,18,0.9)",
      }}
    >
      <p className="text-[12.5px] leading-snug">
        Novedades de la guía:{" "}
        <b className="text-white">
          {novedades.length} {novedades.length === 1 ? "tema nuevo" : "temas nuevos"}
        </b>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={verNovedades}
          className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg bg-gradient-to-r from-fuchsia-600 to-cyan-600 px-3 text-[12px] font-semibold text-white transition hover:from-fuchsia-500 hover:to-cyan-500"
        >
          Ver ahora
        </button>
        <button
          type="button"
          onClick={descartarNovedades}
          className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg px-2 text-[12px] text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          Más tarde
        </button>
      </div>
    </motion.div>
  ) : null;

  // ── acceso flotante discreto (siempre reabrible) ───────────────────────────
  // Se oculta mientras la guía está abierta, o si el usuario lo desactivó en
  // Ajustes → Personalización ("Botón de guía"). El tour por primera visita y el
  // helper global window.openStarseedGuide() siguen disponibles igualmente.
  const FloatingAccess = !open && buttonVisible ? (
    <button
      type="button"
      onClick={() => openGuide(undefined, "boton")}
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
  // Tarjeta del tour: gira de canto desde el lado hacia el que se avanza
  // (3D con movimiento completo, desplazamiento en equipos modestos, fundido
  // con menos movimiento).
  const vPaso = variantesPaso(nivelMovimiento);
  const variantesTarjeta: Variants = {
    entrar: (d: Direccion) => ({ ...vPaso.entrar(d), y: nivelMovimiento === "minimo" ? 0 : 10 }),
    centro: { ...vPaso.centro, y: 0, transition: transicionPaso(nivelMovimiento) },
    salir: (d: Direccion) => ({ ...vPaso.salir(d), transition: { duration: nivelMovimiento === "minimo" ? 0.1 : 0.16, ease: "easeIn" } }),
  };

  return (
    <>
      {AvisoNovedades}
      {FloatingAccess}

      <AnimatePresence>
        {open && (
          <motion.div
            key="aurora-guide-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22 }}
            className="fixed inset-0"
            style={{ zIndex: zGuia(origen) }}
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
                {/* Onda que sale del elemento (la «iluminación» automática del paso):
                    un anillo que se expande y se desvanece en bucle, para que el ojo
                    vaya solo al elemento del que habla Aurora. */}
                {!reduceMotion && (
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute"
                    initial={{ opacity: 0.75, scale: 1 }}
                    animate={{ opacity: [0.75, 0], scale: [1, 1.45] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
                    style={{
                      left: spot.left - 8,
                      top: spot.top - 8,
                      width: spot.width + 16,
                      height: spot.height + 16,
                      borderRadius: 18,
                      border: `2px solid ${step.accent}`,
                      transformOrigin: "center",
                    }}
                  />
                )}
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
                    {/* Emblema de StarSeed arriba del todo, centrado. */}
                    <div className="mb-4 flex justify-center">
                      <IconoStarSeed />
                    </div>
                    {/* Cerrar (arriba-derecha): la X común del OS */}
                    <BotonCerrar etiqueta="Cerrar la guía" atajo="Esc" tamano="sm" posicion="interior" onClick={close} />

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
                style={{ perspective: nivelMovimiento === "completo" ? 1200 : undefined }}
              >
                <AnimatePresence mode="wait" custom={direccion}>
                  <motion.div
                    key={step.key}
                    custom={direccion}
                    variants={variantesTarjeta}
                    initial="entrar"
                    animate="centro"
                    exit="salir"
                    data-testid="guia-tarjeta"
                    // Deslizar a la izquierda = siguiente; a la derecha = anterior.
                    {...deslizar}
                    className={cn(
                      "pointer-events-auto relative flex w-full max-w-[30rem] flex-col overflow-hidden rounded-[24px] touch-pan-y",
                      "max-h-[calc(100dvh-1.5rem)] border border-white/12 shadow-2xl shadow-black/60 backdrop-blur-2xl",
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

                    {/* El contenido se desplaza dentro de la tarjeta: a 360 px y con teclado abierto nada se corta. */}
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
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
                            <h2 className="text-[16px] font-bold leading-tight text-white">{titulo}</h2>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
                            <Compass className="h-3 w-3" />
                            {etiquetaProgreso(index)}
                            <span className="normal-case tracking-normal text-white/40">· {capituloDeIndice(index).titulo}</span>
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
                            "grid h-11 w-11 shrink-0 place-items-center rounded-lg border transition cursor-pointer",
                            muted
                              ? "border-white/12 bg-white/[0.03] text-white/50 hover:text-white"
                              : "border-[#C9A8FF]/30 bg-[#C9A8FF]/10 text-[#C9A8FF] hover:bg-[#C9A8FF]/20",
                          )}
                        >
                          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </button>

                        <BotonCerrar etiqueta="Cerrar la guía" atajo="Esc" tamano="sm" onClick={close} />
                      </div>

                      {/* ── Retomada: el recorrido sigue por donde se dejó ── */}
                      {reanudadoEn !== null && reanudadoEn === index && (
                        <div
                          data-testid="guia-retomada"
                          className="mt-3 flex flex-wrap items-center gap-x-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[11.5px] text-white/65"
                        >
                          <span className="py-2">Retomas donde lo dejaste.</span>
                          <button
                            type="button"
                            onClick={empezarDeNuevo}
                            className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md px-1 text-white/85 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                          >
                            <RotateCcw className="h-3 w-3" aria-hidden /> Empezar de nuevo
                          </button>
                        </div>
                      )}

                      {/* ── El modo voz pasó a texto (sin el puente de Aurora): se dice ── */}
                      {avisoVoz && (
                        <p
                          data-testid="guia-aviso-voz"
                          role="status"
                          className="mt-3 flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] leading-snug text-white/65"
                        >
                          <EarOff className="h-3.5 w-3.5 shrink-0" aria-hidden /> {avisoVoz}
                        </p>
                      )}

                      {/* ── EJEMPLO ANIMADO del paso (mini-demostración, cargada a demanda) ── */}
                      {step.paso.demo && (
                        <div className="mt-3.5">
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={`${step.key}-demo`}
                              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                              transition={{ duration: reduceMotion ? 0.12 : 0.3 }}
                            >
                              <DemoPaso clave={step.paso.demo} accent={step.accent} reduce={reduceMotion} />
                            </motion.div>
                          </AnimatePresence>
                        </div>
                      )}

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
                          {cuerpo}
                        </motion.p>
                      </AnimatePresence>

                      {/* Las ideas clave del tema y, en «Qué es», sus tarjetas */}
                      <PuntosPaso puntos={step.paso.puntos} color={step.accent} className="mt-3" />
                      <TarjetasPaso paso={step.paso} className="mt-3" />

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

                      {/* Acciones del paso: "Ir/mostrar" (acompañar) + "Hazlo por mí".
                          Sin cuenta, lo que lleva a una zona que la pide pasa a «Disponible al entrar». */}
                      {(step.go || step.doIt) && (
                        <div className="mt-3.5 flex flex-wrap items-center gap-2">
                          {step.go && !(sinCuenta && step.go.cuenta) && (
                            <button
                              type="button"
                              onClick={() => step.go?.run(ctx)}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 transition hover:bg-white/[0.09] cursor-pointer"
                              title="Acompañar: te muestro o abro esta zona"
                            >
                              <ArrowRight className="h-3.5 w-3.5" style={{ color: step.accent }} />
                              {step.go.label}
                            </button>
                          )}
                          {step.doIt && !(sinCuenta && step.doIt.cuenta) && (
                            <button
                              type="button"
                              onClick={() => step.doIt?.run(ctx)}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-white transition cursor-pointer"
                              style={{
                                background: `linear-gradient(90deg, color-mix(in srgb, ${step.accent} 55%, #6d28d9), color-mix(in srgb, ${step.accent} 35%, #0891b2))`,
                              }}
                              title="Hazlo por mí: disparo la acción real de este paso"
                            >
                              <Wand2 className="h-3.5 w-3.5" />
                              {step.doIt.label}
                            </button>
                          )}
                          {sinCuenta && (step.go?.cuenta || step.doIt?.cuenta) && (
                            <span
                              data-testid="solo-con-cuenta"
                              title="Crea tu cuenta o entra para abrir esta zona"
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[12px] text-white/55"
                            >
                              <Lock className="h-3.5 w-3.5" aria-hidden /> Disponible al entrar
                            </span>
                          )}
                        </div>
                      )}

                      {/* El último paso: la cuenta. Sin ella, crear, entrar o explorar; con ella, su espacio. */}
                      {isLast && (
                        <div data-testid="guia-cuenta" className="mt-3.5 space-y-3">
                          <RazonesCuenta />
                          {haySesion === true ? (
                            <button
                              type="button"
                              onClick={irAMiEspacio}
                              className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:from-emerald-500 hover:to-cyan-500 sm:w-auto"
                            >
                              Ir a mi espacio <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          ) : (
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                              <button
                                type="button"
                                onClick={() => irAlAcceso("crear-cuenta")}
                                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-600 px-4 py-1.5 text-[13px] font-semibold text-white transition hover:from-fuchsia-500 hover:to-cyan-500"
                              >
                                <UserPlus className="h-4 w-4" aria-hidden /> Crear cuenta
                              </button>
                              <button
                                type="button"
                                onClick={() => irAlAcceso("entrar")}
                                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-1.5 text-[13px] font-medium text-white/90 transition hover:bg-white/[0.09]"
                              >
                                <LogIn className="h-4 w-4" aria-hidden /> Entrar
                              </button>
                              <button
                                type="button"
                                onClick={explorar}
                                className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-2 text-[12px] text-white/65 underline-offset-2 hover:text-white/90 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                              >
                                Explorar sin cuenta
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pídeselo a Aurora (integración ligera) */}
                      {step.ask && (
                        <button
                          type="button"
                          onClick={askAurora}
                          className="mt-3 flex min-h-[44px] w-full items-start gap-2 rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/15 px-3 py-2 text-left transition hover:bg-fuchsia-950/25 cursor-pointer"
                          title="Sugerir esta frase a Aurora"
                        >
                          <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-300" />
                          <span className="text-[11.5px] leading-snug text-fuchsia-100/85">
                            <span className="text-fuchsia-300/70">Pídeselo a Aurora: </span>
                            <span className="italic">“{step.ask}”</span>
                          </span>
                        </button>
                      )}

                      {/* Capítulos: la barra ES el progreso del recorrido (NO auto-avanza) */}
                      <BarraCapitulos indice={index} onIr={goTo} className="mt-2" />

                      {/* Controles: Anterior · Siguiente/Terminar */}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={goPrev}
                            disabled={isFirst}
                            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
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

                        {isLast ? (
                          <button
                            type="button"
                            onClick={close}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:from-emerald-500 hover:to-cyan-500 cursor-pointer"
                          >
                            Entendido
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={goNext}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:from-fuchsia-500 hover:to-cyan-500 cursor-pointer"
                          >
                            Siguiente <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Índice de capítulos + saltos: «Saltar a crear cuenta» siempre a mano mientras no haya cuenta */}
                      <IndiceGuia indice={index} onIr={goTo} className="mt-1" />
                      <div className="flex flex-wrap items-center gap-x-4">
                        {!isLast && haySesion !== true && (
                          <button
                            type="button"
                            onClick={() => irAlAcceso("crear-cuenta")}
                            className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 text-[12px] font-medium text-cyan-200/90 underline-offset-2 transition hover:text-cyan-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                          >
                            <UserPlus className="h-3 w-3" aria-hidden /> Saltar a crear cuenta
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={close}
                          className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 text-[11px] text-white/45 transition hover:text-white/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                        >
                          <SkipForward className="h-3 w-3" aria-hidden /> Saltar
                        </button>
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
