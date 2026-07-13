"use client";

/**
 * StarSeed OS — Bóveda de Memorias (Memory Vault)
 *
 * Gestión de documentos de memoria personales del usuario (Exocórtex).
 * Cada MemoryDoc es un archivo .md editable que vive en localStorage y puede
 * integrarse en el grafo 3D del cerebro como nodos de tipo "memoria".
 *
 * FOLDERS DENTRO DE MEMORIAS:
 * Los "folders" se modelan de dos formas complementarias:
 *   1. Campo `category` del MemoryDoc → agrupa memorias a nivel de colección.
 *   2. Encabezados markdown (# ## ###) dentro del doc → crean jerarquía de nodos
 *      dentro del grafo de UNA memoria (igual que subfolders dentro de un archivo).
 *      Esto sigue el principio de "Singularidad del Contenido" del SOSD: la estructura
 *      interna se representa como árbol, no como ficheros separados.
 *
 * SSR-SAFE: todas las referencias a window/localStorage están guardadas con
 * `typeof window !== "undefined"`.
 *
 * EVENTOS: tras cualquier mutación se emite `starseed:memory-vault` en window,
 * para que los consumidores (useMemoryVault, cerebro 3D) se refresquen.
 */

import { useState, useEffect, useCallback } from "react";

// ============================================================
// Tipos
// ============================================================

export interface MemoryDoc {
  id: string;
  name: string;
  category: string;
  tags: string[];
  markdown: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
  active: boolean;
}

/**
 * Nodo del grafo cerebral. Compatible con la forma que espera el cerebro 3D.
 */
export interface VaultGraphNode {
  id: string;
  label: string;
  type: string;
  kind?: string;
  context?: string[];
  summary?: string;
  links?: { label: string; url: string }[];
  _osLayer?: "memoria";
  _osLink?: string;
  _color?: string;
}

export interface VaultGraphEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
}

// ============================================================
// Constantes
// ============================================================

const VAULT_KEY = "starseed.memory.vault.v1";
const VAULT_EVENT = "starseed:memory-vault";

// ============================================================
// Semillas (datos de ejemplo en el primer arranque)
// ============================================================

const SEED_MEMORIES: MemoryDoc[] = [
  {
    id: "seed-exocortex",
    name: "Mi Exocórtex",
    category: "Personal",
    tags: ["identidad", "memoria", "yo"],
    color: "#007FFF",
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    markdown: `# Mi Exocórtex

Extensión digital de mi mente dentro de StarSeed OS.
Propiedad exclusiva mía — el sistema la sirve, no la controla.

## Valores fundamentales

- Soberanía personal sobre mis datos
- Pensamiento crítico y curiosidad constante
- Conexión empática con la comunidad

## Objetivos actuales

- Explorar el ecosistema StarSeed
- Contribuir a la gobernanza participativa
- Desarrollar proyectos creativos en la red

## Conexiones importantes

Estas personas y conceptos forman mi red de confianza:
[[Red StarSeed]] — mi comunidad principal

## Notas libres

> "La tecnología amplifica la conciencia, no la reemplaza." — Principio Ciberdelia
`,
  },
  {
    id: "seed-starseed-net",
    name: "Red StarSeed",
    category: "Sistema",
    tags: ["red", "comunidad", "starseed", "sosd"],
    color: "#39FF14",
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    markdown: `# Red StarSeed

El Sistema Operativo Social Descentralizado (SOSD) — sistema nervioso digital de la comunidad.

## Tres ecosistemas funcionales

### Ecosistema Político
- Democracia directa y voto líquido
- Gestión de recursos comunes
- [Gobernanza](/network/politics)

### Ecosistema Educativo
- Biblioteca universal de conocimiento
- Mentoría híbrida humano + IA
- [Educación](/network/education)

### Ecosistema Cultural
- Expresión artística libre
- Multiverso y espacios virtuales
- [Cultura](/network/culture)

## Principios nucleares

- [[Mi Exocórtex]] es soberano dentro de la red
- Código abierto y auditable
- Sin vigilancia masiva, sin alienación

## Referencias

- [Constitución StarSeed](https://docs.google.com/document/d/1XpltI3gkYN1Ma2wBVrlisPagL_HfeoF1RsnFKG09w4I/edit)
- [Manifiesto Fundacional](https://docs.google.com/document/d/1YiX9QK_JJHbmRMRj8fXrJeNffsDQ8T2RhzMHTeyavA0/edit)
`,
  },
];

