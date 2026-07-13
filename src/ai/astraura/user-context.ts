"use client";

/*
 * Astraura · CONTEXTO TOTAL DEL USUARIO (user-context)
 * ═══════════════════════════════════════════════════════════════════════════
 * Recolectores TOLERANTES (nunca lanzan) que resumen, en español y de forma
 * compacta, el ámbito PROPIO del usuario — perfiles, grupos/páginas, archivos,
 * publicaciones, mensajes, notificaciones/recordatorios, escritorios/widgets
 * y proyectos/espacios — más una búsqueda PÚBLICA de la red. Cierra el hueco
 * de "Aurora no sabe nada de mí ni de la red" sin tocar ninguna tabla nueva:
 * reutiliza las capas de datos ya existentes (profiles.ts, os-files.ts,
 * dm.ts, notifications.ts, reminders-store.ts, desktop-store.ts, spaces.ts).
 *
 * Privacidad (regla dura): solo ÁMBITO PROPIO (owner/auth.uid()) + PÚBLICO
 * (os_pages/os_groups/os_posts legibles por RLS). `misMensajes()` NUNCA
 * incluye el cuerpo de los mensajes, solo hilos + títulos + contador. Nunca
 * se exponen claves, tokens ni secretos.
 *
 * Consumido por:
 *   · buildUserContext(level) → bloque de system prompt para Aurora, inyectado
 *     automáticamente desde `astrauraChat()` (router.ts) cuando el usuario lo
 *     activó (Ajustes → Aurora e IA → "Aurora conoce mi contexto").
 *   · aurora-tools.ts → tools invocables get_user_context / search_network_posts
 *     / get_entity_context (para que Aurora pida más detalle a demanda).
 *
 * Todo SSR-safe (`typeof window` guards) y defensivo: cualquier fallo de red,
 * tabla ausente o sesión inexistente degrada a "" / [] sin romper la
 * conversación de Aurora. Imports de otras capas son DINÁMICOS para no acoplar
 * el bundle de Astraura a cada dominio y para poder cargarse desde cualquier
 * punto (router/tools) sin ciclos.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";

/* ─────────────────────────────── Ajustes ─────────────────────────────────── */

export type UserContextLevel = "breve" | "completo";

/**
 * Preferencias declaradas por el usuario en el ONBOARDING de Aurora (opcional):
 * cómo llamarle, temas de interés, tono deseado e idioma. Se guardan DENTRO de la
 * misma clave sincronizada (nada de claves nuevas) y Aurora las tiene presentes
 * en CADA conversación (buildUserContext las antepone). Todo opcional/ajustable.
 */
export interface UserAbout {
  /** Cómo prefiere el usuario que Aurora se dirija a él/ella. */
  callName?: string;
  /** Temas de interés (texto libre, separado por comas). */
  interests?: string;
  /** Tono deseado ("cercano" | "equilibrado" | "formal" u otro descriptivo). */
  tone?: string;
  /** Idioma preferente ("es", "en"…). */
  language?: string;
}

export interface UserContextSettings {
  /** Aurora conoce automáticamente tu contexto propio en cada conversación. */
  enabled: boolean;
  /** Nivel que se inyecta automáticamente cuando `enabled` es true. */
  defaultLevel: UserContextLevel;
  /** Preferencias del onboarding (cómo llamarte, intereses, tono, idioma). */
  about?: UserAbout;
}

export const USER_CONTEXT_SETTINGS_KEY = "starseed.astraura.usercontext.v1";
export const USER_CONTEXT_SETTINGS_EVENT = "starseed:astraura-usercontext";

export const DEFAULT_USER_CONTEXT_SETTINGS: UserContextSettings = {
  enabled: true,
  defaultLevel: "breve",
};

/** Saneado defensivo del bloque "about" (recorta y descarta vacíos). */
function sanitizeAbout(raw: unknown): UserAbout | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
  const out: UserAbout = {};
  const callName = str(r.callName, 60);
  if (callName) out.callName = callName;
  const interests = str(r.interests, 400);
  if (interests) out.interests = interests;
  const tone = str(r.tone, 40);
  if (tone) out.tone = tone;
  const language = str(r.language, 12);
  if (language) out.language = language;
  return Object.keys(out).length ? out : undefined;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

