/**
 * StarSeed OS — App Generator (Astraura)
 *
 * Núcleo del "Estudio de Apps con IA": un proyecto virtual multi-archivo
 * (árbol de archivos, formatos, carpetas) que Astraura genera y refina con IA,
 * con vista previa en vivo (iframe srcdoc), edición, exportación y guardado en
 * Supabase. Pensado para ser, dentro del navegador, lo más parecido posible a
 * Cursor / Claude Code / Antigravity: generar apps con IA, con libertad de
 * archivos, conexiones y plugins — siendo honestos sobre los límites del
 * preview client-side (HTML/CSS/JS + React vía CDN; no es un IDE de servidor ni
 * un deploy real: exporta para ejecutar donde quieras).
 *
 * SSR-safe: ninguna referencia a `window` a nivel de módulo. Las descargas y la
 * vista previa se construyen bajo demanda en el cliente.
 */

import { createClient } from "@/utils/supabase/client";
import { chat } from "@/ai/client/chat";
import type { ChatMessage } from "@/ai/providers/types";

// ────────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────────

export interface AppFile {
  /** Ruta relativa dentro del proyecto, p.ej. "index.html" o "css/app.css". */
  path: string;
  /** Contenido textual del archivo. */
  content: string;
  /** Lenguaje/formato (html, css, js, jsx, ts, json, md, txt, ...). */
  language: string;
}

export interface GeneratedApp {
  id: string;
  owner: string | null;
  name: string;
  files: AppFile[];
  meta: AppMeta;
  shared: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AppMeta {
  /** Última descripción/idea con la que se generó o refinó la app. */
  spec?: string;
  /** Notas que devuelve el modelo al generar. */
  notes?: string;
  /** Plugins / integraciones que el usuario quiere conectar (editable). */
  plugins?: string[];
  /** Conexiones declaradas (APIs, datos, servicios). */
  connections?: string[];
  /** Cualquier extra. */
  [k: string]: unknown;
}

export interface GenerateResult {
  files: AppFile[];
  notes: string;
}

export interface PublishRef {
  kind: "generated_app";
  id: string;
  name: string;
  fileCount: number;
  shared: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Utilidades de lenguaje / formato
// ────────────────────────────────────────────────────────────────────────────

const EXT_LANG: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  svg: "svg",
  xml: "xml",
  yml: "yaml",
  yaml: "yaml",
};

export function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "text";
}

export function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function uid(): string {
  // SSR-safe id (no crypto requerido).
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toLowerCase();
}

// ────────────────────────────────────────────────────────────────────────────
// Plantilla base + creación de proyectos
// ────────────────────────────────────────────────────────────────────────────

