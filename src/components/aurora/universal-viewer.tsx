"use client";

/**
 * StarSeed OS — Aurora · VISOR UNIVERSAL de contenido en el chat
 * ============================================================================
 * Detecta referencias multimedia dentro del TEXTO de un mensaje (imágenes en
 * markdown `![alt](url)`, URLs http(s) directas y data:URIs con mime conocido)
 * y las pinta DEBAJO de la burbuja con el visor adecuado:
 *
 *   · image   → <img> (object-cover, clic = abrir en pestaña nueva)
 *   · video   → <video controls> · YouTube/youtu.be → iframe nocookie
 *   · audio   → <audio controls>
 *   · pdf     → <iframe> con botón «abrir»
 *   · model3d → <model-viewer> (script CDN cargado UNA sola vez, perezoso)
 *   · csv     → fetch + tabla simple (primeras 30 filas, comillas básicas)
 *   · code    → fetch + <pre> con scroll (json · md · txt)
 *   · link    → tarjeta-enlace SOLO para URLs con extensión no reconocida
 *
 * Los enlaces "normales" (sin extensión, páginas web corrientes) NO generan
 * visor. Reglas de la casa: defensivo (nunca lanza), SSR-safe, carga perezosa
 * (loading="lazy" + IntersectionObserver donde hay fetch), errores silenciosos
 * (si un fetch falla → tarjeta-enlace) y estética Crystal Liquid Glass
 * (bg-white/5 · border-white/10 · backdrop-blur).
 *
 * Se usa en el chat completo del Exocórtex (aurora-chat-view) y en el
 * mini-reproductor (aurora-mini-player) con `compact` para reducir alturas.
 */

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { Box, ExternalLink, FileText, Link2, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────────────────────────── Tipos ───────────────────────────── */

export type MediaKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "model3d"
  | "csv"
  | "code"
  | "link";

export interface MediaRef {
  kind: MediaKind;
  /** URL original tal cual aparece en el texto (clave de dedupe). */
  url: string;
  /** Texto alternativo (de la sintaxis markdown), si existía. */
  alt?: string;
  /** Extensión detectada (informativa, para cabeceras de tarjeta). */
  ext?: string;
  /** Solo vídeo: URL de embed (YouTube nocookie) si aplica. */
  embedUrl?: string;
}

/** Máximo de visores por mensaje (evita burbujas infinitas). */
const MAX_REFS = 6;

/* ─────────────────────── Clasificación de URLs ─────────────────────── */

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "m4a", "opus"]);
const MODEL_EXTS = new Set(["glb", "gltf"]);
const TEXT_EXTS = new Set(["json", "md", "txt"]);
/** Extensiones de "página web corriente": se tratan como enlace normal (sin visor). */
const PAGE_EXTS = new Set(["html", "htm", "php", "asp", "aspx", "jsp"]);

/** Extrae el id de vídeo de YouTube (watch?v= · youtu.be · shorts · embed). */
function youTubeId(u: URL): string | null {
  try {
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const okId = (id: string | undefined): id is string => !!id && /^[\w-]{6,}$/.test(id);
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return okId(id) ? id : null;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (okId(v ?? undefined)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "embed" || p === "shorts" || p === "v");
      const cand = idx >= 0 ? parts[idx + 1] : undefined;
      return okId(cand) ? cand : null;
    }
  } catch { /* silencioso */ }
  return null;
}

