"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — INSTALACIÓN EN EL DISPOSITIVO (honesta sobre sus límites)
 * ---------------------------------------------------------------------------
 * Reúne, en un solo módulo SSR-safe y defensivo, TODO lo que el OS puede hacer
 * para instalarse y arraigar en el dispositivo del usuario, diciendo la VERDAD
 * sobre qué puede y qué NO puede hacer un navegador:
 *
 *   1. detectOS()            → qué sistema/arquitectura es este dispositivo.
 *   2. PWA real HOY          → beforeinstallprompt (capturado), canInstallPWA(),
 *                              promptInstallPWA(), isRunningStandalone(),
 *                              y escucha de `appinstalled`. La PWA es la vía
 *                              de instalación REAL disponible hoy.
 *   3. requestMaxPermissions → pide de forma secuencial los permisos WEB que
 *                              el navegador SÍ concede (notificaciones,
 *                              almacenamiento persistente, wake lock). NO pide
 *                              mic/cámara aquí: eso lo gestiona Aurora al usarse.
 *   4. nativePackages(os)    → opciones de instalación NATIVA por SO. Donde no
 *                              hay binario real hoy, status "soon" con
 *                              explicación honesta. La PWA es lo real ahora.
 *   5. companionInfo(os)     → el COMPAÑERO LOCAL: agente nativo que da a Aurora
 *                              control por terminal + permisos del dispositivo.
 *                              El navegador NO puede hacer eso solo (seguridad);
 *                              hace falta instalar el compañero y conceder
 *                              permisos. Al hacerlo, el dispositivo se registra
 *                              como neurona con permiso 'agent'
 *                              (src/lib/neurons/neurons.ts).
 *
 * Regla de oro: nunca lanza; en el servidor devuelve valores neutros.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ═══════════════════════════ 1 · Detección de SO ═══════════════════════════ */

export type OsId = "macos" | "windows" | "linux" | "android" | "ios" | "unknown";

export interface DetectedOs {
  os: OsId;
  /** Etiqueta legible para la UI ("macOS", "Windows", "Android"…). */
  label: string;
  /** Arquitectura si el navegador la expone (UA-CH) — p.ej. "arm", "x86". */
  arch?: string;
}

const OS_LABEL: Record<OsId, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
  ios: "iOS / iPadOS",
  unknown: "tu sistema",
};

/**
 * Detecta el sistema operativo por User-Agent Client Hints (preferido) con
 * fallback a userAgent. iPadOS moderno se camufla como Mac: lo distinguimos por
 * el soporte táctil. Nunca lanza; en SSR devuelve "unknown".
 */
export function detectOS(): DetectedOs {
  if (typeof navigator === "undefined") {
    return { os: "unknown", label: OS_LABEL.unknown };
  }
  const ua = navigator.userAgent || "";
  const uaData = (navigator as Navigator & {
    userAgentData?: { platform?: string; mobile?: boolean; architecture?: string };
  }).userAgentData;

  // Arquitectura (solo con UA-CH de alto nivel; puede faltar).
  let arch: string | undefined;
  try {
    if (uaData?.architecture) arch = uaData.architecture;
  } catch { /* */ }

  const hintPlatform = (uaData?.platform || "").toLowerCase();

  // iPadOS moderno se hace pasar por Macintosh; lo delatan los toques.
  const isIPadOS =
    /macintosh/i.test(ua) &&
    typeof document !== "undefined" &&
    "ontouchend" in document;

  let os: OsId = "unknown";
  if (hintPlatform.includes("android") || /android/i.test(ua)) os = "android";
  else if (/iphone|ipod/i.test(ua) || /ipad/i.test(ua) || isIPadOS) os = "ios";
  else if (hintPlatform.includes("windows") || /windows/i.test(ua)) os = "windows";
  else if (hintPlatform.includes("mac") || /mac os x|macintosh/i.test(ua)) os = "macos";
  else if (hintPlatform.includes("linux") || /linux|x11|cros/i.test(ua)) os = "linux";

  return { os, label: OS_LABEL[os], arch };
}

/* ═══════════════════════════ 2 · PWA (real hoy) ═══════════════════════════ */

/** Tipado mínimo del evento no estándar `beforeinstallprompt` (Chromium). */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/** Evento para que la UI reaccione a cambios de instalabilidad PWA. */
export const PWA_STATE_EVENT = "starseed:pwa-installable";

// Guardamos el evento en el módulo: el navegador lo emite una vez y hay que
// conservarlo para dispararlo cuando el usuario pulse el botón.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let appInstalled = false;
let listenersBound = false;

function emitPwaState(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(PWA_STATE_EVENT, {
        detail: { canInstall: canInstallPWA(), installed: appInstalled },
      }),
    );
  } catch { /* */ }
}

