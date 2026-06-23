"use client";

/**
 * StarSeed OS — Módulo 3: La Red de Conocimiento
 *
 * Capa de datos + lógica de grafo para Categorías (árbol jerárquico ramificado)
 * y Temas (conceptos/keywords vinculados a UNA O MÁS categorías de distintas
 * ramas — esto es lo que forma "la red").
 *
 * Tablas Supabase (commons, RLS authenticated):
 *   • knowledge_categories(id, parent_id, name, slug, owner, created_at) — árbol.
 *   • knowledge_topics(id, name, blurb, owner, created_at).
 *   • topic_categories(topic_id, category_id) — relación M2M.
 *
 * "Vínculos de ubicación": cada tema muestra sus múltiples rutas de categoría
 * (raíz → hoja); al hacer clic en una se navega/enfoca esa categoría.
 */

import { createClient } from "@/utils/supabase/client";

// ────────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string | null;
  owner: string | null;
  created_at: string | null;
}

export interface Topic {
  id: string;
  name: string;
  blurb: string | null;
  owner: string | null;
  created_at: string | null;
}

export interface TopicCategory {
  topic_id: string;
  category_id: string;
}

/** Nodo del árbol de categorías (jerárquico, anidado). */
export interface CategoryNode extends Category {
  children: CategoryNode[];
  depth: number;
}

/** Una ruta de ubicación de un tema: ids + nombres root→leaf, y la categoría hoja. */
export interface TopicPath {
  categoryId: string;
  ids: string[];
  names: string[];
}

/** Nodo del grafo (categorías y temas) para Mapa 2D / Red 3D. */
export interface GraphNode {
  id: string;
  kind: "category" | "topic";
  name: string;
  /** ref. original (categoryId / topicId sin prefijo). */
  refId: string;
  /** profundidad en el árbol (solo categorías). */
  depth?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** "tree" = categoría↔padre · "link" = tema↔categoría (cross-branch). */
  kind: "tree" | "link";
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SearchResult {
  categories: Category[];
  topics: Topic[];
}

// Prefijos estables para ids de grafo (evita colisiones cat/tema).
export const catNodeId = (id: string) => `c:${id}`;
export const topicNodeId = (id: string) => `t:${id}`;

// ────────────────────────────────────────────────────────────────────────────
// Utilidad slug
// ────────────────────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return (name || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ────────────────────────────────────────────────────────────────────────────
// CRUD — Categorías
// ────────────────────────────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("knowledge_categories")
    .select("id,parent_id,name,slug,owner,created_at")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as Category[]) ?? [];
}

export async function listTopics(): Promise<Topic[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("knowledge_topics")
    .select("id,name,blurb,owner,created_at")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as Topic[]) ?? [];
}

export async function listTopicCategories(): Promise<TopicCategory[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("topic_categories")
    .select("topic_id,category_id");
  if (error) throw error;
  return (data as TopicCategory[]) ?? [];
}

/** Carga todo el modelo de la red de una sola pasada. */
export async function loadKnowledge(): Promise<{
  categories: Category[];
  topics: Topic[];
  links: TopicCategory[];
}> {
  const [categories, topics, links] = await Promise.all([
    listCategories(),
    listTopics(),
    listTopicCategories(),
  ]);
  return { categories, topics, links };
}

