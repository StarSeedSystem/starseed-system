"use client";

/**
 * StarSeed OS — INICIO / ACTUALIZACIONES unificadas de Astraura + OmniVoice (Adenda 111).
 * ============================================================================
 * Lógica de la ventana emergente que aparece en la PRIMERA entrada de una neurona
 * y cuando queda algo por configurar. Desde 2026-09-29 (persistencia entre medios)
 * el «ya lo vi» vive CON LA CUENTA y no en cada navegador:
 *
 *   · CON LA CUENTA (`avisos-cuenta`, clave `starseed.avisos.vistos.v1`, sincronizada y
 *     fusionada): la primera configuración hecha (`a149.sistemas.inicio`), el «recordar
 *     luego» con su hora (`a149.sistemas.luego`) y cada firma de catálogo ya vista
 *     (`a149.catalogo.<firma>`). Un medio nuevo (localhost, Vercel, PWA, Tauri) hereda todo
 *     eso al bajar la cuenta y NO vuelve a abrir la ventana.
 *   · LOCAL A ESTE MEDIO (`starseed.astraura.startup.v1`, NO viaja con la cuenta): las
 *     preferencias de ESTA neurona —auto-actualización, estrategia— y la foto del catálogo
 *     (`lastCatalog`) con la que se calculan las novedades. (Antes esta cabecera decía que
 *     esa clave «viaja con la cuenta vía settings-sync»: no era cierto, no está en
 *     SYNCED_KEYS; por eso cada medio la volvía a abrir.) Lo que un medio antiguo ya tenía
 *     escrito aquí se RESPETA y se COPIA a la cuenta (`copiarEstadoLocalACuenta`).
 *
 * Qué abre la ventana grande y qué solo avisa (`decidirArranque`):
 *   · ventana: primera configuración sin hacer, o algo que de verdad pide acción;
 *   · aviso pequeño no bloqueante: el catálogo cambió (modelos/fuentes nuevos);
 *   · nada: «recordar luego» vigente, o todo al día.
 *
 * Módulo LIVIANO: datos + lógica pura (sin React). Nunca lanza. SSR-safe.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import { ALL_LLM_SPECS, ALL_VOICE_SPECS } from "@/ai/astraura/model-requirements";
import { INTEGRATIONS, REGISTRY_REVIEWED, type Integration } from "@/lib/integrations/integration-registry";
// (A149 · olas) Configuración PENDIENTE de la neurona: la elección de voz vive
// en su propia clave por dispositivo. Módulo liviano (localStorage), sin ciclos.
import { readNeuronVoiceChoice, neuronVoiceChoiceIsStale } from "@/lib/aurora/tts-oss/neuron-voice-constants";
// (2026-09-29 · persistencia entre medios) El «visto/hecho/luego» va con la cuenta.
import { avisoResuelto, estadoAviso, marcarAviso, olvidarAviso } from "@/lib/sync/avisos-cuenta";
import { neuronDeviceIdActual } from "@/lib/network/identidad-dispositivo";

export const STARTUP_UPDATES_KEY = "starseed.astraura.startup.v1";
export const STARTUP_UPDATES_EVENT = "starseed:astraura-startup";
export const STARTUP_OPEN_EVENT = "starseed:open-astraura-startup";

export type StartupStrategy = "auto" | "local" | "servidor";

export interface StartupState {
  /** Firma de catálogo vista por última vez. */
  lastSig?: string;
  /** Ids del catálogo vistos por última vez (para calcular novedades). */
  lastCatalog?: string[];
  seenAt?: number;
  firstRunDone?: boolean;
  /** Auto-actualizar modelos/fuentes por defecto. */
  autoUpdate?: boolean;
  /** Estrategia por defecto de la neurona. */
  strategy?: StartupStrategy;
  /** No volver a mostrar hasta este epoch ms ("recordar luego"). */
  snoozeUntil?: number;
}

export const DEFAULT_STARTUP: StartupState = { autoUpdate: true, strategy: "auto" };

