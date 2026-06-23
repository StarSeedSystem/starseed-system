// src/lib/canvas/canvas.ts
// StarSeed · Pizarra — Lienzo universal de creación.
// Capa de datos + catálogo de bloques para un tablero que puede conectar con
// CUALQUIER archivo, baúl, memoria, app, enlace, programa, widget o ventana del
// navegador. Soporta publicación democrática (proponer) o inmediata (post).
//
// Tabla: canvases(id, owner, scope, scope_ref, title, blocks jsonb, shared,
//                 created_at, updated_at). Degrada con elegancia: cualquier
// fallo de Supabase se traga y devuelve un valor seguro.

import { createClient } from "@/utils/supabase/client";

// ---- Tipos -----------------------------------------------------------------

export type BlockKind =
  | "text"
  | "file"
  | "vault"
  | "memory"
  | "app"
  | "link"
  | "widget"
  | "browser"
  | "image"
  // "cover" es un bloque ESPECIAL (no aparece en Insertar): materializa la
  // Tarjeta de Previsualización (portada obligatoria) del Lienzo Universal.
  | "cover";

export type CanvasBlock = {
  id: string;
  kind: BlockKind;
  x: number;
  y: number;
  w: number;
  h: number;
  data: Record<string, any>;
  title?: string;
  // ---- Capas / propiedades (Módulo 5, todos opcionales y aditivos) --------
  group?: string; // carpeta / grupo (Propiedades del Elemento)
  hidden?: boolean; // visibilidad de la capa (panel Capas)
  locked?: boolean; // capa bloqueada: no se arrastra ni redimensiona
  accent?: string; // color/acento del elemento (Propiedades del Elemento)
};

export type Canvas = {
  id: string;
  owner: string | null;
  scope: string;
  scope_ref: string | null;
  title: string;
  blocks: CanvasBlock[];
  shared: boolean;
  created_at?: string;
  updated_at?: string;
};

// Forma del payload compartible que devuelve attachTo() — apto para adjuntar a
// posts, mensajes o propuestas.
export type CanvasShareRef = {
  type: "canvas";
  canvasId: string;
  title: string;
  blocks: number;
  shared: boolean;
  summary: string;
};

// ---- Catálogo de tipos de bloque ------------------------------------------
// Cada entrada describe CÓMO conecta el bloque con el resto del sistema.

// Categoría de un tipo de bloque, para agrupar en el menú "Insertar".
export type BlockCategory = "texto" | "medios" | "red" | "herramientas";

export const BLOCK_CATEGORY_LABELS: Record<BlockCategory, string> = {
  texto: "Texto",
  medios: "Medios",
  red: "Red / Datos",
  herramientas: "Herramientas",
};

export const BLOCK_CATEGORY_ORDER: BlockCategory[] = [
  "texto",
  "medios",
  "red",
  "herramientas",
];

export type BlockKindDef = {
  kind: BlockKind;
  label: string;
  icon: string; // nombre de icono lucide-react (resuelto en el componente)
  blurb: string;
  connect: string; // cómo se conecta / configura
  category?: BlockCategory; // agrupación para el menú "Insertar"
};

export const BLOCK_KINDS: BlockKindDef[] = [
  {
    kind: "text",
    category: "texto",
    label: "Texto / Nota",
    icon: "Type",
    blurb: "Escribe ideas, markdown o notas libres directamente en el lienzo.",
    connect: "Editor de texto en el propio bloque.",
  },
  {
    kind: "file",
    category: "medios",
    label: "Archivo",
    icon: "FileText",
    blurb: "Conecta un archivo subido o accesible por URL.",
    connect: "Sube un archivo o pega su URL.",
  },
  {
    kind: "vault",
    category: "red",
    label: "Baúl",
    icon: "Archive",
    blurb: "Enlaza un baúl de memorias y conexiones.",
    connect: "Selecciónalo desde tus baúles en Supabase.",
  },
  {
    kind: "memory",
    category: "red",
    label: "Memoria",
    icon: "Brain",
    blurb: "Trae el contenido de una memoria (soul/memory/dream/skills…).",
    connect: "Selecciónala desde tus memorias en Supabase.",
  },
  {
    kind: "app",
    category: "herramientas",
    label: "App / Programa",
    icon: "AppWindow",
    blurb: "Conecta una app o programa del sistema con su configuración.",
    connect: "Indica nombre + configuración (ruta, comando, params).",
  },
  {
    kind: "link",
    category: "red",
    label: "Enlace",
    icon: "Link2",
    blurb: "Cualquier enlace interno o externo como tarjeta.",
    connect: "Pega la URL.",
  },
  {
    kind: "widget",
    category: "herramientas",
    label: "Widget",
    icon: "LayoutGrid",
    blurb: "Inserta un widget del sistema con sus parámetros.",
    connect: "Indica nombre del widget + configuración.",
  },
  {
    kind: "browser",
    category: "medios",
    label: "Navegador",
    icon: "Globe",
    blurb: "Embebe una ventana del navegador (web incrustable) en un iframe.",
    connect: "Pega una URL embebible. Algunos sitios bloquean el embebido.",
  },
  {
    kind: "image",
    category: "medios",
    label: "Imagen",
    icon: "Image",
    blurb: "Muestra una imagen por URL.",
    connect: "Pega la URL de la imagen.",
  },
];

