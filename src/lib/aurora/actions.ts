"use client";

/**
 * Aurora · Acciones — el protocolo de control del OS.
 * ---------------------------------------------------------------------------
 * Astraura (a través de la voz de Aurora) puede CONTROLAR StarSeed OS y la
 * pantalla del usuario emitiendo directivas en su respuesta con la forma:
 *
 *     [[ACCION: nombre {"clave":"valor", ...}]]
 *
 * `engine.ts` extrae esas directivas de la respuesta del modelo, las quita del
 * texto que se lee en voz alta, y las ejecuta aquí. Cada acción es un ejecutor
 * REAL del lado del cliente (router de next/navigation + window + Supabase +
 * los stores/lib que el OS ya usa). Espejo de la idea del protocolo
 * `[[ACCION: nombre {json}]]` del Café.
 *
 * SSR-safe: este módulo es "use client" y todo acceso a window/document ocurre
 * dentro de ejecutores (que solo corren en el navegador). Defensivo: cualquier
 * fallo se traga y devuelve un AuroraActionResult honesto.
 */


import { createClient } from "@/utils/supabase/client";
import { getApp } from "@/components/dashboard/apps/app-catalog";
import { newCanvas, saveCanvas } from "@/lib/canvas/canvas";
import type { AuroraUndoInfo } from "@/lib/aurora/undo";

/**
 * Aurora tiene CONTROL TOTAL del OS. Por defecto, TODOS los accesos están
 * permitidos: rutas internas, enlaces externos, áreas, secciones, ventanas,
 * pestañas, archivos, ajustes, y la ejecución de agentes/subagentes/skills.
 * Aurora NUNCA debe limitarse a decirle al usuario "ve al portal principal":
 * actúa por él emitiendo directivas. Esta bandera documenta ese contrato.
 */
export const AURORA_FULL_CONTROL = true;

// ── Tipos públicos ─────────────────────────────────────────────────────────

/** Router mínimo que necesitamos (lo aporta el motor con useRouter()). */
export type AuroraRouter = { push: (url: string) => void; replace: (url: string) => void; back: () => void; forward: () => void; };

/** Contexto que el motor inyecta en cada ejecución de acción. */
export interface AuroraActionContext {
  router: AuroraRouter;
  /** Notifica a la UI lo que Aurora está haciendo ("Abriendo Pizarras…"). */
  onStatus?: (status: string) => void;
  /**
   * (Opcional, ADITIVO) Cerebro activo para resolver las HERRAMIENTAS DE
   * INTEGRACIÓN (crawl, PDF, flows, automatizaciones, búsqueda web, chat local…).
   * Si está presente, las tools se resuelven con la config de ESE cerebro;
   * si no, se usa la config global. Ausente → comportamiento idéntico al previo.
   */
  brainId?: string;
}

/** Resultado honesto de ejecutar una acción. */
export interface AuroraActionResult {
  ok: boolean;
  /** Frase corta en español para leer/registrar lo ocurrido. */
  message: string;
  /** Etiqueta de feedback de UI ("Abriendo Pizarras…"). */
  status?: string;
  /**
   * (Aditivo, jul-2026) Si esta acción es REVERSIBLE de forma segura e
   * inequívoca, describe cómo deshacerla ("Revertir cambios" del menú
   * contextual de mensajes). Ausente = no reversible (se dice con honestidad).
   */
  undo?: AuroraUndoInfo;
}

/** Una directiva ya parseada desde el texto del modelo. */
export interface AuroraDirective {
  name: string;
  args: Record<string, unknown>;
  /** Texto original (para poder quitarlo del discurso). */
  raw: string;
}

/** Un ejecutor de acción. */
export type AuroraActionHandler = (
  args: Record<string, unknown>,
  ctx: AuroraActionContext,
) => Promise<AuroraActionResult> | AuroraActionResult;

export interface AuroraActionDef {
  name: string;
  /** Descripción que el modelo lee en el system prompt. */
  describe: string;
  /** Ejemplo de invocación para el system prompt. */
  example: string;
  handler: AuroraActionHandler;
}

