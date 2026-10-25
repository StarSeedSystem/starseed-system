/**
 * Piezas HTML de la presentación (2026-10-25 · DSN1025D). Núcleo PURO: sin `node:*`, sin DOM y
 * sin red. Traduce el documento rico y los elementos del lienzo a HTML escapado, con listas
 * blancas de color, enlace e imagen. Lo no permitido se degrada a texto o se omite: no ejecuta nada.
 */
import type {
    AlineacionBloque, BloqueDoc, DocRico, ElementoLienzo, EstiloMensaje, FuenteMensaje, TramoTexto,
} from "@/lib/mensajeria/formato-tipos";
const ENLACE_OK = /^(https?:\/\/|mailto:)\S+$/i;
const RE_HEX = /^#[0-9a-fA-F]{3,8}$/;
/** Escapa texto para HTML (las cinco entidades que importan en atributos y contenido). */
export function escaparHtml(t: string): string {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/** Hex válido según la lista blanca del OS; `null` para cualquier otra cosa. */
export function hexValido(c: unknown): string | null {
    return typeof c === "string" && RE_HEX.test(c) ? c : null;
}
/** Pilas concretas, sin variables CSS de next/font: el HTML tiene que verse fuera del OS. */
export const FUENTES_HTML: Record<FuenteMensaje, string> = {
    inter: "Inter, system-ui, sans-serif", outfit: "Outfit, system-ui, sans-serif",
    titular: "Rajdhani, Outfit, system-ui, sans-serif", roboto: "Roboto, system-ui, sans-serif",
    mono: "ui-monospace, 'JetBrains Mono', monospace", serif: "Georgia, 'Times New Roman', serif",
    manuscrita: "'Segoe Script', 'Bradley Hand', cursive", redonda: "ui-rounded, 'SF Pro Rounded', Nunito, system-ui, sans-serif",
};
const ALINEACION: Record<AlineacionBloque, string> = { izquierda: "left", centro: "center", derecha: "right", justificado: "justify" };
const MARCAS: readonly (readonly [string, string])[] = [["codigo", "code"], ["negrita", "strong"], ["cursiva", "em"], ["subrayado", "u"], ["tachado", "s"]];
function alineado(a?: AlineacionBloque): string {
    return a ? ` style="text-align:${ALINEACION[a]}"` : "";
}
function tramoAHtml(t: TramoTexto, factor: number): string {
    let h = escaparHtml(t.texto ?? "");
    const m = t.marcas ?? [];
    for (const [marca, tag] of MARCAS) if (m.some((x) => x === marca)) h = `<${tag}>${h}</${tag}>`;
    const css: string[] = [];
    const color = hexValido(t.color); const fondo = hexValido(t.resaltado);
    if (color) css.push(`color:${color}`);
    if (fondo) css.push(`background-color:${fondo}`);
    if (typeof t.tamano === "number" && Number.isFinite(t.tamano)) css.push(`font-size:${t.tamano * factor}px`);
    if (css.length) h = `<span style="${css.join(";")}">${h}</span>`;
    const enlace = typeof t.enlace === "string" ? t.enlace.trim() : "";
    if (ENLACE_OK.test(enlace)) h = `<a href="${escaparHtml(enlace)}" rel="noopener noreferrer">${h}</a>`;
    return h;
}
function bloqueAHtml(b: BloqueDoc, factor: number): string {
    const t = (xs: TramoTexto[]) => xs.map((x) => tramoAHtml(x, factor)).join("");
    switch (b.tipo) {
        case "titulo": { const n = b.nivel === 1 || b.nivel === 3 ? b.nivel : 2; return `<h${n}${alineado(b.alineacion)}>${t(b.tramos)}</h${n}>`; }
        case "parrafo": return `<p${alineado(b.alineacion)}>${t(b.tramos)}</p>`;
        case "lista": { const tag = b.ordenada ? "ol" : "ul"; return `<${tag}>${b.items.map((it) => `<li>${t(it)}</li>`).join("")}</${tag}>`; }
        case "tareas": return `<ul class="tareas">${b.items.map((it) => `<li><span aria-hidden="true">${it.hecha ? "☑" : "☐"}</span> ${t(it.tramos)}</li>`).join("")}</ul>`;
        case "cita": return `<blockquote>${t(b.tramos)}</blockquote>`;
        case "codigo": return `<pre><code>${escaparHtml(b.texto ?? "")}</code></pre>`;
        case "separador": return "<hr>";
        default: return "";
    }
}
/** Documento rico a HTML: todo el texto escapado y ningún atributo de evento. */
export function docRicoAHtml(doc: DocRico, factor: number): string {
    const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
    return (doc.bloques ?? []).map((b) => bloqueAHtml(b, f)).join("");
}
function numero(n: unknown, def = 0): number {
    return typeof n === "number" && Number.isFinite(n) ? n : def;
}
function cajaBase(el: ElementoLienzo, factor: number): string {
    const css = [`left:${numero(el.x) * factor}px`, `top:${numero(el.y) * factor}px`,
        `width:${numero(el.w) * factor}px`, `height:${numero(el.h) * factor}px`, `z-index:${Math.round(numero(el.z))}`];
    if (numero(el.rot)) css.push(`transform:rotate(${numero(el.rot)}deg)`);
    if (el.opacidad !== undefined) css.push(`opacity:${Math.min(1, Math.max(0, numero(el.opacidad, 1)))}`);
    if (numero(el.radio) > 0) css.push(`border-radius:${numero(el.radio) * factor}px`);
    return css.join(";");
}
function caja(el: ElementoLienzo, factor: number, clase: string, dentro: string): string {
    return `<div class="${clase}" style="${cajaBase(el, factor)}">${dentro}</div>`;
}
const ESTRELLA = "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)";
function textoAHtml(el: ElementoLienzo, factor: number): string {
    const e: EstiloMensaje = el.estilo ?? {};
    const css: string[] = [];
    if (e.fuente && FUENTES_HTML[e.fuente]) css.push(`font-family:${FUENTES_HTML[e.fuente]}`);
    if (typeof e.tamano === "number" && Number.isFinite(e.tamano)) css.push(`font-size:${e.tamano * factor}px`);
    const color = hexValido(e.color);
    if (color) css.push(`color:${color}`);
    if (e.alineacion) css.push(`text-align:${ALINEACION[e.alineacion]}`);
    if (e.negrita) css.push("font-weight:700");
    if (e.cursiva) css.push("font-style:italic");
    const dentro = docRicoAHtml(el.texto ?? { bloques: [] }, factor);
    return `<div class="el texto" style="${cajaBase(el, factor)}${css.length ? `;${css.join(";")}` : ""}">${dentro}</div>`;
}
function formaAHtml(el: ElementoLienzo, factor: number): string {
    const f = el.forma, color = hexValido(f?.color) ?? "#64748b", tipo = f?.tipo ?? "rect";
    const css = [cajaBase(el, factor)];
    if (tipo === "circulo") css.push("border-radius:50%");
    if (tipo === "estrella") css.push(`clip-path:${ESTRELLA}`);
    if (tipo === "linea") css.push(`border-top:${Math.max(1, 2 * factor)}px solid ${color}`, "background:none");
    else if (f?.relleno === false) css.push("background:transparent", `border:${Math.max(1, 2 * factor)}px solid ${color}`);
    else css.push(`background:${color}`);
    return `<div class="el forma" style="${css.join(";")}"></div>`;
}
/** Un elemento del lienzo a HTML absoluto, con el factor del escenario. */
export function elementoAHtml(el: ElementoLienzo, factor: number): string {
    const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
    if (el.tipo === "texto") return textoAHtml(el, f);
    if (el.tipo === "forma") return formaAHtml(el, f);
    if (el.tipo === "imagen" || el.tipo === "gif") {
        const url = typeof el.url === "string" ? el.url.trim() : "";
        if (!url.startsWith("data:image/") && !url.startsWith("https://")) return "";
        return caja(el, f, "el media", `<img src="${escaparHtml(url)}" alt="">`);
    }
    const nombre = typeof el.nombre === "string" && el.nombre.trim() ? el.nombre.trim() : el.tipo;
    return caja(el, f, "el caja", `<span>${escaparHtml(nombre)}</span>`);
}
