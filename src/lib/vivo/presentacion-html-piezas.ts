/**
 * Piezas HTML para la exportación de la presentación en vivo (2026-10-27 · tarea DSN1025D,
 * ficha lib-frontend-slides en config/repos-libreria-1025.json: HTML de un solo archivo,
 * sin dependencias, escenario fijo honesto).
 *
 * Núcleo PURO: sin `node:*`, sin DOM, sin red. Convierte los tipos de
 * `@/lib/mensajeria/formato-tipos` en cadenas HTML escapadas: todo texto pasa por
 * `escaparHtml`, los colores solo salen si `hexValido` los acepta, los enlaces solo
 * http(s)/mailto y ningún elemento media ejecuta nada ajeno (nada de iframes ni reproductores).
 */
import type {
    BloqueDoc,
    DocRico,
    ElementoLienzo,
    EstiloMensaje,
    FuenteMensaje,
    MarcaTexto,
    TramoTexto,
} from "@/lib/mensajeria/formato-tipos";

/** Escapa texto para HTML: &, <, >, " y '. */
export function escaparHtml(t: string): string {
    return t
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const PATRON_HEX = /^#[0-9a-fA-F]{3,8}$/;

/** Un color del dato solo es usable si es hex válido (#rgb … #rrggbbaa); si no, null. */
export function hexValido(c: unknown): string | null {
    if (typeof c !== "string" || !PATRON_HEX.test(c)) return null;
    return c;
}

/** */
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

/** Solo http(s) o mailto; cualquier otra cosa (javascript:, rutas) queda como texto. */
function enlaceValido(enlace: string): boolean {
    return /^https?:\/\//i.test(enlace) || /^mailto:/i.test(enlace);
}

/** Redondea a 2 decimales para que el HTML no lleve ruido de coma flotante. */
function num(n: number): string {
    const r = Math.round(n * 100) / 100;
    return String(r);
}

/** */
export function tramoAHtml(t: TramoTexto, factor: number): string {
    let s: string;
    if (t.enlace && enlaceValido(t.enlace)) {
        s = `<a href="${escaparHtml(t.enlace)}" rel="noopener noreferrer">${escaparHtml(t.texto || t.enlace)}</a>`;
    } else if (t.enlace && !enlaceValido(t.enlace)) {
        s = escaparHtml(t.enlace);
    } else {
        s = escaparHtml(t.texto);
    }
    s = aplicarMarcas(s, t.marcas);
    const estilos = estilosDeTramo(t, factor);
    return estilos.length ? `<span style="${estilos.join(";")}">${s}</span>` : s;
}

/** Color, resaltado, fuente y tamaño del tramo, todos con valor validado y factor. */
function estilosDeTramo(t: TramoTexto, factor: number): string[] {
    const estilos: string[] = [];
    const color = hexValido(t.color);
    const fondo = hexValido(t.resaltado);
    if (color) estilos.push(`color:${color}`);
    if (fondo) estilos.push(`background:${fondo}`);
    if (t.fuente) estilos.push(`font-family:${FUENTES_HTML[t.fuente]}`);
    if (t.tamano) estilos.push(`font-size:${num(t.tamano * factor)}px`);
    return estilos;
}

/** Marcas a etiquetas simples; sin guiones, sin atributos ni JavaScript. */
function aplicarMarcas(s: string, marcas?: MarcaTexto[]): string {
    if (!marcas) return s;
    if (marcas.includes("codigo")) s = `<code>${s}</code>`;
    if (marcas.includes("negrita")) s = `<strong>${s}</strong>`;
    if (marcas.includes("cursiva")) s = `<em>${s}</em>`;
    if (marcas.includes("subrayado")) s = `<u>${s}</u>`;
    if (marcas.includes("tachado")) s = `<s>${s}</s>`;
    return s;
}

/** Alineación de un bloque (párrafo o título) a estilo en línea. */
function alineacionHtml(al?: "izquierda" | "centro" | "derecha" | "justificado"): string {
    if (!al || al === "izquierda") return "";
    return ` style="text-align:${al === "justificado" ? "justify" : al}"`;
}

/** */
export function docRicoAHtml(doc: DocRico, factor: number): string {
    return doc.bloques.map((b) => bloqueAHtml(b, factor)).join("");
}

/** Un bloque del doc rico, a su etiqueta; las tareas son texto con casilla, JAMÁS un `<input>`. */
function bloqueAHtml(b: BloqueDoc, factor: number): string {
    switch (b.tipo) {
        case "titulo":
            return `<h${b.nivel}${alineacionHtml(b.alineacion)}>${tramosAHtml(b.tramos, factor)}</h${b.nivel}>`;
        case "parrafo":
            return `<p${alineacionHtml(b.alineacion)}>${tramosAHtml(b.tramos, factor)}</p>`;
        case "lista": {
            const tag = b.ordenada ? "ol" : "ul";
            const items = b.items.map((it) => `<li>${tramosAHtml(it, factor)}</li>`).join("");
            return `<${tag}>${items}</${tag}>`;
        }
        case "tareas":
            return (
                `<ul class="tareas">` +
                b.items.map((it) => `<li>${it.hecha ? "&#9745;" : "&#9744;"} ${tramosAHtml(it.tramos, factor)}</li>`).join("") +
                `</ul>`
            );
        case "cita":
            return `<blockquote>${tramosAHtml(b.tramos, factor)}</blockquote>`;
        case "codigo":
            return `<pre>${escaparHtml(b.texto)}</pre>`;
        case "separador":
            return `<hr>`;
    }
}

/** */
export function tramosAHtml(ts: TramoTexto[], factor: number): string {
    return ts.map((t) => tramoAHtml(t, factor)).join("");
}

// ───────────────── Elemento del lienzo ─────────────────

const NOMBRE_MEDIA: Partial<Record<ElementoLienzo["tipo"], string>> = {
    video: "Vídeo",
    audio: "Audio",
    web: "Sitio web",
    app: "App del OS",
    vivo: "App en vivo",
    archivo: "Archivo",
};

/** Estilo del texto: fuente del mapa (nunca variables CSS de next/font), tamaño ×factor, etc. */
function estiloTextoDe(e: EstiloMensaje, factor: number): string[] {
    const estilos: string[] = [`font-family:${FUENTES_HTML[e.fuente ?? "inter"]}`];
    if (e.tamano) estilos.push(`font-size:${num(e.tamano * factor)}px`);
    const color = hexValido(e.color);
    if (color) estilos.push(`color:${color}`);
    if (e.alineacion && e.alineacion !== "izquierda") estilos.push(`text-align:${e.alineacion}`);
    if (e.negrita) estilos.push("font-weight:700");
    if (e.cursiva) estilos.push("font-style:italic");
    return estilos;
}

/** Imagen solo si la url es `data:image/` o `https://`; cualquier otra cosa se omite. */
function imagenSegura(url: string | undefined): string {
    if (!url || (!url.startsWith("data:image/") && !url.startsWith("https://"))) return "";
    return `<img alt="" src="${escaparHtml(url)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain">`;
}

/** Forma segura: color validado; círculo con border-radius, estrella con clip-path, línea fina. */
function formaAHtml(el: ElementoLienzo): string {
    const f = el.forma;
    if (!f) return "";
    const color = hexValido(f.color) ?? "#ffffff";
    const radio = el.radio ? `border-radius:${num(el.radio)}px` : "";
    const pleno = f.relleno ? `background:${color}` : `border:3px solid ${color}`;
    if (f.tipo === "estrella") {
        return `<div style="position:absolute;inset:0;background:${color};clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)"></div>`;
    }
    if (f.tipo === "circulo") return `<div style="position:absolute;inset:0;border-radius:50%;${pleno}"></div>`;
    if (f.tipo === "linea") {
        const grosor = Math.max(2, Math.round(4 / 2));
        return `<div style="position:absolute;left:0;right:0;top:50%;height:${grosor}px;margin-top:-${Math.round(grosor / 2)}px;border-radius:2px;background:${color}"></div>`;
    }
    return `<div style="position:absolute;inset:0;${radio || "border-radius:8px"};${pleno}"></div>`;
}

/** */
export function elementoAHtml(el: ElementoLienzo, factor: number): string {
    const caja = [
        "position:absolute",
        `left:${num(el.x * factor)}px`,
        `top:${num(el.y * factor)}px`,
        `width:${num(el.w * factor)}px`,
        `height:${num(el.h * factor)}px`,
        `z-index:${Math.max(1, Math.round(el.z) || 1)}`,
    ];
    if (el.opacidad !== undefined) caja.push(`opacity:${num(el.opacidad)}`);
    if (el.rot) caja.push(`transform:rotate(${num(el.rot)}deg)`);
    const radio = el.radio ? `border-radius:${num(el.radio * factor)}px` : "";

    let contenido = "";
    let extra = radio;
    if (el.tipo === "texto") {
        extra = `${radio};overflow:hidden;${estiloTextoDe(el.estilo ?? {}, factor).join(";")}`;
        contenido = docRicoAHtml(el.texto ?? { bloques: [] }, factor);
    } else if (el.tipo === "imagen" || el.tipo === "gif") {
        contenido = imagenSegura(el.url);
    } else if (el.tipo === "forma") {
        contenido = formaAHtml(el);
    } else {
        const nombre = NOMBRE_MEDIA[el.tipo] ?? "Elemento";
        const etiqueta = escaparHtml(el.nombre?.trim() || nombre);
        contenido = `<div class="media" style="${radio}">${etiqueta}</div>`;
    }
    return `<div class="caja" style="${caja.join(";")}${extra ? `;${extra}` : ""}">${contenido}</div>`;
}