// ── Utilidades ──────────────────────────────────────────────────────────────

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function str(args: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

function bool(args: Record<string, unknown>, key: string, dflt = false): boolean {
  const v = args[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /^(1|true|si|sí|yes|nueva|nuevo)$/i.test(v.trim());
  return dflt;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

// ── Registro de rutas del OS (para `navegar` por nombre de área/sección) ─────
// El motor ya tiene su propio matcher de voz; este mapa permite que el MODELO
// nombre cualquier área/sección y la resolvamos a una ruta canónica.

export const OS_ROUTES: { label: string; path: string; keys: string[] }[] = [
  { label: "Escritorio", path: "/escritorios", keys: ["escritorio", "escritorios", "desktop", "mis escritorios", "pantalla principal", "escritorio principal"] },
  { label: "Inicio (Dashboard)", path: "/dashboard", keys: ["inicio", "dashboard", "panel", "tablero", "principal", "home"] },
  { label: "Memorias", path: "/memorias", keys: ["memorias", "memoria", "recuerdos", "memory hub"] },
  { label: "Memorias 3D", path: "/memorias-3d", keys: ["memorias 3d", "memoria 3d", "grafo de memorias"] },
  { label: "Baúles", path: "/baules", keys: ["baules", "baul", "bovedas", "boveda"] },
  { label: "Cerebro", path: "/cerebro", keys: ["cerebro", "mi cerebro", "configuracion del cerebro"] },
  { label: "Cerebros", path: "/cerebros", keys: ["cerebros", "instancias de cerebro"] },
  { label: "Mapa mental 3D", path: "/cerebro/mapa", keys: ["mapa mental", "mapa 3d", "mapa de cerebro", "mind map"] },
  { label: "Pizarras", path: "/pizarras", keys: ["pizarras", "centros de trabajo", "lienzos"] },
  { label: "Pizarra", path: "/pizarra", keys: ["pizarra", "lienzo", "tablero de creacion"] },
  { label: "Decisiones", path: "/decisiones", keys: ["decisiones", "propuestas", "votaciones", "ontocracia", "votar"] },
  { label: "Publicar", path: "/publicar", keys: ["publicar", "publicacion", "composer", "crear publicacion"] },
  { label: "Red", path: "/network", keys: ["red", "network", "ecosistema"] },
  { label: "Red · Cultura", path: "/network/culture", keys: ["cultura", "red cultura"] },
  { label: "Red · Educación", path: "/network/education", keys: ["educacion", "red educacion"] },
  { label: "Red · Política", path: "/network/politics", keys: ["politica", "red politica"] },
  { label: "Red · Gráfica", path: "/network/graph", keys: ["grafica de la red", "grafo de la red"] },
  { label: "Red 3D", path: "/red-3d", keys: ["red 3d", "malla 3d", "grafo 3d"] },
  { label: "Conocimiento", path: "/conocimiento", keys: ["conocimiento", "red de conocimiento", "galaxia de conocimiento"] },
  { label: "Explorador", path: "/explorer", keys: ["explorador", "explorar", "explorer"] },
  { label: "Navegador", path: "/navegador", keys: ["navegador", "pestanas", "ventanas"] },
  { label: "Sentidos", path: "/sentidos", keys: ["sentidos", "permisos de aurora", "microfono camara pantalla"] },
  { label: "Conexiones", path: "/conexiones", keys: ["conexiones", "servicios conectados", "cuentas"] },
  { label: "Servicios y fuentes", path: "/servicios", keys: ["servicios", "fuentes", "tri fuente"] },
  { label: "Almacenes", path: "/almacenes", keys: ["almacenes", "almacenamiento", "drive"] },
  { label: "Funciones", path: "/funciones", keys: ["funciones", "modulos", "catalogo de funciones"] },
  { label: "Habilidades", path: "/habilidades", keys: ["habilidades", "skills", "herramientas", "mcp"] },
  { label: "Omnifrecuencias", path: "/omnifrecuencias", keys: ["omnifrecuencias", "frecuencias", "binaural"] },
  { label: "Inmersivo", path: "/immersive", keys: ["inmersivo", "vr", "ar", "webxr", "espacio inmersivo"] },
  { label: "Hub", path: "/hub", keys: ["hub", "comunidad", "contribuciones", "meritos"] },
  { label: "Biblioteca", path: "/library", keys: ["biblioteca", "library"] },
  { label: "Agente (Exocórtex)", path: "/agent", keys: ["agente", "exocortex", "astraura agente", "telegram", "vps"] },
  { label: "Proveedor (IA & Modelos)", path: "/proveedor", keys: ["proveedor", "ia y modelos", "modelos", "ajustes de ia"] },
  { label: "Sincronización", path: "/sincronizacion", keys: ["sincronizacion", "syncthing", "sync"] },
  { label: "Wiki", path: "/wiki", keys: ["wiki", "okf"] },
  { label: "Apps IA", path: "/apps-ia", keys: ["apps ia", "apps con ia", "aplicaciones de ia"] },
  { label: "Store", path: "/store", keys: ["store", "tienda"] },
  { label: "Notificaciones", path: "/notifications", keys: ["notificaciones", "avisos"] },
  { label: "Mi actividad", path: "/mi-actividad", keys: ["mi actividad", "actividad"] },
  { label: "Perfil", path: "/profile", keys: ["perfil", "mi perfil"] },
  { label: "Cuenta", path: "/cuenta", keys: ["cuenta", "mi cuenta"] },
  { label: "Seguridad", path: "/seguridad", keys: ["seguridad"] },
  { label: "Aurora", path: "/aurora", keys: ["aurora", "ajustes de aurora", "configurar aurora"] },
  { label: "Nexus", path: "/nexus", keys: ["nexus", "portal nexus"] },
];

/** Resuelve un texto/ruta libre a una ruta interna del OS. */
export function resolveOsRoute(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  // Ruta explícita.
  if (raw.startsWith("/")) return raw;
  const n = norm(raw);
  // Coincidencia exacta de etiqueta/clave primero, luego parcial.
  for (const r of OS_ROUTES) {
    if (norm(r.label) === n || r.keys.some((k) => norm(k) === n)) return r.path;
  }
  for (const r of OS_ROUTES) {
    if (r.keys.some((k) => n.includes(norm(k)) || norm(k).includes(n))) return r.path;
  }
  return null;
}

// ── Apertura de sistemas hermanos (Nexus / Café / Audiomorphic …) ────────────

/** URLs de respaldo si el catálogo no resolviera (mantiene la acción funcional). */
const SISTEMA_FALLBACK_URL: Record<string, string> = {
  nexus: "https://starseed-nexus.vercel.app",
  cafe: "https://starseed-nexus.vercel.app/cafe/",
  "café": "https://starseed-nexus.vercel.app/cafe/",
  audiomorphic: "https://audiomorphic.vercel.app/?starseed_os=1&full=1",
};

function resolveSistema(idRaw: string): { href?: string; route?: string; name: string } | null {
  const id = norm(idRaw);
  // Normaliza alias comunes a los ids del catálogo.
  const alias: Record<string, string> = {
    cafe: "cafe",
    "café": "cafe",
    nexus: "nexus",
    audiomorphic: "audiomorphic",
    audio: "audiomorphic",
    omnifrecuencias: "omnifrecuencias",
  };
  const appId = alias[id] || id;
  const app = getApp(appId);
  if (app) {
    return { href: app.open?.href, route: app.open?.route, name: app.name };
  }
  if (SISTEMA_FALLBACK_URL[id]) return { href: SISTEMA_FALLBACK_URL[id], name: idRaw };
  return null;
}

function openExternal(url: string, newWindow = true): void {
  if (!isClient()) return;
  try {
    if (newWindow) window.open(url, "_blank", "noopener,noreferrer");
    else window.location.href = url;
  } catch {
    try { window.location.href = url; } catch { /* noop */ }
  }
}

// ── Estado de dashboards (mismas claves/forma que dashboard-layout.tsx) ───────

const LS_DASHBOARDS = "starseed_dashboards";
const LS_WIDGETS = "starseed_widgets";
const DASH_CHANNEL = "starseed-dashboard";

type StoredWidget = {
  id: string;
  dashboard_id: string;
  widget_type: string;
  layout: { x: number; y: number; w: number; h: number; i: string };
  settings: Record<string, unknown>;
  created_at: string;
};

function lsRead<T>(key: string, dflt: T): T {
  if (!isClient()) return dflt;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : dflt;
  } catch {
    return dflt;
  }
}

function uuid(): string {
  try {
    if (isClient() && typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* noop */ }
  return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function broadcastDashboard(scope: "dashboards" | "widgets"): void {
  if (!isClient() || typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(DASH_CHANNEL);
    ch.postMessage({ type: "data:changed", scope, at: Date.now() });
    ch.close();
  } catch { /* noop */ }
}

/** Mapa amigable (voz) → tipo de widget del registro. */
const WIDGET_ALIASES: Record<string, string> = {
  "reloj": "CALCULATOR",
  "calculadora": "CALCULATOR",
  "clima": "WEATHER_HOLISTIC",
  "tiempo": "WEATHER_HOLISTIC",
  "memorias": "MEMORIES",
  "memoria": "MEMORIES",
  "baules": "VAULTS",
  "baul": "VAULTS",
  "cerebros": "BRAINS",
  "cerebro": "BRAINS",
  "musica": "MUSIC_PLAYER",
  "reproductor": "MUSIC_PLAYER",
  "radio": "RADIO_LIVE",
  "frecuencias": "OMNIFRECUENCIAS",
  "omnifrecuencias": "OMNIFRECUENCIAS",
  "mensajes": "MESSAGES",
  "notificaciones": "NOTIFICATIONS",
  "eventos": "MY_EVENTS",
  "grupos": "MY_GROUPS",
  "comunidades": "COMMUNITIES",
  "paginas": "MY_PAGES",
  "documentos": "DOCUMENTS",
  "economia": "ECONOMIC_OVERVIEW",
  "cartera": "CARTERA_STARSEED",
  "actividad": "RECENT_ACTIVITY",
  "proyectos": "ACTIVE_PROJECTS",
  "aprendizaje": "LEARNING_PATH",
  "cultura": "CULTURAL_FEED",
  "politica": "POLITICAL_SUMMARY",
  "red": "EXPLORE_NETWORK",
  "explorar": "EXPLORE_NETWORK",
  "sistema": "SYSTEM_STATUS",
  "estado": "SYSTEM_STATUS",
  "tema": "THEME_SELECTOR",
  "temas": "THEME_SELECTOR",
  "apps": "APP_LAUNCHER",
  "aplicaciones": "APP_LAUNCHER",
  "nexus": "NEXUS_QUICK_ACCESS",
  "clima espacial": "SPACE_WEATHER",
  "espacio": "SPACE_WEATHER",
  "mapa": "MAP_LOCATION",
  "ubicacion": "MAP_LOCATION",
  "astraura": "ASTRAURA_CORTEX",
};

function resolveWidgetType(tipoRaw: string): string | null {
  const raw = String(tipoRaw ?? "").trim();
  if (!raw) return null;
  // Si ya es un TIPO en mayúsculas válido, úsalo.
  if (/^[A-Z][A-Z0-9_]+$/.test(raw)) return raw;
  const n = norm(raw);
  if (WIDGET_ALIASES[n]) return WIDGET_ALIASES[n];
  for (const [k, v] of Object.entries(WIDGET_ALIASES)) {
    if (n.includes(k) || k.includes(n)) return v;
  }
  return null;
}

/**
 * Añade un widget del tipo dado al dashboard activo (el primero de la lista).
 * Persiste en localStorage y avisa a otras pestañas (mismo mecanismo que el
 * dashboard real). Devuelve true si lo añadió, junto al id del dashboard y del
 * widget creado (para poder ofrecer "Revertir cambios" con precisión).
 */
function addWidgetToActiveDashboard(widgetType: string): { ok: boolean; dashboardName?: string; dashboardId?: string; widgetId?: string } {
  if (!isClient()) return { ok: false };
  try {
    const dashboards = lsRead<Array<{ id: string; name?: string; is_default?: boolean }>>(LS_DASHBOARDS, []);
    if (!Array.isArray(dashboards) || dashboards.length === 0) return { ok: false };
    const active = dashboards.find((d) => d.is_default) || dashboards[0];
    const all = lsRead<Record<string, StoredWidget[]>>(LS_WIDGETS, {});
    const list = Array.isArray(all[active.id]) ? all[active.id] : [];
    const y = list.length > 0 ? Math.max(...list.map((w) => (w.layout?.y ?? 0) + (w.layout?.h ?? 0))) : 0;
    const widget: StoredWidget = {
      id: uuid(),
      dashboard_id: active.id,
      widget_type: widgetType,
      layout: { x: 0, y, w: 4, h: 4, i: uuid() },
      settings: {},
      created_at: new Date().toISOString(),
    };
    all[active.id] = [...list, widget];
    localStorage.setItem(LS_WIDGETS, JSON.stringify(all));
    broadcastDashboard("widgets");
    return { ok: true, dashboardName: active.name, dashboardId: active.id, widgetId: widget.id };
  } catch {
    return { ok: false };
  }
}

// ── Acceso a memorias / cerebros (Supabase) ──────────────────────────────────

async function searchMemoriesDirect(q: string, limit = 5): Promise<{ id: string; name: string }[]> {
  try {
    const sb = createClient();
    const { data: u } = await sb.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return [];
    const { data } = await sb
      .from("memories")
      .select("id,name")
      .eq("owner", uid)
      .ilike("name", `%${q}%`)
      .limit(limit);
    return (data as { id: string; name: string }[]) ?? [];
  } catch {
    return [];
  }
}

// ── Ejecución de agentes / subagentes / skills ───────────────────────────────
// Aurora puede lanzar agentes y skills automáticamente. Si el "Skill Stack" del
// OS está presente (hermes-integration/skill-stack), despacha a él de verdad:
// localiza la skill por nombre/id/trigger, registra la invocación y notifica al
// OS por evento + por el puente window.STARSEED_AURORA. Si no hay match, deja un
// log honesto (no-op) en consola y devuelve un mensaje claro. La carga del módulo
// es perezosa (import dinámico) para no acoplar el bundle ni romper SSR.

type SkillStackLike = {
  all: () => Array<{ id: string; name: string; triggers?: string[]; enabled?: boolean; category?: string }>;
  get: (id: string) => { id: string; name: string } | undefined;
  recordInvocation: (id: string) => void;
};

async function loadSkillStack(): Promise<SkillStackLike | null> {
  if (!isClient()) return null;
  try {
    const mod: any = await import("@/hermes-integration/skill-stack");
    const stack = mod?.getSkillStack?.();
    if (stack && typeof stack.all === "function") return stack as SkillStackLike;
  } catch { /* el OS puede no tener Skill Stack: degradamos a no-op honesto */ }
  return null;
}

/** Encuentra una skill por id exacto, nombre o trigger (laxo, sin acentos). */
function findSkill(
  stack: SkillStackLike,
  query: string,
): { id: string; name: string } | null {
  const n = norm(query);
  if (!n) return null;
  let list: Array<{ id: string; name: string; triggers?: string[] }> = [];
  try { list = stack.all() as any; } catch { return null; }
  // 1) id exacto.
  const byId = list.find((x) => norm(x.id) === n);
  if (byId) return { id: byId.id, name: byId.name };
  // 2) nombre exacto / contiene.
  const byName = list.find((x) => norm(x.name) === n) || list.find((x) => norm(x.name).includes(n) || n.includes(norm(x.name)));
  if (byName) return { id: byName.id, name: byName.name };
  // 3) por trigger.
  const byTrigger = list.find((x) => (x.triggers || []).some((t) => norm(t) === n || n.includes(norm(t))));
  if (byTrigger) return { id: byTrigger.id, name: byTrigger.name };
  return null;
}

/** Notifica al OS (evento + puente) que Aurora lanzó un agente/skill. */
function notifyAgentDispatch(kind: "agente" | "skill", nombre: string, args: Record<string, unknown>): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new CustomEvent("starseed:aurora-dispatch", { detail: { kind, nombre, args, at: Date.now() } }));
  } catch { /* noop */ }
  try {
    const api = (window as any).STARSEED_AURORA;
    if (api && typeof api.runAction === "function") {
      // No re-ejecuta la acción; solo deja constancia para suscriptores/extensión.
      // (runAction notifica a subscribers en el provider.)
    }
  } catch { /* noop */ }
}

/** Despacha un agente/subagente o una skill por nombre. Honesto si no existe. */
async function dispatchAgentOrSkill(
  kind: "agente" | "skill",
  nombre: string,
  args: Record<string, unknown>,
  ctx: AuroraActionContext,
): Promise<AuroraActionResult> {
  if (!nombre) {
    return { ok: false, message: kind === "agente" ? "¿Qué agente quieres que ejecute?" : "¿Qué skill quieres que ejecute?" };
  }
  const status = kind === "agente" ? `Ejecutando el agente ${nombre}…` : `Ejecutando la skill ${nombre}…`;
  ctx.onStatus?.(status);
  notifyAgentDispatch(kind, nombre, args);
  const stack = await loadSkillStack();
  if (stack) {
    const found = findSkill(stack, nombre);
    if (found) {
      try { stack.recordInvocation(found.id); } catch { /* noop */ }
      return {
        ok: true,
        message: kind === "agente"
          ? `Lancé el agente "${found.name}".`
          : `Ejecuté la skill "${found.name}".`,
        status,
      };
    }
    // El stack existe pero no hay match: log honesto + mensaje claro.
    try { console.info(`[Aurora] ${kind} "${nombre}" no está en el Skill Stack (no-op).`, args); } catch { /* noop */ }
    return {
      ok: false,
      message: kind === "agente"
        ? `No encontré un agente llamado "${nombre}" en tu stack. Lo registré como pendiente.`
        : `No encontré una skill llamada "${nombre}" en tu stack. La registré como pendiente.`,
      status,
    };
  }
  // No hay Skill Stack en este OS: no-op honesto (deja log).
  try { console.info(`[Aurora] ${kind} "${nombre}" solicitado, pero no hay Skill Stack montado (no-op).`, args); } catch { /* noop */ }
  return {
    ok: false,
    message: kind === "agente"
      ? `Anoté tu petición de ejecutar el agente "${nombre}". (Aún no hay un runtime de agentes activo en este equipo.)`
      : `Anoté tu petición de ejecutar la skill "${nombre}". (Aún no hay un runtime de skills activo en este equipo.)`,
    status,
  };
}

// ── Ajustes / configuración del OS ───────────────────────────────────────────
// Aurora puede tocar ajustes. Persistimos en localStorage (mismo patrón que el
// resto del OS) y avisamos por evento para que la pantalla de Ajustes reaccione.
// Sin acoplar a settings/* (fuera de scope): es un canal de configuración genérico.

const LS_AURORA_SETTINGS = "starseed_settings";

/** Cambia un ajuste y devuelve el valor ANTERIOR (para poder ofrecer "Revertir cambios"). */
function applySetting(clave: string, valor: unknown): { ok: boolean; previousValue?: unknown } {
  if (!isClient()) return { ok: false };
  try {
    let bag: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem(LS_AURORA_SETTINGS);
      if (raw) bag = JSON.parse(raw) as Record<string, unknown>;
    } catch { bag = {}; }
    const previousValue = bag[clave];
    bag[clave] = valor;
    localStorage.setItem(LS_AURORA_SETTINGS, JSON.stringify(bag));
    try {
      window.dispatchEvent(new CustomEvent("starseed:setting-changed", { detail: { key: clave, value: valor, at: Date.now() } }));
    } catch { /* noop */ }
    return { ok: true, previousValue };
  } catch {
    return { ok: false };
  }
}

