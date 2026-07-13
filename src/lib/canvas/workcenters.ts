// src/lib/canvas/workcenters.ts
// StarSeed · Centros de trabajo — Pizarras como CENTROS DE TRABAJO INFINITOS.
// Un centro de trabajo agrupa múltiples lienzos (pizarras) y se puede guardar,
// exportar, compartir como post/mensaje y almacenar en bibliotecas/folders.
// Vistas: libre, mapa-mental (grafo radial) o cerebro (memoria). Las ventanas
// (bloques) son ajustables (tamaño/posición/conexiones) y se organizan en
// grupos/folders. Las conexiones entre bloques viven en `canvases.edges`.
//
// Tabla: work_centers(id, owner, name, canvas_ids jsonb, folder, view jsonb,
//                     shared, created_at, updated_at).
// Tabla: canvases(... edges jsonb) — aristas entre bloques de un mismo lienzo.
//
// Degrada con elegancia: cualquier fallo de Supabase se traga y devuelve un
// valor seguro. SSR-safe: nada de window en el cuerpo del módulo.

import { createClient } from "@/utils/supabase/client";
import {
  genId,
  summarizeCanvas,
  saveCanvas,
  type Canvas,
} from "@/lib/canvas/canvas";

// ---- Tipos -----------------------------------------------------------------

// Modos de vista de un centro de trabajo (también aplicables a un lienzo).
export const VIEW_MODES = ["libre", "mapa-mental", "cerebro"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

// Etiquetas legibles de cada modo de vista.
export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  libre: "Libre",
  "mapa-mental": "Mapa mental",
  cerebro: "Cerebro",
};

// Estado de vista persistido del centro (pan/zoom global + modo + grupos).
export type WorkCenterView = {
  mode: ViewMode;
  pan?: { x: number; y: number };
  zoom?: number;
  // Posición de cada lienzo cuando el centro se ve como mapa/cerebro.
  positions?: Record<string, { x: number; y: number }>;
};

export type WorkCenter = {
  id: string;
  owner: string | null;
  name: string;
  canvas_ids: string[];
  folder: string | null;
  view: WorkCenterView;
  shared: boolean;
  created_at?: string;
  updated_at?: string;
};

// Arista (conexión) entre dos bloques de un mismo lienzo.
export type CanvasEdge = {
  id: string;
  from: string; // blockId
  to: string; // blockId
  label?: string;
};

// Referencia compartible de un centro (para adjuntar a posts / mensajes).
export type WorkCenterShareRef = {
  type: "work_center";
  workCenterId: string;
  name: string;
  canvases: number;
  shared: boolean;
  summary: string;
};

// Referencia de almacenamiento en biblioteca / memoria (vault).
export type LibraryRef = {
  type: "library_ref";
  workCenterId: string;
  name: string;
  folder: string | null;
  storedAt: string;
};

// ---- Utilidades de vista ---------------------------------------------------

export function defaultView(): WorkCenterView {
  return { mode: "libre", pan: { x: 0, y: 0 }, zoom: 1, positions: {} };
}

export function newWorkCenter(name = "Centro de trabajo", folder: string | null = null): WorkCenter {
  return {
    id: "",
    owner: null,
    name: name || "Centro de trabajo",
    canvas_ids: [],
    folder: folder ?? null,
    view: defaultView(),
    shared: false,
  };
}

// ---- CRUD ------------------------------------------------------------------

async function currentUserId(sb: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function listWorkCenters(): Promise<WorkCenter[]> {
  try {
    const sb = createClient();
    const uid = await currentUserId(sb);
    if (!uid) return [];
    const { data, error } = await sb
      .from("work_centers")
      .select("*")
      .eq("owner", uid)
      .order("updated_at", { ascending: false });
    if (error) return [];
    return (data as WorkCenter[])?.map(normalizeWorkCenter) ?? [];
  } catch {
    return [];
  }
}

export async function getWorkCenter(id: string): Promise<WorkCenter | null> {
  if (!id) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb.from("work_centers").select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return normalizeWorkCenter(data as WorkCenter);
  } catch {
    return null;
  }
}

