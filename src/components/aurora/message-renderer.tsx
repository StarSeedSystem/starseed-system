"use client";

/**
 * StarSeed OS — Aurora · RENDERIZADOR UNIVERSAL de mensajes de chat
 * ============================================================================
 * Componente reutilizable que sustituye el render de texto plano en TODOS los
 * chats de Aurora (Exocórtex/orbe, página /aurora, chat de agente): interpreta
 * el TEXTO de un mensaje y pinta cada pieza con el visor adecuado.
 *
 * Soporta:
 *   · Markdown completo (títulos, listas, citas, negrita/cursiva, enlaces) vía
 *     `react-markdown` (ya en el catálogo del repo, sin plugins nuevos).
 *   · Tablas markdown (GFM) — parseadas A MANO porque el repo no trae
 *     `remark-gfm`; nunca lanza, degrada a texto si el parseo falla.
 *   · Bloques de código ```lang — resaltado LIGERO por palabras clave (sin
 *     librería nueva) + botón «Copiar».
 *   · Bloques JSON — detectados (```json o texto que parsea como JSON) y
 *     pintados PLEGABLES con botón «Copiar».
 *   · SVG inline — sanitizado con una whitelist DOM propia (sin dependencias)
 *     antes de insertarlo, para que sea seguro.
 *   · HTML embebido en el texto — sanitizado con la MISMA whitelist antes de
 *     `dangerouslySetInnerHTML` (nunca vuelca HTML sin filtrar).
 *   · Imágenes, audio, vídeo, PDFs, modelos 3D, CSV y tarjetas de archivo/enlace
 *     — delegado en el visor universal YA EXISTENTE (`MessageMedia` de
 *     `universal-viewer.tsx`); no se duplica esa lógica.
 *
 * Filosofía del repo (Ciberdelia): nunca lanza, todo defensivo y SSR-safe,
 * estética Crystal Liquid Glass, transiciones 150-300ms, sin emojis-icono
 * (lucide-react), cursor-pointer en lo clicable.
 */

import { useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { MessageMedia } from "@/components/aurora/universal-viewer";
import { AuroraReadButton } from "@/components/aurora/aurora-read-button";
import { CodeRunner } from "@/components/aurora/code-runner";


/* ═══════════════════════════ Sanitización HTML/SVG ═══════════════════════════
 * Whitelist DOM propia (sin DOMPurify ni dependencias nuevas): recorre el árbol
 * parseado, elimina nodos/atributos peligrosos (script, style, on*, hrefs con
 * javascript:, etc.) y devuelve HTML limpio. SSR-safe: sin `document` devuelve
 * "" (nunca intenta sanitizar en servidor).
 */

const ALLOWED_TAGS = new Set([
  "a", "abbr", "b", "blockquote", "br", "caption", "code", "col", "colgroup",
  "dd", "del", "div", "dl", "dt", "em", "figcaption", "figure", "h1", "h2",
  "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark", "ol",
  "p", "pre", "q", "s", "small", "span", "strong", "sub", "summary", "sup",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul", "svg",
  "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g",
  "defs", "linearGradient", "radialGradient", "stop", "text", "tspan", "use",
]);

const ALLOWED_ATTRS = new Set([
  "href", "src", "alt", "title", "class", "id", "target", "rel", "colspan",
  "rowspan", "align", "width", "height", "viewBox", "xmlns", "fill", "stroke",
  "stroke-width", "d", "cx", "cy", "r", "x", "y", "x1", "y1", "x2", "y2",
  "points", "gradientUnits", "offset", "stop-color", "stop-opacity",
  "font-size", "text-anchor", "transform", "opacity", "rx", "ry",
]);

/** ¿Este valor de atributo es una URL peligrosa (javascript:, data:text/html…)? */
function isUnsafeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith("javascript:") || v.startsWith("vbscript:") || v.startsWith("data:text/html");
}

/** Sanea recursivamente un nodo del DOM (in-place) según la whitelist. */
function sanitizeNode(node: Element): void {
  const tag = node.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    node.remove();
    return;
  }
  // Quita atributos no permitidos + valores peligrosos.
  for (const attr of Array.from(node.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on")) { node.removeAttribute(attr.name); continue; }
    if (!ALLOWED_ATTRS.has(name)) { node.removeAttribute(attr.name); continue; }
    if ((name === "href" || name === "src") && isUnsafeUrl(attr.value)) {
      node.removeAttribute(attr.name);
    }
  }
  // Enlaces externos siempre con rel seguro.
  if (tag === "a") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
  for (const child of Array.from(node.children)) sanitizeNode(child);
}