export function blockKindDef(kind: BlockKind): BlockKindDef | undefined {
  return BLOCK_KINDS.find((b) => b.kind === kind);
}

// ---- Utilidades ------------------------------------------------------------

export function genId(prefix = "blk"): string {
  return (
    prefix +
    "_" +
    Math.random().toString(36).slice(2, 9) +
    Date.now().toString(36).slice(-4)
  );
}

// Tamaño/posición por defecto de un bloque recién creado, escalonado para que
// no se solapen perfectamente.
export function defaultBlock(kind: BlockKind, index = 0): CanvasBlock {
  const def = blockKindDef(kind);
  return {
    id: genId(),
    kind,
    x: 40 + (index % 5) * 36,
    y: 40 + (index % 5) * 36,
    w: kind === "browser" || kind === "image" ? 360 : 280,
    h: kind === "browser" ? 260 : kind === "text" ? 180 : 200,
    data: {},
    title: def?.label,
  };
}

// Resumen legible de un lienzo (para previews y publicación).
export function summarizeCanvas(canvas: Canvas): string {
  const counts = new Map<BlockKind, number>();
  // El bloque especial `cover` (portada) no cuenta como contenido del lienzo.
  const content = (canvas.blocks || []).filter((b) => b.kind !== "cover");
  for (const b of content) {
    counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([k, n]) => {
    const def = blockKindDef(k);
    return `${n} ${def?.label ?? k}`;
  });
  const total = content.length;
  return parts.length
    ? `${total} bloque${total === 1 ? "" : "s"}: ${parts.join(", ")}`
    : "Lienzo vacío";
}

// ---- Tarjeta de Previsualización (portada obligatoria) --------------------
// El Lienzo Universal (Módulo 5 · sección D) exige una "Tarjeta de
// Previsualización" como portada de la publicación. No hay columna dedicada, así
// que la modelamos como un BLOQUE ESPECIAL de tipo `cover` que vive dentro de
// `blocks` (jsonb que ya se persiste). Convención: como mucho UN bloque cover
// por lienzo; no se dibuja en la superficie del lienzo (lo filtra el tablero) y
// no aparece en el menú "Insertar".

export const COVER_BLOCK_ID = "cover_card";

export type CanvasCover = {
  title: string;
  subtitle?: string;
  image?: string; // URL de imagen de portada
  accent?: string; // color/acento
};

// Devuelve el bloque cover (portada) del lienzo, si existe.
export function getCoverBlock(canvas: Canvas): CanvasBlock | undefined {
  return (canvas.blocks || []).find((b) => b.kind === "cover");
}

// Extrae la Tarjeta de Previsualización (portada) del lienzo, o null si no hay.
export function getCover(canvas: Canvas): CanvasCover | null {
  const blk = getCoverBlock(canvas);
  if (!blk) return null;
  const d = blk.data || {};
  return {
    title: typeof d.title === "string" ? d.title : "",
    subtitle: typeof d.subtitle === "string" ? d.subtitle : "",
    image: typeof d.image === "string" ? d.image : "",
    accent: typeof d.accent === "string" ? d.accent : "",
  };
}

// ¿Tiene el lienzo una portada VÁLIDA? (al menos un título no vacío). Gate de
// publicación: sin esto no se permite publicar.
export function hasCover(canvas: Canvas): boolean {
  const c = getCover(canvas);
  return !!c && !!c.title && c.title.trim().length > 0;
}

// Inserta o actualiza la Tarjeta de Previsualización del lienzo (aditivo,
// inmutable). El bloque cover se mantiene SIEMPRE como primer elemento del
// array para una convención estable.
export function setCover(canvas: Canvas, cover: CanvasCover): Canvas {
  const rest = (canvas.blocks || []).filter((b) => b.kind !== "cover");
  const existing = getCoverBlock(canvas);
  const coverBlock: CanvasBlock = {
    id: existing?.id || COVER_BLOCK_ID,
    kind: "cover",
    x: existing?.x ?? 0,
    y: existing?.y ?? 0,
    w: existing?.w ?? 360,
    h: existing?.h ?? 200,
    title: "Tarjeta de Previsualización",
    data: {
      title: cover.title || "",
      subtitle: cover.subtitle || "",
      image: cover.image || "",
      accent: cover.accent || "",
    },
  };
  return { ...canvas, blocks: [coverBlock, ...rest] };
}