/**
 * Empieza a escuchar `beforeinstallprompt` y `appinstalled`. Idempotente y
 * SSR-safe. La UI puede llamarlo al montar; también se auto-invoca desde los
 * getters para no perder el evento si se disparó antes.
 */
export function initPwaCapture(): void {
  if (typeof window === "undefined" || listenersBound) return;
  listenersBound = true;
  try {
    window.addEventListener("beforeinstallprompt", (e: Event) => {
      // Evita el mini-infobar por defecto: lo lanzamos nosotros con el botón.
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      emitPwaState();
    });
    window.addEventListener("appinstalled", () => {
      appInstalled = true;
      deferredPrompt = null;
      emitPwaState();
    });
  } catch { /* */ }
}

/** ¿Hay un prompt de instalación PWA nativo disponible ahora mismo? */
export function canInstallPWA(): boolean {
  if (typeof window === "undefined") return false;
  initPwaCapture();
  return deferredPrompt !== null && !appInstalled && !isRunningStandalone();
}

/** ¿El OS ya corre como app instalada (display-mode standalone)? */
export function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export type PwaPromptResult = "accepted" | "dismissed" | "unavailable";

/**
 * Lanza el diálogo nativo de instalación PWA si está disponible. Devuelve el
 * resultado del usuario, o "unavailable" si no hay prompt (iOS Safari, o el
 * navegador aún no lo ofreció). Nunca lanza.
 */
export async function promptInstallPWA(): Promise<PwaPromptResult> {
  if (typeof window === "undefined") return "unavailable";
  initPwaCapture();
  const evt = deferredPrompt;
  if (!evt) return "unavailable";
  try {
    await evt.prompt();
    const choice = await evt.userChoice.catch(() => null);
    deferredPrompt = null; // el prompt se consume una sola vez
    emitPwaState();
    if (choice?.outcome === "accepted") {
      appInstalled = true;
      return "accepted";
    }
    return "dismissed";
  } catch {
    deferredPrompt = null;
    emitPwaState();
    return "unavailable";
  }
}

/* ══════════════════════ 3 · Permisos web (los reales) ══════════════════════ */

export type GrantState = "granted" | "denied" | "unsupported" | "error";

export interface PermissionReport {
  /** Notificaciones del sistema (Notification.requestPermission). */
  notifications: GrantState;
  /** Almacenamiento persistente (navigator.storage.persist). */
  persistentStorage: GrantState;
  /** Wake Lock disponible en el navegador (no lo mantenemos, solo comprobamos). */
  wakeLock: GrantState;
  /** Texto legible resumido (para toasts). */
  summary: string;
}

/**
 * Pide, de forma SECUENCIAL y defensiva, los permisos WEB que el navegador SÍ
 * puede conceder para que el OS funcione mejor como app:
 *   · Notificaciones (avisos de Aurora / la red).
 *   · Almacenamiento persistente (que el navegador no borre tus datos/modelos).
 *   · Wake Lock (mantener despierta la pantalla cuando haga falta) — solo
 *     comprobamos disponibilidad; adquirir/soltar el lock lo hace quien lo use.
 *
 * NO pide micrófono ni cámara: esos sentidos los solicita Aurora en el momento
 * de usarlos (visión/voz), no al instalar. Nunca lanza.
 */
export async function requestMaxPermissions(): Promise<PermissionReport> {
  const report: PermissionReport = {
    notifications: "unsupported",
    persistentStorage: "unsupported",
    wakeLock: "unsupported",
    summary: "",
  };
  if (typeof window === "undefined") {
    report.summary = "Los permisos se piden en el navegador.";
    return report;
  }

  // 1) Notificaciones.
  try {
    if (typeof Notification !== "undefined" && typeof Notification.requestPermission === "function") {
      if (Notification.permission === "granted") {
        report.notifications = "granted";
      } else if (Notification.permission === "denied") {
        report.notifications = "denied";
      } else {
        const res = await Notification.requestPermission();
        report.notifications = res === "granted" ? "granted" : "denied";
      }
    }
  } catch {
    report.notifications = "error";
  }

  // 2) Almacenamiento persistente.
  try {
    const storage = navigator.storage as StorageManager & {
      persisted?: () => Promise<boolean>;
      persist?: () => Promise<boolean>;
    };
    if (storage && typeof storage.persist === "function") {
      const already = typeof storage.persisted === "function" ? await storage.persisted() : false;
      const ok = already || (await storage.persist());
      report.persistentStorage = ok ? "granted" : "denied";
    }
  } catch {
    report.persistentStorage = "error";
  }

  // 3) Wake Lock — solo disponibilidad (no mantenemos el lock aquí).
  try {
    if ("wakeLock" in navigator) report.wakeLock = "granted";
  } catch {
    report.wakeLock = "error";
  }

  const parts: string[] = [];
  if (report.notifications === "granted") parts.push("notificaciones");
  if (report.persistentStorage === "granted") parts.push("almacenamiento persistente");
  if (report.wakeLock === "granted") parts.push("wake lock");
  report.summary = parts.length
    ? `Concedido: ${parts.join(", ")}.`
    : "No se concedió ningún permiso web (puedes activarlos desde los ajustes del navegador).";
  return report;
}

