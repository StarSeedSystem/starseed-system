"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · BÚSQUEDA UNIFICADA  (Adenda 67 · P4-5 · Typesense)
 * ---------------------------------------------------------------------------
 * La búsqueda de personas y grupos del OS vive hoy en `@/lib/social/os-profiles`
 * (Supabase: `os_profiles`, `os_pages`, `os_groups` con `ilike`). Funciona, pero
 * `ilike` no tolera erratas ni ordena por relevancia.
 *
 * Esta capa es **ADITIVA y con FALLBACK**, en ese orden estricto:
 *   1) Si el usuario tiene **Typesense** configurado Y habilitado Y con
 *      colección + `query_by` declarados → se busca ahí (rápido, tolerante a
 *      erratas, ordenado por relevancia).
 *   2) En CUALQUIER otro caso —no configurado, sin colección, servidor caído,
 *      cero resultados— se cae a la búsqueda de SIEMPRE (Supabase), sin que el
 *      usuario note nada. La búsqueda del OS **nunca** deja de funcionar por
 *      esto: Typesense es una MEJORA opcional, jamás un requisito.
 *
 * HONESTIDAD: `searchWithEngine()` devuelve además QUÉ motor respondió
 * (`engine: "typesense" | "supabase"`), para que la UI pueda mostrarlo si quiere.
 * No fingimos búsqueda semántica cuando estamos con `ilike`.
 *
 * NO se toca `os-profiles.ts`: sus funciones siguen siendo la verdad y el suelo.
 * SSR-safe y defensivo: nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  searchUsers as searchUsersDb,
  searchGroups as searchGroupsDb,
  fetchProfilesByIds,
  type OsProfile,
  type SocialGroupHit,
} from "@/lib/social/os-profiles";
import { loadIntegrationConfig } from "@/lib/integrations/registry";
import { runIntegration } from "@/lib/integrations/run";
import type { TypesenseHit } from "@/lib/integrations/clients/typesense";

/** Motor que respondió de verdad (transparencia). */
export type SearchEngine = "typesense" | "supabase";

export interface EngineResult<T> {
  engine: SearchEngine;
  results: T[];
  /** Motivo por el que NO se usó Typesense (si aplica). Honesto. */
  note?: string;
}

/* ─────────────────── Config de Typesense en el OS ─────────────────── */

/**
 * Claves de `extra` que el usuario rellena en Ajustes → Integraciones → Typesense:
 *   · collection       → colección de PERSONAS   (p.ej. "os_profiles")
 *   · queryBy          → campos de personas      (p.ej. "username,display_name,bio")
 *   · groupsCollection → colección de GRUPOS     (p.ej. "os_groups")
 *   · groupsQueryBy    → campos de grupos        (p.ej. "name,slug,description,tags")
 * Si falta la colección/`query_by` de un tipo, ESE tipo cae a Supabase (y el otro
 * puede seguir usando Typesense). Granularidad honesta.
 */
interface TsCfg {
  enabled: boolean;
  usersCollection: string;
  usersQueryBy: string;
  groupsCollection: string;
  groupsQueryBy: string;
}

function readTypesenseCfg(): TsCfg | null {
  if (typeof window === "undefined") return null;
  try {
    const cfg = loadIntegrationConfig("typesense");
    // `enabled !== false` es el criterio del runner, pero aquí exigimos que el
    // usuario lo haya activado A PROPÓSITO: nunca desviamos la búsqueda del OS
    // a un servidor por accidente.
    if (cfg.enabled !== true) return null;
    if (!cfg.endpoint?.trim()) return null;
    const e = cfg.extra ?? {};
    return {
      enabled: true,
      usersCollection: (e.collection || e.usersCollection || "").trim(),
      usersQueryBy: (e.queryBy || e.query_by || e.usersQueryBy || "").trim(),
      groupsCollection: (e.groupsCollection || "").trim(),
      groupsQueryBy: (e.groupsQueryBy || "").trim(),
    };
  } catch {
    return null;
  }
}

/** ¿Está Typesense listo para la búsqueda del OS? (para insignias en la UI) */
export function typesenseReady(): { users: boolean; groups: boolean } {
  const c = readTypesenseCfg();
  if (!c) return { users: false, groups: false };
  return {
    users: !!(c.usersCollection && c.usersQueryBy),
    groups: !!(c.groupsCollection && c.groupsQueryBy),
  };
}

/* ─────────────────────── Mapeo de documentos ─────────────────────── */

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v == null ? fallback : String(v);
}

/**
 * Documento de Typesense → OsProfile. Acepta los nombres de campo naturales
 * (`user_id`/`userId`, `display_name`/`displayName`…) sin imponer un esquema:
 * el usuario indexa como quiera.
 */
function hitToProfile(h: TypesenseHit): OsProfile | null {
  const d = h.doc || {};
  const userId = str(d.user_id ?? d.userId ?? d.id);
  const username = str(d.username ?? d.handle);
  if (!userId || !username) return null;
  return {
    userId,
    username,
    displayName: str(d.display_name ?? d.displayName, username),
    avatarUrl: str(d.avatar_url ?? d.avatarUrl) || undefined,
    bio: str(d.bio),
    tags: Array.isArray(d.tags) ? (d.tags as unknown[]).map((t) => str(t)) : [],
    searchable: d.searchable !== false,
    updatedAt: str(d.updated_at ?? d.updatedAt, new Date().toISOString()),
  };
}

