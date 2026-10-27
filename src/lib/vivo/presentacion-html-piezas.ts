/**
 * Piezas HTML de la presentación exportada: escape, colores, fuentes del escenario, documento
 * rico y elementos del lienzo. Módulo PURO: sin `node:*`, sin DOM y sin red.
 */
import type { BloqueDoc, DocRico, ElementoLienzo, FuenteMensaje, TramoTexto } from "@/lib/mensajeria/formato-tipos";
/** Las pilas son concretas: el archivo no pide fuentes a ningún servidor. */
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

const ALINEACIONES: Record<string, string> = { izquierda: "left", centro: "center", derecha: "right", justificado: "justify" };
const ETIQUETAS: Record<string, string> = { video: "Vídeo", audio: "Audio", web: "Sitio web", app: "App del OS", vivo: "App en vivo", archivo: "Archivo" };

export function escaparHtml(t: string): string {
    return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c] ?? c);
}

export function hexValido(c: unknown): string | null {
    return typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
}

function esEnlaceSeguro(url: string): boolean {
    return /^https?:\/\//i.test(url) || /^mailto:/i.test(url);
}

function alineacion(a?: string): string {
    const v = a ? ALINEACIONES[a] : "";
    return v ? `text-align:${v};` : "";
}

function tramoAHtml(t: TramoTexto, factor: number): string {
    let html = escaparHtml(t.texto);
    const marcas = t.marcas ?? [];
    if (marcas.includes("codigo")) html = `<code>${html}</code>`;
    if (marcas.includes("negrita")) html = `<strong>${html}</strong>`;
    if (marcas.includes("cursiva")) html = `<em>${html}</em>`;
    if (marcas.includes("subrayado")) html = `<u>${html}</u>`;
    if (marcas.includes("tachado")) html = `<s>${html}</s>`;
    const color = hexValido(t.color);
    if (color) html = `<span style="color:${color}">${html}</span>`;
    if (t.enlace && esEnlaceSeguro(t.enlace)) {
        html = `<a href="${escaparHtml(t.enlace)}" rel="noopener noreferrer">${html}</a>`;
    }
    return html;
}

function tramosAHtml(tramos: TramoTexto[], factor: number): string {
    return tramos.map((t) => tramoAHtml(t, factor)).join("");
}

function bloqueAHtml(b: BloqueDoc, factor: number): string {
    const m = Math.round(8 * factor);
    switch (b.tipo) {
        case "titulo": {
            const tam = b.nivel === 1 ? 44 : b.nivel === 2 ? 34 : 26;
            return `<h${b.nivel} style="margin:0 0 ${m}px;font-size:${Math.round(tam * factor)}px;${alineacion(b.alineacion)}">${tramosAHtml(b.tramos, factor)}</h${b.nivel}>`;
        }
        case "parrafo":
            return `<p style="margin:0 0 ${m}px;${alineacion(b.alineacion)}">${tramosAHtml(b.tramos, factor)}</p>`;
        case "lista": {
            const etiqueta = b.ordenada ? "ol" : "ul";
            return `<${etiqueta} style="margin:0 0 ${m}px;padding-left:${Math.round(24 * factor)}px">${b.items.map((it) => `<li>${tramosAHtml(it, factor)}</li>`).join("")}</${etiqueta}>`;
        }
        case "tareas":
            return `<ul style="list-style:none;margin:0 0 ${m}px;padding:0">${b.items.map((it) => `<li>${it.hecha ? "☑" : "☐"} ${tramosAHtml(it.tramos, factor)}</li>`).join("")}</ul>`;
        case "cita":
            return `<blockquote style="margin:0 0 ${m}px;padding-left:${Math.round(16 * factor)}px;border-left:${Math.max(1, Math.round(3 * factor))}px solid currentColor">${tramosAHtml(b.tramos, factor)}</blockquote>`;
        case "codigo":
            return `<pre style="margin:0 0 ${m}px;white-space:pre-wrap"><code>${escaparHtml(b.texto)}</code></pre>`;
        case "separador":
            return `<hr style="border:0;border-top:1px solid currentColor;margin:${m}px 0">`;
        default:
            return "";
    }
}

export function docRicoAHtml(doc: DocRico, factor: number): string {
    return doc.bloques.map((b) => bloqueAHtml(b, factor)).join("");
}

export function elementoAHtml(el: ElementoLienzo, factor: number): string {
    const caja = `position:absolute;left:${Math.round(el.x * factor)}px;top:${Math.round(el.y * factor)}px;width:${Math.round(el.w * factor)}px;height:${Math.round(el.h * factor)}px;z-index:${Math.round(el.z)};transform:rotate(${el.rot ?? 0}deg);opacity:${Math.max(0, Math.min(1, el.opacidad ?? 1))};border-radius:${Math.round((el.radio ?? 0) * factor)}px;`;
    let contenido = "";
    if (el.tipo === "texto") {
        const e = el.estilo ?? {};
        const est = [`font-family:${FUENTES_HTML[e.fuente ?? "inter"]}`, "width:100%", "height:100%", "white-space:pre-wrap"];
        if (typeof e.tamano === "number") est.push(`font-size:${Math.round(e.tamano * factor)}px`);
        const color = hexValido(e.color);
        if (color) est.push(`color:${color}`);
        if (e.alineacion) est.push(alineacion(e.alineacion));
        if (e.negrita) est.push("font-weight:700");
        if (e.cursiva) est.push("font-style:italic");
        contenido = `<div style="${est.join(";")}">${docRicoAHtml(el.texto ?? { bloques: [] }, factor)}</div>`;
    } else if (el.tipo === "imagen" || el.tipo === "gif") {
        const url = el.url ?? "";
        if (!/^data:image\//i.test(url) && !/^https:\/\//i.test(url)) return "";
        contenido = `<img alt="" src="${escaparHtml(url)}" style="width:100%;height:100%;object-fit:contain">`;
    } else if (el.tipo === "forma") {
        const f = el.forma;
        const color = hexValido(f?.color); let est = "";
        if (f?.tipo === "circulo") est += "border-radius:50%;";
        if (f?.tipo === "estrella") est += "clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);";
        if (color && f?.tipo === "linea") est += `background:${color};border-radius:999px;`;
        else if (color && f?.relleno) est += `background:${color};`;
        else if (color) est += `border:2px solid ${color};box-sizing:border-box;`;
        const altoForma = f?.tipo === "linea" ? `height:${Math.max(2, Math.round(2 * factor))}px` : "height:100%";
        contenido = `<div style="${est}width:100%;${altoForma}"></div>`;
    } else {
        const nombre = (el.nombre || ETIQUETAS[el.tipo] || "Contenido").trim();
        contenido = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:8px;background:rgba(15,23,42,.55);border:1px solid rgba(255,255,255,.28);color:#fff;font:16px/1.3 Inter,system-ui,sans-serif;text-align:center;overflow:hidden">${escaparHtml(nombre)}</div>`;
    }
    return `<div style="${caja}">${contenido}</div>`;
}
