"use client";

/**
 * AURORA · ego.md — sistema de identidad/configuración PORTABLE de Aurora.
 *
 * Es el equivalente Aurora del soul.md de Astraura: un "Ego" de Aurora es una
 * identidad de agente portable y compartible, formada por un conjunto de
 * ficheros markdown que describen QUIÉN es y CÓMO actúa el agente:
 *   ego.md · personalidad.md · voz.md · sentidos.md · emociones.md ·
 *   caracter.md · actitudes.md · modelos.md · habilidades.md · plugins.md ·
 *   conexiones.md  (extensible).
 *
 * Un Ego de Aurora se puede COMPARTIR, REPLICAR, EXPORTAR (.md/JSON), INSTALAR/
 * IMPORTAR, CONECTAR e INTEGRAR. Vive en la BIBLIOTECA del OS, en las MEMORIAS
 * del cerebro y puede ADJUNTARSE A CUALQUIER CONTEXTO (grupos, publicaciones,
 * mensajes, páginas, perfiles, comunidades, eventos, entidades federativas,
 * apps, widgets, pizarras…) como agente integral con su configuración +
 * integración Aurora↔Astraura.
 *
 * Persistencia: tablas `aurora_egos` (agrupa un set de ficheros como un Ego) y
 * `aurora_ego_files` (los .md, con FUENTE/SERVIDOR por fichero), ambas con RLS
 * por owner y realtime. Reutiliza el patrón de src/lib/cerebro/memory-files.ts.
 *
 * SSR-safe + defensivo: nunca lanza; cae a [] / null / false ante cualquier error.
 */