/**
 * Sanitiza un fragmento de HTML/SVG con la whitelist anterior. Devuelve HTML
 * limpio listo para `dangerouslySetInnerHTML`. SSR-safe: "" sin `document`.
 * Defensivo: cualquier fallo de parseo devuelve "".
 */
export function sanitizeHtmlFragment(html: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") return "";
  try {
    const template = document.createElement("template");
    template.innerHTML = html;
    // Elimina comentarios y <script>/<style> explícitamente antes de recorrer.
    const killTags = template.content.querySelectorAll("script, style, iframe, object, embed, link, meta");
    killTags.forEach((n) => n.remove());
    for (const child of Array.from(template.content.children)) sanitizeNode(child);
    return template.innerHTML;
  } catch {
    return "";
  }
}

/* ═══════════════════════════ Detección de bloques ═══════════════════════════
 * Extrae del texto los bloques ```fenced``` (código/JSON) y los SVG inline,
 * dejando el resto como "prosa" a renderizar con Markdown. Todo por regex,
 * defensivo (nunca lanza), con límites de tamaño para no colgar el navegador.
 */

type Segment =
  | { kind: "prose"; text: string }
  // `info` = cadena COMPLETA del fence (```html run mode=split height=520): el
  // ejecutor lee de ahí las directivas del propio código (Ola 4 · Adenda 156).
  | { kind: "code"; lang: string; code: string; info?: string }
  | { kind: "svg"; svg: string };

const MAX_TEXT_LEN = 40_000;

