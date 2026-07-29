"use client";

/**
 * StarSeed OS — ACCESO NATIVO (Adenda 99c).
 * ============================================================================
 * La web es soberana pero LIMITADA a propósito: ningún navegador deja emitir por
 * las antenas Wi-Fi/celular a voluntad, escanear redes, ni (en iOS/Firefox)
 * hablar por BLE/serie. Cuando la neurona necesita ACCESO COMPLETO al hardware
 * de radio para la red mesh — Wi-Fi/TCP local, datos, BLE, USB y antenas
 * externas — el OS DETECTA el sistema operativo y RECOMIENDA instalar la app
 * NATIVA correspondiente (Meshtastic + el daemon meshtasticd), con enlaces
 * reales por plataforma. La malla de Meshtastic es el estándar abierto que ya
 * usa el núcleo; su app nativa da lo que el navegador no puede.
 *
 * Honestidad radical: NO fingimos que la web controle esas antenas; ofrecemos el
 * camino real (app nativa / nodo por Wi-Fi) para lograrlo. SSR-safe. Nunca lanza.
 */

export type OsKind = "android" | "ios" | "windows" | "macos" | "linux" | "chromeos" | "unknown";
export type BrowserKind = "chrome" | "edge" | "safari" | "firefox" | "samsung" | "opera" | "other";

export interface PlatformInfo {
  os: OsKind;
  browser: BrowserKind;
  mobile: boolean;
  /** ¿Puede hablar por Web Bluetooth (radios BLE)? */
  webBluetooth: boolean;
  /** ¿Puede hablar por Web Serial (radios USB)? */
  webSerial: boolean;
  /** ¿Web NFC (etiquetas)? */
  webNfc: boolean;
  /** ¿Corre como PWA instalada (standalone)? */
  standalone: boolean;
}

function ua(): string {
  try {
    return typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  } catch {
    return "";
  }
}

