"use client";

/**
 * ORGANIZADOR INTELIGENTE (Adenda 63 §14 — inspirado en Mouzi, hsr88/mouzi)
 * ------------------------------------------------------------------------
 * Dado un listado de ítems {id, name, kind/mime, updatedAt, folder?} genera un
 * PLAN de organización {moves, newFolders, reasoning} SIN aplicar nada: la UI
 * lo muestra, el usuario marca/desmarca movimientos y confirma.
 *
 * Estrategia en dos niveles:
 *   1) Astraura (si hay inteligencia disponible): prompt en español que pide
 *      SOLO JSON con la estructura propuesta. Con timeout y validación dura.
 *   2) FALLBACK heurístico DETERMINISTA (siempre funciona, offline):
 *      por tipo → Imágenes/Documentos/Audio/Vídeo/Código/Comprimidos;
 *      y además por año (subcarpetas "Tipo/AAAA") si hay >50 ítems.
 *
 * Contrato: nunca lanza; siempre devuelve un plan (posiblemente vacío).
 * Las carpetas usan "/" para anidar (el aplicador crea la jerarquía real).
 */

import { astrauraChat } from "@/ai/astraura/router";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface OrganizerItem {
  id: string;
  name: string;
  /** Tipo lógico del ítem ("file", "post", "bookmark", "image"…), si se conoce. */
  kind?: string;
  /** MIME ("image/png"…), si se conoce. */
  mime?: string;
  /** ISO date de última actualización/guardado. */
  updatedAt?: string;
  /** Nombre (o ruta "A/B") de la carpeta actual; null/"" = raíz. */
  folder?: string | null;
}

export interface OrganizeMove {
  id: string;
  /** Carpeta destino; admite ruta anidada con "/" (p.ej. "Imágenes/2025"). */
  toFolder: string;
}

export interface OrganizePlan {
  moves: OrganizeMove[];
  /** Carpetas (rutas) que habría que crear porque no existen todavía. */
  newFolders: string[];
  /** Explicación en español del criterio aplicado. */
  reasoning: string;
  /** Quién generó el plan. */
  source: "astraura" | "heuristica";
}

export interface OrganizeOptions {
  /** Intentar Astraura primero (por defecto true). false = solo heurística. */
  useAI?: boolean;
  /** Nombres/rutas de carpetas YA existentes (para calcular newFolders). */
  existingFolders?: string[];
  /** Señal de cancelación para la llamada a Astraura. */
  signal?: AbortSignal;
}

/* ------------------------------------------------------------------ */
/* Heurística determinista                                             */
/* ------------------------------------------------------------------ */

const EXT_CATEGORIES: Array<{ folder: string; exts: string[]; mimePrefix?: string[] }> = [
  {
    folder: "Imágenes",
    exts: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "heic", "heif", "bmp", "ico", "tiff", "raw"],
    mimePrefix: ["image/"],
  },
  {
    folder: "Vídeo",
    exts: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "wmv", "flv", "mpg", "mpeg"],
    mimePrefix: ["video/"],
  },
  {
    folder: "Audio",
    exts: ["mp3", "wav", "ogg", "m4a", "flac", "aac", "opus", "wma", "mid", "midi"],
    mimePrefix: ["audio/"],
  },
  {
    folder: "Documentos",
    exts: [
      "pdf", "doc", "docx", "txt", "md", "rtf", "odt", "xls", "xlsx", "csv", "tsv",
      "ppt", "pptx", "pages", "numbers", "key", "epub", "odp", "ods",
    ],
    mimePrefix: ["application/pdf", "text/plain", "text/markdown"],
  },
  {
    folder: "Código",
    exts: [
      "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp",
      "css", "scss", "html", "json", "yml", "yaml", "toml", "sh", "zsh", "sql", "swift",
      "kt", "php", "ipynb", "vue", "svelte",
    ],
    mimePrefix: ["text/javascript", "application/json", "text/html", "text/css"],
  },
  {
    folder: "Comprimidos",
    exts: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "dmg", "iso", "apk", "ipa"],
    mimePrefix: ["application/zip", "application/x-tar", "application/gzip"],
  },
];