// Inserta (si no tiene id) o actualiza el centro. Devuelve el centro persistido
// (con id) o null ante fallo.
export async function saveWorkCenter(wc: WorkCenter): Promise<WorkCenter | null> {
  try {
    const sb = createClient();
    const uid = await currentUserId(sb);
    if (!uid) return null;

    const payload = {
      owner: uid,
      name: wc.name || "Centro de trabajo",
      canvas_ids: wc.canvas_ids ?? [],
      folder: wc.folder ?? null,
      view: wc.view ?? defaultView(),
      shared: !!wc.shared,
      updated_at: new Date().toISOString(),
    };

    if (wc.id) {
      const { data, error } = await sb
        .from("work_centers")
        .update(payload)
        .eq("id", wc.id)
        .select("*")
        .maybeSingle();
      if (error || !data) return null;
      return normalizeWorkCenter(data as WorkCenter);
    }

    const { data, error } = await sb
      .from("work_centers")
      .insert(payload)
      .select("*")
      .maybeSingle();
    if (error || !data) return null;
    return normalizeWorkCenter(data as WorkCenter);
  } catch {
    return null;
  }
}

export async function deleteWorkCenter(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const sb = createClient();
    const { error } = await sb.from("work_centers").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

// ---- Adjuntar / quitar lienzos --------------------------------------------

// Añade un lienzo al centro (sin duplicar) y persiste.
export async function addCanvasToCenter(wc: WorkCenter, canvasId: string): Promise<WorkCenter | null> {
  if (!canvasId) return wc;
  const ids = wc.canvas_ids.includes(canvasId) ? wc.canvas_ids : [...wc.canvas_ids, canvasId];
  return saveWorkCenter({ ...wc, canvas_ids: ids });
}

// Quita un lienzo del centro y persiste.
export async function removeCanvasFromCenter(wc: WorkCenter, canvasId: string): Promise<WorkCenter | null> {
  const ids = wc.canvas_ids.filter((id) => id !== canvasId);
  const positions = { ...(wc.view.positions ?? {}) };
  delete positions[canvasId];
  return saveWorkCenter({ ...wc, canvas_ids: ids, view: { ...wc.view, positions } });
}

// ---- Conexiones (edges) sobre un lienzo -----------------------------------
// Las aristas conectan dos bloques (`from`/`to`) de un mismo lienzo y se
// guardan en `canvases.edges`. Estos helpers operan sobre el objeto Canvas en
// memoria; persiste con saveCanvasWithEdges() para escribir la columna.

export function getEdges(canvas: Canvas): CanvasEdge[] {
  const raw = (canvas as any).edges;
  if (Array.isArray(raw)) return raw as CanvasEdge[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as CanvasEdge[];
    } catch {
      /* */
    }
  }
  return [];
}

// Añade una arista entre dos bloques (evita duplicados y auto-bucles).
export function addEdge(canvas: Canvas, from: string, to: string, label?: string): Canvas {
  if (!from || !to || from === to) return canvas;
  const edges = getEdges(canvas);
  const exists = edges.some(
    (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from),
  );
  if (exists) return canvas;
  const next: CanvasEdge = { id: genId("edge"), from, to, label };
  return { ...canvas, edges: [...edges, next] } as Canvas;
}

// Elimina una arista por id.
export function removeEdge(canvas: Canvas, edgeId: string): Canvas {
  const edges = getEdges(canvas).filter((e) => e.id !== edgeId);
  return { ...canvas, edges } as Canvas;
}

// Limpia aristas que apunten a bloques inexistentes (saneo defensivo).
export function pruneEdges(canvas: Canvas): Canvas {
  const ids = new Set((canvas.blocks ?? []).map((b) => b.id));
  const edges = getEdges(canvas).filter((e) => ids.has(e.from) && ids.has(e.to));
  return { ...canvas, edges } as Canvas;
}

