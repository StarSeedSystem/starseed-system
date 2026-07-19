"use client";

/**
 * StarSeed OS — ADJUNTOS de chat de Aurora/Astraura (Agente S1)
 * ============================================================================
 * Capa fina y COMPARTIDA para adjuntar archivos a los mensajes de la
 * conversación unificada (`astraura_messages.attachments`), en TODAS las
 * superficies (Exocórtex, `/agent` Nexus y mini-reproductor de la orbe).
 *
 * Reutiliza la infraestructura REAL que ya existe:
 *   · `UniversalAttachment` + `uploadFile` + `humanFileSize` de os-files.ts
 *     (bucket `os-files`, RLS por dueño) — es lo que usa el picker universal.
 *   · Si por lo que sea no hay subida disponible, `fileToInlineAttachment`
 *     guarda el archivo INLINE en base64 SÓLO si es ≤200KB (sin DDL: cabe en
 *     el jsonb `attachments`); para tamaños mayores se referencia por nombre.
 *
 * Además compone el CONTEXTO para el modelo: si el adjunto es texto legible
 * (md/txt/json/csv/código… ≤64KB) se inserta su contenido en el turno, marcado
 * claramente; si no, sólo su nombre + tipo + tamaño.
 *
 * Filosofía del repo: SSR-safe, nunca lanza, degrada con gracia.
 */

import { humanFileSize, type UniversalAttachment } from "@/lib/files/os-files";

export type { UniversalAttachment };
export { humanFileSize };

/** Límite para guardar un adjunto INLINE (base64) en el jsonb, sin subida ni DDL. */
export const MAX_INLINE_ATTACH_BYTES = 200 * 1024; // 200KB
/** Límite del contenido de texto legible que se inyecta al modelo por adjunto. */
export const MAX_TEXT_CONTEXT_BYTES = 64 * 1024; // 64KB

// Extensiones y mimes que consideramos "texto legible" (se inyectan al modelo).
const TEXT_EXTS = new Set([
  "txt", "md", "markdown", "mdx", "json", "csv", "tsv", "log", "yml", "yaml",
  "xml", "html", "htm", "css", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py",
  "sh", "bash", "rs", "go", "java", "c", "h", "cpp", "hpp", "cc", "rb", "php",
  "toml", "ini", "env", "sql", "svg", "srt", "vtt",
]);
const TEXT_MIME_RE =
  /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|ecmascript|x-sh|sql|csv|x-www-form-urlencoded)|image\/svg\+xml)/i;

/** Forma laxa de un adjunto (lo que llega en `AiMessage.attachments`, jsonb). */
export interface LooseAttachment {
  kind?: string;
  name?: string;
  mime?: string;
  url?: string;
  size?: number;
  fileId?: string;
  refKind?: string;
  refId?: string;
  route?: string;
  /** Data URL base64 inline (fallback ≤200KB). Compatible con `url`. */
  dataUrl?: string;
}

/** Extensión (minúsculas, sin punto) derivada del nombre o la url. */
export function attachmentExt(a: LooseAttachment | null | undefined): string {
  const src = (a?.name || a?.url || "").split("?")[0];
  const dot = src.lastIndexOf(".");
  if (dot < 0 || dot === src.length - 1) return "";
  return src.slice(dot + 1).toLowerCase();
}

/** ¿El adjunto es texto legible que conviene inyectar al modelo? */
export function isReadableTextAttachment(a: LooseAttachment | null | undefined): boolean {
  if (!a) return false;
  const mime = (a.mime || "").toLowerCase();
  if (mime && TEXT_MIME_RE.test(mime)) return true;
  if (mime.startsWith("image/") && mime !== "image/svg+xml") return false;
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return false;
  const ext = attachmentExt(a);
  return !!ext && TEXT_EXTS.has(ext);
}

/**
 * Normaliza el jsonb `attachments` (unknown[]) a `UniversalAttachment[]` seguro:
 * descarta lo que no tenga forma de adjunto (ni nombre ni url ni referencia).
 */
