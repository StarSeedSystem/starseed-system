/**
 * StarSeed OS — Puente para ABRIR / HABLAR con la Aurora GLOBAL.
 * ----------------------------------------------------------------------------
 * Aurora se monta UNA sola vez (AuroraProvider + AuroraWidget en
 * `app/(app)/layout.tsx`). Este módulo es la forma canónica para que CUALQUIER
 * superficie del OS (Exocórtex, Trinity…) la abra y le pase contexto SIN
 * instanciar una segunda Aurora ni acoplarse a sus componentes.
 *
 * Reutiliza el puente que el provider ya expone en `window.STARSEED_AURORA`
 * (send / runCommand / runAction) y, de forma aditiva y defensiva, hace visible
 * el panel del widget activando su botón flotante (aria-label="Aurora").
 *
 * Todo es no-bloqueante y degrada en silencio: si Aurora aún no montó, no rompe
 * nada. Es seguro llamarlo desde cualquier handler de cliente.
 */

/**
 * Instantánea del estado reactivo de Aurora que el puente expone (v3+), para que
 * el Exocórtex muestre voz/chat en vivo sin instanciar otro motor.
 */
export interface AuroraStateSnapshot {
  supported: boolean;
  enabled: boolean;
  listening: boolean;
  speaking: boolean;
  paused: boolean;
  interim: string;
  transcript: string;
  lastReply: string;
  actionStatus: string;
  conversation: Array<{ role: "user" | "aurora"; text: string; at: number }>;
  actionLog: Array<{ name: string; ok: boolean; message: string }>;
  activePersonality: { id?: string; name: string };
  personalities: Array<{ id?: string; name: string }>;
}

type AuroraBridge = {
  send?: (text: string) => Promise<unknown> | unknown;
  runCommand?: (text: string) => Promise<unknown> | unknown;
  runAction?: (name: string, args?: Record<string, unknown>) => Promise<unknown> | unknown;
  speak?: (text: string) => void;
  toggle?: () => void;
  start?: () => void;
  stop?: () => void;
  setEnabled?: (v: boolean) => void;
  pauseSpeech?: () => void;
  resumeSpeech?: () => void;
  skipForward?: () => void;
  skipBack?: () => void;
  interrupt?: () => void;
  getState?: () => AuroraStateSnapshot | null;
  subscribe?: (cb: () => void) => () => void;
  version?: number;
};

/** Devuelve el puente global de Aurora si está disponible, o `null`. */
export function getAuroraBridge(): AuroraBridge | null {
  if (typeof window === "undefined") return null;
  try {
    const api = (window as unknown as { STARSEED_AURORA?: AuroraBridge }).STARSEED_AURORA;
    return api && typeof api === "object" ? api : null;
  } catch {
    return null;
  }
}

/** ¿Hay una Aurora global lista para recibir mensajes? */
export function isAuroraReady(): boolean {
  const api = getAuroraBridge();
  return !!api && (typeof api.send === "function" || typeof api.runCommand === "function");
}

/**
 * Intenta hacer VISIBLE el panel del widget de Aurora (el que ya está montado),
 * activando su botón flotante. Es best-effort: si no encuentra el botón o el
 * panel ya está abierto, no pasa nada. No instancia ningún componente nuevo.
 */
export function revealAuroraWidget(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  try {
    // El AuroraWidget abre su chat con un "long-press" (pointerdown sostenido)
    // sobre su botón flotante (aria-label="Aurora"). Reproducimos ese gesto de
    // forma defensiva con un menú contextual sintético, que el widget mapea a
    // "abrir el chat" sin alterar la escucha de voz.
    const btn = document.querySelector<HTMLElement>('[aria-label="Aurora"]');
    if (!btn) return;
    // `contextmenu` → el widget hace setTab("chat") + setOpen(true) (ver
    // aurora-widget.tsx). Es la vía menos intrusiva para revelar el panel.
    btn.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, view: window }),
    );
  } catch {
    /* defensivo: nunca rompemos por no poder abrir el panel */
  }
}

export interface OpenAuroraOptions {
  /** Texto/prompt que se envía a Aurora como si lo dijeras tú. */
  prompt?: string;
  /** Si `true` (por defecto) intenta también revelar el panel del widget. */
  reveal?: boolean;
  /** Si `true`, usa runCommand (ruteo de comandos) en vez de send (chat). */
  asCommand?: boolean;
}

/**
 * Abre / enfoca la Aurora GLOBAL y, opcionalmente, le envía un prompt con
 * contexto (p. ej. desde el Exocórtex, con tus memorias). No duplica Aurora.
 *
 * @returns `true` si se pudo entregar el prompt al motor; `false` si no había
 *          puente disponible (Aurora aún no montada / desactivada).
 */