// Persiste un lienzo incluyendo su columna `edges`. Reutiliza saveCanvas para
// blocks/título/etc. y, si hay id, escribe `edges` directamente.
export async function saveCanvasWithEdges(canvas: Canvas): Promise<Canvas | null> {
  const persisted = await saveCanvas(canvas);
  const id = persisted?.id || canvas.id;
  if (!id) return persisted;
  try {
    const sb = createClient();
    const { error } = await sb
      .from("canvases")
      .update({ edges: getEdges(canvas), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      // La columna edges podría no existir aún: degradamos sin romper.
      return persisted ?? canvas;
    }
  } catch {
    /* */
  }
  return persisted
    ? ({ ...persisted, edges: getEdges(canvas) } as Canvas)
    : ({ ...canvas, id } as Canvas);
}

// ---- Exportar / compartir / guardar en biblioteca -------------------------

// Construye un bundle JSON descargable con el centro y todos sus lienzos.
export function exportWorkCenter(
  wc: WorkCenter,
  canvases: Canvas[],
): { bundle: Record<string, any>; json: string; filename: string } {
  const byId = new Map(canvases.map((c) => [c.id, c]));
  const included = wc.canvas_ids
    .map((id) => byId.get(id))
    .filter((c): c is Canvas => !!c)
    .map((c) => ({
      id: c.id,
      title: c.title,
      scope: c.scope,
      scope_ref: c.scope_ref,
      blocks: c.blocks ?? [],
      edges: getEdges(c),
      shared: !!c.shared,
      summary: summarizeCanvas(c),
    }));

  const bundle = {
    type: "starseed.workcenter.bundle",
    version: 1,
    exportedAt: new Date().toISOString(),
    workCenter: {
      id: wc.id,
      name: wc.name,
      folder: wc.folder,
      view: wc.view,
      shared: !!wc.shared,
      canvas_ids: wc.canvas_ids,
    },
    canvases: included,
  };

  const json = JSON.stringify(bundle, null, 2);
  const safeName = (wc.name || "centro-de-trabajo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return { bundle, json, filename: `${safeName || "centro"}.starseed.json` };
}

// Dispara la descarga del bundle en el navegador. SSR-safe (guarda window).
export function downloadWorkCenter(wc: WorkCenter, canvases: Canvas[]): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const { json, filename } = exportWorkCenter(wc, canvases);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

// Marca el centro como compartido y devuelve una referencia adjuntable.
export async function shareWorkCenter(
  wc: WorkCenter,
  canvases: Canvas[] = [],
): Promise<{ ref: WorkCenterShareRef; saved: WorkCenter | null }> {
  const totalBlocks = wc.canvas_ids.reduce((acc, id) => {
    const c = canvases.find((cc) => cc.id === id);
    return acc + (c?.blocks?.length ?? 0);
  }, 0);
  const ref: WorkCenterShareRef = {
    type: "work_center",
    workCenterId: wc.id,
    name: wc.name,
    canvases: wc.canvas_ids.length,
    shared: true,
    summary: `${wc.canvas_ids.length} pizarra${wc.canvas_ids.length === 1 ? "" : "s"} · ${totalBlocks} bloque${totalBlocks === 1 ? "" : "s"}`,
  };
  const saved = wc.shared ? wc : await saveWorkCenter({ ...wc, shared: true });
  return { ref, saved };
}

// Publica el centro como post (inmediato), insertando una fila en `posts`.
export async function publishWorkCenterAsPost(
  wc: WorkCenter,
  canvases: Canvas[],
  opts: { visibility?: string } = {},
): Promise<{ ok: boolean; detail: string; postId?: string }> {
  try {
    const sb = createClient();
    const uid = await currentUserId(sb);
    if (!uid) return { ok: false, detail: "Inicia sesión para publicar." };

    const { bundle } = exportWorkCenter(wc, canvases);
    const { data, error } = await sb
      .from("posts")
      .insert({
        author_id: uid,
        type: "work_center",
        content: bundle,
        visibility: opts.visibility || "public",
      })
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, detail: error.message };
    return { ok: true, detail: "Centro publicado", postId: (data as { id?: string })?.id };
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? "Error al publicar el centro." };
  }
}