function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec((name || "").trim());
  return m ? m[1].toLowerCase() : "";
}

/** Categoría heurística de un ítem, o null si no se reconoce (no se mueve). */
export function categorizeItem(item: OrganizerItem): string | null {
  try {
    const mime = (item.mime || "").toLowerCase();
    const kind = (item.kind || "").toLowerCase();
    if (mime) {
      for (const c of EXT_CATEGORIES) {
        if ((c.mimePrefix ?? []).some((p) => mime.startsWith(p))) return c.folder;
      }
    }
    const ext = extOf(item.name);
    if (ext) {
      for (const c of EXT_CATEGORIES) {
        if (c.exts.includes(ext)) return c.folder;
      }
    }
    // Tipos lógicos de la Biblioteca sin extensión clara:
    if (kind === "image") return "Imágenes";
    if (kind === "video") return "Vídeo";
    if (kind === "audio") return "Audio";
    return null;
  } catch {
    return null;
  }
}

function yearOf(iso?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const y = new Date(t).getFullYear();
  return y >= 1990 && y <= 2100 ? String(y) : null;
}

function normFolder(f?: string | null): string {
  return (f ?? "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();
}

/** Plan determinista: por tipo, y por año dentro del tipo si hay >50 ítems. */
export function heuristicOrganizePlan(items: OrganizerItem[], opts?: OrganizeOptions): OrganizePlan {
  const moves: OrganizeMove[] = [];
  const byYear = items.length > 50;
  try {
    for (const it of items) {
      if (!it?.id) continue;
      const cat = categorizeItem(it);
      if (!cat) continue; // conservador: lo no reconocido se queda donde está
      const year = byYear ? yearOf(it.updatedAt) : null;
      const target = year ? `${cat}/${year}` : cat;
      const current = normFolder(it.folder);
      // Ya está bien colocado (misma carpeta exacta o ya dentro de la categoría destino).
      if (current === normFolder(target) || (!year && current.startsWith(`${normFolder(cat)}`) && current !== "")) continue;
      moves.push({ id: it.id, toFolder: target });
    }
  } catch {
    /* nunca lanza */
  }
  const existing = new Set((opts?.existingFolders ?? []).map(normFolder));
  const newFolders = Array.from(new Set(moves.map((m) => m.toFolder))).filter((f) => !existing.has(normFolder(f)));
  const reasoning = moves.length
    ? `Plan heurístico determinista: agrupa por tipo de archivo (Imágenes, Documentos, Audio, Vídeo, Código, Comprimidos)${byYear ? " y, al haber más de 50 ítems, por año dentro de cada tipo" : ""}. Los ítems no reconocidos se quedan donde están.`
    : "Nada que organizar: los ítems reconocibles ya están en su sitio (o no hay tipos reconocibles).";
  return { moves, newFolders, reasoning, source: "heuristica" };
}

/* ------------------------------------------------------------------ */
/* Plan con Astraura (JSON estricto, validado, con fallback)           */
/* ------------------------------------------------------------------ */

const MAX_AI_ITEMS = 150;
const AI_TIMEOUT_MS = 25_000;

function buildPrompt(items: OrganizerItem[], existingFolders: string[]): string {
  const lines = items.slice(0, MAX_AI_ITEMS).map((it) => {
    const parts = [
      `id=${it.id}`,
      `nombre=${(it.name || "").slice(0, 80)}`,
      it.kind ? `tipo=${it.kind}` : "",
      it.mime ? `mime=${it.mime}` : "",
      yearOf(it.updatedAt) ? `año=${yearOf(it.updatedAt)}` : "",
      it.folder ? `carpeta_actual=${String(it.folder).slice(0, 60)}` : "carpeta_actual=(raíz)",
    ].filter(Boolean);
    return `- ${parts.join(" · ")}`;
  });
  return [
    "Eres el organizador inteligente de la Biblioteca de StarSeed OS (inspirado en Mouzi).",
    "Tu tarea: proponer una estructura de carpetas clara en ESPAÑOL y a qué carpeta mover cada ítem (por tipo, tema o fecha).",
    "",
    `Carpetas existentes: ${existingFolders.length ? existingFolders.join(", ") : "(ninguna)"}`,
    "Ítems:",
    ...lines,
    "",
    "Responde SOLO con un JSON válido, sin markdown ni texto extra, con esta forma exacta:",
    '{"movimientos":[{"id":"<id del ítem>","carpeta":"<nombre de carpeta>"}],"carpetas_nuevas":["<carpeta>"],"razonamiento":"<explicación breve en español>"}',
    "Reglas:",
    "- Usa nombres de carpeta cortos en español; \"/\" para subcarpetas (p.ej. \"Imágenes/2025\").",
    "- Máximo 12 carpetas distintas. Reutiliza las existentes cuando encajen.",
    "- NO incluyas ítems que ya están en una carpeta adecuada.",
    "- No inventes ids: usa exactamente los proporcionados.",
  ].join("\n");
}

function sanitizeFolder(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "").trim();
  if (!clean || clean.length > 60) return null;
  if (clean.split("/").length > 3) return null; // máx. 3 niveles
  return clean;
}