/** Trocea el texto en segmentos de prosa / código-fenced / SVG inline. */
function splitSegments(raw: string): Segment[] {
  const text = raw.length > MAX_TEXT_LEN ? raw.slice(0, MAX_TEXT_LEN) : raw;
  const segments: Segment[] = [];
  const FENCE_RX = /```([^\n]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  // 1) Bloques fenced primero (código/JSON), en orden de aparición.
  while ((m = FENCE_RX.exec(text))) {
    if (m.index > lastIndex) {
      pushProseWithSvg(segments, text.slice(lastIndex, m.index));
    }
    const info = (m[1] || "").trim();
    const lang = (info.split(/\s+/)[0] || "").toLowerCase();
    const code = (m[2] || "").replace(/\n$/, "");
    if (code.trim()) segments.push({ kind: "code", lang, code, info });
    lastIndex = FENCE_RX.lastIndex;
  }
  if (lastIndex < text.length) pushProseWithSvg(segments, text.slice(lastIndex));

  return segments.length ? segments : [{ kind: "prose", text: "" }];
}

/** Dentro de un tramo de prosa, separa además los <svg>…</svg> inline. */
function pushProseWithSvg(segments: Segment[], chunk: string): void {
  const SVG_RX = /<svg[\s\S]*?<\/svg>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = SVG_RX.exec(chunk))) {
    any = true;
    if (m.index > last) {
      const before = chunk.slice(last, m.index);
      if (before.trim()) segments.push({ kind: "prose", text: before });
    }
    segments.push({ kind: "svg", svg: m[0] });
    last = SVG_RX.lastIndex;
  }
  if (!any) {
    if (chunk.trim() || segments.length === 0) segments.push({ kind: "prose", text: chunk });
    return;
  }
  if (last < chunk.length) {
    const rest = chunk.slice(last);
    if (rest.trim()) segments.push({ kind: "prose", text: rest });
  }
}

/** ¿El código de un bloque parsea como JSON válido (objeto o array)? */
function tryParseJson(code: string): unknown | undefined {
  const t = code.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

/* ═══════════════════════════ Resaltado ligero (sin librería) ═══════════════════════════
 * Tokeniza por regex y colorea con clases Tailwind. No es un tokenizador real
 * (no distingue contexto de strings anidados complejos), pero da una lectura
 * MUY superior al texto plano para JS/TS/Python/CSS/JSON/bash — que es lo que
 * pide la tarea ("resaltado ligero"). Defensivo: ante cualquier fallo, texto
 * plano sin colorear.
 */

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "switch", "case", "break", "continue", "class", "extends", "implements",
  "interface", "type", "import", "export", "from", "default", "new", "this",
  "super", "try", "catch", "finally", "throw", "async", "await", "yield",
  "typeof", "instanceof", "in", "of", "void", "null", "undefined", "true",
  "false", "def", "elif", "except", "pass", "lambda", "with", "as", "is",
  "not", "and", "or", "None", "True", "False", "self", "print", "public",
  "private", "protected", "static", "readonly", "enum", "namespace",
]);

interface Token { text: string; cls?: string }

/** Tokeniza una línea de código en piezas coloreables (strings/comentarios/keywords/números). */
function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  // Comentario de línea completo (// o #) → todo el resto en un solo tono.
  const commentMatch = /^(.*?)(\/\/.*|#(?!include|!).*)$/.exec(line);
  const codePart = commentMatch ? commentMatch[1] : line;
  const commentPart = commentMatch ? commentMatch[2] : "";

  const RX = /(".*?"|'.*?'|`.*?`)|(\b\d+(\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z0-9_$]+)/g;
  let m: RegExpExecArray | null;
  while ((m = RX.exec(codePart))) {
    const [, str, num, , word, , punct] = m;
    if (str) tokens.push({ text: str, cls: "text-emerald-300/90" });
    else if (num) tokens.push({ text: num, cls: "text-amber-300/90" });
    else if (word) tokens.push({ text: word, cls: KEYWORDS.has(word) ? "text-[#7fb8ff]" : undefined });
    else if (punct) tokens.push({ text: punct, cls: "text-white/40" });
    else tokens.push({ text: m[0] });
  }
  if (commentPart) tokens.push({ text: commentPart, cls: "text-white/35 italic" });
  return tokens;
}

function HighlightedCode({ code }: { code: string }): ReactNode {
  const lines = useMemo(() => code.split("\n"), [code]);
  return (
    <>
      {lines.map((line, i) => (
        <div key={i}>
          {line === "" ? " " : tokenizeLine(line).map((t, j) => (
            <span key={j} className={t.cls}>{t.text}</span>
          ))}
        </div>
      ))}
    </>
  );
}

/* ═══════════════════════════ Botón «Copiar» ═══════════════════════════ */

function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* portapapeles no disponible: silencioso */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? "Copiado" : "Copiar"}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white/90",
        className,
      )}
    >
      {copied ? <Check className="h-2.5 w-2.5 text-emerald-300" /> : <Copy className="h-2.5 w-2.5" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

/* ═══════════════════════════ Bloque de código ═══════════════════════════ */

function CodeBlock({ lang, code, info }: { lang: string; code: string; info?: string }) {
  const json = useMemo(() => tryParseJson(code), [code]);
  if (json !== undefined) return <JsonBlock value={json} raw={code} />;
  // (Ola 4 · Adenda 156) Todo bloque ejecutable se entrega como PROGRAMA VIVO en
  // el propio chat (ejecutar/cerrar, ventana o pestaña nueva, tamaño, modo de uso,
  // código y consola). El ejecutor cae al bloque plano si no hay nada que correr.
  return <CodeRunner lang={lang} code={code} info={info} fallback={<PlainCodeBlock lang={lang} code={code} />} />;
}

function PlainCodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="my-1.5 overflow-hidden rounded-xl border border-white/10 bg-black/50 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-2.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wide text-white/45">{lang || "texto"}</span>
        <CopyButton value={code} />
      </div>
      <pre className="max-h-80 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-white/80">
        <HighlightedCode code={code} />
      </pre>
    </div>
  );
}

/* ═══════════════════════════ Bloque JSON plegable ═══════════════════════════ */

function JsonBlock({ value, raw }: { value: unknown; raw: string }) {
  const [open, setOpen] = useState(true);
  const pretty = useMemo(() => {
    try { return JSON.stringify(value, null, 2); } catch { return raw; }
  }, [value, raw]);
  const summary = useMemo(() => {
    if (Array.isArray(value)) return `Array · ${value.length} elemento${value.length === 1 ? "" : "s"}`;
    if (value && typeof value === "object") return `Objeto · ${Object.keys(value as object).length} clave${Object.keys(value as object).length === 1 ? "" : "s"}`;
    return "JSON";
  }, [value]);

  return (
    <div className="my-1.5 overflow-hidden rounded-xl border border-white/10 bg-black/50 backdrop-blur-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left transition-colors duration-200 hover:bg-white/[0.06]"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/70">
          {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <span className="font-mono text-[10px] uppercase tracking-wide text-white/45">JSON</span>
          <span className="truncate text-white/50">· {summary}</span>
        </span>
        <CopyButton value={pretty} />
      </button>
      {open && (
        <pre className="max-h-80 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-white/80">
          <HighlightedCode code={pretty} />
        </pre>
      )}
    </div>
  );
}

/* ═══════════════════════════ SVG inline seguro ═══════════════════════════ */

function InlineSvg({ svg }: { svg: string }) {
  const clean = useMemo(() => sanitizeHtmlFragment(svg), [svg]);
  if (!clean) return null;
  return (
    <div
      className="my-1.5 flex items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5 p-3 [&_svg]:h-auto [&_svg]:max-h-64 [&_svg]:w-auto [&_svg]:max-w-full"
      // Contenido saneado por sanitizeHtmlFragment (whitelist DOM propia).
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

/* ═══════════════════════════ HTML embebido seguro ═══════════════════════════
 * Detecta si un tramo de prosa contiene etiquetas HTML "de bloque" (no las que
 * ya cubre Markdown/GFM manual) y, de ser así, lo trata como HTML saneado en
 * vez de Markdown puro (evita que <table>/<div> a medias rompan el parseo).
 */
function looksLikeRawHtml(text: string): boolean {
  return /<\/?(div|table|thead|tbody|tr|td|th|details|summary|figure|mark)\b/i.test(text);
}

function RawHtmlBlock({ text }: { text: string }) {
  const clean = useMemo(() => sanitizeHtmlFragment(text), [text]);
  if (!clean) return <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/85">{text}</p>;
  return (
    <div
      className="prose-chat text-[13px] leading-relaxed text-white/85"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

/* ═══════════════════════════ Tablas Markdown (parseo manual) ═══════════════════════════
 * react-markdown v10 sin remark-gfm no interpreta tablas GFM; el repo no trae
 * ese plugin, así que las detectamos y pintamos A MANO antes de pasar el resto
 * a ReactMarkdown. Formato esperado:
 *   | A | B |
 *   |---|---|
 *   | 1 | 2 |
 */
interface ParsedTable { header: string[]; rows: string[][] }

function parseMarkdownTable(block: string): ParsedTable | null {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const isRow = (l: string) => l.startsWith("|") || l.includes("|");
  if (!isRow(lines[0])) return null;
  const sepLine = lines[1];
  if (!/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(sepLine)) return null;

  const splitRow = (l: string): string[] =>
    l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  const header = splitRow(lines[0]);
  const rows = lines.slice(2).map(splitRow);
  return { header, rows };
}

/** Extrae tablas markdown del texto de prosa, devolviendo tramos alternados. */
function splitProseWithTables(text: string): (string | ParsedTable)[] {
  const lines = text.split("\n");
  const out: (string | ParsedTable)[] = [];
  let buffer: string[] = [];
  let i = 0;
  const flush = () => {
    if (buffer.length) { out.push(buffer.join("\n")); buffer = []; }
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("|") && lines[i + 1] && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      // Posible tabla: recolecta hasta que deje de haber "|".
      const block: string[] = [line, lines[i + 1]];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith("|")) { block.push(lines[j]); j++; }
      const parsed = parseMarkdownTable(block.join("\n"));
      if (parsed) {
        flush();
        out.push(parsed);
        i = j;
        continue;
      }
    }
    buffer.push(line);
    i++;
  }
  flush();
  return out;
}

function TableView({ table }: { table: ParsedTable }) {
  return (
    <div className="my-1.5 overflow-x-auto rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-white/10 text-white/85">
            {table.header.map((h, i) => (
              <th key={i} className="border-b border-white/10 px-2.5 py-1.5 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, ri) => (
            <tr key={ri} className="text-white/70 odd:bg-white/[0.03]">
              {r.map((c, ci) => (
                <td key={ci} className="max-w-[220px] truncate border-b border-white/5 px-2.5 py-1.5">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════ Markdown (react-markdown) ═══════════════════════════ */

const MD_COMPONENTS: Components = {
  a: ({ node: _node, children, href, ...props }) => {
    const isInternal = href?.startsWith("/") || href?.startsWith("#");
    const className = "cursor-pointer text-[#7fb8ff] underline decoration-white/20 underline-offset-2 transition-colors duration-200 hover:text-white hover:decoration-white/40";
    if (isInternal && href) {
      return (
        <Link href={href} className={className}>
          {children}
        </Link>
      );
    }
    return (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  },
  h1: ({ children }) => <h1 className="mb-1.5 mt-2 text-[16px] font-semibold text-white/95">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1.5 mt-2 text-[14px] font-semibold text-white/95">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-[13px] font-semibold text-white/90">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1 mt-1.5 text-[12.5px] font-semibold text-white/90">{children}</h4>,
  p: ({ children }) => <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/85 [&:not(:first-child)]:mt-1.5">{children}</p>,
  ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5 text-[13px] leading-relaxed text-white/85 marker:text-white/40">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5 text-[13px] leading-relaxed text-white/85 marker:text-white/40">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-[#7fb8ff]/40 bg-white/[0.03] py-1 pl-3 pr-2 text-[13px] italic leading-relaxed text-white/70">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-white/10" />,
  strong: ({ children }) => <strong className="font-semibold text-white/95">{children}</strong>,
  em: ({ children }) => <em className="italic text-white/85">{children}</em>,
  code: ({ node: _node, className, children, ...props }) => {
    // Código EN LÍNEA (no bloque, que ya se saca antes vía splitSegments).
    const isInline = !className;
    if (isInline) {
      return (
        <code className="rounded-md border border-white/10 bg-white/10 px-1 py-0.5 font-mono text-[11.5px] text-amber-200/90" {...props}>
          {children}
        </code>
      );
    }
    return <code className={className} {...props}>{children}</code>;
  },
  table: ({ children }) => (
    <div className="my-1.5 overflow-x-auto rounded-xl border border-white/10 bg-white/5 backdrop-blur-md">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/10 text-white/85">{children}</thead>,
  th: ({ children }) => <th className="border-b border-white/10 px-2.5 py-1.5 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="max-w-[220px] truncate border-b border-white/5 px-2.5 py-1.5 text-white/70">{children}</td>,
};

/** Prosa: separa tablas manuales del resto (que va a ReactMarkdown), y detecta HTML crudo. */
function ProseSegment({ text }: { text: string }) {
  // Hooks SIEMPRE antes de cualquier return condicional (reglas de hooks).
  const parts = useMemo(() => splitProseWithTables(text), [text]);

  if (!text.trim()) return null;
  if (looksLikeRawHtml(text)) return <RawHtmlBlock text={text} />;

  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string"
          ? (p.trim() ? <ReactMarkdown key={i} components={MD_COMPONENTS}>{p}</ReactMarkdown> : null)
          : <TableView key={i} table={p} />,
      )}
    </>
  );
}

/* ═══════════════════════════ Componente principal ═══════════════════════════ */

export interface MessageRendererProps {
  /** Texto completo del mensaje a interpretar. */
  text: string;
  /** Modo compacto (burbujas de usuario / mini-reproductor): menos altura en media. */
  compact?: boolean;
  /** Desactiva el visor universal de medios (imágenes/audio/vídeo/archivos) si
   *  el llamador ya lo pinta aparte. Por defecto se incluye (true). */
  media?: boolean;
  className?: string;
  personalityId?: string;
}

/**
 * Renderiza un mensaje de chat de Aurora con soporte universal: markdown,
 * tablas, código con highlight+copiar, JSON plegable, SVG inline seguro, HTML
 * saneado y (opcionalmente) el visor de medios existente debajo. Defensivo:
 * ante cualquier fallo de parseo, cae a texto plano con saltos de línea.
 */
export function MessageRenderer({ text, compact = false, media = true, className, personalityId }: MessageRendererProps) {
  const segments = useMemo(() => {
    try { return splitSegments(text || ""); } catch { return [{ kind: "prose", text: text || "" } as Segment]; }
  }, [text]);

  return (
    <div className={cn("min-w-0 relative group/renderer", className)}>
      {segments.map((seg, i) => {
        if (seg.kind === "code") return <CodeBlock key={i} lang={seg.lang} code={seg.code} info={seg.info} />;
        if (seg.kind === "svg") return <InlineSvg key={i} svg={seg.svg} />;
        return <ProseSegment key={i} text={seg.text} />;
      })}
      {media && <MessageMedia text={text} compact={compact} />}
      <AuroraReadButton text={text} defaultPersonalityId={personalityId} className="absolute -top-3 -right-3 opacity-0 group-hover/renderer:opacity-100 z-10" />
    </div>
  );
}

export default MessageRenderer;
