"use client";

/**
 * Aurora · Recomendaciones Inteligentes por Contexto
 * ----------------------------------------------------------------------------
 * Generador de sugerencias ÚTILES según DÓNDE está el usuario dentro del OS
 * (pathname) y, opcionalmente, algo de estado. Devuelve 1-3 pistas accionables
 * que la BURBUJA del orbe puede ofrecer («¿Creo una pizarra?», «¿Busco en tus
 * memorias?»). Cada sugerencia trae, si aplica, una directiva de acción de
 * Aurora ya lista (`[[ACCION: …]]`) para ejecutarla de un toque.
 *
 * IMPORTANTE (contrato con el widget): AQUÍ solo vive el GENERADOR. El TIMING
 * de cuándo mostrar las pistas (cada cuánto, tras cuánto silencio, etc.) es
 * responsabilidad del widget del orbe. Este módulo se limita a:
 *   • suggestForContext(pathname, state?) → AuroraHint[]  (1-3)
 *   • emitSuggestions(...) / subscribeSuggestions(...)     (evento aurora:suggest)
 *
 * Reutiliza las rutas canónicas de `@/lib/aurora/actions` (resolveOsRoute /
 * OS_ROUTES): la clave de cada bloque de pistas es una RUTA canónica del OS, de
 * modo que las sugerencias siguen la misma taxonomía que la navegación.
 *
 * 100% aditivo, SSR-safe y defensivo: nada toca window/document a nivel de
 * módulo y ninguna función lanza.
 */

// Import de tipos/const de rutas. `resolveOsRoute`/`OS_ROUTES` son puros (sin
// efectos) — importarlos aquí NO acopla comportamiento del motor.
import { resolveOsRoute, OS_ROUTES } from "@/lib/aurora/actions";

// ── Evento ───────────────────────────────────────────────────────────────────
/** Evento que consume la burbuja del orbe (detail = { hints, pathname, at }). */
export const AURORA_SUGGEST_EVENT = "aurora:suggest";

// ── Tipos públicos ───────────────────────────────────────────────────────────

/** Una sugerencia contextual lista para mostrar/decir/ejecutar. */
export interface AuroraHint {
  /** Id estable de la pista (para deduplicar / no repetir seguido). */
  id: string;
  /** Texto corto y decible («¿Creo una pizarra para esto?»). */
  text: string;
  /**
   * Directiva de acción de Aurora ya formada, opcional. Si está, el widget
   * puede ejecutarla directamente por el pipeline de acciones existente.
   * Ej.: '[[ACCION: crear_pizarra {"titulo":"Ideas"}]]'.
   */
  action?: string;
  /** Icono sugerido (nombre Lucide, decorativo; el widget decide si lo usa). */
  icon?: string;
}

/** Estado opcional que afina las pistas (todo opcional y tolerante). */
export interface ContextState {
  /** ¿Hay tareas de fondo activas? (para sugerir «ver tareas»). */
  hasActiveTasks?: boolean;
  /** ¿La sesión está autenticada? (afina pistas que requieren cuenta). */
  signedIn?: boolean;
  /** ¿Hay insignias de pantalla visibles ahora? (evita repetir «ver pantalla»). */
  screenBadgesVisible?: boolean;
  /** Texto libre de contexto (título de la vista, selección…), tolerante. */
  hint?: string;
}

// ── Utilidades base (SSR-safe) ───────────────────────────────────────────────

function isClient(): boolean {
  return typeof window !== "undefined";
}

