/**
 * Piezas puras del exportador HTML de la presentación en vivo (DSN1025D, ficha lib-frontend-slides).
 * Sin `node:*`, sin DOM y sin red: solo texto de entrada → HTML escapado de salida. El HTML que
 * produce es de un solo archivo y estático (sin animaciones, sin iframes, sin scripts ajeno).
 */
import type {
    AlineacionBloque,
    BloqueDoc,
    DocRico,
    ElementoLienzo,
    EstiloMensaje,
    FuenteMensaje,
    TramoTexto,
} from "@/lib/mensajeria/formato-tipos";

/** Escapa & < > " ' para texto y valores de atributo. */
export function escaparHtml(t: string): string {
    return t
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** Solo hex de 3 a 8 dígitos (#fff, #abcd12…). Cualquier otra cosa → null. */
export function hexValido(c: unknown): string | null {
    return typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
}

/** Pilas de fuentes concretas, sin variables CSS de next/font (el HTML debe valer fuera del OS). */
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

// ───────────────────────────── Helpers de formato ─────────────────────────────

function fmt(n: number): string {
    return String(Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
}

function enlaceSeguro(url: string): string | null {
    return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

const ALINEACIONES: Record<Exclude<AlineacionBloque, "izquierda">, string> = {
    centro: "center",
    derecha: "right",
    justificado: "justify",
};

function alineacionAStyle(a?: AlineacionBloque): string {
    return a && a !== "izquierda" ? `text-align:${ALINEACIONES[a]}` : "";
}

/** Un tramo de texto: marcas → etiquetas; enlace solo http(s)/mailto; colores solo con `hexValido`. */
function tramoAHtml(t: TramoTexto, factor: number): string {
    let html = escaparHtml(t.texto);
    const m = t.marcas ?? [];
    if (m.includes("codigo")) html = `<code>${html}</code>`;
    if (m.includes("tachado")) html = `<s>${html}</s>`;
    if (m.includes("subrayado")) html = `<u>${html}</u>`;
    if (m.includes("cursiva")) html = `<em>${html}</em>`;
    if (m.includes("negrita")) html = `<strong>${html}</strong>`;
    const href = t.enlace ? enlaceSeguro(t.enlace) : null;
    if (href) html = `<a href="${escaparHtml(href)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
    const color = hexValido(t.color);
    const resaltado = hexValido(t.resaltado);
    const fuente = t.fuente ? FUENTES_HTML[t.fuente] : null;
    const tamano = typeof t.tamano === "number" ? `font-size:${fmt(t.tamano * factor)}px` : "";
    const extras = [tamano, fuente ? `font-family:${fuente}` : "", color ? `color:${color}` : "", resaltado ? `background-color:${resaltado}` : ""].filter(Boolean).join(";");
    if (extras) html = `<span style="${extras}">${html}</span>`;
    return html;
}

function tramosAHtml(tramos: TramoTexto[], factor: number): string {
    return tramos.map((t) => tramoAHtml(t, factor)).join("");
}

function bloqueAHtml(b: BloqueDoc, factor: number): string {
    const st = alineacionAStyle(b.tipo === "parrafo" || b.tipo === "titulo" ? b.alineacion : undefined);
    const atr = st ? ` style="${st}"` : "";
    switch (b.tipo) {
        case "titulo":
            return `<h${b.nivel}${atr}>${tramosAHtml(b.tramos, factor)}</h${b.nivel}>`;
        case "parrafo":
            return `<p${atr}>${tramosAHtml(b.tramos, factor)}</p>`;
        case "lista": {
            const tag = b.ordenada ? "ol" : "ul";
            return `<${tag}>${b.items.map((it) => `<li>${tramosAHtml(it, factor)}</li>`).join("")}</${tag}>`;
        }
        // Lista de tareas con ☐/☑: nunca <input> (el archivo es estático).
        case "tareas":
            return `<ul class="tareas">${b.items.map((it) => `<li>${it.hecha ? "☑" : "☐"} ${tramosAHtml(it.tramos, factor)}</li>`).join("")}</ul>`;
        case "cita":
            return `<blockquote>${tramosAHtml(b.tramos, factor)}</blockquote>`;
        case "codigo":
            return `<pre><code>${escaparHtml(b.texto)}</code></pre>`;
        case "separador":
            return `<hr>`;
    }
}

/** Doc rico → HTML: título→h1/h2/h3, párrafo→p, lista→ul/ol, tareas→☐/☑, cita→blockquote, código→pre, separador→hr. */
export function docRicoAHtml(doc: DocRico, factor: number): string {
    return doc.bloques.map((b) => bloqueAHtml(b, factor)).join("");
}

/** Estilo del texto del elemento: fuente, tamaño × factor, color, alineación, negrita y cursiva. */
function estiloTextoAHtml(e: EstiloMensaje | undefined, factor: number): string {
    const p: string[] = [];
    if (e?.fuente) p.push(`font-family:${FUENTES_HTML[e.fuente]}`);
    if (typeof e?.tamano === "number") p.push(`font-size:${fmt(e.tamano * factor)}px`);
    const color = hexValido(e?.color);
    if (color) p.push(`color:${color}`);
    if (e?.alineacion && e.alineacion !== "izquierda") p.push(`text-align:${ALINEACIONES[e.alineacion]}`);
    if (e?.negrita) p.push("font-weight:700");
    if (e?.cursiva) p.push("font-style:italic");
    return p.join(";");
}

// ───────────────────────────── Elemento del lienzo ─────────────────────────────

function posicionAbsoluta(el: ElementoLienzo, factor: number): string {
    const p: string[] = [
        "position:absolute",
        `left:${fmt(el.x * factor)}px`,
        `top:${fmt(el.y * factor)}px`,
        `width:${fmt(el.w * factor)}px`,
        `height:${fmt(el.h * factor)}px`,
        `z-index:${Number.isFinite(el.z) ? el.z : 0}`,
    ];
    if (el.rot) p.push(`transform:rotate(${el.rot}deg)`);
    if (typeof el.opacidad === "number") p.push(`opacity:${Math.min(1, Math.max(0, el.opacidad))}`);
    if (el.radio) p.push(`border-radius:${fmt(el.radio * factor)}px`);
    return p.join(";");
}

const ETIQUETAS: Partial<Record<ElementoLienzo["tipo"], string>> = {
    video: "Vídeo",
    audio: "Audio",
    web: "Sitio web",
    app: "App del OS",
    vivo: "App en vivo",
    archivo: "Archivo",
    imagen: "Imagen",
    gif: "GIF",
    forma: "Forma",
    texto: "Texto",
};

/** Estrella de 10 puntas con proporciones áureas (0,618 / 0,764), vía `clip-path`. */
const ESTRELLA_CLIP =
    "polygon(50% 0%,61.8% 38.2%,100% 38.2%,69.1% 61.8%,80.9% 100%,50% 76.4%,19.1% 100%,30.9% 61.8%,0% 38.2%,38.2% 38.2%)";

function formaAHtml(el: ElementoLienzo, factor: number): string {
    const color = hexValido(el.forma?.color) ?? "#888888";
    const relleno = el.forma?.relleno !== false;
    const borde = `border:${fmt(2 * factor)}px solid ${color}`;
    if (el.forma?.tipo === "linea") {
        const st = `position:absolute;left:${fmt(el.x * factor)}px;top:${fmt((el.y + (el.h - 2) / 2) * factor)}px;width:${fmt(el.w * factor)}px;height:${fmt(2 * factor)}px;background:${color};z-index:${el.z}`;
        return `<div style="${st}"></div>`;
    }
    const p: string[] = [posicionAbsoluta(el, factor)];
    switch (el.forma?.tipo) {
        case "circulo":
            p.push(relleno ? `background:${color}` : borde, "border-radius:50%");
            break;
        case "estrella":
            p.push(`background:${color}`, `clip-path:${ESTRELLA_CLIP}`);
            break;
        default:
            p.push(relleno ? `background:${color}` : borde);
            break;
    }
    return `<div style="${p.join(";")}"></div>`;
}

/**
 * Caja inerte para vídeo, audio, web, app, vivo y archivo: solo el nombre. Jamás iframe, <video>
 * ni <audio>: el HTML de archivo no ejecuta nada ajeno.
 */
function cajaAHtml(el: ElementoLienzo, factor: number): string {
    const etiqueta = ETIQUETAS[el.tipo] ?? "Archivo";
    const texto = el.nombre ? `${etiqueta}: ${el.nombre}` : etiqueta;
    const st = `${posicionAbsoluta(el, factor)};display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:${fmt(8 * factor)}px;border:1px solid rgba(255,255,255,.35);border-radius:${fmt((el.radio ?? 12) * factor)}px;text-align:center;overflow:hidden`;
    return `<div style="${st}">${escaparHtml(texto)}</div>`;
}

/** Un elemento del lienzo → `<div>` absoluto. Imagen/gif solo data:image/ o https://; si no, se omite. */
export function elementoAHtml(el: ElementoLienzo, factor: number): string {
    if (el.tipo === "imagen" || el.tipo === "gif") {
        const u = el.url ?? "";
        if (!u.startsWith("data:image/") && !u.startsWith("https://")) return "";
        return `<div style="${posicionAbsoluta(el, factor)}"><img alt="" src="${escaparHtml(u)}" style="width:100%;height:100%;object-fit:contain"></div>`;
    }
    if (el.tipo === "forma" && el.forma) return formaAHtml(el, factor);
    if (el.tipo === "texto") {
        const contenido = el.texto ? docRicoAHtml(el.texto, factor) : "";
        const st = `${posicionAbsoluta(el, factor)};box-sizing:border-box;overflow:hidden;${estiloTextoAHtml(el.estilo, factor)}`;
        return `<div style="${st}">${contenido}</div>`;
    }
    // vídeo, audio, web, app, vivo, archivo (y forma sin forma definida): caja con el nombre.
    return cajaAHtml(el, factor);
}