/** Lee los ajustes de contexto de usuario (localStorage; sincronizados vía SYNCED_KEYS). */
export function getUserContextSettings(): UserContextSettings {
  if (!isClient()) return { ...DEFAULT_USER_CONTEXT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(USER_CONTEXT_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_USER_CONTEXT_SETTINGS };
    const p = JSON.parse(raw) as Partial<UserContextSettings> | null;
    const about = sanitizeAbout(p?.about);
    return {
      enabled: typeof p?.enabled === "boolean" ? p.enabled : DEFAULT_USER_CONTEXT_SETTINGS.enabled,
      defaultLevel: p?.defaultLevel === "completo" ? "completo" : "breve",
      ...(about ? { about } : {}),
    };
  } catch {
    return { ...DEFAULT_USER_CONTEXT_SETTINGS };
  }
}

/** Guarda (fusiona) los ajustes de contexto de usuario. Nunca lanza. */
export function saveUserContextSettings(patch: Partial<UserContextSettings>): UserContextSettings {
  const current = getUserContextSettings();
  const next: UserContextSettings = { ...current, ...patch };
  // El bloque "about" se FUSIONA campo a campo (no se pisa entero) y se sanea.
  if ("about" in patch) {
    const merged = sanitizeAbout({ ...(current.about ?? {}), ...(patch.about ?? {}) });
    if (merged) next.about = merged;
    else delete next.about;
  }
  if (isClient()) {
    try {
      window.localStorage.setItem(USER_CONTEXT_SETTINGS_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(USER_CONTEXT_SETTINGS_EVENT));
    } catch {
      /* cuota / modo privado: degradamos en silencio */
    }
  }
  return next;
}

/* ─────────────────────────────── Utilidades ──────────────────────────────── */