const STARTER_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mi app</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      display: grid; place-items: center; min-height: 100vh;
      background: radial-gradient(circle at 30% 20%, #1e293b, #0f172a);
      color: #e2e8f0;
    }
    .card {
      padding: 2rem 2.5rem; border-radius: 18px;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 20px 60px rgba(0,0,0,0.35); text-align: center; max-width: 28rem;
    }
    h1 { margin: 0 0 .5rem; font-size: 1.5rem; }
    p { margin: 0; color: #94a3b8; }
    button {
      margin-top: 1.25rem; padding: .6rem 1.2rem; border: 0; border-radius: 10px;
      background: linear-gradient(135deg, #6366f1, #a855f7); color: white;
      font-weight: 600; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Hola desde StarSeed</h1>
    <p>Describe tu app arriba y pulsa <b>Generar</b>. Astraura programa contigo.</p>
    <button onclick="this.textContent='✦ ' + new Date().toLocaleTimeString()">Probar</button>
  </div>
</body>
</html>`;

export function newApp(name = "Nueva app", owner: string | null = null): GeneratedApp {
  return {
    id: uid(),
    owner,
    name,
    files: [{ path: "index.html", content: STARTER_HTML, language: "html" }],
    meta: { spec: "", notes: "", plugins: [], connections: [] },
    shared: false,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Operaciones sobre archivos (puras)
// ────────────────────────────────────────────────────────────────────────────

export function editFile(files: AppFile[], path: string, content: string): AppFile[] {
  return files.map((f) => (f.path === path ? { ...f, content } : f));
}

export function addFile(files: AppFile[], path: string, content = ""): AppFile[] {
  const clean = path.trim().replace(/^\/+/, "");
  if (!clean) return files;
  if (files.some((f) => f.path === clean)) return files; // no duplicar
  return [...files, { path: clean, content, language: languageForPath(clean) }];
}

export function removeFile(files: AppFile[], path: string): AppFile[] {
  return files.filter((f) => f.path !== path);
}

export function renameFile(files: AppFile[], from: string, to: string): AppFile[] {
  const clean = to.trim().replace(/^\/+/, "");
  if (!clean || from === clean) return files;
  if (files.some((f) => f.path === clean)) return files;
  return files.map((f) =>
    f.path === from ? { ...f, path: clean, language: languageForPath(clean) } : f,
  );
}

function findFile(files: AppFile[], path: string): AppFile | undefined {
  return files.find((f) => f.path === path);
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt de generación + parseo tolerante
// ────────────────────────────────────────────────────────────────────────────

/**
 * Construye la instrucción para el modelo. Le pedimos SIEMPRE devolver un único
 * objeto JSON `{ "files": [{path, content, language}], "notes": "" }` para una
 * app web pequeña y autocontenida. Preferimos un `index.html` único con CSS/JS
 * inline (o React + Babel vía CDN para apps React), o pocos archivos. Se permite
 * CDN (cdnjs / unpkg). El preview corre client-side, así que nada de backend.
 */
export function genPrompt(spec: string, files: AppFile[] = []): ChatMessage[] {
  const hasFiles = files.length > 0;
  const ctx = hasFiles
    ? "\n\nARCHIVOS ACTUALES DEL PROYECTO (refina/edita sobre estos; devuelve el conjunto completo y final de archivos, no diffs):\n" +
      files
        .map((f) => `--- ${f.path} (${f.language}) ---\n${truncate(f.content, 6000)}`)
        .join("\n\n")
    : "";

  const system =
    "Eres Astraura, la IA que programa apps web junto a la persona dentro de StarSeed OS " +
    "(un estudio en el navegador estilo Cursor / Claude Code). Generas APLICACIONES WEB PEQUEÑAS, " +
    "COMPLETAS y AUTOCONTENIDAS que deben funcionar en un iframe sin backend.\n\n" +
    "REGLAS DE SALIDA — OBLIGATORIO:\n" +
    "1) Responde EXCLUSIVAMENTE con UN objeto JSON válido. Sin texto antes ni después, sin markdown, sin ```.\n" +
    '2) Forma EXACTA: {"files":[{"path":"index.html","content":"...","language":"html"}],"notes":"explicación breve en español"}.\n' +
    '3) "content" es el archivo COMPLETO como string (escapa comillas y saltos de línea correctamente en JSON).\n' +
    "4) PREFIERE un único index.html con CSS y JS inline. Si necesitas varios archivos, usa rutas relativas " +
    "(p.ej. css/app.css, js/app.js) y enlázalos desde index.html con <link>/<script src>.\n" +
    "5) Para apps React: UN solo index.html con React + ReactDOM + Babel Standalone vía CDN (unpkg/cdnjs) y " +
    'un <script type="text/babel"> con el componente. NO uses imports de npm ni bundlers.\n' +
    "6) Nada de procesos de servidor, Node, ni fetch a APIs privadas. CDN público permitido (cdnjs, unpkg).\n" +
    "7) Diseño limpio, responsive, con buen contraste. Comenta el código lo justo.\n" +
    "8) Si refinas un proyecto existente, MANTÉN lo que funciona y aplica solo lo pedido, devolviendo TODOS los archivos.";

  const user =
    `Crea (o refina) esta app web:\n\n"${spec.trim() || "una app de demostración simple y bonita"}"` +
    ctx +
    "\n\nDevuelve ahora SOLO el JSON con los archivos finales.";

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "\n/* …truncado… */" : s;
}

/**
 * Extrae y parsea el JSON `{files, notes}` de una respuesta que puede venir con
 * ruido: fences ```json, texto antes/después, o el objeto directamente.
 */
export function parseGenerated(raw: string): GenerateResult {
  const text = (raw ?? "").trim();
  let jsonStr = text;

  // 1) Quitar fences ```...```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    jsonStr = fence[1].trim();
  } else {
    // 2) Recortar al primer { … último } (heurística simple).
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      jsonStr = text.slice(first, last + 1);
    }
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // 3) Reintento: limpieza mínima (comas finales, BOM).
    try {
      const repaired = jsonStr.replace(/,\s*([}\]])/g, "$1").replace(/^﻿/, "");
      parsed = JSON.parse(repaired);
    } catch {
      parsed = null;
    }
  }

  if (!parsed || !Array.isArray(parsed.files)) {
    // 4) Fallback honesto: si no hubo JSON usable pero hay HTML, lo envolvemos.
    if (/<html|<!doctype|<body|<div/i.test(text)) {
      return {
        files: [{ path: "index.html", content: text, language: "html" }],
        notes:
          "El modelo no devolvió JSON válido; se usó la respuesta como index.html. Pídele a Astraura que reformatee si hace falta.",
      };
    }
    throw new Error(
      "No pude interpretar la respuesta del modelo como un proyecto de archivos. Intenta de nuevo o reformula la idea.",
    );
  }

  const files: AppFile[] = (parsed.files as any[])
    .filter((f) => f && typeof f.path === "string" && typeof f.content === "string")
    .map((f) => ({
      path: String(f.path).trim().replace(/^\/+/, ""),
      content: String(f.content),
      language:
        typeof f.language === "string" && f.language
          ? f.language
          : languageForPath(String(f.path)),
    }));

  if (!files.length) {
    throw new Error("El modelo devolvió un proyecto sin archivos válidos.");
  }

  return { files, notes: typeof parsed.notes === "string" ? parsed.notes : "" };
}