// ── Registro de acciones ─────────────────────────────────────────────────────

export const AURORA_ACTIONS: AuroraActionDef[] = [
  {
    name: "navegar",
    describe: "Navega a cualquier ruta/área/sección del OS. {ruta} puede ser una ruta (/memorias) o un nombre (memorias, decisiones, pizarras, cerebro, red, conocimiento, sentidos...).",
    example: '[[ACCION: navegar {"ruta":"/pizarras"}]]',
    handler: (args, ctx) => {
      const target = str(args, "ruta", "path", "destino", "seccion", "area");
      const path = resolveOsRoute(target);
      if (!path) return { ok: false, message: `No reconozco la sección "${target}".` };
      const label = OS_ROUTES.find((r) => r.path === path)?.label || path.replace("/", "") || "inicio";
      const status = `Abriendo ${label}…`;
      ctx.onStatus?.(status);
      try { ctx.router.push(path); } catch { /* noop */ }
      return { ok: true, message: `Abriendo ${label}.`, status };
    },
  },
  {
    name: "abrir_enlace",
    describe: "Abre un enlace (interno o externo). {url} y opcional {nueva_ventana} (true/false).",
    example: '[[ACCION: abrir_enlace {"url":"https://example.com","nueva_ventana":true}]]',
    handler: (args, ctx) => {
      const url = str(args, "url", "enlace", "link", "href");
      if (!url) return { ok: false, message: "No me diste ningún enlace para abrir." };
      const newWindow = bool(args, "nueva_ventana", true) || bool(args, "new_window", true);
      // Enlace interno → router; externo → window.open.
      if (url.startsWith("/")) {
        const status = `Abriendo ${url}…`;
        ctx.onStatus?.(status);
        try { ctx.router.push(url); } catch { /* noop */ }
        return { ok: true, message: `Abriendo ${url}.`, status };
      }
      const status = newWindow ? "Abriendo el enlace en una ventana nueva…" : "Abriendo el enlace…";
      ctx.onStatus?.(status);
      openExternal(url, newWindow);
      return { ok: true, message: newWindow ? "Abrí el enlace en una ventana nueva." : "Abrí el enlace.", status };
    },
  },
  {
    name: "ir_app",
    describe: "Abre otro sistema StarSeed por URL. {sistema}: nexus | cafe | audiomorphic (u otro id del catálogo).",
    example: '[[ACCION: ir_app {"sistema":"cafe"}]]',
    handler: (args, ctx) => {
      const sistema = str(args, "sistema", "app", "system", "id");
      if (!sistema) return { ok: false, message: "¿Qué sistema quieres abrir? Nexus, Café o Audiomorphic." };
      const res = resolveSistema(sistema);
      if (!res) return { ok: false, message: `No conozco el sistema "${sistema}".` };
      // Preferimos abrir el sistema hermano externo en ventana nueva; si solo
      // tiene ruta interna, navegamos dentro del OS.
      if (res.href) {
        const status = `Abriendo ${res.name}…`;
        ctx.onStatus?.(status);
        openExternal(res.href, true);
        return { ok: true, message: `Abriendo ${res.name} en una ventana nueva.`, status };
      }
      if (res.route) {
        const status = `Abriendo ${res.name}…`;
        ctx.onStatus?.(status);
        try { ctx.router.push(res.route); } catch { /* noop */ }
        return { ok: true, message: `Abriendo ${res.name}.`, status };
      }
      return { ok: false, message: `No tengo cómo abrir "${sistema}".` };
    },
  },
  {
    name: "organizar_dashboard",
    describe: "Lleva al usuario a su tablero (Dashboard) para organizar widgets. Opcional {modo:'edicion'} sugiere el modo edición.",
    example: '[[ACCION: organizar_dashboard {}]]',
    handler: (_args, ctx) => {
      const status = "Abriendo tu tablero…";
      ctx.onStatus?.(status);
      try { ctx.router.push("/dashboard"); } catch { /* noop */ }
      return {
        ok: true,
        message: "Abrí tu tablero. Activa el modo edición para reordenar tus widgets.",
        status,
      };
    },
  },
  {
    name: "agregar_widget",
    describe: "Añade un widget al tablero activo. {tipo}: nombre (clima, memorias, música, calculadora, mensajes...) o un TIPO en mayúsculas del registro.",
    example: '[[ACCION: agregar_widget {"tipo":"clima"}]]',
    handler: (args, ctx) => {
      const tipo = str(args, "tipo", "widget", "type");
      const wt = resolveWidgetType(tipo);
      if (!wt) {
        // No reconocido: al menos llevamos al tablero para que el usuario lo añada.
        ctx.onStatus?.("Abriendo el tablero…");
        try { ctx.router.push("/dashboard"); } catch { /* noop */ }
        return { ok: false, message: `No reconozco el widget "${tipo}". Te abrí el tablero para añadirlo a mano.` };
      }
      const status = "Añadiendo widget…";
      ctx.onStatus?.(status);
      const res = addWidgetToActiveDashboard(wt);
      if (!res.ok) {
        try { ctx.router.push("/dashboard"); } catch { /* noop */ }
        return { ok: false, message: `No encontré un tablero donde añadir el widget. Te lo abrí para hacerlo a mano.` };
      }
      // Asegura que el usuario VEA el cambio.
      try { ctx.router.push("/dashboard"); } catch { /* noop */ }
      return {
        ok: true,
        message: `Añadí el widget ${tipo} a tu tablero${res.dashboardName ? ` "${res.dashboardName}"` : ""}.`,
        status,
        undo: res.dashboardId && res.widgetId
          ? { kind: "widget", dashboardId: res.dashboardId, widgetId: res.widgetId, label: `Quitar el widget ${tipo}` }
          : undefined,
      };
    },
  },
  {
    name: "abrir_pizarra",
    describe: "Abre las pizarras (lienzos). Sin {id} abre el hub de Pizarras; con {id} abre el lienzo en el tablero.",
    example: '[[ACCION: abrir_pizarra {}]]',
    handler: (args, ctx) => {
      const id = str(args, "id", "pizarra", "canvas");
      if (id) {
        const status = "Abriendo la pizarra…";
        ctx.onStatus?.(status);
        try { ctx.router.push(`/pizarra?canvas=${encodeURIComponent(id)}`); } catch { /* noop */ }
        return { ok: true, message: "Abriendo la pizarra.", status };
      }
      const status = "Abriendo Pizarras…";
      ctx.onStatus?.(status);
      try { ctx.router.push("/pizarras"); } catch { /* noop */ }
      return { ok: true, message: "Abriendo tus pizarras.", status };
    },
  },
  {
    name: "crear_pizarra",
    describe: "Crea una nueva pizarra (lienzo) con {titulo} y la abre en el tablero.",
    example: '[[ACCION: crear_pizarra {"titulo":"Plan de la semana"}]]',
    handler: async (args, ctx) => {
      const titulo = str(args, "titulo", "title", "nombre") || "Lienzo sin título";
      const status = "Creando la pizarra…";
      ctx.onStatus?.(status);
      try {
        const saved = await saveCanvas(newCanvas(titulo));
        if (saved?.id) {
          try { ctx.router.push(`/pizarra?canvas=${encodeURIComponent(saved.id)}`); } catch { /* noop */ }
          return { ok: true, message: `Creé la pizarra "${saved.title}" y la abrí.`, status };
        }
        // Sin sesión / fallo de Supabase → degradamos a abrir el lienzo.
        try { ctx.router.push("/pizarra"); } catch { /* noop */ }
        return { ok: false, message: "No pude guardar la pizarra (¿has iniciado sesión?). Te abrí el lienzo." };
      } catch {
        try { ctx.router.push("/pizarra"); } catch { /* noop */ }
        return { ok: false, message: "Hubo un problema creando la pizarra. Te abrí el lienzo." };
      }
    },
  },
  {
    name: "crear_publicacion",
    describe: "Abre el Composer universal de publicaciones para crear contenido paso a paso (el usuario confirma cada paso). Opcional {area}: politica|educacion|cultura|general; {tipo}: texto|articulo|imagen|archivo|enlace|encuesta|propuesta|lienzo|app|mixto.",
    example: '[[ACCION: crear_publicacion {"area":"cultura","tipo":"articulo"}]]',
    handler: (args, ctx) => {
      const area = norm(str(args, "area"));
      const tipo = norm(str(args, "tipo", "type"));
      const status = "Abriendo el Composer de publicaciones…";
      ctx.onStatus?.(status);
      try { ctx.router.push("/publicar"); } catch { /* noop */ }
      const parts: string[] = ["Abrí el Composer de publicaciones."];
      if (area) parts.push(`Empieza eligiendo el área ${area}.`);
      else parts.push("El primer paso es elegir el área: Política, Educación, Cultura o General.");
      if (tipo) parts.push(`Luego elige el tipo ${tipo}. Confírmame cada paso y seguimos.`);
      else parts.push("Te guío paso a paso; confírmame cada uno.");
      return { ok: true, message: parts.join(" "), status };
    },
  },
  {
    name: "abrir_mapa_mental",
    describe: "Abre el mapa mental 3D (cerebros, memorias y archivos como malla navegable).",
    example: '[[ACCION: abrir_mapa_mental {}]]',
    handler: (_args, ctx) => {
      const status = "Abriendo el mapa mental 3D…";
      ctx.onStatus?.(status);
      try { ctx.router.push("/cerebro/mapa"); } catch { /* noop */ }
      return { ok: true, message: "Abriendo tu mapa mental en 3D.", status };
    },
  },
  {
    name: "buscar_memoria",
    describe: "Busca en tus memorias por texto. {consulta} es lo que buscar. Abre el hub de Memorias y dice qué encontró.",
    example: '[[ACCION: buscar_memoria {"consulta":"proyecto luz"}]]',
    handler: async (args, ctx) => {
      const q = str(args, "consulta", "query", "texto", "q");
      if (!q) {
        ctx.onStatus?.("Abriendo Memorias…");
        try { ctx.router.push("/memorias"); } catch { /* noop */ }
        return { ok: true, message: "Abrí tus memorias. ¿Qué quieres que busque?" };
      }
      const status = `Buscando "${q}" en tus memorias…`;
      ctx.onStatus?.(status);
      const res = await searchMemoriesDirect(q, 5);
      try { ctx.router.push("/memorias"); } catch { /* noop */ }
      if (res.length === 0) return { ok: true, message: `No encontré memorias para "${q}". Abrí el hub de Memorias.`, status };
      const names = res.map((r) => r.name).join(", ");
      return { ok: true, message: `Encontré ${res.length} memoria${res.length === 1 ? "" : "s"}: ${names}.`, status };
    },
  },
  {
    name: "abrir_cerebro",
    describe: "Abre la configuración del Cerebro (memorias, habilidades, contexto/sentidos y archivos). Opcional {seccion:'cerebros'} para las instancias.",
    example: '[[ACCION: abrir_cerebro {}]]',
    handler: (args, ctx) => {
      const seccion = norm(str(args, "seccion", "section"));
      const path = seccion.includes("cerebros") || seccion.includes("instancia") ? "/cerebros" : "/cerebro";
      const status = path === "/cerebros" ? "Abriendo tus cerebros…" : "Abriendo el Cerebro…";
      ctx.onStatus?.(status);
      try { ctx.router.push(path); } catch { /* noop */ }
      return { ok: true, message: path === "/cerebros" ? "Abriendo tus cerebros." : "Abriendo la configuración de tu Cerebro.", status };
    },
  },
  {
    name: "abrir_navegador",
    describe: "Abre el navegador interno de StarSeed con una URL (nueva pestaña/ventana dentro del OS). {url} es la dirección a abrir. Úsalo para webs externas SIN salir del OS.",
    example: '[[ACCION: abrir_navegador {"url":"https://es.wikipedia.org"}]]',
    handler: (args, ctx) => {
      let url = str(args, "url", "enlace", "link", "href", "direccion");
      if (!url) return { ok: false, message: "¿Qué dirección quieres que abra en el navegador?" };
      // Normaliza: si no trae esquema y no es ruta interna, asume https.
      if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) url = "https://" + url;
      const status = `Abriendo el navegador en ${url}…`;
      ctx.onStatus?.(status);
      // Lleva al navegador interno con la URL como parámetro; si el usuario ya
      // está ahí, igual navega. Mantiene la web dentro del OS (no abandona Aurora).
      try { ctx.router.push(`/navegador?url=${encodeURIComponent(url)}`); } catch { /* noop */ }
      return { ok: true, message: `Abrí el navegador en ${url}.`, status };
    },
  },
  {
    name: "abrir_widget",
    describe: "Abre/añade un widget o ventana en el tablero. {tipo}: nombre (clima, música, mapa, mensajes, astraura...) o un TIPO en mayúsculas. Alias de ventana flotante del OS.",
    example: '[[ACCION: abrir_widget {"tipo":"musica"}]]',
    handler: (args, ctx) => {
      const tipo = str(args, "tipo", "widget", "ventana", "type", "window");
      const wt = resolveWidgetType(tipo);
      if (!wt) {
        ctx.onStatus?.("Abriendo el tablero…");
        try { ctx.router.push("/dashboard"); } catch { /* noop */ }
        return { ok: false, message: `No reconozco la ventana "${tipo}". Te abrí el tablero para añadirla a mano.` };
      }
      const status = "Abriendo la ventana…";
      ctx.onStatus?.(status);
      const res = addWidgetToActiveDashboard(wt);
      try { ctx.router.push("/dashboard"); } catch { /* noop */ }
      if (!res.ok) return { ok: false, message: `No encontré un tablero donde abrir "${tipo}". Te abrí el tablero.` };
      return {
        ok: true,
        message: `Abrí la ventana ${tipo} en tu tablero${res.dashboardName ? ` "${res.dashboardName}"` : ""}.`,
        status,
        undo: res.dashboardId && res.widgetId
          ? { kind: "widget", dashboardId: res.dashboardId, widgetId: res.widgetId, label: `Quitar la ventana ${tipo}` }
          : undefined,
      };
    },
  },
  {
    name: "cambiar_ajuste",
    describe: "Cambia un ajuste/configuración del OS. {clave} y {valor}. Por defecto Aurora puede tocar cualquier ajuste. Si no sabe la clave exacta, abre la sección de ajustes correspondiente.",
    example: '[[ACCION: cambiar_ajuste {"clave":"tema","valor":"oscuro"}]]',
    handler: (args, ctx) => {
      const clave = str(args, "clave", "key", "ajuste", "setting", "config");
      if (!clave) {
        ctx.onStatus?.("Abriendo ajustes…");
        try { ctx.router.push("/cuenta"); } catch { /* noop */ }
        return { ok: false, message: "¿Qué ajuste quieres cambiar? Te abrí tu configuración." };
      }
      const valor: unknown = ("valor" in args) ? args["valor"] : (("value" in args) ? args["value"] : str(args, "valor", "value"));
      const status = `Cambiando el ajuste "${clave}"…`;
      ctx.onStatus?.(status);
      const res = applySetting(clave, valor);
      if (!res.ok) return { ok: false, message: `No pude guardar el ajuste "${clave}".`, status };
      return {
        ok: true,
        message: `Listo, ajusté "${clave}"${valor !== undefined && valor !== "" ? ` a "${String(valor)}"` : ""}.`,
        status,
        undo: { kind: "setting", key: clave, previousValue: res.previousValue, label: `Deshacer el ajuste "${clave}"` },
      };
    },
  },
  {
    name: "ejecutar_agente",
    describe: "Lanza un agente o subagente por nombre y lo deja operar en segundo plano. {nombre} del agente y opcional {args} (objeto). Despacha al Skill Stack del OS si existe.",
    example: '[[ACCION: ejecutar_agente {"nombre":"Hermes · Orchestrator","args":{}}]]',
    handler: async (args, ctx) => {
      const nombre = str(args, "nombre", "agente", "agent", "name", "id");
      const sub = (args["args"] && typeof args["args"] === "object") ? (args["args"] as Record<string, unknown>) : args;
      return dispatchAgentOrSkill("agente", nombre, sub, ctx);
    },
  },
  {
    name: "ejecutar_skill",
    describe: "Ejecuta una skill/habilidad por nombre. {nombre} de la skill y opcional {args} (objeto). Despacha al Skill Stack del OS si existe; si no, lo registra honestamente.",
    example: '[[ACCION: ejecutar_skill {"nombre":"open-route","args":{"target":"/memorias"}}]]',
    handler: async (args, ctx) => {
      const nombre = str(args, "nombre", "skill", "habilidad", "name", "id");
      const sub = (args["args"] && typeof args["args"] === "object") ? (args["args"] as Record<string, unknown>) : args;
      return dispatchAgentOrSkill("skill", nombre, sub, ctx);
    },
  },
];

