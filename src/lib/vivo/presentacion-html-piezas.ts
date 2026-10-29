/**
 * Piezas del exportador de presentaciones a HTML autónomo (2026-10-29 · Ola 1025R).
 *
 * Núcleo PURO: sin `node:*`, sin DOM y sin red. Convierte datos del lienzo en HTML escapado;
 * el documento completo se arma en `presentacion-html.ts`. Regla de `frontend-slides`:
 * escenario fijo, un solo archivo, sin dependencias y sin ejecutar nada ajeno.
 */

import type { BloqueDoc, DocRico, ElementoLienzo, EstiloMensaje, FuenteMensaje, TramoTexto } from "@/lib/mensajeria/formato-tipos";

export const FUENTES_HTML: Record<FuenteMensaje, string> = {
    inter: "Inter, system-ui, sans-serif", outfit: "Outfit, system-ui, sans-serif",
    titular: "Rajdhani, Outfit, system-ui, sans-serif", roboto: "Roboto, system-ui, sans-serif",
    mono: "ui-monospace, 'JetBrains Mono', monospace", serif: "Georgia, 'Times New Roman', serif",
    manuscrita: "'Segoe Script', 'Bradley Hand', cursive", redonda: "ui-rounded, 'SF Pro Rounded', Nunito, system-ui, sans-serif",
};

export function escaparHtml(t: string): string {
    return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function hexValido(c: unknown): string | null {
    return typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
}

export function docRicoAHtml(doc: DocRico, factor: number): string {
    return doc.bloques.map((b) => bloqueAHtml(b, factor)).filter(Boolean).join("\n");
}

function baseElemento(el: ElementoLienzo, factor: number): string {
    const css = [`left:${num(el.x) * factor}px`, `top:${num(el.y) * factor}px`, `width:${Math.max(0, num(el.w)) * factor}px`, `height:${Math.max(0, num(el.h)) * factor}px`, `z-index:${Math.round(num(el.z))}`];
    if (num(el.rot)) css.push(`transform:rotate(${num(el.rot)}deg)`);
    if (typeof el.opacidad === "number") css.push(`opacity:${Math.max(0, Math.min(1, el.opacidad))}`);
    if (typeof el.radio === "number") css.push(`border-radius:${Math.max(0, el.radio) * factor}px`);
    return css.join(";");
}

function textoAHtml(el: ElementoLienzo, factor: number): string {
    const e: EstiloMensaje = el.estilo ?? {};
    const alineacion = e.alineacion === "centro" ? "center" : e.alineacion === "derecha" ? "right" : "left";
    const css = [`font-family:${FUENTES_HTML[e.fuente ?? "inter"]}`, `font-size:${Math.max(1, num(e.tamano, 16)) * factor}px`, `text-align:${alineacion}`, "width:100%;height:100%;overflow:hidden;white-space:pre-wrap"];
    const color = hexValido(e.color);
    if (color) css.push(`color:${color}`);
    if (e.negrita) css.push("font-weight:700");
    if (e.cursiva) css.push("font-style:italic");
    return `<div class="texto" style="${css.join(";")}">${docRicoAHtml(el.texto ?? { bloques: [] }, factor)}</div>`;
}

function formaCss(el: ElementoLienzo): string {
    const f = el.forma;
    const color = hexValido(f?.color) ?? "#FFFFFF";
    if (f?.tipo === "estrella") return `background:${color};clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)`;
    if (f?.tipo === "linea") return `background:${color};border:0;height:2px;top:50%`;
    const relleno = f?.relleno ? `background:${color};border:0` : `background:transparent;border:2px solid ${color}`;
    return f?.tipo === "circulo" ? `${relleno};border-radius:50%` : relleno;
}

function imagenSegura(url: string | undefined): string | null {
    return url && (url.startsWith("data:image/") || url.startsWith("https://")) ? url : null;
}

export function elementoAHtml(el: ElementoLienzo, factor: number): string {
    const base = baseElemento(el, factor);
    if (el.tipo === "texto") return `<div class="el" style="${base}">${textoAHtml(el, factor)}</div>`;
    if (el.tipo === "imagen" || el.tipo === "gif") {
        const url = imagenSegura(el.url);
        return url ? `<div class="el" style="${base}"><img src="${escaparHtml(url)}" alt=""></div>` : "";
    }
    if (el.tipo === "forma") return `<div class="el" style="${base};${formaCss(el)}"></div>`;
    const nombre = (el.nombre ?? "").trim() || (el.tipo === "web" ? "Sitio web" : el.tipo);
    return `<div class="el caja" style="${base}">${escaparHtml(nombre)}</div>`;
}

function num(v: unknown, def = 0): number { return typeof v === "number" && Number.isFinite(v) ? v : def; }

function enlaceSeguro(url: string | undefined): string | null { return url && /^(https?:\/\/|mailto:)/i.test(url) ? url : null; }

function tramoAHtml(t: TramoTexto, factor: number): string {
    let html = escaparHtml(t.texto);
    const css: string[] = [];
    const color = hexValido(t.color);
    const fondo = hexValido(t.resaltado);
    if (color) css.push(`color:${color}`);
    if (fondo) css.push(`background-color:${fondo}`);
    if (typeof t.tamano === "number" && t.tamano > 0) css.push(`font-size:${t.tamano * factor}px`);
    if (css.length) html = `<span style="${css.join(";")}">${html}</span>`;
    const marcas = t.marcas ?? [];
    if (marcas.includes("codigo")) html = `<code>${html}</code>`;
    if (marcas.includes("tachado")) html = `<s>${html}</s>`;
    if (marcas.includes("subrayado")) html = `<u>${html}</u>`;
    if (marcas.includes("cursiva")) html = `<em>${html}</em>`;
    if (marcas.includes("negrita")) html = `<strong>${html}</strong>`;
    const enlace = enlaceSeguro(t.enlace);
    return enlace ? `<a href="${escaparHtml(enlace)}" rel="noopener noreferrer">${html}</a>` : html;
}

function tramosAHtml(tramos: TramoTexto[], factor: number): string { return tramos.map((t) => tramoAHtml(t, factor)).join(""); }

function bloqueAHtml(b: BloqueDoc, factor: number): string {
    switch (b.tipo) {
        case "titulo": {
            const n = b.nivel;
            return `<h${n}>${tramosAHtml(b.tramos, factor)}</h${n}>`;
        }
        case "parrafo": return `<p>${tramosAHtml(b.tramos, factor)}</p>`;
        case "lista": {
            const tag = b.ordenada ? "ol" : "ul";
            const items = b.items.map((it) => `<li>${tramosAHtml(it, factor)}</li>`).join("");
            return `<${tag}>${items}</${tag}>`;
        }
        case "tareas": {
            const items = b.items.map((it) => `<li>${it.hecha ? "☑" : "☐"} ${tramosAHtml(it.tramos, factor)}</li>`).join("");
            return `<ul class="tareas">${items}</ul>`;
        }
        case "cita": return `<blockquote>${tramosAHtml(b.tramos, factor)}</blockquote>`;
        case "codigo": return `<pre><code>${escaparHtml(b.texto)}</code></pre>`;
        case "separador": return "<hr>";
        default: return "";
    }
}
