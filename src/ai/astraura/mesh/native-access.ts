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

/* ── Enlaces reales de las apps Meshtastic (estándar abierto del mesh) ──────── */
const L = {
  android: { label: "Meshtastic para Android (Play Store)", url: "https://play.google.com/store/apps/details?id=com.geeksville.mesh", kind: "store" as const },
  androidFdroid: { label: "Meshtastic en F-Droid", url: "https://f-droid.org/packages/com.geeksville.mesh/", kind: "store" as const },
  ios: { label: "Meshtastic para iPhone/iPad (App Store)", url: "https://apps.apple.com/app/meshtastic/id1586432531", kind: "store" as const },
  mac: { label: "Meshtastic para Mac (App Store)", url: "https://apps.apple.com/app/meshtastic/id1586432531", kind: "store" as const },
  web: { label: "Cliente web de Meshtastic (Serial/BLE)", url: "https://client.meshtastic.org", kind: "web" as const },
  linuxd: { label: "meshtasticd (daemon Linux/SBC)", url: "https://meshtastic.org/docs/software/linux/installation/", kind: "docs" as const },
  downloads: { label: "Todas las apps y descargas", url: "https://meshtastic.org/download/", kind: "docs" as const },
};

/**
 * recommendNative — dado el SO/navegador, recomienda la app nativa adecuada para
 * acceso completo a la malla (Wi-Fi/TCP local, datos, BLE, USB, antenas externas).
 * `needed` es true cuando el navegador actual NO puede conectar un radio directo
 * (sin Web Bluetooth NI Web Serial) o es un móvil sin esas APIs.
 */
export function recommendNative(p: PlatformInfo): NativeRecommendation {
  const canRadioInBrowser = p.webBluetooth || p.webSerial;
  const unlocks = [
    "conexión directa al radio por BLE y USB",
    "malla por Wi-Fi/TCP a nodos de tu red local",
    "puente a larga distancia por MQTT (más allá del alcance LoRa)",
    "uso en segundo plano y antenas externas conectadas",
  ];

  if (p.os === "android") {
    return {
      needed: !canRadioInBrowser || p.browser === "firefox" || p.browser === "safari",
      title: "Acceso completo en Android",
      reason:
        p.webBluetooth || p.webSerial
          ? "Tu navegador ya conecta radios, pero la app nativa da malla Wi-Fi/TCP, datos y uso en segundo plano."
          : "Este navegador no expone Bluetooth/serie; la app nativa conecta el radio y usa Wi-Fi/datos para la malla.",
      unlocks,
      links: [L.android, L.androidFdroid, L.downloads],
    };
  }
  if (p.os === "ios") {
    return {
      needed: true, // Safari/iOS no tiene Web Bluetooth ni Web Serial
      title: "Acceso completo en iPhone/iPad",
      reason: "iOS no permite Bluetooth/serie desde el navegador; la app nativa conecta el radio y lleva la malla por Wi-Fi/TCP y MQTT.",
      unlocks,
      links: [L.ios, L.downloads],
    };
  }
  if (p.os === "linux") {
    return {
      needed: !canRadioInBrowser,
      title: "Acceso completo en Linux",
      reason: "Para malla por Wi-Fi/TCP local, radios y antenas externas sin depender del navegador, ejecuta el daemon meshtasticd (StarSeed se conecta por su API).",
      unlocks,
      links: [L.linuxd, L.web, L.downloads],
    };
  }
  if (p.os === "macos") {
    return {
      needed: !canRadioInBrowser,
      title: "Acceso completo en Mac",
      reason: canRadioInBrowser
        ? "Chrome/Edge ya conectan radios por BLE/USB; la app nativa añade Wi-Fi/TCP, MQTT y segundo plano."
        : "Safari no expone Bluetooth/serie; usa la app de Mac o Chrome/Edge con el cliente web.",
      unlocks,
      links: [L.mac, L.web, L.downloads],
    };
  }
  if (p.os === "windows" || p.os === "chromeos") {
    return {
      needed: !canRadioInBrowser,
      title: p.os === "chromeos" ? "Acceso completo en ChromeOS" : "Acceso completo en Windows",
      reason: canRadioInBrowser
        ? "Tu navegador ya conecta radios por BLE/USB; para Wi-Fi/TCP a nodos de tu red y MQTT, usa el cliente web/daemon."
        : "Este navegador no expone Bluetooth/serie; usa Chrome o Edge con el cliente web de Meshtastic.",
      unlocks,
      links: [L.web, L.downloads],
    };
  }
  return {
    needed: !canRadioInBrowser,
    title: "Acceso completo (app nativa)",
    reason: "Para conectar radios y llevar la malla por Wi-Fi/TCP y datos con acceso completo al hardware, instala la app de Meshtastic de tu sistema.",
    unlocks,
    links: [L.downloads, L.web],
  };
}

/** Atajo: recomendación para la plataforma actual. */
export function nativeRecommendationNow(): NativeRecommendation {
  return recommendNative(detectPlatform());
}