// ============================================================
// Persistencia local
// ============================================================

function readVault(): MemoryDoc[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeVault(docs: MemoryDoc[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(docs));
  } catch {
    // quota exceeded — silently fail
  }
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(VAULT_EVENT));
}

/** Inicializa la bóveda con semillas si está vacía. */
function ensureSeeded(): void {
  if (typeof window === "undefined") return;
  const existing = readVault();
  if (existing.length === 0) {
    writeVault(SEED_MEMORIES);
  }
}

function generateId(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// API pública — CRUD
// ============================================================

/** Lista todas las memorias. Siembra ejemplos en primer uso. */
export function listMemories(): MemoryDoc[] {
  if (typeof window === "undefined") return [];
  ensureSeeded();
  return readVault();
}

/** Obtiene una memoria por id. */
export function getMemory(id: string): MemoryDoc | undefined {
  return listMemories().find((d) => d.id === id);
}

/** Crea una nueva memoria. Campos no provistos toman valores por defecto. */
export function createMemory(partial: Partial<MemoryDoc>): MemoryDoc {
  const now = Date.now();
  const doc: MemoryDoc = {
    id: partial.id ?? generateId(),
    name: partial.name ?? "Nueva memoria",
    category: partial.category ?? "Personal",
    tags: partial.tags ?? [],
    markdown: partial.markdown ?? `# ${partial.name ?? "Nueva memoria"}\n\nEscribe aquí tus pensamientos...\n`,
    color: partial.color,
    createdAt: partial.createdAt ?? now,
    updatedAt: now,
    active: partial.active ?? true,
  };
  const vault = readVault();
  vault.push(doc);
  writeVault(vault);
  emitChange();
  return doc;
}

/** Actualiza campos parciales de una memoria. */
export function updateMemory(id: string, patch: Partial<MemoryDoc>): MemoryDoc | undefined {
  const vault = readVault();
  const idx = vault.findIndex((d) => d.id === id);
  if (idx === -1) return undefined;
  const updated: MemoryDoc = { ...vault[idx], ...patch, id, updatedAt: Date.now() };
  vault[idx] = updated;
  writeVault(vault);
  emitChange();
  return updated;
}

/** Elimina una memoria por id. */
export function deleteMemory(id: string): void {
  const vault = readVault().filter((d) => d.id !== id);
  writeVault(vault);
  emitChange();
}

/** Duplica una memoria, generando un nuevo id y añadiendo " (copia)" al nombre. */
export function duplicateMemory(id: string): MemoryDoc | undefined {
  const original = getMemory(id);
  if (!original) return undefined;
  const now = Date.now();
  const copy: MemoryDoc = {
    ...original,
    id: generateId(),
    name: `${original.name} (copia)`,
    createdAt: now,
    updatedAt: now,
  };
  const vault = readVault();
  vault.push(copy);
  writeVault(vault);
  emitChange();
  return copy;
}

/** Alterna el campo `active` de una memoria (visible/oculta en el cerebro). */
export function toggleActive(id: string): MemoryDoc | undefined {
  const doc = getMemory(id);
  if (!doc) return undefined;
  return updateMemory(id, { active: !doc.active });
}

/** Cambia la categoría de una memoria. */
export function setCategory(id: string, cat: string): MemoryDoc | undefined {
  return updateMemory(id, { category: cat });
}

// ============================================================
// Parser de Markdown → Grafo
// ============================================================

/**
 * Convierte un MemoryDoc en un sub-grafo de nodos y aristas.
 *
 * Estructura:
 *   ROOT (el doc completo)
 *     └── # Heading → nodo hijo del root
 *           └── ## Sub-heading → nodo hijo del heading anterior
 *                 └── - Bullet → nodo hoja
 *
 * Wiki-links [[Nombre]] crean aristas de tipo "memoria-link" hacia
 * nodos cuyo label coincida dentro del mismo vault.
 *
 * [label](url) añaden entradas `links` al nodo actual.
 */
export function parseMarkdownToGraph(doc: MemoryDoc): {
  nodes: VaultGraphNode[];
  edges: VaultGraphEdge[];
} {
  const nodes: VaultGraphNode[] = [];
  const edges: VaultGraphEdge[] = [];
  const prefix = doc.id;

  // Nodo raíz — representa la memoria entera
  const rootId = `${prefix}::root`;
  nodes.push({
    id: rootId,
    label: doc.name,
    type: "memoria",
    kind: "episodic",
    context: [doc.category, ...doc.tags],
    summary: `Memoria: ${doc.name} [${doc.category}]`,
    _osLayer: "memoria",
    _osLink: `/exocortex#${doc.id}`,
    _color: doc.color,
  });

  const lines = doc.markdown.split("\n");

  // Stack de parents: [ { id, level } ]
  // level: 0=root, 1=#, 2=##, 3=###, ...
  const parentStack: { id: string; level: number }[] = [{ id: rootId, level: 0 }];

  // Nodo "en curso" para acumular links de markdown [label](url)
  let currentNodeId = rootId;

  // Índice de ids creados, para detectar wiki-links al final
  const labelToId: Record<string, string> = { [doc.name]: rootId };

  // Pendientes de wiki-link (necesitan un segundo paso)
  const wikiLinkPending: { sourceId: string; targetLabel: string }[] = [];

  let headingCounter = 0;
  let bulletCounter = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // ── Encabezados ──────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const label = headingMatch[2].trim();
      headingCounter++;
      const nodeId = `${prefix}::h${headingCounter}`;

      // Extraer links normales del label
      const mdLinks = extractMdLinks(label);
      const cleanLabel = removeMdLinks(label);

      nodes.push({
        id: nodeId,
        label: cleanLabel,
        type: "memoria",
        kind: "semantic",
        context: [doc.category],
        _osLayer: "memoria",
        _osLink: `/exocortex#${doc.id}`,
        _color: doc.color,
        links: mdLinks.length ? mdLinks : undefined,
        summary: `${doc.name} › ${cleanLabel}`,
      });
      labelToId[cleanLabel] = nodeId;

      // Encontrar parent adecuado en el stack
      while (parentStack.length > 1 && parentStack[parentStack.length - 1].level >= level) {
        parentStack.pop();
      }
      const parentId = parentStack[parentStack.length - 1].id;
      edges.push({ source: parentId, target: nodeId, type: "memoria-link", weight: 1 });

      parentStack.push({ id: nodeId, level });
      currentNodeId = nodeId;

      // Detectar wiki-links en el label
      extractWikiLinks(label).forEach((wl) =>
        wikiLinkPending.push({ sourceId: nodeId, targetLabel: wl })
      );
      continue;
    }

    // ── Bullets ───────────────────────────────────────────────
    const bulletMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
    if (bulletMatch) {
      const rawText = bulletMatch[1].trim();
      bulletCounter++;
      const nodeId = `${prefix}::b${bulletCounter}`;

      const mdLinks = extractMdLinks(rawText);
      const cleanText = removeMdLinks(rawText);

      nodes.push({
        id: nodeId,
        label: cleanText,
        type: "memoria",
        kind: "episodic",
        context: [doc.category],
        _osLayer: "memoria",
        _osLink: `/exocortex#${doc.id}`,
        _color: doc.color,
        links: mdLinks.length ? mdLinks : undefined,
      });
      labelToId[cleanText] = nodeId;

      // Parent es el heading/root actual
      const parentId = parentStack[parentStack.length - 1].id;
      edges.push({ source: parentId, target: nodeId, type: "memoria-link", weight: 0.5 });

      // Detectar wiki-links en el bullet
      extractWikiLinks(rawText).forEach((wl) =>
        wikiLinkPending.push({ sourceId: nodeId, targetLabel: wl })
      );

      // Agregar links normales al nodo corriente también
      if (mdLinks.length) {
        const existing = nodes.find((n) => n.id === currentNodeId);
        if (existing) {
          existing.links = [...(existing.links ?? []), ...mdLinks];
        }
      }
      continue;
    }

    // ── Links normales [label](url) en texto libre ───────────
    const mdLinks = extractMdLinks(line);
    if (mdLinks.length && currentNodeId) {
      const existing = nodes.find((n) => n.id === currentNodeId);
      if (existing) {
        existing.links = [...(existing.links ?? []), ...mdLinks];
      }
    }

    // ── Wiki links en texto libre ─────────────────────────────
    extractWikiLinks(line).forEach((wl) =>
      wikiLinkPending.push({ sourceId: currentNodeId, targetLabel: wl })
    );
  }

  // Segundo paso: resolver wiki-links → aristas
  for (const pending of wikiLinkPending) {
    const targetId = labelToId[pending.targetLabel];
    if (targetId && targetId !== pending.sourceId) {
      // Evitar duplicados
      const exists = edges.some(
        (e) => e.source === pending.sourceId && e.target === targetId && e.type === "wikilink"
      );
      if (!exists) {
        edges.push({ source: pending.sourceId, target: targetId, type: "wikilink", weight: 0.8 });
      }
    }
  }

  return { nodes, edges };
}