// Guarda el centro en una biblioteca / memoria (vault). Intenta insertar en
// `vaults` con una referencia; si la tabla/columna no encaja, degrada y aún así
// devuelve una referencia local utilizable.
export async function saveWorkCenterToLibrary(
  wc: WorkCenter,
  canvases: Canvas[] = [],
): Promise<{ ok: boolean; ref: LibraryRef; detail: string }> {
  const ref: LibraryRef = {
    type: "library_ref",
    workCenterId: wc.id,
    name: wc.name,
    folder: wc.folder ?? null,
    storedAt: new Date().toISOString(),
  };
  try {
    const sb = createClient();
    const uid = await currentUserId(sb);
    if (!uid) return { ok: false, ref, detail: "Inicia sesión para guardar en biblioteca." };

    const { bundle } = exportWorkCenter(wc, canvases);
    const { error } = await sb.from("vaults").insert({
      owner: uid,
      name: `Centro · ${wc.name}`,
      kind: "work_center",
      data: bundle,
    });
    if (error) {
      return { ok: false, ref, detail: "Guardado en memoria local (biblioteca no disponible)." };
    }
    return { ok: true, ref, detail: "Guardado en biblioteca." };
  } catch {
    return { ok: false, ref, detail: "Guardado en memoria local (biblioteca no disponible)." };
  }
}

// Referencia compartible sin marcar como compartido (solo lectura del estado).
export function attachWorkCenter(wc: WorkCenter, canvases: Canvas[] = []): WorkCenterShareRef {
  const totalBlocks = wc.canvas_ids.reduce((acc, id) => {
    const c = canvases.find((cc) => cc.id === id);
    return acc + (c?.blocks?.length ?? 0);
  }, 0);
  return {
    type: "work_center",
    workCenterId: wc.id,
    name: wc.name,
    canvases: wc.canvas_ids.length,
    shared: !!wc.shared,
    summary: `${wc.canvas_ids.length} pizarra${wc.canvas_ids.length === 1 ? "" : "s"} · ${totalBlocks} bloque${totalBlocks === 1 ? "" : "s"}`,
  };
}

// ---- internos --------------------------------------------------------------

function normalizeView(raw: any): WorkCenterView {
  const base = defaultView();
  if (!raw || typeof raw !== "object") {
    if (typeof raw === "string") {
      try {
        return normalizeView(JSON.parse(raw));
      } catch {
        return base;
      }
    }
    return base;
  }
  const mode = (VIEW_MODES as readonly string[]).includes(raw.mode) ? (raw.mode as ViewMode) : "libre";
  return {
    mode,
    pan: raw.pan && typeof raw.pan === "object" ? { x: Number(raw.pan.x) || 0, y: Number(raw.pan.y) || 0 } : base.pan,
    zoom: typeof raw.zoom === "number" && raw.zoom > 0 ? raw.zoom : 1,
    positions: raw.positions && typeof raw.positions === "object" ? raw.positions : {},
  };
}

function normalizeWorkCenter(row: WorkCenter): WorkCenter {
  let ids: string[] = [];
  const raw = (row as any).canvas_ids;
  if (Array.isArray(raw)) {
    ids = raw.filter((x) => typeof x === "string");
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) ids = parsed.filter((x) => typeof x === "string");
    } catch {
      ids = [];
    }
  }
  return {
    id: row.id,
    owner: row.owner ?? null,
    name: row.name || "Centro de trabajo",
    canvas_ids: ids,
    folder: row.folder ?? null,
    view: normalizeView((row as any).view),
    shared: !!row.shared,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