function parseAiPlan(text: string, items: OrganizerItem[], opts?: OrganizeOptions): OrganizePlan | null {
  try {
    let body = (text || "").trim();
    body = body.replace(/^```(?:json)?/i, "").replace(/```$/m, "").trim();
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(body.slice(start, end + 1)) as {
      movimientos?: Array<{ id?: unknown; carpeta?: unknown }>;
      carpetas_nuevas?: unknown[];
      razonamiento?: unknown;
    };
    if (!Array.isArray(parsed.movimientos)) return null;
    const validIds = new Map(items.map((it) => [it.id, it] as const));
    const seen = new Set<string>();
    const moves: OrganizeMove[] = [];
    for (const m of parsed.movimientos) {
      const id = typeof m?.id === "string" ? m.id : "";
      const folder = sanitizeFolder(m?.carpeta);
      if (!id || !folder || !validIds.has(id) || seen.has(id)) continue;
      const current = normFolder(validIds.get(id)?.folder);
      if (current === normFolder(folder)) continue; // ya está ahí
      seen.add(id);
      moves.push({ id, toFolder: folder });
      if (moves.length >= items.length) break;
    }
    if (!moves.length) return null;
    const existing = new Set((opts?.existingFolders ?? []).map(normFolder));
    const newFolders = Array.from(new Set(moves.map((mv) => mv.toFolder))).filter((f) => !existing.has(normFolder(f)));
    const reasoning = typeof parsed.razonamiento === "string" && parsed.razonamiento.trim()
      ? parsed.razonamiento.trim().slice(0, 600)
      : "Plan propuesto por Astraura según tipo, tema y fecha de los ítems.";
    return { moves, newFolders, reasoning, source: "astraura" };
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Genera el PLAN de organización. Intenta Astraura (JSON estricto, validado);
 * ante cualquier fallo/timeout/JSON inválido cae a la heurística determinista.
 * Nunca lanza.
 */
export async function buildOrganizePlan(items: OrganizerItem[], opts?: OrganizeOptions): Promise<OrganizePlan> {
  const list = Array.isArray(items) ? items.filter((it) => it && typeof it.id === "string") : [];
  if (!list.length) {
    return { moves: [], newFolders: [], reasoning: "No hay ítems que organizar.", source: "heuristica" };
  }
  if (opts?.useAI !== false) {
    try {
      const prompt = buildPrompt(list, opts?.existingFolders ?? []);
      const res = await withTimeout(
        astrauraChat({
          messages: [
            { role: "system", content: "Eres un organizador de archivos. Respondes ÚNICAMENTE con JSON válido, nunca con texto adicional." },
            { role: "user", content: prompt },
          ],
          temperature: 0,
          maxTokens: 1600,
          signal: opts?.signal,
          taskHint: "code",
        }),
        AI_TIMEOUT_MS,
      );
      const plan = parseAiPlan(res?.text ?? "", list, opts);
      if (plan) return plan;
    } catch {
      /* cae a la heurística */
    }
  }
  return heuristicOrganizePlan(list, opts);
}