/** Ids del catálogo actual con prefijo de tipo (L:llm · V:voz · I:integración). */
export function catalogIds(): string[] {
  return [
    ...ALL_LLM_SPECS.map((s) => "L:" + s.id),
    ...ALL_VOICE_SPECS.map((s) => "V:" + s.id),
    ...INTEGRATIONS.map((i) => "I:" + i.id),
  ].sort();
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Firma estable del catálogo (cambia si aparecen/desaparecen modelos o fuentes). */
export function catalogSignature(): string {
  const ids = catalogIds();
  return `${ids.length}.${REGISTRY_REVIEWED}.${hash(ids.join("|"))}`;
}

/* ───────────── Avisos con la cuenta (ids estables; ver avisos-cuenta.ts) ───────────── */

/** Primera configuración de sistemas hecha (`hecho`): vale para TODA la cuenta. */
export const AVISO_SISTEMAS_INICIO = "a149.sistemas.inicio";
/** «Recordar luego» (`luego` + hora): no volver a abrir la ventana antes de `hasta`. */
export const AVISO_SISTEMAS_LUEGO = "a149.sistemas.luego";
/** Firma de catálogo ya vista (`visto`): el id lleva la firma, así una versión más antigua o
 *  más nueva del OS no pisa a la otra (cada firma vista se recuerda). */
export const AVISO_CATALOGO_PREFIJO = "a149.catalogo.";

let firmaCacheada: string | null = null;

/** Firma del catálogo de ESTA build (memoizada: el catálogo es estático por build). */
function firmaActual(): string {
  if (firmaCacheada === null) firmaCacheada = catalogSignature();
  return firmaCacheada;
}

/** ¿La cuenta ya vio esta firma de catálogo (en cualquier medio)? */
function catalogoVistoEnCuenta(sig: string = firmaActual()): boolean {
  try { return avisoResuelto(estadoAviso(AVISO_CATALOGO_PREFIJO + sig)); } catch { return false; }
}

/** Lo guardado EN ESTE MEDIO (sin mezclar con la cuenta). Nunca lanza. */
function leerLocal(): StartupState {
  try {
    const raw = safeGet(STARTUP_UPDATES_KEY);
    if (!raw) return { ...DEFAULT_STARTUP };
    const p = JSON.parse(raw) as Partial<StartupState>;
    return {
      ...DEFAULT_STARTUP,
      ...p,
      autoUpdate: p.autoUpdate !== false, // por defecto ON
      strategy: p.strategy === "local" || p.strategy === "servidor" ? p.strategy : "auto",
      lastCatalog: Array.isArray(p.lastCatalog) ? p.lastCatalog.map(String) : undefined,
    };
  } catch {
    return { ...DEFAULT_STARTUP };
  }
}

/**
 * Estado efectivo: lo local de este medio SUPERPUESTO con lo que sabe la cuenta.
 *  · `firstRunDone`: hecho aquí O en la cuenta (un «hecho» viejo local se respeta siempre).
 *  · `snoozeUntil`: manda la cuenta si tiene registro (un reinicio suyo levanta el «luego»
 *    aunque este medio guardara uno antiguo); si no, lo local (medio antiguo, aún sin copiar).
 *  · `lastSig`: la firma actual si la cuenta ya la vio; si no, la última vista aquí.
 */
export function getStartupState(): StartupState {
  const local = leerLocal();
  try {
    const luego = estadoAviso(AVISO_SISTEMAS_LUEGO);
    return {
      ...local,
      firstRunDone: local.firstRunDone === true || avisoResuelto(estadoAviso(AVISO_SISTEMAS_INICIO)),
      snoozeUntil: luego.estado !== null ? luego.hasta : local.snoozeUntil,
      lastSig: catalogoVistoEnCuenta() ? firmaActual() : local.lastSig,
    };
  } catch {
    return local;
  }
}

export function setStartupState(patch: Partial<StartupState>): StartupState {
  try {
    const { firstRunDone, lastSig, snoozeUntil, ...prefs } = patch;
    const local = leerLocal();
    const next: StartupState = { ...local, ...prefs };
    // Lo que atañe a la cuenta va a la cuenta; el blob local conserva lo que era «histórico».
    if (firstRunDone === true) {
      next.firstRunDone = true;
      marcarAviso(AVISO_SISTEMAS_INICIO, "hecho");
    }
    if (typeof lastSig === "string" && lastSig) {
      next.lastSig = lastSig;
      marcarAviso(AVISO_CATALOGO_PREFIJO + lastSig, "visto");
    }
    if ("snoozeUntil" in patch) {
      const hasta = typeof snoozeUntil === "number" ? snoozeUntil : 0;
      if (hasta > Date.now()) marcarAviso(AVISO_SISTEMAS_LUEGO, "luego", { hastaMs: hasta });
      else olvidarAviso(AVISO_SISTEMAS_LUEGO); // reinicio: «ya pendiente» en TODOS los medios
      next.snoozeUntil = 0; // el plazo vive en la cuenta, no aquí
    }
    safeSet(STARTUP_UPDATES_KEY, JSON.stringify(next));
    const efectivo = getStartupState();
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STARTUP_UPDATES_EVENT, { detail: efectivo }));
    return efectivo;
  } catch {
    return getStartupState();
  }
}

/**
 * Compatibilidad hacia atrás: un medio que ya tenía la ventana «vista» en su clave local
 * (`starseed.astraura.startup.v1`) la copia a la cuenta, para que los DEMÁS medios la hereden.
 * Idempotente y sin efecto si la cuenta ya tiene su propio registro. Nunca lanza.
 */