// ── Utilidades de parseo ──────────────────────────────────────

function extractMdLinks(text: string): { label: string; url: string }[] {
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  const results: { label: string; url: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ label: m[1], url: m[2] });
  }
  return results;
}

function removeMdLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\[\[([^\]]+)\]\]/g, "$1").trim();
}

function extractWikiLinks(text: string): string[] {
  const re = /\[\[([^\]]+)\]\]/g;
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push(m[1]);
  }
  return results;
}

// ============================================================
// Grafo activo combinado
// ============================================================

/**
 * Combina los grafos de TODAS las memorias activas en un único grafo.
 * Las aristas de tipo "wikilink" entre memorias distintas conectan nodos
 * de documentos diferentes cuando el label coincide con el nombre de otra memoria.
 *
 * SSR-safe: devuelve { nodes: [], edges: [] } en entorno servidor.
 */
export function getActiveVaultGraph(): { nodes: VaultGraphNode[]; edges: VaultGraphEdge[] } {
  if (typeof window === "undefined") return { nodes: [], edges: [] };

  const actives = listMemories().filter((d) => d.active);
  if (actives.length === 0) return { nodes: [], edges: [] };

  const allNodes: VaultGraphNode[] = [];
  const allEdges: VaultGraphEdge[] = [];

  // Mapa nombre-de-memoria → id de su nodo raíz (para cross-doc wiki-links)
  const nameToRootId: Record<string, string> = {};

  for (const doc of actives) {
    const { nodes, edges } = parseMarkdownToGraph(doc);
    allNodes.push(...nodes);
    allEdges.push(...edges);
    nameToRootId[doc.name] = `${doc.id}::root`;
  }

  // Conectar wiki-links cross-documento
  for (const node of allNodes) {
    if (node.type !== "memoria") continue;
    // Buscar si el label coincide con otra memoria
    const targetRootId = nameToRootId[node.label];
    if (targetRootId && targetRootId !== node.id) {
      const exists = allEdges.some(
        (e) => e.source === node.id && e.target === targetRootId && e.type === "cross-memory"
      );
      if (!exists) {
        allEdges.push({ source: node.id, target: targetRootId, type: "cross-memory", weight: 1.2 });
      }
    }
  }

  return { nodes: allNodes, edges: allEdges };
}