// ────────────────────────────────────────────────────────────────────────────
// Generación con IA (mismo patrón chat() que el resto de la app)
// ────────────────────────────────────────────────────────────────────────────

export interface GenerateOptions {
  signal?: AbortSignal;
  onChunk?: (delta: string) => void;
}

/**
 * Llama al modelo con `genPrompt` y devuelve `{files, notes}`. Tolerante a JSON
 * ruidoso. `currentFiles` permite refinar (Refinar) usando el proyecto actual
 * como contexto.
 */
export async function generate(
  spec: string,
  currentFiles: AppFile[] = [],
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const messages = genPrompt(spec, currentFiles);
  const r = await chat({
    messages,
    temperature: 0.3,
    signal: opts.signal,
    onChunk: opts.onChunk,
  });
  return parseGenerated(r.text);
}

// ────────────────────────────────────────────────────────────────────────────
// Construcción del preview (srcdoc para iframe)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Produce el HTML (string) para `iframe.srcdoc`.
 *  - Si hay un index.html (o cualquier *.html), inyecta inline el contenido de
 *    los <link rel="stylesheet" href="..."> y <script src="..."> que apunten a
 *    otros archivos del proyecto (resolución simple por ruta).
 *  - Si no hay HTML, envuelve el par JS/CSS encontrado en una página mínima.
 */
export function buildPreview(files: AppFile[]): string {
  if (!files.length) {
    return "<!doctype html><meta charset='utf-8'><body style='font-family:system-ui;color:#94a3b8;background:#0f172a;display:grid;place-items:center;height:100vh;margin:0'>Proyecto vacío — genera o crea un archivo.</body>";
  }

  const htmlFile =
    findFile(files, "index.html") || files.find((f) => f.path.toLowerCase().endsWith(".html"));

  if (htmlFile) {
    return inlineHtml(htmlFile.content, files);
  }

  // Sin HTML: ensamblar CSS + JS en una página mínima.
  const css = files
    .filter((f) => f.path.toLowerCase().endsWith(".css"))
    .map((f) => f.content)
    .join("\n\n");
  const js = files
    .filter((f) => /\.(js|mjs|jsx)$/i.test(f.path))
    .map((f) => f.content)
    .join("\n\n");

  return (
    "<!doctype html><html><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
    (css ? `<style>\n${css}\n</style>` : "") +
    "</head><body>" +
    (js ? `<script>\n${js}\n</script>` : "") +
    "</body></html>"
  );
}