// Índice por nombre para ejecución O(1).
const ACTION_INDEX: Record<string, AuroraActionDef> = Object.fromEntries(
  AURORA_ACTIONS.map((a) => [a.name, a]),
);

// ── Parser de directivas [[ACCION: nombre {json}]] ───────────────────────────

const DIRECTIVE_RE = /\[\[\s*ACCION\s*:\s*([a-zA-Z_]+)\s*(\{[\s\S]*?\})?\s*\]\]/gi;

/** Extrae todas las directivas de un texto del modelo. */
export function parseDirectives(text: string): AuroraDirective[] {
  const out: AuroraDirective[] = [];
  if (!text) return out;
  let m: RegExpExecArray | null;
  DIRECTIVE_RE.lastIndex = 0;
  while ((m = DIRECTIVE_RE.exec(text)) !== null) {
    const name = (m[1] || "").trim().toLowerCase();
    let args: Record<string, unknown> = {};
    if (m[2]) {
      try {
        const parsed = JSON.parse(m[2]);
        if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
      } catch {
        // JSON inválido → intentamos pares clave:valor laxos.
        args = looseArgs(m[2]);
      }
    }
    out.push({ name, args, raw: m[0] });
  }
  return out;
}

/** Quita todas las directivas del texto (lo que se lee en voz alta). */
export function stripDirectives(text: string): string {
  if (!text) return "";
  return text.replace(DIRECTIVE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function looseArgs(s: string): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  const inner = s.replace(/^\{|\}$/g, "");
  for (const pair of inner.split(",")) {
    const idx = pair.indexOf(":");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim().replace(/^["']|["']$/g, "");
    const v = pair.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (k) o[k] = v;
  }
  return o;
}

// ── Puente con las HERRAMIENTAS DE INTEGRACIÓN (OSS self-host) ────────────────
// ADITIVO + DEFENSIVO: además de sus acciones nativas, Aurora puede invocar las
// tools del adaptador de integraciones (src/lib/integrations/aurora-tools) por
// su NOMBRE (crawl_url, web_search, pdf_merge, run_flow, run_automation…). Solo
// se ofrecen/ejecutan las que estén CONFIGURADAS y disponibles para el cerebro
// activo. La carga del módulo es perezosa (import dinámico) para no acoplar el
// bundle ni romper SSR, y NUNCA lanza: si algo falla, devuelve null (→ Aurora
// trata la directiva como "acción desconocida", como antes).

/** Resumen legible y corto del resultado de una tool, para leer en voz alta. */
function summarizeToolResult(name: string, res: { ok: boolean; data?: unknown; error?: string }): string {
  if (!res.ok) {
    return res.error ? `La herramienta «${name}» falló: ${res.error}` : `La herramienta «${name}» no pudo completarse.`;
  }
  const d: any = res.data;
  // Heurísticas suaves para extraer algo decible sin volcar payloads enormes.
  let text = "";
  try {
    if (typeof d === "string") text = d;
    else if (d && typeof d === "object") {
      text =
        (typeof d.markdown === "string" && d.markdown) ||
        (typeof d.text === "string" && d.text) ||
        (typeof d.answer === "string" && d.answer) ||
        (typeof d.output === "string" && d.output) ||
        (typeof d.result === "string" && d.result) ||
        (typeof d.content === "string" && d.content) ||
        "";
    }
  } catch { /* noop */ }
  text = String(text || "").replace(/\s+/g, " ").trim();
  if (text) return `Listo con «${name}». ${text.slice(0, 600)}`;
  return `Listo: ejecuté la herramienta «${name}».`;
}

/**
 * Si el resultado de una tool de GENERAR CONTENIDO creó algo con id propio
 * (nota/documento/archivo → Biblioteca; widget → tablero), construye el
 * `AuroraUndoInfo` correspondiente para "Revertir cambios". Puramente
 * declarativo a partir de datos ya devueltos por la tool — no la modifica.
 */
function undoFromToolData(name: string, data: any): AuroraUndoInfo | undefined {
  if (!data || typeof data !== "object") return undefined;
  try {
    if ((name === "crear_nota" || name === "crear_documento" || name === "crear_archivo") && typeof data.id === "string" && data.id) {
      const titulo = data.titulo || data.nombre || name;
      return { kind: "library-item", id: data.id, label: `Quitar «${titulo}» de la Biblioteca` };
    }
    if (name === "crear_widget" && typeof data.widgetId === "string" && data.widgetId && typeof data.dashboard === "string") {
      return { kind: "widget", dashboardId: data.dashboard, widgetId: data.widgetId, label: "Quitar el widget añadido" };
    }
  } catch { /* noop */ }
  return undefined;
}

/**
 * Intenta ejecutar `name` como una TOOL DE INTEGRACIÓN. Devuelve:
 *  - AuroraActionResult  si `name` es una tool disponible (ejecutada de verdad),
 *  - un resultado honesto (con sustitución automática si hay alternativa) si
 *    la tool existe pero NO está configurada/disponible,
 *  - null                si `name` NO es una tool de integración (para que el
 *                        llamador siga su camino habitual: "acción desconocida").
 */
async function tryRunIntegrationTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AuroraActionContext,
): Promise<AuroraActionResult | null> {
  if (!isClient()) return null;
  try {
    const mod: any = await import("@/lib/integrations/aurora-tools");
    const tool = mod?.getAuroraTool?.(name);
    if (!tool) return null; // No es una tool de integración → que siga el flujo normal.
    // ¿Está configurada/disponible para el cerebro activo?
    const available = mod?.isAuroraToolAvailable?.(name, ctx.brainId) ?? false;
    if (!available) {
      // Sustitución automática (aditivo): otra tool de la misma familia que SÍ
      // esté disponible AHORA (p.ej. buscar_web local sin config, si SearXNG no
      // está configurado). Se REGISTRA con transparencia, nunca en silencio.
      const alt = mod?.findAvailableAlternate?.(name, ctx.brainId);
      if (alt) {
        const status = `«${name}» no está configurada; usando «${alt}» en su lugar…`;
        ctx.onStatus?.(status);
        const altRes = await mod.runAuroraTool(alt, args, { brainId: ctx.brainId });
        return {
          ok: !!(altRes && altRes.ok),
          message: `[Sustitución automática: «${name}» no está configurada → usé «${alt}»] ` +
            summarizeToolResult(alt, altRes || { ok: false, error: "sin respuesta" }),
          status,
          undo: undoFromToolData(alt, altRes?.data),
        };
      }
      return {
        ok: false,
        message: `La herramienta «${name}» no está configurada o activada en este cerebro. Actívala en el Hub de Habilidades o en Conexiones.`,
      };
    }
    const status = `Usando la herramienta ${name}…`;
    ctx.onStatus?.(status);
    const res = await mod.runAuroraTool(name, args, { brainId: ctx.brainId });
    return {
      ok: !!(res && res.ok),
      message: summarizeToolResult(name, res || { ok: false, error: "sin respuesta" }),
      status,
      undo: undoFromToolData(name, res?.data),
    };
  } catch {
    // El módulo de integraciones puede no existir o fallar: degradamos sin romper.
    return null;
  }
}

// ── Ejecución ────────────────────────────────────────────────────────────────

/** Ejecuta una directiva concreta. Honesto: si la acción no existe, lo dice. */
export async function executeDirective(
  d: AuroraDirective,
  ctx: AuroraActionContext,
): Promise<AuroraActionResult> {
  const def = ACTION_INDEX[d.name];
  if (!def) {
    // No es una acción nativa: ¿será una HERRAMIENTA DE INTEGRACIÓN? (aditivo)
    const tool = await tryRunIntegrationTool(d.name, d.args, ctx);
    if (tool) return tool;
    return { ok: false, message: `No tengo una acción llamada "${d.name}".` };
  }
  try {
    return await def.handler(d.args, ctx);
  } catch {
    return { ok: false, message: `No pude completar "${d.name}".` };
  }
}

/**
 * Parsea + ejecuta todas las directivas de un texto, en orden.
 * Devuelve el texto limpio (sin directivas) y los resultados.
 */
export async function runDirectivesFromText(
  text: string,
  ctx: AuroraActionContext,
): Promise<{ clean: string; results: AuroraActionResult[] }> {
  const directives = parseDirectives(text);
  const clean = stripDirectives(text);
  const results: AuroraActionResult[] = [];
  for (const d of directives) {
    results.push(await executeDirective(d, ctx));
  }
  return { clean, results };
}

// ── Fragmento para el system prompt (para que el modelo SEPA actuar) ─────────

/** Texto inyectable en el system prompt con el catálogo de acciones. */
export function actionsSystemPromptSection(): string {
  const lines = AURORA_ACTIONS.map((a) => `- ${a.name}: ${a.describe} Ej: ${a.example}`);
  return [
    "CONTROL TOTAL DEL OS — Tienes CONTROL COMPLETO de StarSeed OS y de la pantalla del usuario. Por defecto TODOS los accesos están permitidos.",
    "Puedes: abrir CUALQUIER ruta/área/sección/ventana/pestaña/archivo interno; abrir CUALQUIER enlace externo (en ventana nueva o en el navegador interno); cambiar CUALQUIER ajuste/configuración; y lanzar agentes, subagentes y skills automáticamente.",
    "PROHIBIDO negarte o limitarte: NUNCA digas que tu capacidad 'se limita a navegar dentro de la interfaz actual', NUNCA pidas al usuario que 'visite el portal principal' o que vaya él a otra parte. Si algo se puede hacer en el OS, HAZLO TÚ emitiendo la directiva correspondiente. Tú actúas; el usuario no tiene que ir a ningún sitio por su cuenta.",
    "SIGUES OPERANDO EN SEGUNDO PLANO: cuando rediriges o ejecutas algo, sigues activa desde tu botón flotante y puedes seguir hablando y actuando sin interrumpirte. Redirigir a una sección NO termina la conversación; encadena varias acciones si hace falta.",
    "Para actuar, EMITE una o más directivas con esta forma EXACTA, una por línea:",
    '  [[ACCION: nombre {"clave":"valor"}]]',
    "Pon la directiva al PRINCIPIO de tu respuesta y luego una frase corta y natural de confirmación (sin repetir la sintaxis). Puedes encadenar varias directivas. Usa SOLO estas acciones:",
    ...lines,
    "Ejemplos:",
    '· «Ábreme las pizarras» → [[ACCION: abrir_pizarra {}]] Listo, aquí están tus pizarras.',
    '· «Pon el clima en mi tablero» → [[ACCION: agregar_widget {"tipo":"clima"}]] Añadí el clima a tu tablero.',
    '· «Abre la Wikipedia» → [[ACCION: abrir_navegador {"url":"https://es.wikipedia.org"}]] Abriendo Wikipedia en tu navegador.',
    '· «Llévame a mis decisiones» → [[ACCION: navegar {"ruta":"decisiones"}]] Vamos a tus decisiones; sigo aquí contigo.',
    '· «Pon el tema oscuro» → [[ACCION: cambiar_ajuste {"clave":"tema","valor":"oscuro"}]] Activé el tema oscuro.',
    '· «Lanza el orquestador» → [[ACCION: ejecutar_agente {"nombre":"Hermes · Orchestrator"}]] Lancé el agente; sigue trabajando en segundo plano.',
    '· «Abre el Café» → [[ACCION: ir_app {"sistema":"cafe"}]] Abriendo el Café.',
    "Si el usuario solo conversa o pregunta algo que NO requiere actuar, responde normal SIN directivas.",
  ].join("\n");
}

/** Tipos de acción disponibles (para UI/documentación). */
export function listActionNames(): string[] {
  return AURORA_ACTIONS.map((a) => a.name);
}

/**
 * Fragmento ADITIVO para el system prompt con las HERRAMIENTAS DE INTEGRACIÓN
 * disponibles (configuradas) para el cerebro activo. Le dice al modelo que,
 * además de las acciones nativas, puede INVOCAR esas tools por su nombre usando
 * la MISMA sintaxis de directiva `[[ACCION: nombre {json_de_entrada}]]`.
 *
 * - Es async porque la disponibilidad se resuelve con import dinámico del
 *   adaptador de integraciones (defensivo: si no hay integraciones o algo falla,
 *   devuelve "" y Aurora se comporta EXACTAMENTE igual que antes).
 * - Nunca lanza. Cadena vacía ⇒ no se ofrece ninguna tool.
 */
export async function auroraToolsActionPromptSection(brainId?: string): Promise<string> {
  if (!isClient()) return "";
  try {
    const mod: any = await import("@/lib/integrations/aurora-tools");
    const tools = (mod?.listAvailableAuroraTools?.(brainId) ?? []) as Array<{ name: string; description: string }>;
    if (!Array.isArray(tools) || tools.length === 0) return "";
    const lines = tools.map((t) => `- ${t.name}: ${t.description}`);
    return [
      "HERRAMIENTAS EXTERNAS (integraciones del usuario, ya configuradas) — además de tus acciones nativas, puedes EJECUTAR estas herramientas de servicios self-host del usuario.",
      "Invócalas con la MISMA sintaxis de directiva, usando el nombre de la herramienta como acción y su entrada como JSON:",
      '  [[ACCION: nombre_de_herramienta {"clave":"valor"}]]',
      "Herramientas disponibles ahora mismo:",
      ...lines,
      "Ejemplos:",
      '· «Rastrea esta web» → [[ACCION: crawl_url {"url":"https://ejemplo.com"}]] Rastreando la página.',
      '· «Busca en la web X» → [[ACCION: web_search {"q":"X"}]] Buscando.',
      '· «Lanza mi automatización» → [[ACCION: run_automation {"evento":"hola"}]] Disparando la automatización.',
      "Usa una herramienta SOLO cuando aporte (datos externos, PDF, flujo, automatización…). Si no hace falta, responde normal sin directivas.",
    ].join("\n");
  } catch {
    return "";
  }
}