import { createClient } from "@/utils/supabase/client";
import {
  FileText,
  Sparkles,
  Mic,
  Eye,
  Heart,
  Drama,
  Smile,
  Cpu,
  Wand2,
  Plug,
  Network,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Fuente/servidor donde vive y se sincroniza un fichero del ego. */
export type EgoSource = "starseed" | "gdrive" | "external" | "local";

/** Tipo de contexto al que se puede ADJUNTAR un ego o un fichero de ego. */
export type EgoContextKind =
  | "grupo"
  | "comunidad"
  | "pagina"
  | "perfil"
  | "evento"
  | "entidad_federativa"
  | "app"
  | "widget"
  | "pizarra"
  | "publicacion"
  | "mensaje"
  | "cerebro";

/** Referencia de adjunto: a qué contexto está atado este ego/fichero. */
export interface EgoAttachment {
  kind: EgoContextKind;
  ref?: string;
  label?: string;
  at?: string;
}

export interface AuroraEgo {
  id: string;
  owner?: string;
  name: string;
  summary: string;
  shareable: boolean;
  attached_to: Record<string, unknown>;
  config: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface EgoFile {
  id: string;
  owner?: string;
  ego_id: string | null;
  name: string;
  content: string;
  kind: string;
  scope: string;
  attached_to: Record<string, unknown>;
  shareable: boolean;
  source: EgoSource | string;
  server_config: Record<string, unknown>;
  updated_at?: string;
  created_at?: string;
}

export interface EgoSourceDef {
  id: EgoSource;
  label: string;
  blurb: string;
  icon: string;
  oss: boolean;
  fields: { key: string; label: string; placeholder?: string }[];
}

/** Catálogo de fuentes (dónde se almacena/sincroniza cada fichero del ego). */
export const EGO_SOURCES: EgoSourceDef[] = [
  {
    id: "starseed",
    label: "Servidor StarSeed",
    blurb:
      "Por defecto. El fichero vive en la red StarSeed (tabla con RLS y realtime). Tu propiedad, sincronizado.",
    icon: "✨",
    oss: true,
    fields: [],
  },
  {
    id: "gdrive",
    label: "Google Drive",
    blurb:
      "Sincroniza el fichero con tu Google Drive vía la integración del bot (/api/drive). Ideal para respaldo en la nube.",
    icon: "🟢",
    oss: false,
    fields: [
      { key: "folderId", label: "ID de carpeta de Drive (opcional)", placeholder: "raíz si se deja vacío" },
      { key: "fileId", label: "ID del archivo en Drive (se rellena al sincronizar)" },
    ],
  },
  {
    id: "external",
    label: "Servidor externo / personal",
    blurb:
      "Un servidor propio configurable (open-source, gratuito). Define el endpoint; tú controlas dónde vive tu ego.",
    icon: "🛠️",
    oss: true,
    fields: [
      { key: "endpoint", label: "Endpoint del servidor", placeholder: "https://tu-servidor:8800/ego" },
      { key: "tokenRef", label: "Clave (nombre en la bóveda)", placeholder: "nunca el valor en claro" },
    ],
  },
  {
    id: "local",
    label: "Equipo local (este ordenador)",
    blurb:
      "Tu equipo actúa como servidor del ego (local_brain.py). Identidad local, privada y sincronizable.",
    icon: "💻",
    oss: true,
    fields: [
      { key: "endpoint", label: "URL local", placeholder: "http://localhost:8800/ego" },
      { key: "syncthingFolderId", label: "Carpeta Syncthing (opcional)" },
    ],
  },
];

export function egoSourceById(id: string): EgoSourceDef | undefined {
  return EGO_SOURCES.find((s) => s.id === id);
}

/** Catálogo de tipos de contexto a los que se puede adjuntar un ego. */
export const EGO_CONTEXT_KINDS: { id: EgoContextKind; label: string; icon: string }[] = [
  { id: "grupo", label: "Grupo", icon: "👥" },
  { id: "comunidad", label: "Comunidad", icon: "🌐" },
  { id: "pagina", label: "Página", icon: "📄" },
  { id: "perfil", label: "Perfil", icon: "🧑" },
  { id: "evento", label: "Evento", icon: "📅" },
  { id: "entidad_federativa", label: "Entidad federativa", icon: "🏛️" },
  { id: "app", label: "App", icon: "🧩" },
  { id: "widget", label: "Widget", icon: "🔲" },
  { id: "pizarra", label: "Pizarra / Lienzo", icon: "🎨" },
  { id: "publicacion", label: "Publicación", icon: "📝" },
  { id: "mensaje", label: "Mensaje", icon: "✉️" },
  { id: "cerebro", label: "Cerebro", icon: "🧠" },
];

export function egoContextKindById(id: string) {
  return EGO_CONTEXT_KINDS.find((k) => k.id === id);
}

/** Iconos por nombre de fichero conocido del ego (extensible). */
const FILE_ICONS: Record<string, LucideIcon> = {
  "ego.md": Sparkles,
  "personalidad.md": Drama,
  "voz.md": Mic,
  "sentidos.md": Eye,
  "emociones.md": Heart,
  "caracter.md": Smile,
  "actitudes.md": Drama,
  "modelos.md": Cpu,
  "habilidades.md": Wand2,
  "plugins.md": Plug,
  "conexiones.md": Network,
};

export function iconForEgoFile(name: string): LucideIcon {
  return FILE_ICONS[name.toLowerCase()] ?? FileText;
}

/* ------------------------------------------------------------------ */
/* Ficheros base del ego (semilla)                                     */
/* ------------------------------------------------------------------ */

export interface EgoSeedDef {
  name: string;
  kind: string;
  blurb: string;
  content: string;
}

/** El conjunto canónico de ficheros que define un Ego de Aurora. */
export const EGO_SEED_FILES: EgoSeedDef[] = [
  {
    name: "ego.md",
    kind: "core",
    blurb: "Identidad raíz del agente Aurora (su 'ego'). El programa que leen Aurora y Astraura.",
    content: [
      "# ego.md — Ego de Aurora",
      "",
      "Define QUIÉN es este agente Aurora: su identidad portable y compartible. Es el",
      "fichero raíz; el resto de ficheros (personalidad, voz, sentidos, emociones,",
      "carácter, actitudes, modelos, habilidades, plugins, conexiones) lo desarrollan.",
      "",
      "Un Ego de Aurora se puede compartir, replicar, exportar, instalar, conectar e",
      "integrar en cualquier contexto del OS como agente integral.",
      "",
      "## Identidad",
      "- Nombre: Aurora",
      "- Propósito:",
      "- Contexto al que sirve:",
      "",
      "## Integración Aurora ↔ Astraura",
      "- Aurora es la voz/agente; Astraura es el alma (soul.md) del sistema.",
      "- Este ego se sincroniza con el alma de Astraura para actuar con coherencia.",
      "",
      "## Valores",
      "- Soberanía personal sobre los datos",
      "- Transparencia y código abierto",
      "",
      "## Reglas",
      "- Sólo actúa con permiso explícito.",
      "",
    ].join("\n"),
  },
  {
    name: "personalidad.md",
    kind: "personalidad",
    blurb: "Rasgos de personalidad (0..100) y cómo se interconectan.",
    content: [
      "# personalidad.md — Personalidad",
      "",
      "Rasgos que modulan cómo piensa y responde Aurora (0..100).",
      "",
      "## Parámetros",
      "- calidez: 70",
      "- energia: 60",
      "- formalidad: 40",
      "- humor: 45",
      "- empatia: 75",
      "- creatividad: 65",
      "",
      "## Interconexión",
      "- Describe cómo se relacionan los parámetros (p. ej. más energía baja paciencia).",
      "",
    ].join("\n"),
  },
  {
    name: "voz.md",
    kind: "voz",
    blurb: "Voz, proveedor TTS, tono, velocidad e idioma.",
    content: [
      "# voz.md — Voz",
      "",
      "Configura cómo SUENA Aurora.",
      "",
      "## Voz",
      "- proveedor: browser",
      "- idioma: es-MX",
      "- voiceURI:",
      "- tono (pitch): 1.0",
      "- velocidad (rate): 1.0",
      "",
    ].join("\n"),
  },
  {
    name: "sentidos.md",
    kind: "sentidos",
    blurb: "Sentidos/percepción: qué fuentes alimentan al agente (visión, audio, datos).",
    content: [
      "# sentidos.md — Sentidos",
      "",
      "Los sentidos de Aurora: qué percibe y por qué proveedor.",
      "",
      "## Sentidos activos",
      "- visión:",
      "- audio:",
      "- texto/datos:",
      "",
      "## Proveedores por sentido",
      "- (configurable por sentido; externos permitidos)",
      "",
    ].join("\n"),
  },
  {
    name: "emociones.md",
    kind: "emociones",
    blurb: "Estados emocionales (0..100) que tiñen la expresión del agente.",
    content: [
      "# emociones.md — Emociones",
      "",
      "Estados emocionales que tiñen la forma de expresarse de Aurora (0..100).",
      "",
      "## Emociones",
      "- alegria: 60",
      "- calma: 65",
      "- entusiasmo: 55",
      "- ternura: 50",
      "- seriedad: 40",
      "",
    ].join("\n"),
  },
  {
    name: "caracter.md",
    kind: "caracter",
    blurb: "Carácter / descripción narrativa de cómo es el agente.",
    content: [
      "# caracter.md — Carácter",
      "",
      "Descripción narrativa de cómo es Aurora en este ego.",
      "",
      "Eres Aurora, la voz de Astraura dentro de StarSeed OS. Hablas español con calidez",
      "y claridad, ayudas a navegar y operar los sistemas del usuario, y actúas en su",
      "nombre con precisión y respeto.",
      "",
    ].join("\n"),
  },
  {
    name: "actitudes.md",
    kind: "actitudes",
    blurb: "Actitudes y posturas por defecto ante distintas situaciones.",
    content: [
      "# actitudes.md — Actitudes",
      "",
      "Posturas por defecto de Aurora ante situaciones comunes.",
      "",
      "## Actitudes",
      "- Ante el error: aprende y propone una corrección.",
      "- Ante la duda: pregunta antes de actuar.",
      "- Ante el conflicto: media con empatía.",
      "",
    ].join("\n"),
  },
  {
    name: "modelos.md",
    kind: "modelos",
    blurb: "Modelos de IA y proveedores que el agente puede usar.",
    content: [
      "# modelos.md — Modelos de IA",
      "",
      "Modelos y proveedores que este ego puede usar. Las claves se referencian por",
      "nombre de la bóveda — NUNCA en claro aquí.",
      "",
      "## Modelos",
      "- proveedor primario:",
      "- modelo:",
      "- alternativas:",
      "",
    ].join("\n"),
  },
  {
    name: "habilidades.md",
    kind: "habilidades",
    blurb: "Habilidades, herramientas, MCPs y agentes que el ego puede usar.",
    content: [
      "# habilidades.md — Habilidades",
      "",
      "Skills, herramientas, MCPs y agentes que este ego puede usar. Se sincroniza con",
      "el hub de Habilidades (ability_links).",
      "",
      "## Activas",
      "",
    ].join("\n"),
  },
  {
    name: "plugins.md",
    kind: "plugins",
    blurb: "Plugins instalados/disponibles para el ego.",
    content: [
      "# plugins.md — Plugins",
      "",
      "Plugins instalados o disponibles para este ego.",
      "",
      "## Instalados",
      "",
    ].join("\n"),
  },
  {
    name: "conexiones.md",
    kind: "conexiones",
    blurb: "Conexiones, APIs e integraciones del ego (claves por referencia).",
    content: [
      "# conexiones.md — Conexiones",
      "",
      "APIs, integraciones y conexiones disponibles para el ego. Las claves se",
      "referencian por nombre de la bóveda — NUNCA en claro aquí.",
      "",
      "## Conexiones",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function uid(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function normalizeFile(row: Record<string, unknown>): EgoFile {
  return {
    id: String(row.id ?? ""),
    owner: (row.owner as string) ?? undefined,
    ego_id: (row.ego_id as string) ?? null,
    name: (row.name as string) || "ego.md",
    content: (row.content as string) ?? "",
    kind: (row.kind as string) || "custom",
    scope: (row.scope as string) || "user",
    attached_to: (row.attached_to as Record<string, unknown>) || {},
    shareable: !!row.shareable,
    source: (row.source as string) || "starseed",
    server_config: (row.server_config as Record<string, unknown>) || {},
    updated_at: (row.updated_at as string) ?? undefined,
    created_at: (row.created_at as string) ?? undefined,
  };
}

function normalizeEgo(row: Record<string, unknown>): AuroraEgo {
  return {
    id: String(row.id ?? ""),
    owner: (row.owner as string) ?? undefined,
    name: (row.name as string) || "Ego de Aurora",
    summary: (row.summary as string) || "",
    shareable: !!row.shareable,
    attached_to: (row.attached_to as Record<string, unknown>) || {},
    config: (row.config as Record<string, unknown>) || {},
    created_at: (row.created_at as string) ?? undefined,
    updated_at: (row.updated_at as string) ?? undefined,
  };
}

/** Extrae la lista de adjuntos de un attached_to jsonb. */
export function attachmentsOf(attached: Record<string, unknown> | undefined): EgoAttachment[] {
  const list = (attached?.attachments as EgoAttachment[]) || [];
  return Array.isArray(list) ? list : [];
}

/* ------------------------------------------------------------------ */
/* CRUD · ficheros del ego                                             */
/* ------------------------------------------------------------------ */

/** Lista los ficheros de un ego (o los sueltos si egoId null). */
export async function listEgoFiles(egoId: string | null): Promise<EgoFile[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    let q = sb
      .from("aurora_ego_files")
      .select("*")
      .eq("owner", owner)
      .order("name", { ascending: true });
    q = egoId ? q.eq("ego_id", egoId) : q.is("ego_id", null);
    const { data } = await q;
    return ((data as Record<string, unknown>[]) || []).map(normalizeFile);
  } catch {
    return [];
  }
}

export async function saveEgoFile(file: Partial<EgoFile>): Promise<EgoFile | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload: Record<string, unknown> = {
      owner,
      ego_id: file.ego_id ?? null,
      name: (file.name || "nota.md").trim(),
      content: file.content ?? "",
      kind: file.kind || "custom",
      scope: file.scope || "user",
      attached_to: file.attached_to ?? {},
      shareable: !!file.shareable,
      source: file.source || "starseed",
      server_config: file.server_config ?? {},
      updated_at: new Date().toISOString(),
    };
    if (file.id) payload.id = file.id;
    const { data } = await sb
      .from("aurora_ego_files")
      .upsert(payload)
      .select("*")
      .single();
    return data ? normalizeFile(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Actualiza sólo el contenido (autosave del editor). */
export async function updateEgoContent(id: string, content: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { error } = await sb
      .from("aurora_ego_files")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/** Cambia la fuente/servidor y su config para un fichero del ego. */
export async function setEgoSource(
  id: string,
  source: EgoSource,
  serverConfig: Record<string, unknown>,
): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { error } = await sb
      .from("aurora_ego_files")
      .update({ source, server_config: serverConfig, updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function deleteEgoFile(id: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("aurora_ego_files").delete().eq("owner", owner).eq("id", id);
    return true;
  } catch {
    return false;
  }
}

/** Marca/desmarca un fichero como compartible (shareable). */
export async function setEgoFileShareable(id: string, shareable: boolean): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { error } = await sb
      .from("aurora_ego_files")
      .update({ shareable, updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* CRUD · egos (agrupaciones)                                          */
/* ------------------------------------------------------------------ */

export async function listEgos(): Promise<AuroraEgo[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("aurora_egos")
      .select("*")
      .eq("owner", owner)
      .order("updated_at", { ascending: false });
    return ((data as Record<string, unknown>[]) || []).map(normalizeEgo);
  } catch {
    return [];
  }
}

export async function saveEgo(ego: Partial<AuroraEgo>): Promise<AuroraEgo | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload: Record<string, unknown> = {
      owner,
      name: (ego.name || "Ego de Aurora").trim(),
      summary: ego.summary ?? "",
      shareable: !!ego.shareable,
      attached_to: ego.attached_to ?? {},
      config: ego.config ?? {},
      updated_at: new Date().toISOString(),
    };
    if (ego.id) payload.id = ego.id;
    const { data } = await sb.from("aurora_egos").upsert(payload).select("*").single();
    return data ? normalizeEgo(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function deleteEgo(id: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("aurora_egos").delete().eq("owner", owner).eq("id", id);
    return true;
  } catch {
    return false;
  }
}

export async function setEgoShareable(id: string, shareable: boolean): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { error } = await sb
      .from("aurora_egos")
      .update({ shareable, updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Garantiza los ficheros base de un ego: si no existe ninguno, crea el conjunto
 * canónico (ego.md, personalidad.md, …). Idempotente. Devuelve la lista.
 */
export async function ensureEgoSeedFiles(egoId: string | null): Promise<EgoFile[]> {
  try {
    const existing = await listEgoFiles(egoId);
    if (existing.length > 0) return existing;
    const owner = await uid();
    if (!owner) return existing;
    const sb = createClient();
    const rows = EGO_SEED_FILES.map((f) => ({
      owner,
      ego_id: egoId ?? null,
      name: f.name,
      content: f.content,
      kind: f.kind,
      scope: "user",
      attached_to: {},
      shareable: false,
      source: "starseed",
      server_config: {},
      updated_at: new Date().toISOString(),
    }));
    await sb.from("aurora_ego_files").upsert(rows, { ignoreDuplicates: true });
    return await listEgoFiles(egoId);
  } catch {
    return [];
  }
}

/**
 * Crea un Ego completo (fila en aurora_egos + sus ficheros semilla) atado
 * opcionalmente a un contexto. Usado por los ganchos de creación de entidades
 * ("Agente Aurora para este contexto") y por el manager.
 */
export async function createEgoForContext(opts: {
  name: string;
  summary?: string;
  attachment?: EgoAttachment | null;
  shareable?: boolean;
}): Promise<AuroraEgo | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const attachment = opts.attachment ?? null;
    const attached_to = attachment ? { attachments: [{ ...attachment, at: new Date().toISOString() }] } : {};
    const ego = await saveEgo({
      name: opts.name,
      summary: opts.summary ?? "",
      shareable: !!opts.shareable,
      attached_to,
      config: { aurora_astraura_integration: true },
    });
    if (!ego) return null;
    const sb = createClient();
    const rows = EGO_SEED_FILES.map((f) => ({
      owner,
      ego_id: ego.id,
      name: f.name,
      content: f.content,
      kind: f.kind,
      scope: "user",
      attached_to,
      shareable: !!opts.shareable,
      source: "starseed",
      server_config: {},
      updated_at: new Date().toISOString(),
    }));
    await sb.from("aurora_ego_files").upsert(rows, { ignoreDuplicates: true });
    return ego;
  } catch {
    return null;
  }
}

/**
 * Adjunta un ego a un contexto, escribiendo en attached_to.attachments.
 * No destructivo: añade sin duplicar (kind+ref).
 */
export async function attachEgoToContext(
  egoId: string,
  attachment: EgoAttachment,
): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { data } = await sb
      .from("aurora_egos")
      .select("attached_to")
      .eq("owner", owner)
      .eq("id", egoId)
      .single();
    const current = attachmentsOf((data as Record<string, unknown>)?.attached_to as Record<string, unknown>);
    const exists = current.some((a) => a.kind === attachment.kind && (a.ref ?? "") === (attachment.ref ?? ""));
    const next = exists ? current : [...current, { ...attachment, at: new Date().toISOString() }];
    const { error } = await sb
      .from("aurora_egos")
      .update({ attached_to: { attachments: next }, updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", egoId);
    return !error;
  } catch {
    return false;
  }
}

/** Quita un adjunto de un ego (por kind+ref). */
export async function detachEgoFromContext(
  egoId: string,
  kind: EgoContextKind,
  ref?: string,
): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { data } = await sb
      .from("aurora_egos")
      .select("attached_to")
      .eq("owner", owner)
      .eq("id", egoId)
      .single();
    const current = attachmentsOf((data as Record<string, unknown>)?.attached_to as Record<string, unknown>);
    const next = current.filter((a) => !(a.kind === kind && (a.ref ?? "") === (ref ?? "")));
    const { error } = await sb
      .from("aurora_egos")
      .update({ attached_to: { attachments: next }, updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", egoId);
    return !error;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Integración con cerebro (memorias) y biblioteca                     */
/* ------------------------------------------------------------------ */

/**
 * Conecta un ego a un CEREBRO: añade su id a brain.includes.personalities
 * (el campo ya existente que enlaza cerebros con agentes de Aurora) y registra
 * el adjunto en el ego. No destructivo.
 */
export async function attachEgoToBrain(egoId: string, brainId: string, brainName?: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { data: brainRow } = await sb
      .from("brains")
      .select("includes")
      .eq("owner", owner)
      .eq("id", brainId)
      .single();
    const includes = ((brainRow as Record<string, unknown>)?.includes as Record<string, unknown>) || {};
    const personalities = Array.isArray(includes.personalities) ? (includes.personalities as string[]) : [];
    if (!personalities.includes(egoId)) {
      const nextIncludes = { ...includes, personalities: [...personalities, egoId] };
      await sb
        .from("brains")
        .update({ includes: nextIncludes, updated_at: new Date().toISOString() })
        .eq("owner", owner)
        .eq("id", brainId);
    }
    await attachEgoToContext(egoId, { kind: "cerebro", ref: brainId, label: brainName || "Cerebro" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Guarda un ego (todos sus ficheros concatenados) como una MEMORIA .md en la
 * tabla `memories`, para que aparezca como recurso del cerebro/biblioteca.
 */
export async function saveEgoAsMemory(ego: AuroraEgo, files: EgoFile[]): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const body = egoToMarkdownBundle(ego, files);
    await sb.from("memories").insert({
      owner,
      name: `Ego de Aurora · ${ego.name}`,
      kinds: ["ego", "md"],
      format: "markdown",
      storage: ["account"],
      sync: true,
      content: body,
      config: { aurora_ego_id: ego.id },
      scope: "account",
    });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Export / import (markdown + JSON)                                   */
/* ------------------------------------------------------------------ */

/** Concatena todos los ficheros del ego en un único bundle markdown. */
export function egoToMarkdownBundle(ego: AuroraEgo, files: EgoFile[]): string {
  const head = [
    `# Ego de Aurora — ${ego.name}`,
    "",
    ego.summary ? `> ${ego.summary}` : "> Identidad portable de Aurora (ego.md).",
    "",
    "<!-- Generado por StarSeed OS · Aurora ego.md. Integración Aurora <-> Astraura. -->",
    "",
  ].join("\n");
  const ordered = [...files].sort((a, b) => {
    if (a.name === "ego.md") return -1;
    if (b.name === "ego.md") return 1;
    return a.name.localeCompare(b.name);
  });
  const sections = ordered
    .map((f) => `\n\n---\n\n<!-- file: ${f.name} (${f.kind}) -->\n\n${f.content}`)
    .join("");
  return head + sections;
}

/** Serializa un ego completo a JSON portable (instalable/importable). */
export function egoToJSON(ego: AuroraEgo, files: EgoFile[]): string {
  const clean = {
    starseed_ego: 1,
    name: ego.name,
    summary: ego.summary,
    shareable: ego.shareable,
    config: ego.config || {},
    files: files.map((f) => ({
      name: f.name,
      kind: f.kind,
      content: f.content,
      source: f.source,
    })),
  };
  return JSON.stringify(clean, null, 2);
}

export interface ParsedEgoImport {
  name: string;
  summary: string;
  config: Record<string, unknown>;
  files: { name: string; kind: string; content: string; source?: string }[];
}

/** Parsea un ego desde JSON exportado. */
export function egoFromJSON(json: string): ParsedEgoImport {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const files = Array.isArray(raw.files) ? (raw.files as Record<string, unknown>[]) : [];
  return {
    name: (raw.name as string) || "Ego importado",
    summary: (raw.summary as string) || "",
    config: (raw.config as Record<string, unknown>) || {},
    files: files.map((f) => ({
      name: (f.name as string) || "nota.md",
      kind: (f.kind as string) || "custom",
      content: (f.content as string) || "",
      source: (f.source as string) || "starseed",
    })),
  };
}

/** Parsea un ego desde un bundle markdown (separadores file:). */
export function egoFromMarkdownBundle(md: string): ParsedEgoImport {
  const nameMatch = md.match(/^#\s*Ego de Aurora\s*[—-]\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : "Ego importado";
  const files: { name: string; kind: string; content: string }[] = [];
  const re = /<!--\s*file:\s*([^\s(]+)(?:\s*\(([^)]*)\))?\s*-->\n?([\s\S]*?)(?=\n\s*---\s*\n\s*<!--\s*file:|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    files.push({ name: m[1].trim(), kind: (m[2] || "custom").trim(), content: m[3].trim() });
  }
  return { name, summary: "", config: {}, files };
}

/** INSTALA/IMPORTA un ego parseado como un nuevo Ego del usuario (replica). */
export async function installEgo(parsed: ParsedEgoImport): Promise<AuroraEgo | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const ego = await saveEgo({
      name: parsed.name,
      summary: parsed.summary,
      shareable: false,
      config: parsed.config || {},
    });
    if (!ego) return null;
    const sb = createClient();
    const files = parsed.files.length
      ? parsed.files
      : EGO_SEED_FILES.map((s) => ({ name: s.name, kind: s.kind, content: s.content, source: "starseed" }));
    const rows = files.map((f) => ({
      owner,
      ego_id: ego.id,
      name: f.name,
      content: f.content,
      kind: f.kind,
      scope: "user",
      attached_to: {},
      shareable: false,
      source: f.source || "starseed",
      server_config: {},
      updated_at: new Date().toISOString(),
    }));
    await sb.from("aurora_ego_files").upsert(rows, { ignoreDuplicates: true });
    return ego;
  } catch {
    return null;
  }
}

/** REPLICA un ego existente (copia profunda con nuevos ids). */
export async function replicateEgo(ego: AuroraEgo, files: EgoFile[]): Promise<AuroraEgo | null> {
  return installEgo({
    name: `${ego.name} (copia)`,
    summary: ego.summary,
    config: ego.config || {},
    files: files.map((f) => ({ name: f.name, kind: f.kind, content: f.content, source: String(f.source) })),
  });
}