/** Recorta puntuación de prosa colgando al final de una URL capturada. */
function cleanUrl(raw: string): string {
  let url = (raw || "").trim();
  while (url && /[.,;:!?»›'"”’)]$/.test(url)) url = url.slice(0, -1);
  return url;
}

/** Clasifica UNA URL (http(s) o data:) → MediaRef, o null si no toca visor. */
function classifyUrl(url: string): MediaRef | null {
  try {
    if (!url) return null;

    // data:URIs — solo mimes conocidos.
    if (/^data:/i.test(url)) {
      const mime = url.slice(5).split(/[;,]/)[0].toLowerCase();
      if (mime.startsWith("image/")) return { kind: "image", url };
      if (mime.startsWith("audio/")) return { kind: "audio", url };
      if (mime.startsWith("video/")) return { kind: "video", url };
      if (mime === "application/pdf") return { kind: "pdf", url };
      if (mime.startsWith("model/")) return { kind: "model3d", url };
      return null;
    }

    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;

    // YouTube → vídeo con embed nocookie (no tiene extensión).
    const ytId = youTubeId(u);
    if (ytId) {
      return { kind: "video", url, embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}` };
    }

    const host = u.hostname.toLowerCase();
    const extMatch = /\.([a-z0-9]{1,8})$/.exec(u.pathname.toLowerCase());
    const ext = extMatch ? extMatch[1] : "";

    // Generadores de imagen sin extensión (Pollinations).
    if (host === "image.pollinations.ai") return { kind: "image", url };

    if (IMAGE_EXTS.has(ext)) return { kind: "image", url, ext };
    if (VIDEO_EXTS.has(ext)) return { kind: "video", url, ext };
    if (AUDIO_EXTS.has(ext)) return { kind: "audio", url, ext };
    if (ext === "pdf") return { kind: "pdf", url, ext };
    if (MODEL_EXTS.has(ext)) return { kind: "model3d", url, ext };
    if (ext === "csv") return { kind: "csv", url, ext };
    if (TEXT_EXTS.has(ext)) return { kind: "code", url, ext };

    if (!ext) return null; // enlace normal sin extensión → SIN visor
    if (PAGE_EXTS.has(ext)) return null; // páginas web corrientes → SIN visor
    return { kind: "link", url, ext }; // extensión desconocida → tarjeta-enlace
  } catch {
    return null;
  }
}

/**
 * Detecta las referencias multimedia de un texto: imágenes markdown, data:URIs
 * y URLs http(s) con extensión/host conocidos. Dedupe por URL, máx. 6.
 */
export function detectMediaRefs(text: string): MediaRef[] {
  try {
    if (!text || typeof text !== "string") return [];
    const src = text.length > 20_000 ? text.slice(0, 20_000) : text;
    const found = new Map<string, MediaRef>();
    const add = (ref: MediaRef | null): void => {
      if (!ref || found.size >= MAX_REFS || found.has(ref.url)) return;
      found.set(ref.url, ref);
    };

    // 1) Imágenes markdown ![alt](url) — la intención del autor es imagen.
    const MD_IMG_RX = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = MD_IMG_RX.exec(src)) && found.size < MAX_REFS) {
      const url = cleanUrl(m[2]);
      if (!url) continue;
      const ref = classifyUrl(url);
      if (ref && ref.kind !== "link") add({ ...ref, alt: m[1] || undefined });
      // Sin clasificar (p. ej. endpoint dinámico) pero el autor dijo «imagen».
      else if (/^(https?:|data:image\/)/i.test(url)) add({ kind: "image", url, alt: m[1] || undefined });
    }

    // 2) data:URIs con mime conocido.
    const DATA_RX = /\bdata:(?:image|audio|video|model|application)\/[a-z0-9.+-]+(?:;[a-z0-9=+-]+)*,[^\s"'<>)\]]+/gi;
    while ((m = DATA_RX.exec(src)) && found.size < MAX_REFS) add(classifyUrl(m[0]));

    // 3) URLs http(s) directas.
    const URL_RX = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
    while ((m = URL_RX.exec(src)) && found.size < MAX_REFS) add(classifyUrl(cleanUrl(m[0])));

    return Array.from(found.values());
  } catch {
    return [];
  }
}

/* ─────────────────── Utilidades de los visores ─────────────────── */

/** Nombre de archivo legible de una URL (para cabeceras de tarjeta). */
function fileName(url: string): string {
  try {
    const u = new URL(url);
    const base = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(base);
  } catch {
    return "";
  }
}

/**
 * Observa cuándo el elemento entra en el viewport (carga perezosa de los
 * visores que hacen fetch). Si no hay IntersectionObserver, carga directa.
 */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    try {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              setInView(true);
              try { io.disconnect(); } catch { /* */ }
              break;
            }
          }
        },
        { rootMargin: "160px" },
      );
      io.observe(el);
      return () => { try { io.disconnect(); } catch { /* */ } };
    } catch {
      setInView(true);
    }
  }, []);

  return [ref, inView] as const;
}

/** Carga el script de <model-viewer> UNA sola vez (type=module, CDN). */
let modelViewerPromise: Promise<boolean> | null = null;
function ensureModelViewer(): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(false);
  }
  try {
    if (window.customElements?.get("model-viewer")) return Promise.resolve(true);
  } catch { /* silencioso */ }
  if (modelViewerPromise) return modelViewerPromise;
  modelViewerPromise = new Promise<boolean>((resolve) => {
    try {
      const s = document.createElement("script");
      s.type = "module";
      s.async = true;
      s.src = "https://cdn.jsdelivr.net/npm/@google/model-viewer@4/dist/model-viewer.min.js";
      s.setAttribute("data-starseed-model-viewer", "1");
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    } catch {
      resolve(false);
    }
  });
  return modelViewerPromise;
}

/** Parser CSV mínimo (comillas básicas, sin dependencias). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } // comilla escapada ""
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/* ─────────────────── Piezas visuales compartidas ─────────────────── */

/** Marco cristal-líquido común de los visores. */
function GlassFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-md", className)}>
      {children}
    </div>
  );
}

/** Cabecera pequeña de tarjeta: icono + nombre + «abrir». */
function CardHead({ icon, label, url }: { icon: React.ReactNode; label: string; url: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-2.5 py-1.5">
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/70">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white/90"
        title="Abrir en una pestaña nueva"
      >
        abrir <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </div>
  );
}

/** Placeholder de carga (visores con fetch). */
function LoadingHint({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center px-3 py-4 text-[10px] text-white/40">
      {label}
    </div>
  );
}

/** Tarjeta-enlace: fallback genérico (extensión desconocida o fetch fallido). */
function LinkCard({ url, label }: { url: string; label?: string }) {
  let host = url;
  try { host = new URL(url).hostname; } catch { /* data: u otros */ }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-md transition-colors duration-200 hover:bg-white/10"
      title="Abrir enlace en una pestaña nueva"
    >
      <Link2 className="h-3.5 w-3.5 shrink-0 text-white/50" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-medium text-white/80">{label || fileName(url) || host}</span>
        <span className="block truncate text-[10px] text-white/45">{url}</span>
      </span>
      <ExternalLink className="h-3 w-3 shrink-0 text-white/40" />
    </a>
  );
}

/* ─────────────────────────── Visores ─────────────────────────── */

function ImageView({ url, alt, compact }: { url: string; alt?: string; compact: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <LinkCard url={url} label={alt} />;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block cursor-pointer"
      title={alt ? `${alt} — abrir en pestaña nueva` : "Abrir la imagen en una pestaña nueva"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt || "Imagen adjunta"}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn(
          "w-full rounded-xl border border-white/10 bg-white/5 object-cover transition-opacity duration-200 hover:opacity-90",
          compact ? "max-h-36" : "max-h-64",
        )}
      />
    </a>
  );
}

function VideoView({ url, embedUrl, compact }: { url: string; embedUrl?: string; compact: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <LinkCard url={url} />;
  // YouTube → iframe nocookie con relación de aspecto de vídeo.
  if (embedUrl) {
    return (
      <GlassFrame>
        <iframe
          src={embedUrl}
          title="Vídeo de YouTube"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className={cn("aspect-video w-full", compact && "max-h-48")}
        />
      </GlassFrame>
    );
  }
  return (
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className={cn(
        "w-full rounded-xl border border-white/10 bg-black/40",
        compact ? "max-h-40" : "max-h-64",
      )}
    />
  );
}

function AudioView({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <LinkCard url={url} />;
  return (
    <GlassFrame className="p-1.5">
      <audio
        src={url}
        controls
        preload="none"
        onError={() => setFailed(true)}
        className="h-9 w-full"
      />
    </GlassFrame>
  );
}

function PdfView({ url, compact }: { url: string; compact: boolean }) {
  return (
    <GlassFrame>
      <CardHead
        icon={<FileText className="h-3 w-3 shrink-0 text-white/50" />}
        label={fileName(url) || "Documento PDF"}
        url={url}
      />
      <iframe
        src={url}
        title={fileName(url) || "Documento PDF"}
        loading="lazy"
        style={{ height: compact ? 200 : 320 }}
        className="w-full bg-white/5"
      />
    </GlassFrame>
  );
}

function Model3dView({ url, compact }: { url: string; compact: boolean }) {
  const [hostRef, inView] = useInView<HTMLDivElement>();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Carga perezosa del script del visor cuando el marco entra en pantalla.
  useEffect(() => {
    if (!inView || ready || failed) return;
    let alive = true;
    ensureModelViewer().then((ok) => {
      if (!alive) return;
      if (ok) setReady(true);
      else setFailed(true);
    });
    return () => { alive = false; };
  }, [inView, ready, failed]);

  if (failed) return <LinkCard url={url} />;

  return (
    <GlassFrame>
      <CardHead
        icon={<Box className="h-3 w-3 shrink-0 text-white/50" />}
        label={fileName(url) || "Modelo 3D"}
        url={url}
      />
      <div ref={hostRef} style={{ height: compact ? 180 : 260 }} className="w-full">
        {ready ? (
          // Elemento custom <model-viewer> vía createElement (sin ampliar JSX).
          createElement("model-viewer", {
            src: url,
            "camera-controls": "",
            "auto-rotate": "",
            style: { width: "100%", height: "100%", display: "block", backgroundColor: "transparent" },
          })
        ) : (
          <LoadingHint label="Cargando visor 3D…" />
        )}
      </div>
    </GlassFrame>
  );
}

function CsvView({ url, compact }: { url: string; compact: boolean }) {
  const [hostRef, inView] = useInView<HTMLDivElement>();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!inView || rows !== null || failed) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.text();
        const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 30);
        const parsed = lines.map((l) => parseCsvLine(l).slice(0, 16));
        if (alive) setRows(parsed);
      } catch {
        if (alive) setFailed(true); // error silencioso → tarjeta-enlace
      }
    })();
    return () => { alive = false; };
  }, [inView, url, rows, failed]);

  if (failed) return <LinkCard url={url} />;

  return (
    <GlassFrame>
      <CardHead
        icon={<Table2 className="h-3 w-3 shrink-0 text-white/50" />}
        label={fileName(url) || "Tabla CSV"}
        url={url}
      />
      <div ref={hostRef} className={cn("overflow-auto", compact ? "max-h-[160px]" : "max-h-[240px]")}>
        {rows === null ? (
          <LoadingHint label="Cargando tabla…" />
        ) : rows.length === 0 ? (
          <LoadingHint label="El archivo está vacío." />
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <tbody>
              {rows.map((r, ri) => (
                <tr
                  key={ri}
                  className={ri === 0 ? "bg-white/10 font-medium text-white/85" : "text-white/65 odd:bg-white/[0.03]"}
                >
                  {r.map((c, ci) => (
                    <td key={ci} className="max-w-[180px] truncate border-b border-white/5 px-2 py-1">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </GlassFrame>
  );
}

function TextFileView({ url, ext, compact }: { url: string; ext?: string; compact: boolean }) {
  const [hostRef, inView] = useInView<HTMLDivElement>();
  const [body, setBody] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!inView || body !== null || failed) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (alive) setBody(text.slice(0, 20_000));
      } catch {
        if (alive) setFailed(true); // error silencioso → tarjeta-enlace
      }
    })();
    return () => { alive = false; };
  }, [inView, url, body, failed]);

  if (failed) return <LinkCard url={url} />;

  return (
    <GlassFrame>
      <CardHead
        icon={<FileText className="h-3 w-3 shrink-0 text-white/50" />}
        label={fileName(url) || `Archivo ${(ext || "de texto").toUpperCase()}`}
        url={url}
      />
      <div ref={hostRef}>
        {body === null ? (
          <LoadingHint label="Cargando contenido…" />
        ) : (
          <pre
            className={cn(
              "overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-relaxed text-white/75",
              compact ? "max-h-[160px]" : "max-h-[240px]",
            )}
          >
            {body}
          </pre>
        )}
      </div>
    </GlassFrame>
  );
}

/** Enruta cada referencia a su visor. */
function MediaRefView({ item, compact }: { item: MediaRef; compact: boolean }) {
  switch (item.kind) {
    case "image":
      return <ImageView url={item.url} alt={item.alt} compact={compact} />;
    case "video":
      return <VideoView url={item.url} embedUrl={item.embedUrl} compact={compact} />;
    case "audio":
      return <AudioView url={item.url} />;
    case "pdf":
      return <PdfView url={item.url} compact={compact} />;
    case "model3d":
      return <Model3dView url={item.url} compact={compact} />;
    case "csv":
      return <CsvView url={item.url} compact={compact} />;
    case "code":
      return <TextFileView url={item.url} ext={item.ext} compact={compact} />;
    case "link":
      return <LinkCard url={item.url} />;
    default:
      return null;
  }
}

/* ─────────────────────────── MessageMedia ─────────────────────────── */

export interface MessageMediaProps {
  /** Texto del mensaje donde buscar referencias multimedia. */
  text: string;
  /** Modo compacto (mini-reproductor / burbujas de usuario): menos altura. */
  compact?: boolean;
  className?: string;
}

/**
 * Pinta bajo un mensaje los visores de las referencias detectadas en su texto.
 * Si no hay ninguna, no renderiza nada (cero coste visual).
 */
export function MessageMedia({ text, compact = false, className }: MessageMediaProps) {
  const refs = useMemo(() => detectMediaRefs(text), [text]);
  if (refs.length === 0) return null;
  return (
    <div className={cn("mt-2 flex w-full min-w-0 flex-col gap-2", className)}>
      {refs.map((r, i) => (
        <MediaRefView key={`${i}-${r.url.slice(0, 200)}`} item={r} compact={compact} />
      ))}
    </div>
  );
}

export default MessageMedia;
