/**
 * Presentación en vivo → HTML autónomo (Ola 1025R · DSN1025D).
 * Piezas puras: escapado, hex, fuentes, documento rico y elementos del lienzo. Sin DOM, sin
 * red y sin `node:*`; el archivo generado no ejecuta nada ajeno ni hace peticiones.
 */
import type { BloqueDoc, DocRico, ElementoLienzo, EstiloMensaje, FuenteMensaje, TramoTexto } from "@/lib/mensajeria/formato-tipos";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escaparHtml(t: string): string {
    return String(t ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const RE_HEX = /^#[0-9a-fA-F]{3,8}$/;

export function hexValido(c: unknown): string | null {
    return typeof c === "string" && RE_HEX.test(c) ? c.toLowerCase() : null;
}

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

function num(v: unknown, porDefecto = 0): number {
    return typeof v === "number" && Number.isFinite(v) ? v : porDefecto;
}

function px(v: unknown, factor: number): string {
    return `${Math.round(num(v) * factor * 100) / 100}px`;
}

function enlaceSeguroHtml(u?: string): string | null {
    if (!u) return null;
    const t = u.trim();
    return /^https?:\/\/[^\s"'<>]+$/i.test(t) || /^mailto:[^\s"'<>]+$/i.test(t) ? t : null;
}

const MARCAS: Record<string, [string, string]> = {
    negrita: ["<strong>", "</strong>"],
    cursiva: ["<em>", "</em>"],
    subrayado: ["<u>", "</u>"],
    tachado: ["<s>", "</s>"],
    codigo: ["<code>", "</code>"],
};

function tramoAHtml(t: TramoTexto): string {
    let html = escaparHtml(t.texto);
    for (const marca of t.marcas ?? []) {
        const par = MARCAS[marca];
        if (par) html = par[0] + html + par[1];
    }
    const color = hexValido(t.color);
    if (color) html = `<span style="color:${color}">${html}</span>`;
    const href = enlaceSeguroHtml(t.enlace);
    if (href) html = `<a href="${escaparHtml(href)}" rel="noopener noreferrer">${html}</a>`;
    return html;
}

const tramosAHtml = (tramos: TramoTexto[] | undefined): string => (tramos ?? []).map(tramoAHtml).join("");

function bloqueAHtml(b: BloqueDoc): string {
    switch (b.tipo) {
        case "titulo": {
            const h = b.nivel === 1 ? "h1" : b.nivel === 2 ? "h2" : "h3";
            return `<${h}>${tramosAHtml(b.tramos)}</${h}>`;
        }
        case "parrafo":
            return `<p>${tramosAHtml(b.tramos)}</p>`;
        case "lista": {
            const tag = b.ordenada ? "ol" : "ul";
            return `<${tag}>${b.items.map((i) => `<li>${tramosAHtml(i)}</li>`).join("")}</${tag}>`;
        }
        case "tareas":
            return `<ul>${b.items.map((i) => `<li>${i.hecha ? "☑" : "☐"} ${tramosAHtml(i.tramos)}</li>`).join("")}</ul>`;
        case "cita":
            return `<blockquote>${tramosAHtml(b.tramos)}</blockquote>`;
        case "codigo":
            return `<pre>${escaparHtml(b.texto)}</pre>`;
        case "separador":
            return "<hr>";
        default:
            return "";
    }
}

export function docRicoAHtml(doc: DocRico, factor: number): string {
    const base = Math.max(1, Math.round(16 * (factor > 0 && Number.isFinite(factor) ? factor : 1)));
    return `<div class="doc" style="font-size:${base}px">${(doc?.bloques ?? []).map(bloqueAHtml).join("")}</div>`;
}

function caja(el: ElementoLienzo, factor: number): string {
    const p = [
        "position:absolute",
        `left:${px(el.x, factor)}`,
        `top:${px(el.y, factor)}`,
        `width:${px(el.w, factor)}`,
        `height:${px(el.h, factor)}`,
        `z-index:${Math.round(num(el.z))}`,
    ];
    if (num(el.rot) !== 0) p.push(`transform:rotate(${Math.round(num(el.rot) * 100) / 100}deg)`);
    if (typeof el.opacidad === "number") p.push(`opacity:${Math.max(0, Math.min(1, el.opacidad))}`);
    if (typeof el.radio === "number") p.push(`border-radius:${px(el.radio, factor)}`);
    return p.join(";");
}

function estiloTexto(e: EstiloMensaje | undefined, factor: number): string {
    const p: string[] = [];
    if (e?.fuente && FUENTES_HTML[e.fuente]) p.push(`font-family:${FUENTES_HTML[e.fuente]}`);
    if (typeof e?.tamano === "number") p.push(`font-size:${px(e.tamano, factor)}`);
    const color = hexValido(e?.color);
    if (color) p.push(`color:${color}`);
    if (e?.alineacion)
        p.push(
            `text-align:${e.alineacion === "centro" ? "center" : e.alineacion === "derecha" ? "right" : "left"}`,
        );
    if (e?.negrita) p.push("font-weight:700");
    if (e?.cursiva) p.push("font-style:italic");
    return p.join(";");
}

const ESTRELLA =
    "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)";

function formaAHtml(el: ElementoLienzo, factor: number): string {
    const f = el.forma;
    const color = hexValido(f?.color) ?? "#ffffff";
    const relleno = f?.relleno !== false;
    const p = [caja(el, factor)];
    if (f?.tipo === "circulo")
        p.push("border-radius:50%", relleno ? `background:${color}` : `border:${Math.max(1, 2 * factor)}px solid ${color}`);
    else if (f?.tipo === "estrella")
        p.push(`clip-path:${ESTRELLA}`, `background:${color}`);
    else if (f?.tipo === "linea") p.push(`background:${color}`, `height:${Math.max(1, 2 * factor)}px`);
    else p.push(relleno ? `background:${color}` : `border:${Math.max(1, 2 * factor)}px solid ${color}`);
    return `<div style="${p.join(";")}"></div>`;
}

function cajaConNombre(el: ElementoLienzo, factor: number, nombre: string): string {
    const p = [
        caja(el, factor),
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "overflow:hidden",
        "padding:8px",
        "font-size:20px",
        "background:rgba(255,255,255,.08)",
        "border:1px solid rgba(255,255,255,.25)",
    ];
    return `<div style="${p.join(";")}">${escaparHtml(nombre)}</div>`;
}

export function elementoAHtml(el: ElementoLienzo, factor: number): string {
    const f = factor > 0 && Number.isFinite(factor) ? factor : 1;
    if (el.tipo === "texto")
        return `<div style="${[caja(el, f), estiloTexto(el.estilo, f)].filter(Boolean).join(";")}">${docRicoAHtml(el.texto ?? { bloques: [] }, f)}</div>`;
    if (el.tipo === "imagen" || el.tipo === "gif") {
        const u = el.url?.trim();
        const src = u && (/^data:image\//i.test(u) || /^https:\/\//i.test(u)) ? u : null;
        if (!src) return "";
        return `<div style="${caja(el, f)}"><img src="${escaparHtml(src)}" alt="" style="width:100%;height:100%;object-fit:contain"></div>`;
    }
    if (el.tipo === "forma") return formaAHtml(el, f);
    const nombre = el.nombre ?? el.vivo?.name ?? el.tipo;
    return cajaConNombre(el, f, nombre);
}