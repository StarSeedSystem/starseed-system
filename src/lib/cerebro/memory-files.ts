"use client";

/**
 * CEREBRO · MEMORIA — archivos .md y sus FUENTES/SERVIDORES (entradas y salidas).
 *
 * Cada cerebro administra un conjunto de ficheros markdown (soul.md, memory.md,
 * dream.md, skills.md, apis.md… extensible). Por cada fichero el usuario elige
 * DÓNDE se guarda/sincroniza (la "fuente"/servidor):
 *   - starseed  → servidor StarSeed (por defecto, respaldado por esta tabla).
 *   - gdrive    → Google Drive (integración del bot en /api/drive).
 *   - external  → servidor externo/personal configurable (se guarda el endpoint).
 *   - local     → equipo local actuando como servidor de cerebro (local_brain.py).
 *
 * Edición tipo Obsidian: editor markdown + lista de ficheros. Filosofía: paridad/
 * superioridad vs Obsidian — open-source, servidores personales configurables,
 * almacenamiento+sincronización seleccionables POR FICHERO.
 *
 * Persistencia: tabla `brain_memory_files` (owner, brain_id?, name, content,
 * source, server_config jsonb, meta jsonb, sync, updated_at) con RLS por owner y
 * realtime. Sigue el patrón de src/lib/brains/brains.ts y src/lib/senses/senses.ts.
 *
 * SSR-safe + defensivo: nunca lanza; cae a [] / null ante cualquier error.
 */

import { createClient } from "@/utils/supabase/client";
import {
  FileText,
  Sparkles,
  Moon,
  Wand2,
  Plug,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Fuente/servidor donde vive y se sincroniza un fichero de memoria. */
export type MemorySource = "starseed" | "gdrive" | "external" | "local" | "casaos" | "raven" | "skales";

export interface MemoryFile {
  id: string;
  owner?: string;
  /** Cerebro al que pertenece (null = ficheros de cuenta / sin cerebro). */
  brain_id: string | null;
  name: string;
  content: string;
  source: MemorySource | string;
  /** Config del servidor/fuente: { endpoint, tokenRef, folderId, path, ... }. */
  server_config: Record<string, unknown>;
  /** { category, tags[], color, kind }. */
  meta: Record<string, unknown>;
  sync: boolean;
  updated_at?: string;
  created_at?: string;
}

export interface MemorySourceDef {
  id: MemorySource;
  label: string;
  blurb: string;
  icon: string;
  /** ¿open-source / autoalojable? */
  oss: boolean;
  /** Campos del server_config que esta fuente necesita. */
  fields: { key: string; label: string; placeholder?: string }[];
}

/** Catálogo de fuentes (dónde se almacena/sincroniza cada fichero). */
export const MEMORY_SOURCES: MemorySourceDef[] = [
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
      { key: "folderId", label: "ID de folder de Drive (opcional)", placeholder: "raíz si se deja vacío" },
      { key: "fileId", label: "ID del archivo en Drive (se rellena al sincronizar)" },
    ],
  },
  {
    id: "external",
    label: "Servidor externo / personal",
    blurb:
      "Un servidor propio configurable (open-source, gratuito). Define el endpoint; tú controlas dónde se guardan tus memorias.",
    icon: "🛠️",
    oss: true,
    fields: [
      { key: "endpoint", label: "Endpoint del servidor", placeholder: "https://tu-servidor:8800/memory" },
      { key: "tokenRef", label: "Clave (nombre en la bóveda)", placeholder: "nunca el valor en claro" },
    ],
  },
  {
    id: "local",
    label: "Equipo local (este ordenador)",
    blurb:
      "Tu equipo actúa como servidor del cerebro (local_brain.py). Memorias locales, privadas y sincronizables.",
    icon: "💻",
    oss: true,
    fields: [
      { key: "endpoint", label: "URL local", placeholder: "http://localhost:8800/memory" },
      { key: "syncthingFolderId", label: "Folder Syncthing (opcional)" },
    ],
  },
  {
    id: "casaos",
    label: "CasaOS (neurona)",
    blurb:
      "El servidor casero CasaOS de una de tus neuronas guarda este fichero (Files/Nextcloud/Syncthing). Declara y prueba su URL en Cerebro → Neuronas.",
    icon: "🏠",
    oss: true,
    fields: [
      { key: "endpoint", label: "URL del CasaOS", placeholder: "http://192.168.1.50:80" },
      { key: "path", label: "Ruta/app de destino (opcional)", placeholder: "Files/starseed-memorias" },
    ],
  },
  // Adenda 63 §14: Raven y Skales como backends OPCIONALES de memoria/
  // inteligencia (misma pauta de conector por endpoint que CasaOS).
  {
    id: "raven",
    label: "Raven (memoria agéntica)",
    blurb:
      "Servidor open-source de memoria agéntica (EverMind-AI/Raven): este fichero se guarda/recupera como memoria de largo plazo del cerebro. Despliega Raven en una neurona propia y apunta aquí su endpoint.",
    icon: "🪶",
    oss: true,
    fields: [
      { key: "endpoint", label: "Endpoint de Raven", placeholder: "http://tu-neurona:8000" },
      { key: "tokenRef", label: "Clave (nombre en la bóveda, opcional)", placeholder: "nunca el valor en claro" },
      { key: "collection", label: "Colección/espacio (opcional)", placeholder: "cerebro-principal" },
    ],
  },
  {
    id: "skales",
    label: "Skales",
    blurb:
      "Backend/adaptador open-source (skalesapp/skales) de memoria e inteligencia para cerebros. Autoalojable; el fichero vive en tu servidor Skales y se sincroniza por endpoint.",
    icon: "🗂️",
    oss: true,
    fields: [
      { key: "endpoint", label: "Endpoint de Skales", placeholder: "http://tu-neurona:3000" },
      { key: "tokenRef", label: "Clave (nombre en la bóveda, opcional)", placeholder: "nunca el valor en claro" },
      { key: "space", label: "Espacio/folder (opcional)", placeholder: "memorias" },
    ],
  },
];

