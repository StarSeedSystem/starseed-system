// Exportar un diagrama de Astraura a SVG y PNG y alternar su piel clara/oscura (architecture/diagramas.md §4-I).
// Sigue la skill MIT diagram-design (vendor/habilidades/diagram-design/references/export.md): se entrega solo el
// <svg> del diagrama, con el CSS de la página dentro y sin scripts, y el PNG mide viewBox × escala (de 1 a 4).
// Módulo PURO: sin DOM ni red. El dibujo a PNG lo hace la vista.

export type ModoDiagrama = "claro" | "oscuro";
export type ResultadoSvg = { ok: true; svg: string } | { ok: false; motivo: string };
export type PlanPng = { ok: true; ancho: number; alto: number; escala: number; svg: string } | { ok: false; motivo: string };
/** Área máxima de lienzo que acepta cualquier navegador (Safari: 4096 × 4096). */
const AREA_MAXIMA = 16_777_216;
const ATRIBUTOS = `(?:"[^"]*"|'[^']*'|[^'">])*`;
const RE_RAIZ = new RegExp(`^\\s*<svg\\b${ATRIBUTOS}>`, "i");
/** Colores hex y rgb()/rgba(); el grupo 1 protege url(#…), referencias &#…; y href, que no son colores. */
const RE_COLOR = new RegExp("(url\\([^)]*\\)|&#\\w+;|href\\s*=\\s*(?:\"[^\"]*\"|'[^']*'))" +
  "|#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\\w-])(?!\\s*\\{)" +
  "|rgba?\\(\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*(?:[,/]\\s*([\\d.]+)(%?)\\s*)?\\)", "gi");
/** Piel clara → oscura de la skill (style-guide.md: roles y regla de inversión); `@f` escala el alfa de los tintes. */
const PIEL = "f5f5f5:2d3142 ececec:393e53 2d3142:f5f5f5 111111:111111 4f5d75:bfc0c0 bfc0c0:bfc0c0 5a6580:949eb2 bf4520:f08a59@1.25 " +
  "2e5aa8:739fdf 1c1917:faf7f2 7c8f6f:9caf8f@1.22 5e7a9b:82a0c0@1.22 b8915a:d3ad7a@1.22 9c6b50:b88670@1.22 6e6479:8d8298@1.22";
type Destino = { rgb: number[]; f: number };
const hx = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
const canales = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const A_OSCURO = new Map<string, Destino>(), A_CLARO = new Map<string, Destino>();
for (const par of PIEL.split(" ")) {
  const [, de, a, f = "1"] = /^(\w+):(\w+)(?:@([\d.]+))?$/.exec(par) ?? [];
  if (!A_OSCURO.has(de)) A_OSCURO.set(de, { rgb: canales(a), f: Number(f) });
  if (!A_CLARO.has(a)) A_CLARO.set(a, { rgb: canales(de), f: 1 / Number(f) });
}

/** [rgb, alfa] de un color hex o rgb()/rgba() ya troceado por RE_COLOR. */
function leer(hex?: string, r?: string, g?: string, b?: string, a?: string, pct?: string): [number[], number] {
  if (!hex) return [[r, g, b].map((c) => Math.min(255, Number(c))), a ? Number(a) / (pct ? 100 : 1) : 1];
  const h = hex.length < 5 ? [...hex].map((c) => c + c).join("") : hex;
  return [canales(h), h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
}
/** Color de la otra piel: el par de la skill si lo hay; si no, misma tonalidad con la luminosidad invertida. */
function convertir([rgb, alfa]: [number[], number], dir: Map<string, Destino>): [number[], number] {
  const d = dir.get(rgb.map(hx).join(""));
  if (d) return [d.rgb, alfa < 1 ? Math.round(Math.min(1, alfa * d.f) * 1000) / 1000 : alfa];
  const k = 255 - Math.max(...rgb) - Math.min(...rgb);
  return [rgb.map((c) => c + k), alfa];
}

/** Piel con la que se dibujó: la del papel (`--color-paper` o el <rect> de fondo a toda la superficie). */
export function modoDeDiagrama(html: string): ModoDiagrama {
  const papel = /--color-paper\s*:\s*([^;}]+)/i.exec(html)?.[1]
    ?? /<rect\b[^>]*\bwidth\s*=\s*["']100%["'][^>]*\bfill\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
  const m = papel ? new RegExp(RE_COLOR.source, "i").exec(papel.trim()) : null;
  if (!m || m[1]) return "claro";
  const [rgb] = leer(m[2], m[3], m[4], m[5]);
  return Math.max(...rgb) + Math.min(...rgb) < 255 ? "oscuro" : "claro";
}
/** El mismo diagrama en la piel pedida. Solo toca <style> y atributos: textos, url(#…) y href quedan igual. */
export function conModo(html: string, modo: ModoDiagrama): string {
  if (modoDeDiagrama(html) === modo) return html;
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>|<[a-z][^<>]*>/gi, (zona) =>
    zona.replace(RE_COLOR, (todo: string, protegido?: string, hex?: string, r?: string, g?: string, b?: string, a?: string, pct?: string) => {
      if (protegido) return todo;
      const [c, al] = convertir(leer(hex, r, g, b, a, pct), modo === "oscuro" ? A_OSCURO : A_CLARO);
      if (hex) return `#${c.map(hx).join("")}${hex.length === 4 || hex.length === 8 ? hx(al * 255) : ""}`;
      return a ? `rgba(${c.join(",")},${al})` : `rgb(${c.join(",")})`;
    }));
}