// Quita la portada del lienzo (raramente necesario; mantenida por simetría).
export function clearCover(canvas: Canvas): Canvas {
  return { ...canvas, blocks: (canvas.blocks || []).filter((b) => b.kind !== "cover") };
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

export function newCanvas(title: string, scope = "account", scopeRef: string | null = null): Canvas {
  return {
    id: "",
    owner: null,
    scope,
    scope_ref: scopeRef,
    title: title || "Lienzo sin título",
    blocks: [],
    shared: false,
  };
}

export async function listCanvases(): Promise<Canvas[]> {
  try {
    const sb = createClient();
    const uid = await currentUserId(sb);
    if (!uid) return [];
    const { data, error } = await sb
      .from("canvases")
      .select("*")
      .eq("owner", uid)
      .order("updated_at", { ascending: false });
    if (error) return [];
    return (data as Canvas[])?.map(normalizeCanvas) ?? [];
  } catch {
    return [];
  }
}

export async function getCanvas(id: string): Promise<Canvas | null> {
  if (!id) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb.from("canvases").select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return normalizeCanvas(data as Canvas);
  } catch {
    return null;
  }
}

// Inserta (si no tiene id) o actualiza el lienzo. Devuelve el lienzo persistido
// (con id) o null ante fallo.
export async function saveCanvas(c: Canvas): Promise<Canvas | null> {
  try {
    const sb = createClient();
    const uid = await currentUserId(sb);
    if (!uid) return null;

    const payload = {
      owner: uid,
      scope: c.scope || "account",
      scope_ref: c.scope_ref ?? null,
      title: c.title || "Lienzo sin título",
      blocks: c.blocks ?? [],
      shared: !!c.shared,
      updated_at: new Date().toISOString(),
    };

    if (c.id) {
      const { data, error } = await sb
        .from("canvases")
        .update(payload)
        .eq("id", c.id)
        .select("*")
        .maybeSingle();
      if (error || !data) return null;
      return normalizeCanvas(data as Canvas);
    }

    const { data, error } = await sb
      .from("canvases")
      .insert(payload)
      .select("*")
      .maybeSingle();
    if (error || !data) return null;
    return normalizeCanvas(data as Canvas);
  } catch {
    return null;
  }
}

export async function deleteCanvas(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const sb = createClient();
    const { error } = await sb.from("canvases").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

// ---- Datos de referencia (para los selectores de bloque) -------------------

export type VaultRef = { id: string; name: string };
export type MemoryRef = { id: string; name: string; content?: string };

export async function listVaults(): Promise<VaultRef[]> {
  try {
    const sb = createClient();
    const uid = await currentUserId(sb);
    if (!uid) return [];
    const { data } = await sb.from("vaults").select("id,name").eq("owner", uid);
    return (data as VaultRef[]) ?? [];
  } catch {
    return [];
  }
}

export async function listMemories(): Promise<MemoryRef[]> {
  try {
    const sb = createClient();
    const uid = await currentUserId(sb);
    if (!uid) return [];
    const { data } = await sb
      .from("memories")
      .select("id,name,content")
      .eq("owner", uid)
      .order("created_at", { ascending: false });
    return (data as MemoryRef[]) ?? [];
  } catch {
    return [];
  }
}

// ---- Publicación / compartir ----------------------------------------------

// Publicación inmediata: inserta una fila en `posts` con el lienzo.
export async function publishCanvasAsPost(
  canvas: Canvas,
  opts: { visibility?: string } = {},
): Promise<{ ok: boolean; detail: string; postId?: string }> {
  try {
    const sb = createClient();
    const uid = await currentUserId(sb);
    if (!uid) return { ok: false, detail: "Inicia sesión para publicar." };

    const content = {
      title: canvas.title,
      blocks: canvas.blocks ?? [],
      summary: summarizeCanvas(canvas),
    };

    const { data, error } = await sb
      .from("posts")
      .insert({
        author_id: uid,
        type: "canvas",
        content,
        visibility: opts.visibility || "public",
      })
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, detail: error.message };
    return { ok: true, detail: "Lienzo publicado", postId: (data as { id?: string })?.id };
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? "Error al publicar el lienzo." };
  }
}

// Referencia compartible (para adjuntar a posts / mensajes / propuestas).
export function attachTo(canvas: Canvas): CanvasShareRef {
  return {
    type: "canvas",
    canvasId: canvas.id,
    title: canvas.title,
    blocks: canvas.blocks?.length ?? 0,
    shared: !!canvas.shared,
    summary: summarizeCanvas(canvas),
  };
}

// ---- internos --------------------------------------------------------------

function normalizeCanvas(row: Canvas): Canvas {
  let blocks: CanvasBlock[] = [];
  const raw = (row as any).blocks;
  if (Array.isArray(raw)) {
    blocks = raw as CanvasBlock[];
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) blocks = parsed;
    } catch {
      blocks = [];
    }
  }
  return {
    id: row.id,
    owner: row.owner ?? null,
    scope: row.scope || "account",
    scope_ref: row.scope_ref ?? null,
    title: row.title || "Lienzo sin título",
    blocks,
    shared: !!row.shared,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
