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

import type { Router } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { getApp } from "@/components/dashboard/apps/app-catalog";
import { newCanvas, saveCanvas } from "@/lib/canvas/canvas";

// ── Tipos públicos ─────────────────────────────────────────────────────────

/** Router mínimo que necesitamos (lo aporta el motor con useRouter()). */
export type AuroraRouter = Pick<Router, "push" | "replace" | "back" | "forward">;

/** Contexto que el motor inyecta en cada ejecución de acción. */
export interface AuroraActionContext {
  router: AuroraRouter;
  /** Notifica a la UI lo que Aurora está haciendo ("Abriendo Pizarras…"). */
  onStatus?: (status: string) => void;
}

/** Resultado honesto de ejecutar una acción. */
export interface AuroraActionResult {
  ok: boolean;
  /** Frase corta en español para leer/registrar lo ocurrido. */
  message: string;
  /** Etiqueta de feedback de UI ("Abriendo Pizarras…"). */
  status?: string;
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
 * dashboard real). Devuelve true si lo añadió.
 */
function addWidgetToActiveDashboard(widgetType: string): { ok: boolean; dashboardName?: string } {
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
    return { ok: true, dashboardName: active.name };
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
      return { ok: true, message: `Añadí el widget ${tipo} a tu tablero${res.dashboardName ? ` "${res.dashboardName}"` : ""}.`, status };
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

// ── Ejecución ────────────────────────────────────────────────────────────────

/** Ejecuta una directiva concreta. Honesto: si la acción no existe, lo dice. */
export async function executeDirective(
  d: AuroraDirective,
  ctx: AuroraActionContext,
): Promise<AuroraActionResult> {
  const def = ACTION_INDEX[d.name];
  if (!def) return { ok: false, message: `No tengo una acción llamada "${d.name}".` };
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
    "CONTROL DEL OS — Puedes CONTROLAR StarSeed OS y la pantalla del usuario.",
    "Cuando el usuario quiera que abras, crees, busques o manipules algo, NO te limites a describirlo: EMITE una o más directivas de acción con esta forma EXACTA, en una sola línea cada una:",
    '  [[ACCION: nombre {"clave":"valor"}]]',
    "Pon la directiva al PRINCIPIO de tu respuesta y luego una frase corta y natural de confirmación (sin repetir la sintaxis). Puedes encadenar varias directivas si hace falta. Usa SOLO estas acciones:",
    ...lines,
    'Ejemplos: «Abreme las pizarras» → [[ACCION: abrir_pizarra {}]] Listo, aquí están tus pizarras. · «Pon el clima en mi tablero» → [[ACCION: agregar_widget {"tipo":"clima"}]] Añadí el clima a tu tablero. · «Abre el Café» → [[ACCION: ir_app {"sistema":"cafe"}]] Abriendo el Café.',
    "Si el usuario solo conversa o pregunta algo que no requiere actuar, responde normal SIN directivas.",
  ].join("\n");
}

/** Tipos de acción disponibles (para UI/documentación). */
export function listActionNames(): string[] {
  return AURORA_ACTIONS.map((a) => a.name);
}