/** [inicio, fin) del primer <svg> de primer nivel, contando los anidados (iconos) y sin mirar dentro de
 * comentarios, scripts ni estilos: una regex perezosa cortaría en el </svg> del primer icono. */
function limitesSvg(html: string): [number, number] | null {
  const mascara = html.replace(/<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>/gi, (m) => " ".repeat(m.length));
  const re = new RegExp(`<\\/?svg\\b${ATRIBUTOS}>`, "gi");
  let inicio = -1, nivel = 0;
  for (let m = re.exec(mascara); m; m = re.exec(mascara)) {
    const cierre = m[0][1] === "/";
    if (inicio < 0) { if (cierre) continue; inicio = m.index; }
    nivel += cierre ? -1 : /\/\s*>$/.test(m[0]) ? 0 : 1;
    if (nivel === 0) return [inicio, m.index + m[0].length];
  }
  return null;
}
/** CSS de la página que el diagrama necesita: sin el `svg {…}` de maquetación y con el color y la fuente
 * del `body`, que el SVG heredaba (en un .svg suelto, `:root` es el propio <svg>). */
function cssDePagina(html: string, [i, f]: [number, number]): string {
  const fuera = (html.slice(0, i) + html.slice(f)).replace(/<!--[\s\S]*?-->/g, "");
  let css = [...fuera.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((m) => m[1]).join("\n");
  css = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[{};])\s*svg\s*\{[^}]*\}/g, "$1");
  const cuerpo = /(?:^|[{};])\s*body\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const heredado = cuerpo.split(";").map((d) => d.trim()).filter((d) => /^(color|font-family)\s*:/i.test(d));
  return (heredado.length ? `${css}\n:root { ${heredado.join("; ")}; }` : css).trim();
}

/** El <svg> del diagrama como archivo autónomo: espacio de nombres, CSS de la página dentro, sin scripts. */
export function svgDeDiagrama(html: string): ResultadoSvg {
  const limites = limitesSvg(html);
  if (!limites) return { ok: false, motivo: "no hay ningún <svg> de diagrama" };
  const svg = html.slice(...limites).replace(/<script\b[\s\S]*?<\/script\s*>|<script\b[^>]*\/>/gi, "");
  const raiz = RE_RAIZ.exec(svg)?.[0] ?? "<svg>";
  const ns = (/\sxmlns\s*=/.test(raiz) ? "" : ' xmlns="http://www.w3.org/2000/svg"') +
    (/xlink:/.test(svg) && !/\sxmlns:xlink\s*=/.test(raiz) ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : "");
  const nueva = raiz.replace(/^<svg\b/i, `<svg${ns}`), resto = svg.slice(raiz.length);
  const css = cssDePagina(html, limites);
  if (!css || /\/\s*>$/.test(nueva)) return { ok: true, svg: nueva + resto };
  // Tras <title> y <desc>: el nombre accesible sigue siendo el primer hijo del <svg>.
  const hueco = "(?:\\s|<!--[\\s\\S]*?-->)*";
  const cabeza = new RegExp(`^(${hueco}<title\\b[\\s\\S]*?<\\/title\\s*>)?(${hueco}<desc\\b[\\s\\S]*?<\\/desc\\s*>)?`, "i").exec(resto);
  const corte = cabeza ? cabeza[0].length : 0;
  const estilo = `<style>${css.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</style>`;
  return { ok: true, svg: nueva + resto.slice(0, corte) + estilo + resto.slice(corte) };
}
/** Tamaño del lienzo del PNG (viewBox × escala, de 1 a 4 y dentro del área máxima) y el <svg> con ese tamaño. */
export function planPng(svg: string, escala = 2): PlanPng {
  const raiz = RE_RAIZ.exec(svg)?.[0];
  if (!raiz) return { ok: false, motivo: "no empieza por <svg>" };
  const vb = /\sviewBox\s*=\s*["']([^"']*)["']/i.exec(raiz)?.[1].trim().split(/[\s,]+/).map(Number) ?? [];
  if (vb.length !== 4 || !vb.every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0) return { ok: false, motivo: "el PNG necesita un viewBox con ancho y alto positivos" };
  const tope = Math.sqrt(AREA_MAXIMA / (vb[2] * vb[3]));
  if (tope < 1) return { ok: false, motivo: "el diagrama es demasiado grande para un PNG: expórtalo en SVG" };
  const e = Math.min(Number.isFinite(escala) ? Math.min(4, Math.max(1, escala)) : 2, tope);
  const ancho = Math.floor(vb[2] * e + 1e-6), alto = Math.floor(vb[3] * e + 1e-6);
  const nueva = raiz.replace(/\s(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/<svg\b/i, `<svg width="${ancho}" height="${alto}"`);
  return { ok: true, ancho, alto, escala: e, svg: nueva + svg.slice(raiz.length) };
}