/** Normaliza una ruta href/src relativa para casarla con f.path. */
function normalizeRef(ref: string): string {
  return ref
    .trim()
    .replace(/^\.?\//, "") // ./x  ó /x  -> x
    .replace(/[?#].*$/, "") // quita query/hash
    .replace(/^\/+/, "");
}

function inlineHtml(html: string, files: AppFile[]): string {
  let out = html;

  // Inline de <link rel="stylesheet" href="archivo.css"> (rutas locales).
  out = out.replace(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi, (full, href: string) => {
    if (/^(https?:)?\/\//i.test(href) || href.startsWith("data:")) return full; // CDN/externo
    const target = files.find((f) => normalizeRef(f.path) === normalizeRef(href));
    if (target && /stylesheet/i.test(full)) {
      return `<style data-from="${escapeAttr(href)}">\n${target.content}\n</style>`;
    }
    return full;
  });

  // Inline de <script src="archivo.js"> (rutas locales). Conserva type (p.ej. text/babel).
  out = out.replace(
    /<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (full, pre: string, src: string, post: string) => {
      if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return full; // CDN/externo
      const target = files.find((f) => normalizeRef(f.path) === normalizeRef(src));
      if (!target) return full;
      const attrs = `${pre} ${post}`.replace(/\s+/g, " ").trim();
      const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/i);
      const typeAttr = typeMatch ? ` type="${escapeAttr(typeMatch[1])}"` : "";
      return `<script${typeAttr} data-from="${escapeAttr(src)}">\n${target.content}\n</script>`;
    },
  );

  return out;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ────────────────────────────────────────────────────────────────────────────
// CRUD en Supabase (tabla generated_apps)
// ────────────────────────────────────────────────────────────────────────────

const TABLE = "generated_apps";

async function currentOwner(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Lista las apps del usuario (más recientes primero). */
export async function listApps(): Promise<GeneratedApp[]> {
  const supabase = createClient();
  const owner = await currentOwner();
  let q = supabase.from(TABLE).select("*").order("updated_at", { ascending: false });
  if (owner) q = q.eq("owner", owner);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(normalizeRow);
}

/** Carga una app por id. */
export async function getApp(id: string): Promise<GeneratedApp | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
  if (error) {
    if ((error as any).code === "PGRST116") return null; // no rows
    throw error;
  }
  return data ? normalizeRow(data) : null;
}

/** Inserta o actualiza (upsert) una app y devuelve la versión persistida. */
export async function saveApp(app: GeneratedApp): Promise<GeneratedApp> {
  const supabase = createClient();
  const owner = app.owner ?? (await currentOwner());
  const now = new Date().toISOString();

  const row = {
    id: app.id,
    owner,
    name: app.name || "App sin título",
    files: app.files,
    meta: app.meta ?? {},
    shared: !!app.shared,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw error;
  return normalizeRow(data);
}

/** Borra una app por id. */
export async function deleteApp(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

function normalizeRow(row: any): GeneratedApp {
  const files: AppFile[] = Array.isArray(row?.files)
    ? row.files
        .filter((f: any) => f && typeof f.path === "string")
        .map((f: any) => ({
          path: f.path,
          content: typeof f.content === "string" ? f.content : "",
          language:
            typeof f.language === "string" && f.language ? f.language : languageForPath(f.path),
        }))
    : [];
  return {
    id: String(row?.id ?? uid()),
    owner: row?.owner ?? null,
    name: row?.name ?? "App sin título",
    files,
    meta: (row?.meta && typeof row.meta === "object" ? row.meta : {}) as AppMeta,
    shared: !!row?.shared,
    created_at: row?.created_at,
    updated_at: row?.updated_at,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Exportación + referencia para publicar
// ────────────────────────────────────────────────────────────────────────────

/** Descarga un blob como archivo (cliente). SSR-guard incluido. */
function download(filename: string, content: string, mime = "text/plain") {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeFilename(name: string, fallback = "app"): string {
  const base = (name || fallback)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || fallback;
}

/**
 * Exporta la app:
 *  - Si es de un solo archivo HTML (resuelto/inline), descarga un index.html
 *    combinado y listo para abrir en cualquier navegador.
 *  - Si tiene varios archivos, descarga un bundle .json (todos los archivos) +
 *    cada archivo por separado.
 */
export function exportApp(app: GeneratedApp): void {
  const slug = safeFilename(app.name);
  const htmlFiles = app.files.filter((f) => f.path.toLowerCase().endsWith(".html"));
  const isSingleFile =
    app.files.length === 1 ||
    (htmlFiles.length === 1 && app.files.every((f) => f.path.toLowerCase().endsWith(".html")));

  if (isSingleFile && htmlFiles.length >= 1) {
    // index.html combinado (con assets locales inyectados inline).
    const combined = buildPreview(app.files);
    download(`${slug || "index"}.html`, combined, "text/html");
    return;
  }

  // Bundle JSON + cada archivo.
  const bundle = {
    name: app.name,
    meta: app.meta ?? {},
    files: app.files,
    exportedAt: new Date().toISOString(),
  };
  download(`${slug}-bundle.json`, JSON.stringify(bundle, null, 2), "application/json");
  for (const f of app.files) {
    download(basename(f.path), f.content, "text/plain");
  }
}

/** Referencia ligera para adjuntar a un post o al canvas. */
export function publishRef(app: GeneratedApp): PublishRef {
  return {
    kind: "generated_app",
    id: app.id,
    name: app.name,
    fileCount: app.files.length,
    shared: !!app.shared,
  };
}
