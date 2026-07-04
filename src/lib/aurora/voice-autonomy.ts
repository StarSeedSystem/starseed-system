"use client";

/**
 * voice-autonomy — Autonomía de voz de Aurora (auto-arranque natural).
 * ----------------------------------------------------------------------------
 * El usuario recuerda que "antes Aurora funcionaba fluida y directa desde el
 * inicio, sin activar nada en los menús, hablando con el usuario". Este módulo
 * devuelve esa autonomía SIN reintroducir el glitch-loop (el arranque pasa
 * SIEMPRE por el flujo supervisado `superStart` del provider):
 *
 *   1. Si el micrófono YA está concedido → auto-escucha en cuanto carga.
 *   2. Si no → un ÚNICO handler de primer gesto (pointerdown/keydown/touchstart)
 *      pide permiso, arranca la escucha y saluda. Nada de menús.
 *   3. El TTS del navegador está bloqueado antes del primer gesto (política de
 *      autoplay): el saludo se ENCOLA y se dispara en ese primer gesto.
 *   4. Respeta el toggle del usuario: si apagó Aurora, no auto-arranca.
 *   5. Móvil: pausa la escucha con la pestaña oculta y la reanuda al volver
 *      (ahorra batería y evita cortes del recognition en segundo plano).
 *
 * Todo defensivo y SSR-safe: nunca debe romper la app ni la voz nativa.
 */

const GREETED_SESSION_KEY = "starseed.aurora.greeted.session";
const AUTONOMY_PREF_KEY = "starseed.aurora.autonomy"; // 'on' | 'off' (default on)

/** ¿El usuario desactivó explícitamente la autonomía de voz? */
export function autonomyDisabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUTONOMY_PREF_KEY) === "off";
  } catch {
    return false;
  }
}

export function setAutonomy(on: boolean): void {
  try {
    window.localStorage.setItem(AUTONOMY_PREF_KEY, on ? "on" : "off");
  } catch {
    /* noop */
  }
}

/** ¿Ya saludó en ESTA sesión de pestaña? (una vez por sesión, natural) */
export function greetedThisSession(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(GREETED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGreetedThisSession(): void {
  try {
    window.sessionStorage.setItem(GREETED_SESSION_KEY, "1");
  } catch {
    /* noop */
  }
}

/** Saludo corto y natural según la hora del día y la ruta actual. */
export function greetingFor(name: string, pathname: string): string {
  const h = new Date().getHours();
  const salute =
    h < 6 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
  const where = contextHintFor(pathname);
  return `${salute}, soy ${name}. ${where} Dime qué quieres hacer y lo hago mientras te hablo.`;
}

function contextHintFor(pathname: string): string {
  const p = (pathname || "").toLowerCase();
  if (p.startsWith("/escritorios") || p === "/" ) return "Estamos en tu Escritorio; puedo armarlo contigo, abrir apps o archivos.";
  if (p.startsWith("/dashboard")) return "Estás en tu Dashboard; puedo añadir o mover widgets por ti.";
  if (p.startsWith("/library")) return "Estás en la Librería; puedo buscar e instalar lo que necesites.";
  if (p.startsWith("/hub")) return "Estás en el Hub; puedo llevarte a la Red, comunidades o gobernanza.";
  if (p.startsWith("/profile")) return "Estás en tu perfil; puedo ayudarte a editarlo.";
  if (p.startsWith("/login") || p.startsWith("/onboarding")) return "Puedo guiarte para entrar o crear tu cuenta.";
  return "Tengo control de todo StarSeed y sigo activa en segundo plano.";
}

/**
 * Consulta el estado del permiso de micrófono de forma defensiva.
 * Devuelve 'granted' | 'prompt' | 'denied' | 'unknown'.
 */
export async function queryMicPermission(): Promise<"granted" | "prompt" | "denied" | "unknown"> {
  if (typeof navigator === "undefined") return "unknown";
  try {
    const anyNav = navigator as unknown as {
      permissions?: { query?: (d: { name: string }) => Promise<{ state: string }> };
    };
    if (!anyNav.permissions?.query) return "unknown";
    const status = await anyNav.permissions.query({ name: "microphone" });
    const s = status?.state;
    if (s === "granted" || s === "denied" || s === "prompt") return s;
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** ¿Este dispositivo es táctil/coarse (móvil o tablet)? */
export function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/**
 * ¿Corre como APP INSTALADA (PWA standalone / TWA / app dedicada) y NO como una
 * pestaña web normal? SOLO en la app instalada dejamos la ESCUCHA DE FONDO
 * (wake-word "Aurora") activa; en la web, Aurora escucha únicamente al PULSAR el
 * botón (evita el bucle/tono del reconocimiento de fondo en el navegador).
 */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches ||
      window.matchMedia?.("(display-mode: minimal-ui)").matches;
    // iOS Safari expone navigator.standalone; algunos wrappers ponen una marca.
    const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
    const wrapperFlag = !!(window as unknown as { __STARSEED_NATIVE_APP__?: boolean }).__STARSEED_NATIVE_APP__;
    return !!(standalone || iosStandalone || wrapperFlag);
  } catch {
    return false;
  }
}