export function copiarEstadoLocalACuenta(now = Date.now()): void {
  try {
    const local = leerLocal();
    if (local.firstRunDone && !avisoResuelto(estadoAviso(AVISO_SISTEMAS_INICIO))) {
      marcarAviso(AVISO_SISTEMAS_INICIO, "hecho");
    }
    if (local.lastSig && estadoAviso(AVISO_CATALOGO_PREFIJO + local.lastSig).estado === null) {
      marcarAviso(AVISO_CATALOGO_PREFIJO + local.lastSig, "visto");
    }
    if (typeof local.snoozeUntil === "number" && local.snoozeUntil > now && estadoAviso(AVISO_SISTEMAS_LUEGO).estado === null) {
      marcarAviso(AVISO_SISTEMAS_LUEGO, "luego", { hastaMs: local.snoozeUntil });
    }
  } catch { /* la copia es un extra: nunca rompe el arranque */ }
}

/**
 * CONFIGURACIÓN PENDIENTE de esta neurona (A149 · olas): lo que de VERDAD pide acción.
 * Lista honesta y ampliable:
 *   · la primera configuración completa (`firstRunDone` aún false — en la CUENTA: una
 *     neurona nueva de una cuenta que ya la hizo no la repite);
 *   · la vía de voz de la neurona (nube ⟷ local) SOLO si nada la deja resuelta: ver
 *     `vozConfigurada`. Antes bastaba con que la clave local de voz (por dispositivo, no
 *     sincronizada) faltara, estuviera «más tarde» u obsoleta para que la ventana grande
 *     reapareciera en CADA arranque de cada medio.
 */
export interface PendingConfigItem {
  sistema: "inicio" | "voz";
  label: string;
}

/** ¿Los overrides SINCRONIZADOS de esta neurona fijan un modo de voz (en «Todas» o en alguna personalidad)? */
function vozDefinidaEnCuenta(): boolean {
  try {
    const neurona = neuronDeviceIdActual();
    if (!neurona) return false;
    const raw = safeGet(NEURON_PERSONA_STORAGE_KEY);
    if (!raw) return false;
    const mapa = JSON.parse(raw) as Record<string, Record<string, { voz?: { modo?: unknown } }>> | null;
    const porPersona = mapa && typeof mapa === "object" ? mapa[neurona] : undefined;
    if (!porPersona || typeof porPersona !== "object") return false;
    return Object.values(porPersona).some((o) => {
      const modo = o?.voz?.modo;
      return modo === "cloud" || modo === "local" || modo === "fastweb";
    });
  } catch {
    return false;
  }
}

/**
 * ¿La vía de voz de esta neurona está resuelta? Sí si CUALQUIERA de estas:
 *   1. la elección local de esta neurona es válida y de la versión actual (como siempre);
 *   2. los overrides sincronizados de esta neurona/personalidades definen un modo de voz
 *      (viajan con la cuenta: la decisión ya está tomada aunque este medio no la haya visto);
 *   3. la auto-actualización está encendida (el sistema se ocupa solo; es el valor por defecto).
 */
export function vozConfigurada(): boolean {
  try {
    const choice = readNeuronVoiceChoice();
    if (choice && choice.mode !== "later" && !neuronVoiceChoiceIsStale(choice)) return true;
  } catch { /* */ }
  if (vozDefinidaEnCuenta()) return true;
  try { return getStartupState().autoUpdate !== false; } catch { return true; }
}

export function pendingConfiguration(): PendingConfigItem[] {
  const out: PendingConfigItem[] = [];
  try {
    if (!getStartupState().firstRunDone) {
      out.push({ sistema: "inicio", label: "la configuración inicial de esta neurona" });
    }
  } catch { /* */ }
  try {
    if (!vozConfigurada()) {
      out.push({ sistema: "voz", label: "la vía de voz de esta neurona (nube gratis ⟷ motor local)" });
    }
  } catch { /* */ }
  return out;
}

/** Clave sincronizada de overrides neurona×personalidad (ver neuron-persona-store.ts). */
const NEURON_PERSONA_STORAGE_KEY = "starseed.astraura.neuron-persona.v1";

/**
 * Qué hacer al arrancar. Puro sobre lo que hay guardado (la ventana ESPERA antes al primer pull
 * de la cuenta —`esperarPullInicial`— para no decidir con un medio vacío):
 *   · «recordar luego» vigente → nada, sea cual sea el motivo (nunca antes de su hora);
 *   · primera configuración sin hacer, o algo que de verdad pide acción → ventana grande;
 *   · solo cambió el catálogo (modelos/fuentes nuevos) → aviso pequeño no bloqueante;
 *   · firma cambiada pero sin nada nuevo que contar → nada, y se sella (`sellar`).
 */