export function normalizeAttachments(
  raw: unknown[] | null | undefined,
): UniversalAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: UniversalAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as LooseAttachment;
    const url = a.url || a.dataUrl || a.route;
    if (!a.name && !url && !a.refId) continue;
    out.push({
      kind: (a.kind as UniversalAttachment["kind"]) || "file",
      name: a.name || "Adjunto",
      mime: a.mime,
      url: (url as string) || undefined,
      size: typeof a.size === "number" ? a.size : undefined,
      fileId: a.fileId,
      refKind: a.refKind,
      refId: a.refId,
      route: a.route,
    });
  }
  return out;
}

/** Etiqueta compacta de una lista de adjuntos ("archivo.pdf, foto.png" / "3 adjuntos"). */
export function summarizeAttachments(list: LooseAttachment[] | null | undefined): string {
  const items = normalizeAttachments(list as unknown[] | null | undefined);
  if (items.length === 0) return "";
  if (items.length <= 3) return items.map((a) => a.name || "adjunto").join(", ");
  return `${items.length} adjuntos`;
}

/**
 * Descarga el contenido de texto de un adjunto legible (≤64KB), best-effort.
 * Devuelve `null` si no es legible, no tiene url, o falla la red. Nunca lanza.
 */
export async function fetchAttachmentText(
  a: LooseAttachment | null | undefined,
): Promise<string | null> {
  if (typeof fetch === "undefined") return null;
  if (!a || !isReadableTextAttachment(a)) return null;
  const url = a.url || a.dataUrl || (a as { route?: string }).route;
  if (!url) return null;
  try {
    const res = await fetch(url as string);
    if (!res.ok) return null;
    const blob = await res.blob();
    const text = await blob.text();
    return text.length > MAX_TEXT_CONTEXT_BYTES
      ? `${text.slice(0, MAX_TEXT_CONTEXT_BYTES)}\n…[truncado a 64KB]`
      : text;
  } catch {
    return null;
  }
}

/**
 * Compone el bloque de CONTEXTO de adjuntos para el modelo. Para los legibles,
 * incluye su contenido (marcado); para el resto, sólo nombre + tipo + tamaño.
 * Cadena vacía si no hay adjuntos. Best-effort (los que fallen se citan por nombre).
 */
export async function buildAttachmentsContext(
  list: LooseAttachment[] | null | undefined,
): Promise<string> {
  const items = normalizeAttachments(list as unknown[] | null | undefined);
  if (items.length === 0) return "";
  const parts: string[] = [
    "ADJUNTOS DEL USUARIO EN ESTE MENSAJE (úsalos como referencia para tu respuesta):",
  ];
  for (const a of items) {
    const size = a.size ? `, ${humanFileSize(a.size)}` : "";
    const kind = a.mime || a.kind || "archivo";
    let line = `- ${a.name} (${kind}${size})${a.url ? ` · ${a.url}` : ""}`;
    if (isReadableTextAttachment(a)) {
      const text = await fetchAttachmentText(a);
      if (text && text.trim()) {
        line += `\nContenido de «${a.name}»:\n\`\`\`\n${text}\n\`\`\``;
      }
    }
    parts.push(line);
  }
  return parts.join("\n");
}

function kindOfMime(mime: string | null | undefined): UniversalAttachment["kind"] {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "file";
}

/**
 * Convierte un `File` del dispositivo en un adjunto INLINE (data URL base64),
 * SÓLO si es ≤200KB (cabe en el jsonb sin subida ni DDL). Devuelve `null` si es
 * mayor (el llamador debe subirlo por el picker/uploader o referenciarlo). Nunca lanza.
 */
export async function fileToInlineAttachment(
  file: File,
): Promise<UniversalAttachment | null> {
  if (typeof FileReader === "undefined") return null;
  if (!file || file.size > MAX_INLINE_ATTACH_BYTES) return null;
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("read-failed"));
      reader.readAsDataURL(file);
    });
    if (!dataUrl) return null;
    return {
      kind: kindOfMime(file.type),
      name: file.name,
      mime: file.type || undefined,
      size: file.size,
      url: dataUrl,
    };
  } catch {
    return null;
  }
}