// ============================================================
// Export / Import
// ============================================================

/** Devuelve el contenido markdown de una memoria (para descargar como .md). */
export function exportMemoryMarkdown(id: string): string {
  const doc = getMemory(id);
  if (!doc) return "";
  return doc.markdown;
}

/** Crea un MemoryDoc a partir de texto markdown crudo. */
export function importMemoryMarkdown(
  name: string,
  md: string,
  category?: string
): MemoryDoc {
  return createMemory({
    name,
    markdown: md,
    category: category ?? "Importado",
    tags: [],
  });
}

/** Exporta toda la bóveda como JSON. */
export function exportVaultJson(): string {
  if (typeof window === "undefined") return "[]";
  return JSON.stringify(readVault(), null, 2);
}

/**
 * Importa (reemplaza) la bóveda completa desde un JSON previamente exportado.
 * Si el JSON es inválido, lanza un error que el llamador debe manejar.
 */
export function importVaultJson(json: string): void {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("Formato inválido: se esperaba un array");
  writeVault(parsed as MemoryDoc[]);
  emitChange();
}

/**
 * Codifica una memoria como base64url para compartir.
 * El receptor puede usar decodeShare() para restaurarla.
 */
export function encodeShare(id: string): string {
  const doc = getMemory(id);
  if (!doc) return "";
  const json = JSON.stringify(doc);
  if (typeof window !== "undefined" && window.btoa) {
    return window.btoa(encodeURIComponent(json));
  }
  return Buffer.from(json).toString("base64");
}