export async function openAurora(options: OpenAuroraOptions = {}): Promise<boolean> {
  const { prompt, reveal = true, asCommand = false } = options;

  if (reveal) revealAuroraWidget();

  const text = (prompt ?? "").trim();
  if (!text) return isAuroraReady();

  const api = getAuroraBridge();
  if (!api) return false;

  try {
    if (asCommand && typeof api.runCommand === "function") {
      await api.runCommand(text);
      return true;
    }
    if (typeof api.send === "function") {
      await api.send(text);
      return true;
    }
    if (typeof api.runCommand === "function") {
      await api.runCommand(text);
      return true;
    }
  } catch {
    /* defensivo: el motor puede rechazar; no rompemos la UI que llamó */
  }
  return false;
}

/**
 * Azúcar para el Exocórtex: abre Aurora con un encuadre de "actúa sobre mis
 * memorias", anteponiendo (de forma compacta) el contexto de memoria/bóveda que
 * le pases. Aurora ya sabe buscar/leer/escribir memorias mediante sus acciones.
 */
export async function askAuroraAboutMemory(
  userPrompt: string,
  memoryContext?: string,
): Promise<boolean> {
  const ctx = (memoryContext ?? "").trim();
  const ask = (userPrompt ?? "").trim();
  const framed = ctx
    ? `Contexto de mi Exocórtex (memorias/bóveda):\n${ctx.slice(0, 1800)}\n\n` +
      `Usando ese contexto y tu acceso a mis memorias, ${ask || "ayúdame con esto."}`
    : ask || "Ayúdame con mis memorias del Exocórtex.";
  return openAurora({ prompt: framed, reveal: true });
}

// ── Estado en vivo + control (para el Chat de Aurora en el Exocórtex) ─────────

/** Lee la instantánea del estado de Aurora, o `null` si el puente no está listo. */
export function getAuroraState(): AuroraStateSnapshot | null {
  const api = getAuroraBridge();
  try {
    return api?.getState ? api.getState() ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Suscribe a cambios del estado de Aurora. Devuelve la baja. Si el puente aún no
 * está montado, hace polling ligero hasta que aparece y entonces se re-suscribe.
 */
export function subscribeAurora(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  let off: (() => void) | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;

  const attach = () => {
    const api = getAuroraBridge();
    if (api?.subscribe) {
      off = api.subscribe(cb);
      if (poll) { clearInterval(poll); poll = null; }
      cb(); // primer refresco inmediato
      return true;
    }
    return false;
  };

  if (!attach()) {
    poll = setInterval(() => { attach(); }, 1000);
  }
  return () => {
    if (off) off();
    if (poll) clearInterval(poll);
  };
}

/** Enciende/apaga Aurora globalmente desde cualquier superficie. */
export function setAuroraEnabled(v: boolean): void {
  try { getAuroraBridge()?.setEnabled?.(v); } catch { /* */ }
}

/** Activa/pausa la voz (mismo gesto que el tap del orbe). */
export function toggleAuroraVoice(): void {
  try { getAuroraBridge()?.toggle?.(); } catch { /* */ }
}

/** Hace hablar a Aurora con un texto (TTS). */
export function speakAurora(text: string): void {
  try { getAuroraBridge()?.speak?.(text); } catch { /* */ }
}

/** Envía texto al chat de Aurora (equivalente a escribir en el widget). */
export async function sendToAurora(text: string): Promise<boolean> {
  const api = getAuroraBridge();
  const t = (text ?? "").trim();
  if (!api || !t) return false;
  try {
    if (typeof api.send === "function") { await api.send(t); return true; }
    if (typeof api.runCommand === "function") { await api.runCommand(t); return true; }
  } catch { /* */ }
  return false;
}

/** Transporte de voz (passthrough al puente). */
export const auroraTransport = {
  pause: () => { try { getAuroraBridge()?.pauseSpeech?.(); } catch { /* */ } },
  resume: () => { try { getAuroraBridge()?.resumeSpeech?.(); } catch { /* */ } },
  skipForward: () => { try { getAuroraBridge()?.skipForward?.(); } catch { /* */ } },
  skipBack: () => { try { getAuroraBridge()?.skipBack?.(); } catch { /* */ } },
  interrupt: () => { try { getAuroraBridge()?.interrupt?.(); } catch { /* */ } },
};

// ── Reactivación del orbe (cuando se ocultó arrastrándolo al descarte) ────────
export {
  readOrbHidden as isAuroraOrbHidden,
  setOrbHidden as setAuroraOrbHidden,
  subscribeOrbVisibility as subscribeAuroraOrbVisibility,
} from "@/lib/aurora/aurora-orb-bus";