export function memorySourceById(id: string): MemorySourceDef | undefined {
  return MEMORY_SOURCES.find((s) => s.id === id);
}

/** Iconos por nombre de fichero conocido (extensible). */
const FILE_ICONS: Record<string, LucideIcon> = {
  "soul.md": Sparkles,
  "memory.md": FileText,
  "dream.md": Moon,
  "skills.md": Wand2,
  "apis.md": Plug,
};

export function iconForFile(name: string): LucideIcon {
  return FILE_ICONS[name.toLowerCase()] ?? FileText;
}

/**
 * Ficheros base de un cerebro (se crean al inicializar). Cada uno con un
 * contenido semilla en español explicando su propósito dentro del programa del
 * cerebro. Son el "programa" que leen Astraura/Aurora.
 */
export interface SeedFileDef {
  name: string;
  blurb: string;
  content: string;
}

export const SEED_FILES: SeedFileDef[] = [
  {
    name: "soul.md",
    blurb: "Identidad, valores y reglas del cerebro (su 'alma').",
    content: `# soul.md — Alma del cerebro

Define QUIÉN es este cerebro: identidad, valores y reglas que rigen su comportamiento.
Este fichero es el programa raíz; las Habilidades (skills, plugins, claves, permisos,
agentes) se administran a partir de él.

## Identidad
- Nombre:
- Propósito:

## Valores
- Soberanía personal sobre los datos
- Transparencia y código abierto

## Reglas
- Sólo actúa con permiso explícito.
`,
  },
  {
    name: "memory.md",
    blurb: "Memoria de largo plazo: hechos, contexto y conocimiento.",
    content: `# memory.md — Memoria

Hechos, contexto y conocimiento persistente que el cerebro recuerda entre sesiones.

## Hechos clave

## Contexto actual
`,
  },
  {
    name: "dream.md",
    blurb: "Objetivos, ideas y programas en gestación ('sueños').",
    content: `# dream.md — Sueños

Objetivos, ideas y programas/archivos en gestación. Las Habilidades pueden
materializar lo que aquí se proponga.

## Objetivos

## Ideas
`,
  },
  {
    name: "skills.md",
    blurb: "Catálogo de habilidades y herramientas atadas al cerebro.",
    content: `# skills.md — Habilidades

Lista de skills, herramientas, MCPs y agentes que este cerebro puede usar.
Se sincroniza con el hub de Habilidades (ability_links).

## Activas
`,
  },
  {
    name: "apis.md",
    blurb: "APIs, claves (por referencia) y conexiones del cerebro.",
    content: `# apis.md — APIs y conexiones

APIs, plugins y conexiones disponibles para el cerebro. Las claves se referencian
por nombre de la bóveda — NUNCA se escribe el valor en claro aquí.

## Conexiones
`,
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

function normalizeFile(row: Record<string, unknown>): MemoryFile {
  return {
    id: String(row.id ?? ""),
    owner: (row.owner as string) ?? undefined,
    brain_id: (row.brain_id as string) ?? null,
    name: (row.name as string) || "nota.md",
    content: (row.content as string) ?? "",
    source: (row.source as string) || "starseed",
    server_config: (row.server_config as Record<string, unknown>) || {},
    meta: (row.meta as Record<string, unknown>) || {},
    sync: !!row.sync,
    updated_at: (row.updated_at as string) ?? undefined,
    created_at: (row.created_at as string) ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

/** Lista los ficheros de memoria de un cerebro (o de cuenta si brainId null). */
export async function listMemoryFiles(brainId: string | null): Promise<MemoryFile[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    let q = sb
      .from("brain_memory_files")
      .select("*")
      .eq("owner", owner)
      .order("name", { ascending: true });
    q = brainId ? q.eq("brain_id", brainId) : q.is("brain_id", null);
    const { data } = await q;
    return ((data as Record<string, unknown>[]) || []).map(normalizeFile);
  } catch {
    return [];
  }
}

export async function saveMemoryFile(file: Partial<MemoryFile>): Promise<MemoryFile | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload: Record<string, unknown> = {
      owner,
      brain_id: file.brain_id ?? null,
      name: (file.name || "nota.md").trim(),
      content: file.content ?? "",
      source: file.source || "starseed",
      server_config: file.server_config ?? {},
      meta: file.meta ?? {},
      sync: !!file.sync,
      updated_at: new Date().toISOString(),
    };
    if (file.id) payload.id = file.id;
    const { data } = await sb
      .from("brain_memory_files")
      .upsert(payload)
      .select("*")
      .single();
    return data ? normalizeFile(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Actualiza sólo el contenido (autosave del editor). */
export async function updateMemoryContent(id: string, content: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { error } = await sb
      .from("brain_memory_files")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/** Cambia la fuente/servidor y su config para un fichero. */
export async function setMemorySource(
  id: string,
  source: MemorySource,
  serverConfig: Record<string, unknown>,
  sync: boolean,
): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { error } = await sb
      .from("brain_memory_files")
      .update({
        source,
        server_config: serverConfig,
        sync,
        updated_at: new Date().toISOString(),
      })
      .eq("owner", owner)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function deleteMemoryFile(id: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("brain_memory_files").delete().eq("owner", owner).eq("id", id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Garantiza los ficheros base de un cerebro: si no existe ninguno, crea
 * soul.md / memory.md / dream.md / skills.md / apis.md con su semilla. Devuelve
 * la lista resultante. Idempotente.
 */
export async function ensureSeedFiles(brainId: string | null): Promise<MemoryFile[]> {
  try {
    const existing = await listMemoryFiles(brainId);
    if (existing.length > 0) return existing;
    const owner = await uid();
    if (!owner) return existing;
    const sb = createClient();
    const rows = SEED_FILES.map((f) => ({
      owner,
      brain_id: brainId ?? null,
      name: f.name,
      content: f.content,
      source: "starseed",
      server_config: {},
      meta: { kind: "core", blurb: f.blurb },
      sync: false,
      updated_at: new Date().toISOString(),
    }));
    // upsert respeta el índice único (owner, brain_id, name) → no duplica.
    await sb.from("brain_memory_files").upsert(rows, { ignoreDuplicates: true });
    return await listMemoryFiles(brainId);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Seguridad al exportar/compartir (Adenda 63 §13)                     */
/* ------------------------------------------------------------------ */
/* Mismo patrón que biblioteca (saveItemSecure) y personalidades
 * (importPersonalityJson): SIEMPRE se escanea antes de sacar una memoria
 * del ámbito privado; los hallazgos `critical` se REDACTAN por defecto,
 * con opción explícita `allowCritical` ("compartir igualmente"). Nunca
 * bloquea en silencio: la UI recibe los findings y confirma. */

import { redactText, scanDeep, scanText, summarize, type Finding } from "@/lib/security/scanner";

/** Escanea un fichero de memoria completo (nombre + contenido + config del servidor). */
export function scanMemoryFile(file: Pick<MemoryFile, "name" | "content" | "server_config">): Finding[] {
  try {
    return scanDeep({
      name: file?.name ?? "",
      content: file?.content ?? "",
      server_config: file?.server_config ?? {},
    });
  } catch {
    return [];
  }
}

export interface MemoryExportResult {
  /** Nombre del fichero exportado. */
  name: string;
  /** Contenido listo para compartir (critical redactado salvo allowCritical). */
  content: string;
  /** TODOS los hallazgos detectados (redactados o no). */
  findings: Finding[];
  /** Nº de secretos redactados en `content`. */
  redactedCount: number;
  /** Aviso en español si hubo hallazgos (para mostrar antes de compartir). */
  aviso?: string;
}

/**
 * EXPORTAR/COMPARTIR una memoria con verificación de seguridad: devuelve el
 * contenido con los hallazgos `critical` redactados por defecto. Pasa
 * `allowCritical: true` (decisión explícita del usuario, "compartir
 * igualmente") para exportar el contenido intacto. Nunca lanza.
 */
export function exportMemoryFileSecure(
  file: Pick<MemoryFile, "name" | "content" | "server_config">,
  opts?: { allowCritical?: boolean },
): MemoryExportResult {
  const name = file?.name || "memoria.md";
  const original = file?.content ?? "";
  try {
    if (opts?.allowCritical) {
      const findings = scanText(original);
      const s = summarize(findings);
      return {
        name,
        content: original,
        findings,
        redactedCount: 0,
        aviso: s.clean ? undefined : `Compartes esta memoria SIN redactar: ${s.message}`,
      };
    }
    const r = redactText(original, { minSeverity: "critical" });
    const s = summarize(r.findings);
    return {
      name,
      content: r.text,
      findings: r.findings,
      redactedCount: r.redactedCount,
      aviso: s.clean
        ? undefined
        : r.redactedCount > 0
          ? `Se redactaron ${r.redactedCount} dato(s) crítico(s) antes de exportar. ${s.message}`
          : `Esta memoria contiene datos sensibles no críticos: ${s.message}`,
    };
  } catch {
    return { name, content: original, findings: [], redactedCount: 0 };
  }
}