/** Detecta SO + navegador + capacidades de radio reales del navegador. */
export function detectPlatform(): PlatformInfo {
  const s = ua();
  const low = s.toLowerCase();
  const has = (k: string) => {
    try {
      return typeof navigator !== "undefined" && k in navigator;
    } catch {
      return false;
    }
  };

  let os: OsKind = "unknown";
  // iOS incluye iPadOS moderno, que se hace pasar por Mac: distínguelo por touch.
  const iPadOsAsMac = /Macintosh/.test(s) && typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 1;
  if (/android/.test(low)) os = "android";
  else if (/iphone|ipad|ipod/.test(low) || iPadOsAsMac) os = "ios";
  else if (/cros/.test(low)) os = "chromeos";
  else if (/windows/.test(low)) os = "windows";
  else if (/macintosh|mac os x/.test(low)) os = "macos";
  else if (/linux/.test(low)) os = "linux";

  let browser: BrowserKind = "other";
  if (/edg\//.test(low)) browser = "edge";
  else if (/samsungbrowser/.test(low)) browser = "samsung";
  else if (/opr\//.test(low)) browser = "opera";
  else if (/firefox|fxios/.test(low)) browser = "firefox";
  else if (/chrome|crios|chromium/.test(low)) browser = "chrome";
  else if (/safari/.test(low)) browser = "safari";

  const mobile = /android|iphone|ipad|ipod|mobile/.test(low) || os === "android" || os === "ios";

  let standalone = false;
  try {
    standalone =
      (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches === true) ||
      (typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true);
  } catch {
    /* */
  }

  return {
    os,
    browser,
    mobile,
    webBluetooth: has("bluetooth"),
    webSerial: has("serial"),
    webNfc: typeof window !== "undefined" && "NDEFReader" in window,
    standalone,
  };
}

export interface NativeLink {
  label: string;
  url: string;
  kind: "store" | "web" | "docs" | "repo";
}

export interface NativeRecommendation {
  /** ¿Se recomienda la app nativa para ACCESO COMPLETO en esta plataforma? */
  needed: boolean;
  title: string;
  /** Qué NO permite el navegador aquí (motivo honesto). */
  reason: string;
  /** Qué desbloquea la vía nativa. */
  unlocks: string[];
  /** Enlaces REALES por plataforma. */
  links: NativeLink[];
}

/* ── Enlaces (la malla se ejecuta DENTRO del OS; el protocolo Meshtastic va
 *    embebido — @meshtastic/core. No se instala ninguna app externa) ────────── */
const SITE = "https://starseed-os.vercel.app/";
const L = {
  install: { label: "Instalar StarSeed OS (app)", url: SITE, kind: "web" as const },
  meshtastic: { label: "Protocolo Meshtastic (código abierto del OS)", url: "https://github.com/meshtastic", kind: "repo" as const },
  linuxd: { label: "meshtasticd (nodo local opcional en tu red)", url: "https://meshtastic.org/docs/software/linux/installation/", kind: "docs" as const },
};

/**
 * recommendNative — la malla YA se ejecuta dentro del OS (protocolo Meshtastic
 * embebido) y funciona desde el navegador: relé web por servidor + Web Serial/
 * BLE/HTTP donde el navegador los da. Para acceso COMPLETO al hardware de
 * antenas (múltiples bandas simultáneas y continuas) se instala la APP DE
 * STARSEED OS del sistema — NO una app externa. `needed` marca cuándo la app
 * instalada aporta lo que este navegador no puede (radios directos / segundo
 * plano), pero la malla web sigue funcionando igual sin instalar nada.
 */
export function recommendNative(p: PlatformInfo): NativeRecommendation {
  const canRadioInBrowser = p.webBluetooth || p.webSerial;
  const unlocks = [
    "la malla web por relé (YA activa, sin instalar nada)",
    "radios directos por BLE/USB y nodos por Wi-Fi/TCP",
    "múltiples bandas y antenas simultáneas y continuas",
    "uso en segundo plano (permisos incluidos en la app instalada)",
  ];
  const already = "La malla ya corre dentro del OS en tu navegador (protocolo Meshtastic embebido) por relé web.";

  if (p.os === "ios") {
    return {
      needed: !p.standalone,
      title: "StarSeed OS en iPhone/iPad",
      reason: `${already} iOS no expone Bluetooth/serie en el navegador; instala StarSeed OS como app (desde Safari → Compartir → Añadir a inicio) para radios y antenas con permisos incluidos.`,
      unlocks,
      links: [L.install, L.meshtastic],
    };
  }
  if (p.os === "android") {
    return {
      needed: !p.standalone && !canRadioInBrowser,
      title: "StarSeed OS en Android",
      reason: `${already} Instala StarSeed OS como app (menú del navegador → Instalar app) para radios por BLE/USB, Wi-Fi/TCP y uso continuo con los permisos del dispositivo.`,
      unlocks,
      links: [L.install, L.meshtastic],
    };
  }
  if (p.os === "linux") {
    return {
      needed: !canRadioInBrowser,
      title: "StarSeed OS en Linux",
      reason: `${already} Instálalo como app; para antenas/radios locales sin navegador puedes correr un nodo meshtasticd en tu red (el OS se conecta por Wi-Fi/TCP).`,
      unlocks,
      links: [L.install, L.linuxd, L.meshtastic],
    };
  }
  // Windows / macOS / ChromeOS / desconocido
  return {
    needed: !p.standalone && !canRadioInBrowser,
    title: `StarSeed OS${p.os === "chromeos" ? " en ChromeOS" : p.os === "macos" ? " en Mac" : p.os === "windows" ? " en Windows" : ""}`,
    reason: `${already} Instala StarSeed OS como app (barra de direcciones → Instalar) para radios por BLE/USB, nodos por Wi-Fi/TCP y antenas con permisos incluidos. En Chrome/Edge ya puedes conectar radios desde la web.`,
    unlocks,
    links: [L.install, L.meshtastic],
  };
}

/** Atajo: recomendación para la plataforma actual. */
export function nativeRecommendationNow(): NativeRecommendation {
  return recommendNative(detectPlatform());
}
