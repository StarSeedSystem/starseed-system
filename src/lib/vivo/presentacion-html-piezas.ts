/**
 * Piezas puras del exportador de presentaciones a HTML autónomo (DSN1025D). Sin DOM, sin red ni
 * `node:*`. Todo texto se escapa, todo color pasa por `hexValido` y nada ajeno se ejecuta.
 */
import type { AlineacionBloque, BloqueDoc, DocRico, ElementoLienzo, EstiloMensaje, FuenteMensaje, MarcaTexto, TramoTexto } from "@/lib/mensajeria/formato-tipos";
const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const ALINEACION: Record<string, string> = { centro: "center", derecha: "right", justificado: "justify" };
const MARCAS: [MarcaTexto, string][] = [["codigo", "code"], ["negrita", "strong"], ["cursiva", "em"], ["subrayado", "u"], ["tachado", "s"]];
/** Escapa texto para contenido o para valor de atributo HTML. */
export function escaparHtml(t: string): string {
    return String(t).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
/** Solo un color hex de 3 a 8 dígitos; cualquier otra cosa devuelve null. */
export function hexValido(c: unknown): string | null {
    return typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
}
/** Pilas concretas, sin variables de next/font: el archivo se abre fuera de la app. */
export const FUENTES_HTML: Record<FuenteMensaje, string> = {
    inter: "Inter, system-ui, sans-serif",
    outfit: "Outfit, system-ui, sans-serif",
    titular: "Rajdhani, Outfit, system-ui, sans-serif",
    roboto: "Roboto, system-ui, sans-serif",
    mono: "ui-monospace, 'JetBrains Mono', monospace",
    serif: "Georgia, 'Times New Roman', serif",
    manuscrita: "'Segoe Script', 'Bradley Hand', cursive",
    redonda: "ui-rounded, 'SF Pro Rounded', Nunito, system-ui, sans-serif",
};
function alineacion(a: AlineacionBloque | undefined): string {
    const v = a ? ALINEACION[a] : undefined;
    return v ? ` style="text-align:${v}"` : "";
}
function enlaceValido(u: string | undefined): string | null {
    return u && /^(https?:\/\/|mailto:)/i.test(u) ? u : null;
}
function tramoAHtml(t: TramoTexto, factor: number): string {
    let h = escaparHtml(t.texto ?? "");
    const estilos: string[] = [];
    const color = hexValido(t.color);
    if (color) estilos.push(`color:${color}`);
    if (t.fuente) estilos.push(`font-family:${FUENTES_HTML[t.fuente]}`);
    if (typeof t.tamano === "number" && Number.isFinite(t.tamano)) estilos.push(`font-size:${(t.tamano * factor).toFixed(2)}px`);
    if (estilos.length) h = `<span style="${estilos.join(";")}">${h}</span>`;
    for (const [marca, tag] of MARCAS) if (t.marcas?.includes(marca)) h = `<${tag}>${h}</${tag}>`;
    const url = enlaceValido(t.enlace);
    return url ? `<a href="${escaparHtml(url)}" rel="noopener noreferrer">${h}</a>` : h;
}
/** Documento rico (tipo Word) a HTML: títulos, párrafos, listas, tareas, citas, código y reglas. */
export function docRicoAHtml(doc: DocRico, factor: number): string {
    return doc.bloques.map((b) => bloqueAHtml(b, factor)).join("");
}
function bloqueAHtml(b: BloqueDoc, factor: number): string {
    const tramos = (ts: TramoTexto[]) => ts.map((t) => tramoAHtml(t, factor)).join("");
    if (b.tipo === "titulo") return `<h${b.nivel}${alineacion(b.alineacion)}>${tramos(b.tramos)}</h${b.nivel}>`;
    if (b.tipo === "parrafo") return `<p${alineacion(b.alineacion)}>${tramos(b.tramos)}</p>`;
    if (b.tipo === "lista") { const tag = b.ordenada ? "ol" : "ul"; return `<${tag}>${b.items.map((it) => `<li>${tramos(it)}</li>`).join("")}</${tag}>`; }
    if (b.tipo === "tareas") return `<ul>${b.items.map((it) => `<li>${it.hecha ? "☑" : "☐"} ${tramos(it.tramos)}</li>`).join("")}</ul>`;
    if (b.tipo === "cita") return `<blockquote>${tramos(b.tramos)}</blockquote>`;
    if (b.tipo === "codigo") return `<pre>${escaparHtml(b.texto)}</pre>`;
    return "<hr>";
}
function estiloTexto(e: EstiloMensaje | undefined, factor: number): string {
    const s: string[] = [];
    if (e?.fuente) s.push(`font-family:${FUENTES_HTML[e.fuente]}`);
    if (typeof e?.tamano === "number" && Number.isFinite(e.tamano)) s.push(`font-size:${(e.tamano * factor).toFixed(2)}px`);
    const color = hexValido(e?.color);
    if (color) s.push(`color:${color}`);
    if (e?.alineacion) s.push(`text-align:${e.alineacion === "centro" ? "center" : e.alineacion === "derecha" ? "right" : "left"}`);
    if (e?.negrita) s.push("font-weight:700");
    if (e?.cursiva) s.push("font-style:italic");
    return s.join(";");
}
function cajaDe(el: ElementoLienzo, factor: number, extra: string): string {
    const p = ["position:absolute", `left:${(el.x * factor).toFixed(2)}px`, `top:${(el.y * factor).toFixed(2)}px`, `width:${(el.w * factor).toFixed(2)}px`, `height:${(el.h * factor).toFixed(2)}px`, `z-index:${Math.round(el.z)}`];
    if (el.rot) p.push(`transform:rotate(${el.rot}deg)`);
    if (typeof el.opacidad === "number") p.push(`opacity:${Math.min(1, Math.max(0, el.opacidad))}`);
    if (typeof el.radio === "number") p.push(`border-radius:${(el.radio * factor).toFixed(2)}px`);
    if (extra) p.push(extra);
    return p.join(";");
}
function fuenteImagen(url: string | undefined): string | null {
    return url && (/^data:image\//i.test(url) || /^https:\/\//i.test(url)) ? url : null;
}
function estiloForma(el: ElementoLienzo, factor: number): string | null {
    const forma = el.forma;
    const color = hexValido(forma?.color);
    if (!forma || !color) return null;
    if (forma.tipo === "linea") return `background:${color};height:${Math.max(2, factor * 2).toFixed(2)}px;border-radius:999px`;
    if (forma.relleno === false) return `background:transparent;border:${Math.max(1, factor).toFixed(2)}px solid ${color}${forma.tipo === "circulo" ? ";border-radius:50%" : ""}`;
    const formaCss = forma.tipo === "circulo" ? ";border-radius:50%" : forma.tipo === "estrella" ? ";clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" : "";
    return `background:${color}${formaCss}`;
}
/** Un elemento del lienzo a HTML absoluto; nunca ejecuta contenido ajeno. */
export function elementoAHtml(el: ElementoLienzo, factor: number): string {
    if (el.tipo === "texto" && el.texto) {
        const contenido = `<div style="${estiloTexto(el.estilo, factor)};width:100%;height:100%">${docRicoAHtml(el.texto, factor)}</div>`;
        return `<div style="${cajaDe(el, factor, "overflow:hidden")}">${contenido}</div>`;
    }
    const imagen = fuenteImagen(el.url);
    if ((el.tipo === "imagen" || el.tipo === "gif") && imagen) return `<div style="${cajaDe(el, factor, "overflow:hidden")}"><img alt="" src="${escaparHtml(imagen)}" style="width:100%;height:100%;object-fit:contain"></div>`;
    if (el.tipo === "forma") { const forma = estiloForma(el, factor); if (forma) return `<div style="${cajaDe(el, factor, forma)}"></div>`; }
    const nombre = escaparHtml(el.nombre || `Contenido ${el.tipo}`);
    const caja = "display:flex;align-items:center;justify-content:center;overflow:hidden;border:2px dashed currentColor;background:rgba(0,0,0,.25);font-family:Inter, system-ui, sans-serif;font-size:20px;text-align:center";
    return `<div style="${cajaDe(el, factor, caja)}">${nombre}</div>`;
}