/** Normaliza un pathname a su ruta canónica del OS (o el propio path). */
function canonicalPath(pathname: string): string {
  const raw = String(pathname ?? "").trim();
  if (!raw) return "/";
  // Quita query/hash y barra final (salvo raíz).
  let p = raw.split(/[?#]/)[0];
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "");
  // ¿Coincide (por prefijo) con alguna ruta conocida del OS? La más larga gana.
  let best: string | null = null;
  for (const r of OS_ROUTES) {
    if (p === r.path || p.startsWith(r.path + "/")) {
      if (!best || r.path.length > best.length) best = r.path;
    }
  }
  if (best) return best;
  // Último intento: resolver por nombre (por si llega un alias, no una ruta).
  try {
    const resolved = resolveOsRoute(p);
    if (resolved) return resolved;
  } catch { /* noop */ }
  return p;
}

// ── Catálogo de pistas por ruta canónica ─────────────────────────────────────
// Cada entrada aporta un pequeño conjunto de pistas candidatas para esa área.
// El selector final recorta a 1-3 y las filtra según el estado.

type HintFactory = (state?: ContextState) => AuroraHint[];

const HINTS_BY_ROUTE: Record<string, HintFactory> = {
  "/escritorios": () => [
    { id: "esc-ver", text: "¿Enumero lo que hay en pantalla para que lo uses por voz?", action: '[[ACCION: ver_pantalla {}]]', icon: "ScanEye" },
    { id: "esc-dashboard", text: "¿Abro tu tablero para organizar widgets?", action: '[[ACCION: organizar_dashboard {}]]', icon: "LayoutDashboard" },
    { id: "esc-app", text: "Puedo abrir cualquier app: dime cuál.", icon: "AppWindow" },
  ],
  "/dashboard": () => [
    { id: "dash-widget", text: "¿Añado un widget? (clima, música, memorias…)", action: '[[ACCION: agregar_widget {"tipo":"clima"}]]', icon: "PlusSquare" },
    { id: "dash-org", text: "Activa el modo edición y te ayudo a reordenar tus widgets.", icon: "Move" },
    { id: "dash-astraura", text: "¿Pongo el córtex de Astraura en tu tablero?", action: '[[ACCION: agregar_widget {"tipo":"astraura"}]]', icon: "Sparkles" },
  ],
  "/memorias": () => [
    { id: "mem-buscar", text: "Dime qué recordar y lo busco en tus memorias.", icon: "Search" },
    { id: "mem-3d", text: "¿Abro tus memorias en 3D para explorarlas?", action: '[[ACCION: navegar {"ruta":"/memorias-3d"}]]', icon: "Box" },
    { id: "mem-mapa", text: "¿Quieres ver el mapa mental que las conecta?", action: '[[ACCION: abrir_mapa_mental {}]]', icon: "Share2" },
  ],
  "/pizarras": () => [
    { id: "piz-crear", text: "¿Creo una pizarra nueva para esto?", action: '[[ACCION: crear_pizarra {"titulo":"Ideas"}]]', icon: "PenSquare" },
    { id: "piz-abrir", text: "¿Abro una de tus pizarras?", action: '[[ACCION: abrir_pizarra {}]]', icon: "Layers" },
  ],
  "/pizarra": () => [
    { id: "pizc-guardar", text: "Cuando quieras, guardo y organizo lo del lienzo.", icon: "Save" },
    { id: "pizc-otra", text: "¿Creo otra pizarra en paralelo?", action: '[[ACCION: crear_pizarra {"titulo":"Nueva"}]]', icon: "PenSquare" },
  ],
  "/decisiones": () => [
    { id: "dec-crear", text: "¿Redactamos una propuesta para votar?", action: '[[ACCION: crear_publicacion {"tipo":"propuesta"}]]', icon: "Vote" },
    { id: "dec-leer", text: "Puedo leerte las propuestas abiertas; dime «lee la pantalla».", action: '[[ACCION: leer_pantalla {}]]', icon: "BookOpen" },
  ],
  "/publicar": () => [
    { id: "pub-guia", text: "Te guío paso a paso; dime el área y el tipo.", icon: "Wand2" },
    { id: "pub-rellenar", text: "Si hay un formulario, dime los campos y lo relleno.", icon: "FormInput" },
  ],
  "/network": () => [
    { id: "net-cultura", text: "¿Vamos a Cultura, Educación o Política?", action: '[[ACCION: navegar {"ruta":"/network/culture"}]]', icon: "Network" },
    { id: "net-3d", text: "¿Abro la red en 3D?", action: '[[ACCION: navegar {"ruta":"/red-3d"}]]', icon: "Globe" },
  ],
  "/cerebro": () => [
    { id: "cer-instancias", text: "¿Abro tus cerebros (instancias)?", action: '[[ACCION: abrir_cerebro {"seccion":"cerebros"}]]', icon: "BrainCircuit" },
    { id: "cer-mapa", text: "¿Ves el mapa mental 3D de tu cerebro?", action: '[[ACCION: abrir_mapa_mental {}]]', icon: "Share2" },
  ],
  "/habilidades": () => [
    { id: "hab-ejec", text: "Dime una skill y la ejecuto por ti.", icon: "Puzzle" },
    { id: "hab-agente", text: "¿Lanzo un agente para que trabaje en segundo plano?", icon: "Bot" },
  ],
  "/navegador": () => [
    { id: "nav-url", text: "Dime una web y la abro aquí sin salir del OS.", icon: "Compass" },
    { id: "nav-leer", text: "Puedo leerte lo principal de la página; di «lee la pantalla».", action: '[[ACCION: leer_pantalla {}]]', icon: "BookOpen" },
  ],
  "/conexiones": () => [
    { id: "con-activar", text: "¿Activamos una conexión o servicio?", icon: "Plug" },
  ],
  "/library": () => [
    { id: "lib-buscar", text: "Dime qué buscar en la biblioteca y te ayudo.", icon: "Library" },
  ],
  "/agent": () => [
    { id: "ag-lanzar", text: "¿Lanzo el orquestador para que trabaje en segundo plano?", action: '[[ACCION: ejecutar_agente {"nombre":"Hermes · Orchestrator"}]]', icon: "Bot" },
  ],
};

/** Pistas genéricas cuando la ruta no tiene bloque propio. */
function genericHints(): AuroraHint[] {
  return [
    { id: "gen-ver", text: "Di «ver pantalla» y numero los botones para pulsarlos por voz.", action: '[[ACCION: ver_pantalla {}]]', icon: "ScanEye" },
    { id: "gen-leer", text: "Di «lee la pantalla» y te resumo lo que hay aquí.", action: '[[ACCION: leer_pantalla {}]]', icon: "BookOpen" },
    { id: "gen-ir", text: "Puedo llevarte a cualquier sección: solo dime a dónde.", icon: "Navigation" },
  ];
}

// ── Generador principal ──────────────────────────────────────────────────────

/**
 * Devuelve 1-3 sugerencias útiles para el `pathname` actual (afinadas por
 * `state` opcional). Es puro y SSR-safe: no toca el DOM, no emite eventos.
 * El TIMING de mostrarlas lo decide el widget del orbe.
 */
export function suggestForContext(pathname: string, state?: ContextState): AuroraHint[] {
  const route = canonicalPath(pathname);
  let base: AuroraHint[] = [];
  try {
    const factory = HINTS_BY_ROUTE[route];
    base = factory ? factory(state) : [];
  } catch { base = []; }
  if (base.length === 0) base = genericHints();

  const out: AuroraHint[] = [];

  // Prioriza «ver tareas» si hay tareas de fondo activas (transversal).
  if (state?.hasActiveTasks) {
    out.push({
      id: "bg-ver-tareas",
      text: "Tienes tareas en marcha. ¿Te digo cómo van?",
      action: "[[ACCION: ver_tareas {}]]",
      icon: "ListChecks",
    });
  }

  // Evita sugerir «ver pantalla» si las insignias ya están visibles.
  const filtered = base.filter((h) => {
    if (state?.screenBadgesVisible && /ver_pantalla/.test(h.action ?? "")) return false;
    return true;
  });

  for (const h of filtered) {
    if (out.length >= 3) break;
    if (out.some((x) => x.id === h.id)) continue;
    out.push(h);
  }
  return out.slice(0, 3);
}

// ── Emisión / suscripción del evento aurora:suggest ──────────────────────────

/** Detalle del evento `aurora:suggest`. */
export interface AuroraSuggestDetail {
  hints: AuroraHint[];
  pathname: string;
  at: number;
}

/**
 * Emite `aurora:suggest` con las sugerencias para el `pathname` dado (las genera
 * con suggestForContext). La burbuja del orbe se suscribe y decide cuándo/como
 * mostrarlas. Devuelve las pistas emitidas (o [] fuera del navegador). Defensivo.
 */
export function emitSuggestions(pathname: string, state?: ContextState): AuroraHint[] {
  const hints = suggestForContext(pathname, state);
  if (!isClient()) return hints;
  try {
    window.dispatchEvent(
      new CustomEvent<AuroraSuggestDetail>(AURORA_SUGGEST_EVENT, {
        detail: { hints, pathname: String(pathname ?? ""), at: Date.now() },
      }),
    );
  } catch { /* noop */ }
  return hints;
}

/**
 * Suscribe la burbuja del orbe a las sugerencias emitidas. Devuelve la función
 * de baja. SSR-safe.
 */
export function subscribeSuggestions(
  cb: (detail: AuroraSuggestDetail) => void,
): () => void {
  if (!isClient()) return () => {};
  const on = (e: Event) => {
    const d = (e as CustomEvent<AuroraSuggestDetail>).detail;
    if (d && Array.isArray(d.hints)) cb(d);
  };
  window.addEventListener(AURORA_SUGGEST_EVENT, on);
  return () => window.removeEventListener(AURORA_SUGGEST_EVENT, on);
}