function hitToGroup(h: TypesenseHit): SocialGroupHit | null {
  const d = h.doc || {};
  const slug = str(d.slug);
  const name = str(d.name);
  if (!slug || !name) return null;
  const k = str(d.kind, "grupo");
  const kind: SocialGroupHit["kind"] = k === "comunidad" ? "comunidad" : k === "pagina" ? "pagina" : "grupo";
  return {
    id: str(d.id, slug),
    slug,
    name,
    kind,
    description: str(d.description),
    avatarUrl: str(d.avatar_url ?? d.avatarUrl) || undefined,
    memberCount: Number(d.member_count ?? d.memberCount ?? 0) || 0,
    tags: Array.isArray(d.tags) ? (d.tags as unknown[]).map((t) => str(t)) : [],
  };
}

/* ══════════════════════════ API pública ══════════════════════════ */

/**
 * Busca PERSONAS. Typesense si está listo; si no (o si falla, o si no devuelve
 * nada), Supabase. Devuelve el motor usado y, si procede, el motivo.
 */
export async function searchUsersWithEngine(q: string, limit = 12): Promise<EngineResult<OsProfile>> {
  const term = (q ?? "").trim();
  if (!term) return { engine: "supabase", results: [] };

  const cfg = readTypesenseCfg();
  if (!cfg || !cfg.usersCollection || !cfg.usersQueryBy) {
    return {
      engine: "supabase",
      results: await searchUsersDb(term, limit),
      note: cfg ? "Typesense sin colección de personas configurada." : undefined,
    };
  }

  try {
    const res = await runIntegration("typesense", "search", {
      q: term,
      collection: cfg.usersCollection,
      queryBy: cfg.usersQueryBy,
      perPage: limit,
    });
    if (res.ok) {
      const hits = (res.data?.hits ?? []) as TypesenseHit[];
      const mapped = hits.map(hitToProfile).filter((p): p is OsProfile => !!p);
      if (mapped.length > 0) {
        // Los documentos indexados pueden estar obsoletos: refrescamos los
        // perfiles desde la fuente de verdad (Supabase) sin perder el ORDEN de
        // relevancia que dio Typesense. Best-effort: si falla, servimos el índice.
        try {
          const fresh = await fetchProfilesByIds(mapped.map((m) => m.userId));
          const merged = mapped.map((m) => fresh[m.userId] ?? m);
          return { engine: "typesense", results: merged.slice(0, limit) };
        } catch {
          return { engine: "typesense", results: mapped.slice(0, limit) };
        }
      }
      // Cero resultados en el índice → puede estar desactualizado: caemos a la BD.
      return {
        engine: "supabase",
        results: await searchUsersDb(term, limit),
        note: "Typesense no devolvió resultados; se buscó en la base de datos.",
      };
    }
    return {
      engine: "supabase",
      results: await searchUsersDb(term, limit),
      note: `Typesense no respondió (${res.error ?? "error"}); se buscó en la base de datos.`,
    };
  } catch {
    return {
      engine: "supabase",
      results: await searchUsersDb(term, limit),
      note: "Typesense falló; se buscó en la base de datos.",
    };
  }
}

/** Busca GRUPOS/páginas/comunidades. Typesense si está listo; si no, Supabase. */
export async function searchGroupsWithEngine(q: string, limit = 12): Promise<EngineResult<SocialGroupHit>> {
  const term = (q ?? "").trim();
  if (!term) return { engine: "supabase", results: [] };

  const cfg = readTypesenseCfg();
  if (!cfg || !cfg.groupsCollection || !cfg.groupsQueryBy) {
    return {
      engine: "supabase",
      results: await searchGroupsDb(term, limit),
      note: cfg ? "Typesense sin colección de grupos configurada." : undefined,
    };
  }

  try {
    const res = await runIntegration("typesense", "search", {
      q: term,
      collection: cfg.groupsCollection,
      queryBy: cfg.groupsQueryBy,
      perPage: limit,
    });
    if (res.ok) {
      const hits = (res.data?.hits ?? []) as TypesenseHit[];
      const mapped = hits.map(hitToGroup).filter((g): g is SocialGroupHit => !!g);
      if (mapped.length > 0) return { engine: "typesense", results: mapped.slice(0, limit) };
      return {
        engine: "supabase",
        results: await searchGroupsDb(term, limit),
        note: "Typesense no devolvió resultados; se buscó en la base de datos.",
      };
    }
    return {
      engine: "supabase",
      results: await searchGroupsDb(term, limit),
      note: `Typesense no respondió (${res.error ?? "error"}); se buscó en la base de datos.`,
    };
  } catch {
    return {
      engine: "supabase",
      results: await searchGroupsDb(term, limit),
      note: "Typesense falló; se buscó en la base de datos.",
    };
  }
}

/* ── Envoltorios con la MISMA firma que os-profiles (sustitución directa) ──
 * Permiten migrar cualquier llamador cambiando solo el import: la firma y el
 * tipo de retorno son idénticos a `searchUsers`/`searchGroups`. */

export async function searchUsers(q: string, limit = 12): Promise<OsProfile[]> {
  return (await searchUsersWithEngine(q, limit)).results;
}

export async function searchGroups(q: string, limit = 12): Promise<SocialGroupHit[]> {
  return (await searchGroupsWithEngine(q, limit)).results;
}