/* ═══════════════════════ 4 · Paquetes nativos por SO ═══════════════════════ */

export type NativeStatus = "pwa" | "soon" | "link";

export interface NativeOption {
  /** Etiqueta ("AppImage (.AppImage)", "Instalador (.dmg)"…). */
  label: string;
  /** Nota honesta sobre el estado real de este target. */
  note: string;
  /** "pwa" = la vía real hoy · "soon" = aún no hay binario · "link" = enlace real. */
  status: NativeStatus;
  /** Icono lucide sugerido (la UI lo resuelve con fallback). */
  icon?: string;
  /** Enlace real cuando status = "link" o "pwa" (opcional). */
  href?: string;
}

/** Código fuente y releases oficiales (donde vivirán los binarios nativos). */
export const OS_REPO_URL = "https://github.com/StarSeedSystem/starseed-system";
/** Despliegue web oficial (PWA instalable). */
export const OS_WEB_URL = "https://starseed-os.vercel.app";

/** Texto honesto reutilizable para targets nativos aún sin binario. */
const SOON_NOTE =
  "El paquete nativo aún no está publicado. Hoy la vía real de instalación es la PWA (se instala como app con acceso a pantalla completa y trabajo offline). Los binarios nativos aparecerán aquí en cuanto existan.";

/**
 * Opciones de instalación NATIVA para un SO. La primera opción de cada lista es
 * SIEMPRE la PWA (lo real hoy). Los binarios propios se marcan "soon" con nota
 * honesta hasta que el pipeline los publique en releases. Nunca lanza.
 */
export function nativePackages(os: OsId): NativeOption[] {
  const pwa: NativeOption = {
    label: "Instalar como app (PWA) — recomendado hoy",
    note: "Vía real disponible ahora: instala StarSeed OS como aplicación (pantalla completa, offline y accesos directos) desde este mismo navegador.",
    status: "pwa",
    icon: "Download",
    href: OS_WEB_URL,
  };
  const releases: NativeOption = {
    label: "Código fuente y releases",
    note: "Repositorio oficial: aquí se publicarán los instaladores nativos y puedes compilarlo tú mismo (open source).",
    status: "link",
    icon: "Github",
    href: OS_REPO_URL,
  };

  switch (os) {
    case "linux":
      return [
        pwa,
        { label: "AppImage (.AppImage)", note: SOON_NOTE, status: "soon", icon: "Package" },
        { label: "Paquete Debian (.deb)", note: SOON_NOTE, status: "soon", icon: "Package" },
        releases,
      ];
    case "windows":
      return [
        pwa,
        { label: "Instalador (.exe / MSIX)", note: SOON_NOTE, status: "soon", icon: "Package" },
        releases,
      ];
    case "macos":
      return [
        pwa,
        { label: "Imagen de disco (.dmg)", note: SOON_NOTE, status: "soon", icon: "Package" },
        releases,
      ];
    case "android":
      return [
        pwa,
        { label: "APK (.apk)", note: SOON_NOTE, status: "soon", icon: "Package" },
        releases,
      ];
    case "ios":
      return [
        {
          ...pwa,
          label: "Añadir a pantalla de inicio (PWA)",
          note: "En iPhone/iPad la instalación es vía Safari: Compartir → «Añadir a pantalla de inicio». No hay App Store nativa aún; la PWA es la vía real hoy.",
        },
        releases,
      ];
    default:
      return [pwa, releases];
  }
}

/* ═══════════════════════ 5 · Compañero local (agente) ═══════════════════════ */

export type CompanionStatus = "soon" | "link";

export interface CompanionInfo {
  /** Título de la sección. */
  title: string;
  /** Explicación honesta de qué es y por qué hace falta un nativo. */
  intro: string;
  /** Lista de lo que el compañero SÍ desbloquea (control por terminal, etc.). */
  unlocks: string[];
  /** Pasos de instalación por SO (honestos; hoy en preparación). */
  steps: string[];
  /** "soon" si aún no hay instalador real · "link" si lo hay. */
  status: CompanionStatus;
  /** Enlace del instalador/guía cuando exista. */
  href?: string;
  /** Recordatorio del límite del navegador (para no engañar). */
  browserLimit: string;
}