export type DecisionArranque =
  | { accion: "ventana"; motivo: "primera-vez" | "pendiente"; pendientes: PendingConfigItem[] }
  | { accion: "aviso"; motivo: "novedades"; modelos: number; fuentes: number; firma: string }
  | { accion: "nada"; motivo: "pospuesto" | "al-dia"; sellar?: string };

export function decidirArranque(now = Date.now()): DecisionArranque {
  const st = getStartupState();
  if (st.snoozeUntil && st.snoozeUntil > now) return { accion: "nada", motivo: "pospuesto" };
  if (!st.firstRunDone) return { accion: "ventana", motivo: "primera-vez", pendientes: pendingConfiguration() };
  let pendientes: PendingConfigItem[] = [];
  try { pendientes = pendingConfiguration(); } catch { /* */ }
  if (pendientes.length > 0) return { accion: "ventana", motivo: "pendiente", pendientes };
  const firma = firmaActual();
  if (st.lastSig !== firma) {
    const modelos = newModelIdsSince().length;
    const fuentes = newIntegrationsSince().length;
    if (modelos + fuentes > 0) return { accion: "aviso", motivo: "novedades", modelos, fuentes, firma };
    return { accion: "nada", motivo: "al-dia", sellar: firma };
  }
  return { accion: "nada", motivo: "al-dia" };
}

/**
 * ¿Debe mostrarse la VENTANA GRANDE ahora? (Compatibilidad: lo consulta, por ejemplo, la voz
 * para no abrirse encima.) Un cambio de catálogo ya NO la abre: eso es un aviso pequeño.
 */
export function shouldShowUpdates(now = Date.now()): boolean {
  try { return decidirArranque(now).accion === "ventana"; } catch { return false; }
}

/**
 * Motivo por el que se muestra (para el encabezado del modal). «Novedades» = hay modelos o
 * fuentes que ESTE medio aún no ha revisado —aunque la cuenta ya haya sellado la firma tras el
 * aviso pequeño—, para que «Ver» enseñe de verdad lo que hay de nuevo.
 */
export function updateReason(): "primera-vez" | "novedades" | "al-dia" {
  const st = getStartupState();
  if (!st.firstRunDone) return "primera-vez";
  return newModelIdsSince().length + newIntegrationsSince().length > 0 ? "novedades" : "al-dia";
}

/** Marca el catálogo actual como visto (opcionalmente guarda preferencias). Va con la cuenta. */
export function markUpdatesSeen(patch: Partial<StartupState> = {}): void {
  setStartupState({
    ...patch,
    lastSig: firmaActual(),
    lastCatalog: catalogIds(),
    seenAt: Date.now(),
    firstRunDone: true,
    snoozeUntil: 0,
  });
}

/**
 * Sella en la CUENTA que esta firma de catálogo ya se vio (aviso pequeño mostrado, o cambio sin
 * nada nuevo que contar). No toca la foto local `lastCatalog`: esa solo avanza cuando el usuario
 * revisa la ventana (`markUpdatesSeen`), así «Ver» sigue enseñando lo nuevo.
 */
export function sellarCatalogoVisto(firma: string = firmaActual()): void {
  try { marcarAviso(AVISO_CATALOGO_PREFIJO + firma, "visto"); } catch { /* */ }
}

/** Posponer la ventana (por defecto 24 h). El plazo viaja con la cuenta. */
export function snoozeUpdates(ms = 24 * 60 * 60 * 1000): void {
  setStartupState({ snoozeUntil: Date.now() + ms });
}

/** Integraciones NUEVAS desde la última vez vista (vacío en la primera ejecución). */
export function newIntegrationsSince(): Integration[] {
  const st = getStartupState();
  if (!st.firstRunDone || !st.lastCatalog) return [];

  const seen = new Set(st.lastCatalog);
  return INTEGRATIONS.filter((i) => !seen.has("I:" + i.id));
}

/** Ids de modelos (LLM/voz) NUEVOS desde la última vez vista. */
export function newModelIdsSince(): string[] {
  const st = getStartupState();
  if (!st.firstRunDone || !st.lastCatalog) return [];
  const seen = new Set(st.lastCatalog);
  return [...ALL_LLM_SPECS.map((s) => "L:" + s.id), ...ALL_VOICE_SPECS.map((s) => "V:" + s.id)].filter((id) => !seen.has(id));
}

/** Abre la ventana manualmente (desde ajustes o una notificación). */
export function openStartupUpdates(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STARTUP_OPEN_EVENT));
}

export function subscribeStartupOpen(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener(STARTUP_OPEN_EVENT, h);
  return () => window.removeEventListener(STARTUP_OPEN_EVENT, h);
}