async function currentOwner(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function addCategory({
  name,
  parentId,
}: {
  name: string;
  parentId?: string | null;
}): Promise<Category> {
  const sb = createClient();
  const owner = await currentOwner();
  const payload: Record<string, unknown> = {
    name: name.trim(),
    slug: slugify(name),
    parent_id: parentId ?? null,
  };
  if (owner) payload.owner = owner;
  const { data, error } = await sb
    .from("knowledge_categories")
    .insert(payload)
    .select("id,parent_id,name,slug,owner,created_at")
    .single();
  if (error) throw error;
  return data as Category;
}

export async function addTopic({
  name,
  blurb,
}: {
  name: string;
  blurb?: string | null;
}): Promise<Topic> {
  const sb = createClient();
  const owner = await currentOwner();
  const payload: Record<string, unknown> = {
    name: name.trim(),
    blurb: blurb?.trim() || null,
  };
  if (owner) payload.owner = owner;
  const { data, error } = await sb
    .from("knowledge_topics")
    .insert(payload)
    .select("id,name,blurb,owner,created_at")
    .single();
  if (error) throw error;
  return data as Topic;
}

/** Vincula un tema a una categoría (idempotente: ignora duplicado). */
export async function linkTopic(
  topicId: string,
  categoryId: string,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("topic_categories")
    .insert({ topic_id: topicId, category_id: categoryId });
  // 23505 = unique_violation → ya existía, no es un error real.
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function unlinkTopic(
  topicId: string,
  categoryId: string,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("topic_categories")
    .delete()
    .eq("topic_id", topicId)
    .eq("category_id", categoryId);
  if (error) throw error;
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("knowledge_categories")
    .delete()
    .eq("id", categoryId);
  if (error) throw error;
}

export async function deleteTopic(topicId: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("knowledge_topics")
    .delete()
    .eq("id", topicId);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────────────────────
// Árbol & rutas
// ────────────────────────────────────────────────────────────────────────────

/** Construye el árbol anidado de categorías (raíces = parent_id null). */
export function buildTree(categories: Category[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  for (const c of categories) {
    byId.set(c.id, { ...c, children: [], depth: 0 });
  }
  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const assignDepth = (node: CategoryNode, depth: number) => {
    node.depth = depth;
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    for (const ch of node.children) assignDepth(ch, depth + 1);
  };
  roots.sort((a, b) => a.name.localeCompare(b.name));
  for (const r of roots) assignDepth(r, 0);
  return roots;
}

/** Ruta de nombres raíz→hoja para una categoría (p.ej. ["Ciencia","Física","Física Cuántica"]). */
export function categoryPath(
  catId: string | null | undefined,
  categories: Category[],
): string[] {
  if (!catId) return [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out: string[] = [];
  let cur = byId.get(catId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    out.unshift(cur.name);
    guard.add(cur.id);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return out;
}

/** Igual que categoryPath pero devolviendo los ids raíz→hoja. */
export function categoryPathIds(
  catId: string | null | undefined,
  categories: Category[],
): string[] {
  if (!catId) return [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out: string[] = [];
  let cur = byId.get(catId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    out.unshift(cur.id);
    guard.add(cur.id);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return out;
}

/**
 * "Vínculos de ubicación" de un tema: sus múltiples rutas de categoría.
 * Cada ruta lleva ids + nombres raíz→hoja y la categoría hoja (categoryId).
 */
export function topicPaths(
  topicId: string,
  links: TopicCategory[],
  categories: Category[],
): TopicPath[] {
  const catIds = links
    .filter((l) => l.topic_id === topicId)
    .map((l) => l.category_id);
  const paths = catIds.map((cid) => ({
    categoryId: cid,
    ids: categoryPathIds(cid, categories),
    names: categoryPath(cid, categories),
  }));
  // Solo rutas válidas (categoría existente), ordenadas por nombre de ruta.
  return paths
    .filter((p) => p.names.length > 0)
    .sort((a, b) => a.names.join(" / ").localeCompare(b.names.join(" / ")));
}

/** Temas vinculados a una categoría concreta (sin herencia). */
export function topicsForCategory(
  categoryId: string,
  topics: Topic[],
  links: TopicCategory[],
): Topic[] {
  const ids = new Set(
    links.filter((l) => l.category_id === categoryId).map((l) => l.topic_id),
  );
  return topics.filter((t) => ids.has(t.id));
}

// ────────────────────────────────────────────────────────────────────────────
// Búsqueda
// ────────────────────────────────────────────────────────────────────────────

/** Búsqueda local (categorías + temas) por substring case/acento-insensible. */
export function search(
  q: string,
  categories: Category[],
  topics: Topic[],
): SearchResult {
  const needle = slugify(q);
  if (!needle) return { categories: [], topics: [] };
  const norm = (s: string | null | undefined) => slugify(s ?? "");
  return {
    categories: categories.filter((c) => norm(c.name).includes(needle)),
    topics: topics.filter(
      (t) => norm(t.name).includes(needle) || norm(t.blurb).includes(needle),
    ),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Grafo (Mapa 2D + Red 3D)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Construye el grafo unificado:
 *   • nodos categoría + nodos tema,
 *   • aristas categoría↔padre ("tree"),
 *   • aristas tema↔categoría ("link", potencialmente cruzando ramas).
 */
export function buildGraph(
  categories: Category[],
  topics: Topic[],
  links: TopicCategory[],
): KnowledgeGraph {
  const depthById = new Map<string, number>();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const depthOf = (id: string): number => {
    if (depthById.has(id)) return depthById.get(id)!;
    let d = 0;
    let cur = byId.get(id);
    const guard = new Set<string>();
    while (cur?.parent_id && byId.has(cur.parent_id) && !guard.has(cur.id)) {
      guard.add(cur.id);
      d++;
      cur = byId.get(cur.parent_id);
    }
    depthById.set(id, d);
    return d;
  };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const c of categories) {
    nodes.push({
      id: catNodeId(c.id),
      kind: "category",
      name: c.name,
      refId: c.id,
      depth: depthOf(c.id),
    });
    if (c.parent_id && byId.has(c.parent_id)) {
      edges.push({
        source: catNodeId(c.parent_id),
        target: catNodeId(c.id),
        kind: "tree",
      });
    }
  }

  const catSet = new Set(categories.map((c) => c.id));
  for (const t of topics) {
    nodes.push({
      id: topicNodeId(t.id),
      kind: "topic",
      name: t.name,
      refId: t.id,
    });
  }
  for (const l of links) {
    if (catSet.has(l.category_id)) {
      edges.push({
        source: topicNodeId(l.topic_id),
        target: catNodeId(l.category_id),
        kind: "link",
      });
    }
  }

  return { nodes, edges };
}