/**
 * Información del COMPAÑERO LOCAL de StarSeed: el agente nativo que, instalado y
 * con permisos concedidos, da a Aurora control por terminal y acceso a los
 * recursos del dispositivo. HONESTIDAD RADICAL: el navegador, por seguridad, NO
 * puede ejecutar comandos ni controlar el sistema por sí solo; eso requiere
 * este compañero nativo + permisos explícitos del usuario.
 *
 * Al instalar el compañero, el dispositivo se registra como NEURONA con el
 * permiso 'agent' activo (ver src/lib/neurons/neurons.ts): así el resto de la
 * red personal sabe que este equipo puede aceptar órdenes de agentes.
 * Devuelve pasos por SO. Nunca lanza.
 */
export function companionInfo(os: OsId): CompanionInfo {
  const label = OS_LABEL[os] ?? OS_LABEL.unknown;
  const browserLimit =
    "Un navegador NO puede abrir una terminal ni controlar tu sistema por seguridad. Para dar a Aurora control real del dispositivo hay que instalar este compañero nativo y concederle permisos explícitamente.";
  const unlocks = [
    "Control por terminal: Aurora puede ejecutar comandos que tú autorices.",
    "Acceso a archivos locales fuera del navegador (con permiso).",
    "Sentidos y automatización del sistema (pantalla, apps) cuando lo pidas.",
    "Registra este equipo como neurona con permiso 'agent' (red personal).",
  ];

  // Pasos honestos por SO. Hoy el instalador está en preparación → status "soon".
  const stepsByOs: Record<OsId, string[]> = {
    macos: [
      "Descarga el compañero StarSeed para macOS (en preparación).",
      "Ábrelo y autorízalo en Ajustes del sistema → Privacidad y seguridad.",
      "Inicia sesión con tu cuenta StarSeed para enlazarlo como neurona.",
      "Concede los permisos que quieras dar a Aurora (terminal, archivos, pantalla).",
    ],
    windows: [
      "Descarga el instalador del compañero StarSeed para Windows (en preparación).",
      "Ejecútalo y acepta el aviso de SmartScreen (firma en camino).",
      "Inicia sesión con tu cuenta StarSeed para enlazarlo como neurona.",
      "Concede los permisos que quieras dar a Aurora (terminal, archivos).",
    ],
    linux: [
      "Instala el compañero StarSeed (AppImage/.deb, en preparación).",
      "Dale permiso de ejecución y ábrelo (o usa el servicio de usuario).",
      "Inicia sesión con tu cuenta StarSeed para enlazarlo como neurona.",
      "Concede los permisos que quieras dar a Aurora (terminal, archivos).",
    ],
    android: [
      "Instala la app compañera StarSeed para Android (en preparación).",
      "Concede los permisos del sistema que decidas otorgar.",
      "Inicia sesión con tu cuenta para enlazar el móvil como neurona.",
      "El control de terminal en Android es limitado por el propio sistema (honesto).",
    ],
    ios: [
      "En iOS el sistema restringe fuertemente el control por terminal.",
      "El compañero para iOS ofrecerá lo que Apple permita (atajos/automatización).",
      "Inicia sesión con tu cuenta para enlazar el dispositivo como neurona.",
      "El control total NO es posible en iOS por diseño del sistema (honesto).",
    ],
    unknown: [
      "Detecta tu sistema para ver los pasos exactos del compañero.",
      "En general: instalar el compañero nativo → iniciar sesión → conceder permisos.",
    ],
  };

  return {
    title: `Compañero local de StarSeed para ${label}`,
    intro:
      "El compañero es un pequeño agente nativo que corre en tu dispositivo. Instalarlo y darle permisos es lo que permite a Aurora control por terminal y acceso real al equipo — algo que el navegador solo NO puede hacer.",
    unlocks,
    steps: stepsByOs[os] ?? stepsByOs.unknown,
    status: "soon",
    // Mientras no exista el instalador, enlazamos al repo (transparencia).
    href: OS_REPO_URL,
    browserLimit,
  };
}

/**
 * Marca conceptualmente este dispositivo como neurona con permiso 'agent' tras
 * instalar el compañero. Import dinámico defensivo de neurons.ts (toca Supabase
 * y localStorage): si algo falla, degrada en silencio. Nunca lanza.
 *
 * Nota honesta: esto SOLO actualiza el registro de neuronas; el control real por
 * terminal lo aporta el compañero nativo una vez instalado y con permisos.
 */
export async function registerAsAgentNeuron(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const neurons = await import("@/lib/neurons/neurons");
    const id = neurons.thisDeviceId();
    if (!id) return false;
    await neurons.ensureThisNeuron();
    neurons.setPermission(id, "agent", true);
    return true;
  } catch {
    return false;
  }
}