async function getUid(): Promise<string | null> {
  if (!isClient()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Escapa comodines de `ilike` (`%`, `_`) en texto libre del usuario. */
function escapeLike(q: string): string {
  return q.replace(/[%_]/g, (m) => `\\${m}`);
}

function snippetOf(body: unknown, max = 140): string {
  const s = String(body ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/* ═══════════════════════ Recolectores — ÁMBITO PROPIO ═══════════════════════ */

/** Resumen de los perfiles (facetas) de la cuenta — os_account_profiles. */
export async function misPerfiles(): Promise<string> {
  try {
    const { listMyProfiles, profileKindLabel, activeProfileId } = await import("@/lib/profiles/profiles");
    const profiles = await listMyProfiles();
    if (!profiles.length) return "";
    const activeId = activeProfileId();
    const partes = profiles.slice(0, 6).map((p) => {
      const tags = [profileKindLabel(p.kind)];
      if (p.handle) tags.push(`@${p.handle}`);
      if (p.isDefault) tags.push("predeterminado");
      if (p.id === activeId) tags.push("activo ahora");
      return `${p.name} (${tags.join(", ")})`;
    });
    return `Perfiles de la cuenta (${profiles.length}): ${partes.join("; ")}.`;
  } catch {
    return "";
  }
}

/** Resumen de grupos/páginas: propios (dueño) + membresías — os_pages/os_groups/os_memberships. */
export async function misGruposYPaginas(): Promise<string> {
  const uid = await getUid();
  if (!uid) return "";
  try {
    const supabase = createClient();
    const [memberships, ownedPages, ownedGroups] = await Promise.all([
      supabase.from("os_memberships").select("group_slug", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("os_pages").select("name").eq("owner_id", uid).limit(5),
      supabase.from("os_groups").select("name").eq("owner_id", uid).limit(5),
    ]);
    const memberCount = memberships.count ?? 0;
    const pages = Array.isArray(ownedPages.data) ? (ownedPages.data as { name: string }[]) : [];
    const groups = Array.isArray(ownedGroups.data) ? (ownedGroups.data as { name: string }[]) : [];
    if (!memberCount && !pages.length && !groups.length) return "";
    const bits: string[] = [];
    if (pages.length) bits.push(`páginas propias: ${pages.map((p) => p.name).join(", ")}`);
    if (groups.length) bits.push(`grupos propios: ${groups.map((g) => g.name).join(", ")}`);
    if (memberCount) bits.push(`miembro en ${memberCount} grupo${memberCount === 1 ? "" : "s"}/comunidad${memberCount === 1 ? "" : "es"}`);
    return `Grupos y páginas — ${bits.join("; ")}.`;
  } catch {
    return "";
  }
}

/** Resumen de archivos propios recientes (n, tipos, últimos 5 nombres) — os_files. */
export async function misArchivos(): Promise<string> {
  const uid = await getUid();
  if (!uid) return "";
  try {
    const supabase = createClient();
    const [{ count }, { data: recientes }] = await Promise.all([
      supabase.from("os_files").select("id", { count: "exact", head: true }).eq("owner", uid),
      supabase.from("os_files").select("name, mime").eq("owner", uid).order("created_at", { ascending: false }).limit(5),
    ]);
    const total = count ?? 0;
    if (!total) return "";
    const lista = Array.isArray(recientes) ? (recientes as { name: string; mime: string | null }[]) : [];
    const nombres = lista.map((f) => f.name).filter(Boolean);
    const tipos = Array.from(new Set(lista.map((f) => (f.mime || "").split("/")[0]).filter(Boolean)));
    return `Archivos (${total}${tipos.length ? `, tipos: ${tipos.join("/")}` : ""}) — últimos: ${nombres.join(", ") || "—"}.`;
  } catch {
    return "";
  }
}

/** Resumen de publicaciones PROPIAS recientes — os_posts. */
export async function misPublicaciones(): Promise<string> {
  const uid = await getUid();
  if (!uid) return "";
  try {
    const supabase = createClient();
    const { data, count } = await supabase
      .from("os_posts")
      .select("body, entity_type, entity_slug, created_at", { count: "exact" })
      .eq("author_id", uid)
      .order("created_at", { ascending: false })
      .limit(5);
    if (!Array.isArray(data) || !data.length) return "";
    const total = count ?? data.length;
    const recientes = (data as { body: string | null }[]).map((p) => {
      const s = snippetOf(p.body, 44);
      return s ? `«${s}»` : "(sin texto)";
    });
    return `Publicaciones propias (${total}) — recientes: ${recientes.join("; ")}.`;
  } catch {
    return "";
  }
}

/**
 * Resumen de hilos de mensajes ACTIVOS: n + últimos títulos + no-leídos.
 * SIN contenido privado completo (nunca incluye el cuerpo de los mensajes).
 */
export async function misMensajes(): Promise<string> {
  try {
    const { listThreads } = await import("@/lib/messages/dm");
    const threads = await listThreads();
    if (!threads.length) return "";
    const unread = threads.reduce((n, t) => n + (t.unreadCount || 0), 0);
    const titulos = threads
      .slice(0, 5)
      .map((t) => t.title || (t.kind === "group" ? "Grupo sin título" : "Conversación directa"));
    return (
      `Mensajes: ${threads.length} hilo${threads.length === 1 ? "" : "s"} activo${threads.length === 1 ? "" : "s"}` +
      `${unread ? ` (${unread} sin leer)` : ""} — ${titulos.join(", ")}.`
    );
  } catch {
    return "";
  }
}

/** Resumen de notificaciones (generales + gobernanza), solo conteos y títulos. */
export async function misNotificaciones(): Promise<string> {
  try {
    const { loadAllNotifications } = await import("@/lib/notifications/notifications");
    const items = await loadAllNotifications();
    if (!items.length) return "";
    const unseen = items.filter((i) => !i.seen);
    if (!unseen.length) return `Notificaciones: al día (0 sin leer de ${items.length}).`;
    const titulos = unseen.slice(0, 4).map((i) => i.title);
    return `Notificaciones: ${unseen.length} sin leer — ${titulos.join(", ")}.`;
  } catch {
    return "";
  }
}

/** Resumen de recordatorios/alarmas/temporizadores activos (localStorage, /clima). */
export async function misRecordatorios(): Promise<string> {
  if (!isClient()) return "";
  try {
    const uid = await getUid();
    const { loadItems } = await import("@/lib/clima/reminders-store");
    const store = loadItems(uid);
    const pendientes = store.reminders.filter((r) => r.dueAt > Date.now()).sort((a, b) => a.dueAt - b.dueAt);
    const alarmas = store.alarms.filter((a) => a.enabled);
    const timers = store.timers.filter((t) => t.running);
    const bits: string[] = [];
    if (pendientes.length) {
      bits.push(
        `${pendientes.length} recordatorio${pendientes.length === 1 ? "" : "s"} pendiente${pendientes.length === 1 ? "" : "s"} (próx.: ${pendientes[0].label})`,
      );
    }
    if (alarmas.length) bits.push(`${alarmas.length} alarma${alarmas.length === 1 ? "" : "s"} activa${alarmas.length === 1 ? "" : "s"}`);
    if (timers.length) bits.push(`${timers.length} temporizador${timers.length === 1 ? "" : "es"} en marcha`);
    if (!bits.length) return "";
    return `Recordatorios y alarmas: ${bits.join("; ")}.`;
  } catch {
    return "";
  }
}

/** Resumen de escritorios/widgets del usuario (localStorage, /escritorios). */
export async function misEscritoriosYWidgets(): Promise<string> {
  if (!isClient()) return "";
  try {
    const { readDesktopsSnapshot } = await import("@/components/desktop/desktop-store");
    const state = readDesktopsSnapshot();
    if (!state.desktops.length) return "";
    const activo = state.desktops.find((d) => d.id === state.activeId) ?? state.desktops[0];
    const totalIconos = state.desktops.reduce((n, d) => n + d.icons.length, 0);
    const totalWidgets = state.desktops.reduce(
      (n, d) => n + d.icons.filter((i) => i.kind === "widget").length,
      0,
    );
    return (
      `Escritorios: ${state.desktops.length} (activo: «${activo?.name ?? "—"}»), ${totalIconos} icono${totalIconos === 1 ? "" : "s"} en total` +
      `${totalWidgets ? `, ${totalWidgets} widget${totalWidgets === 1 ? "" : "s"}` : ""}.`
    );
  } catch {
    return "";
  }
}

/** Resumen de proyectos/espacios sincronizados (escritorios/dashboards/pizarras compartidos) — os_spaces. */
export async function misProyectosYEspacios(): Promise<string> {
  try {
    const { listMySpaces } = await import("@/lib/spaces/spaces");
    const spaces = await listMySpaces();
    if (!spaces.length) return "";
    const porTipo: Record<string, number> = {};
    for (const s of spaces) porTipo[s.kind] = (porTipo[s.kind] ?? 0) + 1;
    const resumenTipos = Object.entries(porTipo)
      .map(([k, n]) => `${n} ${k}`)
      .join(", ");
    const nombres = spaces.slice(0, 5).map((s) => s.title);
    return `Espacios compartidos (${spaces.length}: ${resumenTipos}) — ${nombres.join(", ")}.`;
  } catch {
    return "";
  }
}

/* ═══════════════════════════ Recolectores — PÚBLICO ═════════════════════════ */

export interface NetworkPostHit {
  id: string;
  authorName: string | null;
  entityType: string | null;
  entitySlug: string | null;
  snippet: string;
  createdAt: string | null;
}

/** Busca publicaciones PÚBLICAS de la red por texto (os_posts, lectura pública por RLS). */
export async function searchNetworkPosts(q: string, limit = 8): Promise<NetworkPostHit[]> {
  const term = (q ?? "").trim();
  if (!term) return [];
  try {
    const supabase = createClient();
    const like = `%${escapeLike(term)}%`;
    const { data, error } = await supabase
      .from("os_posts")
      .select("id, author_name, entity_type, entity_slug, body, created_at")
      .ilike("body", like)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      authorName: (r.author_name as string) ?? null,
      entityType: (r.entity_type as string) ?? null,
      entitySlug: (r.entity_slug as string) ?? null,
      snippet: snippetOf(r.body, 160),
      createdAt: (r.created_at as string) ?? null,
    }));
  } catch {
    return [];
  }
}

export type EntityContextKind = "pagina" | "grupo";

export interface EntityContextResult {
  found: boolean;
  kind: EntityContextKind;
  slug: string;
  name?: string;
  description?: string;
  memberCount?: number;
  recentPosts: NetworkPostHit[];
  /** Frase lista para hablar/inyectar en el prompt. */
  summary: string;
}

/** Contexto público de una página/grupo: info + publicaciones recientes (sin listar miembros nominalmente). */
export async function getEntityContext(kind: EntityContextKind, slug: string): Promise<EntityContextResult> {
  const cleanSlug = (slug || "").trim().toLowerCase();
  const empty: EntityContextResult = { found: false, kind, slug: cleanSlug, recentPosts: [], summary: "" };
  if (!cleanSlug) return empty;
  try {
    const supabase = createClient();
    const table = kind === "grupo" ? "os_groups" : "os_pages";
    const { data: entity, error } = await supabase
      .from(table)
      .select("name, description, member_count, slug")
      .eq("slug", cleanSlug)
      .maybeSingle();
    if (error || !entity) return empty;

    const row = entity as { name?: string; description?: string; member_count?: number };
    const { data: posts } = await supabase
      .from("os_posts")
      .select("id, author_name, entity_type, entity_slug, body, created_at")
      .eq("entity_slug", cleanSlug)
      .order("created_at", { ascending: false })
      .limit(5);

    const recentPosts: NetworkPostHit[] = Array.isArray(posts)
      ? (posts as Record<string, unknown>[]).map((r) => ({
          id: String(r.id),
          authorName: (r.author_name as string) ?? null,
          entityType: (r.entity_type as string) ?? null,
          entitySlug: (r.entity_slug as string) ?? null,
          snippet: snippetOf(r.body, 140),
          createdAt: (r.created_at as string) ?? null,
        }))
      : [];

    const name = row.name ?? cleanSlug;
    const memberCount = row.member_count;
    const description = row.description ?? "";
    const summary = [
      `${kind === "grupo" ? "Grupo" : "Página"} «${name}» (@${cleanSlug})`,
      memberCount != null ? `${memberCount} miembros` : "",
      description ? snippetOf(description, 140) : "",
      recentPosts.length
        ? `Publicaciones recientes: ${recentPosts.map((p) => p.snippet).slice(0, 3).join(" · ")}`
        : "Sin publicaciones recientes.",
    ]
      .filter(Boolean)
      .join(". ");

    return { found: true, kind, slug: cleanSlug, name, description, memberCount, recentPosts, summary };
  } catch {
    return empty;
  }
}

/* ═══════════════════════════ buildUserContext(level) ═══════════════════════ */

/** Presupuesto de caracteres del bloque final (antes de cabecera/pie). */
const CHAR_BUDGET: Record<UserContextLevel, number> = {
  breve: 1600,
  completo: 6000,
};

/** Une líneas no vacías respetando un presupuesto de caracteres (corta, no trunca a medias). */
function joinWithBudget(lines: string[], budget: number): string {
  const out: string[] = [];
  let total = 0;
  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;
    if (total + clean.length + 1 > budget) break;
    out.push(clean);
    total += clean.length + 1;
  }
  return out.join("\n");
}

/**
 * Compone el bloque de CONTEXTO DEL USUARIO listo para el system prompt de
 * Aurora. `breve` (por defecto, automático) usa solo recolectores ligeros
 * (perfiles, grupos/páginas, notificaciones, recordatorios, escritorios — 0-1
 * consulta cada uno) para no añadir latencia a cada turno de conversación.
 * `completo` añade además mensajes, archivos, publicaciones y espacios
 * (más consultas) — pensado para cuando Aurora lo pide explícitamente vía la
 * tool `get_user_context({ nivel: "completo" })`. Devuelve "" sin sesión, sin
 * datos, o ante cualquier fallo (nunca lanza; nunca bloquea la conversación).
 */
/** Línea de PREFERENCIAS declaradas (onboarding): cómo llamarte, tono, idioma, intereses. */
function aboutLine(): string {
  try {
    const about = getUserContextSettings().about;
    if (!about) return "";
    const parts: string[] = [];
    if (about.callName) parts.push(`dirígete a mí como «${about.callName}»`);
    if (about.tone) parts.push(`tono ${about.tone}`);
    if (about.language) parts.push(`háblame en «${about.language}»`);
    if (about.interests) parts.push(`me interesan: ${about.interests}`);
    if (!parts.length) return "";
    return `Preferencias declaradas por el usuario: ${parts.join("; ")}.`;
  } catch {
    return "";
  }
}

export async function buildUserContext(level: UserContextLevel = "breve"): Promise<string> {
  try {
    const about = aboutLine();
    const uid = await getUid();
    if (!uid) {
      // Sin sesión no hay ámbito propio que resumir, pero las PREFERENCIAS
      // declaradas (cómo llamarte, tono, idioma, intereses) sí aplican siempre.
      return about
        ? ["CONTEXTO DEL USUARIO (privado; ámbito propio, nunca lo compartas fuera de esta conversación).", about].join("\n")
        : "";
    }

    const ligeros = [misPerfiles, misGruposYPaginas, misNotificaciones, misRecordatorios, misEscritoriosYWidgets];
    const pesados = [misMensajes, misArchivos, misPublicaciones, misProyectosYEspacios];
    const collectors = level === "completo" ? [...ligeros, ...pesados] : ligeros;

    const results = await Promise.allSettled(collectors.map((fn) => fn()));
    const collected = results
      .map((r) => (r.status === "fulfilled" ? r.value : ""))
      .filter((l): l is string => !!l && l.trim().length > 0);
    // Las preferencias declaradas van SIEMPRE primero (cómo llamarte, tono, idioma).
    const lines = [about, ...collected].filter((l) => !!l && l.trim().length > 0);

    if (!lines.length) return "";

    const header = "CONTEXTO DEL USUARIO (privado; ámbito propio, nunca lo compartas fuera de esta conversación).";
    const footer =
      level === "breve"
        ? "Resumen BREVE. Si necesitas más detalle (mensajes, archivos, publicaciones, espacios), pide el contexto COMPLETO con la herramienta get_user_context."
        : "Contexto COMPLETO disponible ahora mismo.";

    const body = joinWithBudget(lines, CHAR_BUDGET[level]);
    return [header, body, footer].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}