/**
 * Decodifica una cadena producida por encodeShare().
 * Devuelve el MemoryDoc sin persistirlo (el llamador decide si importarlo).
 */
export function decodeShare(str: string): MemoryDoc | undefined {
  try {
    let json: string;
    if (typeof window !== "undefined" && window.atob) {
      json = decodeURIComponent(window.atob(str));
    } else {
      json = Buffer.from(str, "base64").toString("utf-8");
    }
    return JSON.parse(json) as MemoryDoc;
  } catch {
    return undefined;
  }
}

// ============================================================
// React Hook
// ============================================================

/**
 * useMemoryVault — hook reactivo para la Bóveda de Memorias.
 *
 * Se sincroniza mediante:
 *   1. CustomEvent "starseed:memory-vault" → mutaciones locales en la misma pestaña.
 *   2. StorageEvent → cambios desde otras pestañas del mismo origen.
 *
 * Devuelve todas las memorias y las acciones CRUD + import/export.
 */
export function useMemoryVault() {
  const [memories, setMemories] = useState<MemoryDoc[]>(() => {
    if (typeof window === "undefined") return [];
    ensureSeeded();
    return readVault();
  });

  const refresh = useCallback(() => {
    setMemories(readVault());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener(VAULT_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(VAULT_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return {
    memories,
    create: (partial: Partial<MemoryDoc>) => createMemory(partial),
    update: (id: string, patch: Partial<MemoryDoc>) => { updateMemory(id, patch); },
    remove: (id: string) => { deleteMemory(id); },
    duplicate: (id: string) => duplicateMemory(id),
    toggleActive: (id: string) => { toggleActive(id); },
    setCategory: (id: string, cat: string) => { setCategory(id, cat); },
    importMd: (name: string, md: string, category?: string) =>
      importMemoryMarkdown(name, md, category),
    exportMd: (id: string) => exportMemoryMarkdown(id),
    exportJson: () => exportVaultJson(),
    importJson: (json: string) => { importVaultJson(json); },
  };
}
