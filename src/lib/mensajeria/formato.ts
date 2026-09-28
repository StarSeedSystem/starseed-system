/**
 * Mensajes enriquecidos (2026-09-28) — lógica PURA del formato (contrato C4).
 *
 * `validarFormato` es la puerta de entrada de cualquier `FormatoMensaje`: lo que escribe el editor,
 * lo que llega de la base de datos y lo que manda un cliente viejo o malicioso. Lista blanca campo a
 * campo (lo desconocido se descarta), números acotados a `LIMITES_FORMATO`, colores solo hex o ids
 * conocidos, enlaces solo http(s)/mailto/ruta interna y medios solo https o rutas del propio OS.
 * Lo peligroso (javascript:, blob:, tamaños desmedidos) no se «arregla»: se rechaza con un mensaje
 * en castellano que el editor enseña tal cual.
 *
 * Sin DOM, sin red, sin React en tiempo de ejecución (solo el tipo CSSProperties). Nunca lanza.
 */
import type { CSSProperties } from "react";
import type { DmAttachment } from "@/lib/messages/dm";
import {
    FONDOS_BURBUJA,
    FUENTES_MENSAJE,
    LIMITES_FORMATO,
    type AdjuntoVivo,
    type AlineacionBloque,
    type AnimacionFondo,
    type AnimacionTexto,
    type BloqueDoc,
    type DocRico,
    type ElementoLienzo,
    type EstiloMensaje,
    type FormatoMensaje,
    type FuenteMensaje,
    type LienzoMensaje,
    type MarcaTexto,
    type PermisoVivo,
    type TipoElementoLienzo,
    type TipoVivo,
    type TramoTexto,
} from "@/lib/mensajeria/formato-tipos";

// ───────────────────────────── Catálogos ─────────────────────────────

export const ANIMACIONES_TEXTO: { id: AnimacionTexto; nombre: string; porLetra: boolean; bucle: boolean }[] = [
    { id: "ninguna", nombre: "Sin animación", porLetra: false, bucle: false },
    { id: "aparecer", nombre: "Aparecer", porLetra: true, bucle: false },
    { id: "maquina", nombre: "Máquina de escribir", porLetra: true, bucle: false },
    { id: "ola", nombre: "Ola", porLetra: true, bucle: true },
    { id: "brillo", nombre: "Brillo", porLetra: true, bucle: true },
    { id: "latido", nombre: "Latido", porLetra: false, bucle: true },
    { id: "arcoiris", nombre: "Arcoíris", porLetra: false, bucle: true },
    { id: "neon", nombre: "Neón", porLetra: false, bucle: true },
    { id: "flotar", nombre: "Flotar", porLetra: false, bucle: true },
    { id: "temblor", nombre: "Temblor", porLetra: true, bucle: true },
];

export const ANIMACIONES_FONDO: { id: AnimacionFondo; nombre: string }[] = [
    { id: "ninguna", nombre: "Sin animación" },
    { id: "aurora", nombre: "Aurora" },
    { id: "estrellas", nombre: "Estrellas" },
    { id: "gradiente", nombre: "Gradiente" },
    { id: "pulso", nombre: "Pulso" },
    { id: "particulas", nombre: "Partículas" },
];

export type PresetLienzo = "cuadrado" | "vertical" | "historia" | "horizontal";

/** Tamaños de lienzo en unidades de diseño (a 1× se ven como píxeles). */
export const PRESETS_LIENZO: { id: PresetLienzo; nombre: string; proporcion: string; ancho: number; alto: number }[] = [
    { id: "cuadrado", nombre: "Cuadrado", proporcion: "1:1", ancho: 540, alto: 540 },
    { id: "vertical", nombre: "Vertical", proporcion: "4:5", ancho: 540, alto: 675 },
    { id: "historia", nombre: "Historia", proporcion: "9:16", ancho: 540, alto: 960 },
    { id: "horizontal", nombre: "Horizontal", proporcion: "16:9", ancho: 960, alto: 540 },
];

/** Más letras que esto y la animación pasa de «por letra» a «de bloque» (coste del DOM). */
export const MAX_LETRAS_ANIMADAS = 400;
/** Imágenes incrustadas como `data:image/*` (pegatinas, recortes pequeños). */
export const MAX_DATA_IMAGEN_BYTES = 300 * 1024;

const IDS_FUENTE = new Set<string>(FUENTES_MENSAJE.map((f) => f.id));
const IDS_FONDO = new Set<string>(FONDOS_BURBUJA.map((f) => f.id));
const IDS_ANIM_TEXTO = new Set<string>(ANIMACIONES_TEXTO.map((a) => a.id));
const IDS_ANIM_FONDO = new Set<string>(ANIMACIONES_FONDO.map((a) => a.id));
const MARCAS: readonly MarcaTexto[] = ["negrita", "cursiva", "subrayado", "tachado", "codigo"];
const ALINEACIONES_ESTILO = new Set(["izquierda", "centro", "derecha"]);
const ALINEACIONES_BLOQUE = new Set(["izquierda", "centro", "derecha", "justificado"]);
const TIPOS_ELEMENTO = new Set<TipoElementoLienzo>(["texto", "imagen", "gif", "video", "audio", "web", "app", "vivo", "archivo", "forma"]);
const TIPOS_VIVO = new Set<TipoVivo>([
    "sala", "pizarra", "documento", "presentacion", "tabla", "navegador", "juego", "programa", "escritorio", "dashboard", "escena3d", "xr",
]);
const PERMISOS_VIVO = new Set<PermisoVivo>(["ver", "comentar", "editar"]);
const FORMAS = new Set(["rect", "circulo", "estrella", "linea"]);

/** Nombre legible de cada tipo de elemento (marcadores de texto plano y UI). */
export const NOMBRE_ELEMENTO: Record<TipoElementoLienzo, string> = {
    texto: "texto",
    imagen: "imagen",
    gif: "gif",
    video: "vídeo",
    audio: "audio",
    web: "ventana",
    app: "app",
    vivo: "en vivo",
    archivo: "archivo",
    forma: "forma",
};

// ───────────────────────────── Utilidades básicas ─────────────────────────────

type Obj = Record<string, unknown>;

function esObj(v: unknown): v is Obj {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function redondear(n: number, decimales = 2): number {
    const f = 10 ** decimales;
    return Math.round(n * f) / f;
}

/** Número finito acotado a [min, max]; `undefined` si no es un número. */
export function acotar(v: unknown, min: number, max: number): number | undefined {
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    return redondear(Math.min(max, Math.max(min, v)));
}

const RE_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Color hex válido (#rgb, #rrggbb, #rrggbbaa), en minúsculas; si no, `undefined`. */
export function colorValido(c: unknown): string | undefined {
    if (typeof c !== "string") return undefined;
    const t = c.trim();
    return RE_HEX.test(t) ? t.toLowerCase() : undefined;
}

/** Fondo de burbuja válido: color hex o id de `FONDOS_BURBUJA`. */
export function fondoValido(f: unknown): string | undefined {
    if (typeof f !== "string") return undefined;
    const t = f.trim();
    if (IDS_FONDO.has(t)) return t;
    return colorValido(t);
}

/** CSS de un fondo ya validado (preset o hex). */
export function fondoCssDe(fondo?: string | null): string | undefined {
    if (!fondo) return undefined;
    const preset = FONDOS_BURBUJA.find((f) => f.id === fondo);
    if (preset) return preset.css;
    return colorValido(fondo);
}

/**
 * Color de texto legible sobre un fondo (preset o hex). `undefined` si no hay fondo o es muy
 * transparente: entonces manda el color de la burbuja.
 */
export function colorTextoSobre(fondo?: string | null): string | undefined {
    if (!fondo) return undefined;
    if (IDS_FONDO.has(fondo)) return "#ffffff"; // todos los presets son oscuros o saturados
    const hex = colorValido(fondo);
    if (!hex) return undefined;
    let h = hex.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const alfa = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    if (alfa < 0.45) return undefined;
    const canal = (i: number) => {
        const c = parseInt(h.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
    return lum > 0.45 ? "#0b0d1a" : "#ffffff";
}

// Controles C0/C1 y espacios: nunca dentro de una URL que aceptemos.
// eslint-disable-next-line no-control-regex
const RE_CONTROL_O_ESPACIO = /[\u0000-\u0020\u007F-\u009F\u2028\u2029]/;
// eslint-disable-next-line no-control-regex
const RE_CONTROL_TEXTO = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Ruta del propio OS: empieza por «/» pero no por «//» ni «/\» (serían otro dominio). */
export function esRutaInterna(s: string): boolean {
    return (
        s.length > 0 &&
        s.length <= 2000 &&
        s.startsWith("/") &&
        !s.startsWith("//") &&
        !s.includes("\\") &&
        !RE_CONTROL_O_ESPACIO.test(s)
    );
}

/**
 * Rutas de servidor del OS (API, callbacks de sesión): nunca se cargan solas desde un mensaje
 * (una imagen o una ventana harían la petición con la sesión de quien lo lee).
 */
export function esRutaDeServidor(ruta: string): boolean {
    return /^\/(api|auth)(\/|\?|#|$)/i.test(ruta);
}

function urlHttp(s: string, soloHttps: boolean): string | null {
    if (s.length > 2000 || RE_CONTROL_O_ESPACIO.test(s) || s.includes("\\")) return null;
    if (!/^https?:\/\//i.test(s)) return null;
    try {
        const u = new URL(s);
        if (u.protocol === "https:") return s;
        if (u.protocol === "http:" && !soloHttps) return s;
        return null;
    } catch {
        return null;
    }
}

/** Enlace de texto seguro: http(s), mailto: o ruta interna. `null` si no lo es. */
export function enlaceSeguro(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t) return null;
    if (esRutaInterna(t)) return t;
    if (/^mailto:[^\s]+$/i.test(t) && t.length <= 500 && !RE_CONTROL_O_ESPACIO.test(t)) return t;
    return urlHttp(t, false);
}

/** Dirección de una ventana web: solo https (http se bloquearía como contenido mixto). */
export function urlWebSegura(v: unknown): string | null {
    if (typeof v !== "string") return null;
    return urlHttp(v.trim(), true);
}

const RE_DATA_IMAGEN = /^data:image\/(png|jpeg|jpg|gif|webp|avif|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Bytes que ocupa el contenido de un `data:…;base64,…`. */
function bytesBase64(b64: string): number {
    const relleno = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
    return Math.floor((b64.length * 3) / 4) - relleno;
}

export type ResultadoUrl = { ok: true; url: string } | { ok: false; error: string };

/**
 * URL de un medio (foto, gif, vídeo, audio, archivo): https o ruta del OS; `data:image/*` pequeño
 * solo si se permite. `blob:` nunca (no sobrevive a la pestaña que lo creó).
 */
export function urlMediaSegura(v: unknown, opciones: { permitirDataImagen?: boolean } = {}): ResultadoUrl {
    if (typeof v !== "string" || !v.trim()) return { ok: false, error: "Falta la dirección del archivo." };
    const t = v.trim();
    if (esRutaInterna(t)) {
        return esRutaDeServidor(t) ? { ok: false, error: "Esa ruta del OS no es un archivo que se pueda mostrar." } : { ok: true, url: t };
    }
    if (/^blob:/i.test(t)) {
        return { ok: false, error: "Un archivo local (blob:) no se puede enviar tal cual: súbelo primero y se guardará con su enlace." };
    }
    if (/^data:/i.test(t)) {
        const m = RE_DATA_IMAGEN.exec(t);
        if (!opciones.permitirDataImagen || !m) {
            return { ok: false, error: "Solo se pueden incrustar imágenes pequeñas (png, jpg, gif, webp) directamente en el mensaje." };
        }
        if (bytesBase64(m[2]) > MAX_DATA_IMAGEN_BYTES) {
            return { ok: false, error: "Esa imagen incrustada pesa más de 300 KB: súbela como archivo y quedará enlazada." };
        }
        return { ok: true, url: t };
    }
    if (/^https:\/\//i.test(t)) {
        const u = urlHttp(t, true);
        return u ? { ok: true, url: u } : { ok: false, error: "La dirección del archivo no es válida." };
    }
    if (/^http:\/\//i.test(t)) return { ok: false, error: "Los archivos deben servirse por https para verse en todos los dispositivos." };
    return { ok: false, error: "Esa dirección no está permitida: usa un enlace https o un archivo subido al OS." };
}

/** Host legible de una URL («ejemplo.org»), o la propia cadena si no se puede leer. */
export function hostDeUrl(url?: string | null): string {
    if (!url) return "";
    if (url.startsWith("/")) return "StarSeed OS";
    try {
        return new URL(url).host.replace(/^www\./, "");
    } catch {
        return url.slice(0, 60);
    }
}

function textoLimpio(v: unknown, max: number): string {
    if (typeof v !== "string") return "";
    return v.replace(/\r\n?/g, "\n").replace(RE_CONTROL_TEXTO, "").slice(0, max);
}

function cadenaCorta(v: unknown, max: number): string | undefined {
    if (typeof v !== "string") return undefined;
    const t = textoLimpio(v, max).replace(/\n/g, " ").trim();
    return t || undefined;
}

let contadorIds = 0;
/** Id corto y válido para elementos del lienzo. */
export function nuevoIdElemento(): string {
    contadorIds = (contadorIds + 1) % 1_000_000;
    return `el${Date.now().toString(36)}${contadorIds.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Grafemas de un texto (emoji compuestos, acentos combinados…) con `Intl.Segmenter` si existe. */
export function segmentarGrafemas(t: string): string[] {
    try {
        if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
            const seg = new Intl.Segmenter("es", { granularity: "grapheme" });
            return Array.from(seg.segment(t), (s) => s.segment);
        }
    } catch {
        /* sin Segmenter: por puntos de código */
    }
    return Array.from(t);
}

// ───────────────────────────── Validación ─────────────────────────────

interface Ctx {
    error: string | null;
}

function fallar(ctx: Ctx, mensaje: string) {
    if (!ctx.error) ctx.error = mensaje;
}

/** Estilo del mensaje o de un elemento: lista blanca, colores hex, números acotados. */
export function validarEstilo(v: unknown): EstiloMensaje | undefined {
    if (!esObj(v)) return undefined;
    const e: EstiloMensaje = {};
    if (typeof v.fuente === "string" && IDS_FUENTE.has(v.fuente)) e.fuente = v.fuente as FuenteMensaje;
    const tam = acotar(v.tamano, LIMITES_FORMATO.tamanoMin, LIMITES_FORMATO.tamanoMax);
    if (tam !== undefined) e.tamano = tam;
    const color = colorValido(v.color);
    if (color) e.color = color;
    const colorMarco = colorValido(v.colorMarco);
    if (colorMarco) e.colorMarco = colorMarco;
    const grosor = acotar(v.grosorMarco, 0, 6);
    if (grosor !== undefined) e.grosorMarco = grosor;
    const fondo = fondoValido(v.fondo);
    if (fondo) e.fondo = fondo;
    if (typeof v.animacionTexto === "string" && IDS_ANIM_TEXTO.has(v.animacionTexto) && v.animacionTexto !== "ninguna") {
        e.animacionTexto = v.animacionTexto as AnimacionTexto;
    }
    if (typeof v.animacionFondo === "string" && IDS_ANIM_FONDO.has(v.animacionFondo) && v.animacionFondo !== "ninguna") {
        e.animacionFondo = v.animacionFondo as AnimacionFondo;
    }
    if (typeof v.alineacion === "string" && ALINEACIONES_ESTILO.has(v.alineacion)) {
        e.alineacion = v.alineacion as EstiloMensaje["alineacion"];
    }
    if (v.negrita === true) e.negrita = true;
    if (v.cursiva === true) e.cursiva = true;
    return Object.keys(e).length ? e : undefined;
}

function validarTramo(v: unknown, ctx: Ctx): TramoTexto | null {
    if (!esObj(v)) return null;
    const texto = textoLimpio(v.texto, 20_000);
    if (!texto) return null;
    const t: TramoTexto = { texto };
    if (Array.isArray(v.marcas)) {
        const marcas = MARCAS.filter((m) => (v.marcas as unknown[]).includes(m));
        if (marcas.length) t.marcas = marcas;
    }
    const color = colorValido(v.color);
    if (color) t.color = color;
    const resaltado = colorValido(v.resaltado);
    if (resaltado) t.resaltado = resaltado;
    if (v.enlace !== undefined && v.enlace !== null && v.enlace !== "") {
        const enlace = enlaceSeguro(v.enlace);
        if (!enlace) {
            fallar(ctx, `El enlace «${String(v.enlace).slice(0, 60)}» no está permitido: usa https://, mailto: o una ruta del OS que empiece por «/».`);
        } else t.enlace = enlace;
    }
    if (typeof v.fuente === "string" && IDS_FUENTE.has(v.fuente)) t.fuente = v.fuente as FuenteMensaje;
    const tam = acotar(v.tamano, LIMITES_FORMATO.tamanoMin, LIMITES_FORMATO.tamanoMax);
    if (tam !== undefined) t.tamano = tam;
    return t;
}

function validarTramos(v: unknown, ctx: Ctx): TramoTexto[] {
    if (!Array.isArray(v)) return [];
    const out: TramoTexto[] = [];
    for (const x of v.slice(0, 2000)) {
        const t = validarTramo(x, ctx);
        if (t) out.push(t);
    }
    return out;
}

function alineacionBloque(v: unknown): AlineacionBloque | undefined {
    return typeof v === "string" && ALINEACIONES_BLOQUE.has(v) ? (v as AlineacionBloque) : undefined;
}

function validarBloque(v: unknown, ctx: Ctx): BloqueDoc | null {
    if (!esObj(v)) return null;
    switch (v.tipo) {
        case "parrafo": {
            const b: BloqueDoc = { tipo: "parrafo", tramos: validarTramos(v.tramos, ctx) };
            const al = alineacionBloque(v.alineacion);
            if (al) b.alineacion = al;
            return b;
        }
        case "titulo": {
            const n = Math.round(acotar(v.nivel, 1, 3) ?? 1);
            const nivel: 1 | 2 | 3 = n === 2 ? 2 : n === 3 ? 3 : 1;
            const b: BloqueDoc = { tipo: "titulo", nivel, tramos: validarTramos(v.tramos, ctx) };
            const al = alineacionBloque(v.alineacion);
            if (al) b.alineacion = al;
            return b;
        }
        case "lista": {
            const items = Array.isArray(v.items) ? v.items.slice(0, 500).map((it) => validarTramos(it, ctx)) : [];
            return { tipo: "lista", ordenada: v.ordenada === true, items: items.length ? items : [[]] };
        }
        case "tareas": {
            const items = Array.isArray(v.items)
                ? v.items.slice(0, 500).map((it) => ({
                      hecha: esObj(it) && it.hecha === true,
                      tramos: esObj(it) ? validarTramos(it.tramos, ctx) : [],
                  }))
                : [];
            return { tipo: "tareas", items: items.length ? items : [{ hecha: false, tramos: [] }] };
        }
        case "cita":
            return { tipo: "cita", tramos: validarTramos(v.tramos, ctx) };
        case "codigo": {
            const b: BloqueDoc = { tipo: "codigo", texto: textoLimpio(v.texto, 40_000) };
            if (typeof v.lenguaje === "string" && /^[a-z0-9+#._-]{1,24}$/i.test(v.lenguaje)) b.lenguaje = v.lenguaje.toLowerCase();
            return b;
        }
        case "separador":
            return { tipo: "separador" };
        default:
            return null; // tipo desconocido (cliente futuro): se omite sin romper
    }
}

/** Documento rico: bloques en lista blanca; más de `bloquesDoc` es un error. */
export function validarDoc(v: unknown, ctx: Ctx = { error: null }): DocRico | undefined {
    if (!esObj(v) || !Array.isArray(v.bloques)) return undefined;
    if (v.bloques.length > LIMITES_FORMATO.bloquesDoc) {
        fallar(ctx, `El texto tiene demasiados bloques (${v.bloques.length}); el máximo es ${LIMITES_FORMATO.bloquesDoc}.`);
        return undefined;
    }
    const bloques: BloqueDoc[] = [];
    for (const b of v.bloques) {
        const ok = validarBloque(b, ctx);
        if (ok) bloques.push(ok);
    }
    return { bloques };
}

function validarVivo(v: unknown): AdjuntoVivo | undefined {
    if (!esObj(v) || v.kind !== "vivo") return undefined;
    if (typeof v.tipoVivo !== "string" || !TIPOS_VIVO.has(v.tipoVivo as TipoVivo)) return undefined;
    if (typeof v.sesionId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(v.sesionId)) return undefined;
    if (typeof v.route !== "string" || !esRutaInterna(v.route.trim())) return undefined;
    const vivo: AdjuntoVivo = {
        kind: "vivo",
        tipoVivo: v.tipoVivo as TipoVivo,
        sesionId: v.sesionId,
        route: v.route.trim(),
        name: cadenaCorta(v.name, 200) ?? "App en vivo",
        permiso: typeof v.permiso === "string" && PERMISOS_VIVO.has(v.permiso as PermisoVivo) ? (v.permiso as PermisoVivo) : "ver",
    };
    const url = typeof v.url === "string" ? (esRutaInterna(v.url.trim()) ? v.url.trim() : urlWebSegura(v.url)) : null;
    if (url) vivo.url = url;
    const mime = cadenaCorta(v.mime, 100);
    if (mime) vivo.mime = mime;
    const size = acotar(v.size, 0, 1e12);
    if (size !== undefined) vivo.size = Math.round(size);
    return vivo;
}

function validarElemento(v: unknown, lienzo: { ancho: number; alto: number }, ctx: Ctx, ids: Set<string>): ElementoLienzo | null {
    if (!esObj(v) || typeof v.tipo !== "string" || !TIPOS_ELEMENTO.has(v.tipo as TipoElementoLienzo)) return null;
    const tipo = v.tipo as TipoElementoLienzo;
    let id = typeof v.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v.id) ? v.id : nuevoIdElemento();
    while (ids.has(id)) id = nuevoIdElemento();
    const max = LIMITES_FORMATO.lienzoMax;
    const w = acotar(v.w, 4, max * 2) ?? Math.min(200, lienzo.ancho);
    const h = acotar(v.h, 4, max * 2) ?? Math.min(200, lienzo.alto);
    const el: ElementoLienzo = {
        id,
        tipo,
        x: acotar(v.x, -max, max) ?? 0,
        y: acotar(v.y, -max, max) ?? 0,
        w,
        h,
        z: Math.round(acotar(v.z, 0, 9999) ?? 0),
    };
    if (typeof v.rot === "number" && Number.isFinite(v.rot)) {
        const r = redondear(((v.rot % 360) + 540) % 360 - 180, 1); // (-180, 180]
        if (r !== 0) el.rot = r === -180 ? 180 : r;
    }
    const opacidad = acotar(v.opacidad, 0, 1);
    if (opacidad !== undefined && opacidad < 1) el.opacidad = opacidad;
    const radio = acotar(v.radio, 0, 999);
    if (radio !== undefined && radio > 0) el.radio = radio;
    if (v.bloqueado === true) el.bloqueado = true;
    const estilo = validarEstilo(v.estilo);
    if (estilo) el.estilo = estilo;
    const nombre = cadenaCorta(v.nombre, 200);
    if (nombre) el.nombre = nombre;
    const mime = typeof v.mime === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(v.mime.trim()) && v.mime.length <= 100 ? v.mime.trim().toLowerCase() : undefined;
    if (mime) el.mime = mime;
    const etiqueta = `«${nombre ?? NOMBRE_ELEMENTO[tipo]}»`;

    switch (tipo) {
        case "texto": {
            el.texto = validarDoc(v.texto, ctx) ?? { bloques: [] };
            break;
        }
        case "imagen":
        case "gif":
        case "video":
        case "audio":
        case "archivo": {
            if (v.url === undefined || v.url === null || v.url === "") {
                if (tipo !== "archivo" || !nombre) return null; // sin contenido: nada que pintar
                break;
            }
            const r = urlMediaSegura(v.url, { permitirDataImagen: tipo === "imagen" || tipo === "gif" });
            if (!r.ok) {
                fallar(ctx, `${etiqueta}: ${r.error}`);
                return null;
            }
            el.url = r.url;
            if (tipo === "video" || tipo === "audio" || tipo === "gif") {
                if (v.bucle === true) el.bucle = true;
            }
            if (tipo === "video") {
                if (v.silenciado === true) el.silenciado = true;
                // Reproducción automática solo en silencio (los navegadores la bloquean con sonido).
                if (v.autoplay === true) {
                    el.autoplay = true;
                    el.silenciado = true;
                }
            }
            if (tipo === "audio" && v.silenciado === true) el.silenciado = true;
            break;
        }
        case "web": {
            if (typeof v.url !== "string" || !v.url.trim()) return null;
            const u = urlWebSegura(v.url);
            if (!u) {
                fallar(ctx, `${etiqueta}: las ventanas web solo pueden abrir direcciones https:// (sin javascript:, blob: ni datos).`);
                return null;
            }
            el.url = u;
            break;
        }
        case "app": {
            const ruta = typeof v.ruta === "string" ? v.ruta.trim() : "";
            if (!ruta) return null;
            if (!esRutaInterna(ruta) || esRutaDeServidor(ruta)) {
                fallar(ctx, `${etiqueta}: una app del OS se abre por su ruta interna (por ejemplo «/pizarra»).`);
                return null;
            }
            el.ruta = ruta;
            break;
        }
        case "vivo": {
            const vivo = validarVivo(v.vivo);
            if (!vivo) return null;
            el.vivo = vivo;
            break;
        }
        case "forma": {
            const f = esObj(v.forma) ? v.forma : {};
            el.forma = {
                tipo: typeof f.tipo === "string" && FORMAS.has(f.tipo) ? (f.tipo as "rect" | "circulo" | "estrella" | "linea") : "rect",
                color: colorValido(f.color) ?? "#7c5cff",
            };
            if (f.relleno === true) el.forma.relleno = true;
            break;
        }
    }
    ids.add(id);
    return el;
}

function validarLienzo(v: unknown, ctx: Ctx): LienzoMensaje | undefined {
    if (!esObj(v)) return undefined;
    const max = LIMITES_FORMATO.lienzoMax;
    const ancho = Math.round(acotar(v.ancho, 100, max) ?? 540);
    const alto = Math.round(acotar(v.alto, 100, max) ?? 540);
    const lienzo: LienzoMensaje = { ancho, alto, elementos: [] };
    const fondo = fondoValido(v.fondo);
    if (fondo) lienzo.fondo = fondo;
    if (typeof v.animacionFondo === "string" && IDS_ANIM_FONDO.has(v.animacionFondo) && v.animacionFondo !== "ninguna") {
        lienzo.animacionFondo = v.animacionFondo as AnimacionFondo;
    }
    const elementos = Array.isArray(v.elementos) ? v.elementos : [];
    if (elementos.length > LIMITES_FORMATO.elementosLienzo) {
        fallar(ctx, `El lienzo tiene ${elementos.length} elementos; caben ${LIMITES_FORMATO.elementosLienzo} por mensaje.`);
        return undefined;
    }
    const ids = new Set<string>();
    for (const e of elementos) {
        const el = validarElemento(e, lienzo, ctx, ids);
        if (el) lienzo.elementos.push(el);
    }
    return lienzo;
}

/** Bytes UTF-8 del JSON de un valor (o Infinity si no se puede serializar). */
export function bytesJson(v: unknown): number {
    try {
        const s = JSON.stringify(v);
        if (s === undefined) return 0;
        if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
        return s.length * 3;
    } catch {
        return Infinity;
    }
}

export type ResultadoFormato = { ok: true; formato: FormatoMensaje } | { ok: false; error: string };

/**
 * Valida y normaliza cualquier valor como `FormatoMensaje`. Nunca lanza.
 * Lo desconocido se descarta; los números se acotan; lo peligroso o desmedido se rechaza.
 */
export function validarFormato(f: unknown): ResultadoFormato {
    if (!esObj(f)) return { ok: false, error: "El formato del mensaje no es válido." };
    if (f.v !== undefined && f.v !== 1) return { ok: false, error: "Este mensaje usa un formato más nuevo que esta versión del OS." };
    // Cortafuegos barato antes de recorrer nada: una entrada gigantesca ni se mira.
    const bytesEntrada = bytesJson(f);
    if (bytesEntrada > LIMITES_FORMATO.bytes * 4) {
        return { ok: false, error: `El mensaje es demasiado grande (${Math.round(bytesEntrada / 1024)} KB); el máximo es ${Math.round(LIMITES_FORMATO.bytes / 1000)} KB.` };
    }
    const ctx: Ctx = { error: null };
    const out: FormatoMensaje = { v: 1 };
    const estilo = validarEstilo(f.estilo);
    if (estilo) out.estilo = estilo;
    const doc = validarDoc(f.doc, ctx);
    if (doc) out.doc = doc;
    const lienzo = validarLienzo(f.lienzo, ctx);
    if (lienzo) out.lienzo = lienzo;
    if (ctx.error) return { ok: false, error: ctx.error };
    const bytes = bytesJson(out);
    if (bytes > LIMITES_FORMATO.bytes) {
        return {
            ok: false,
            error: `El mensaje ocupa ${Math.round(bytes / 1000)} KB y el máximo es ${Math.round(LIMITES_FORMATO.bytes / 1000)} KB. Sube las imágenes como archivos en vez de incrustarlas, o divide el mensaje.`,
        };
    }
    return { ok: true, formato: out };
}

// ───────────────────────────── Texto plano ─────────────────────────────

/** Texto de una lista de tramos. */
export function textoDeTramos(tramos: TramoTexto[] | undefined): string {
    return (tramos ?? []).map((t) => t.texto).join("");
}

/** Texto plano de un documento rico (saltos de línea y marcadores de lista). */
export function textoPlanoDeDoc(doc: DocRico | undefined | null): string {
    if (!doc) return "";
    const lineas: string[] = [];
    for (const b of doc.bloques) {
        switch (b.tipo) {
            case "parrafo":
            case "titulo":
                lineas.push(textoDeTramos(b.tramos));
                break;
            case "cita":
                lineas.push(
                    textoDeTramos(b.tramos)
                        .split("\n")
                        .map((l) => `> ${l}`)
                        .join("\n"),
                );
                break;
            case "lista":
                b.items.forEach((it, i) => lineas.push(`${b.ordenada ? `${i + 1}.` : "•"} ${textoDeTramos(it)}`));
                break;
            case "tareas":
                b.items.forEach((it) => lineas.push(`${it.hecha ? "[x]" : "[ ]"} ${textoDeTramos(it.tramos)}`));
                break;
            case "codigo":
                lineas.push(b.texto);
                break;
            case "separador":
                lineas.push("———");
                break;
        }
    }
    return lineas.join("\n");
}

function marcadorElemento(el: ElementoLienzo): string {
    switch (el.tipo) {
        case "texto":
            return textoPlanoDeDoc(el.texto);
        case "imagen":
            return "[imagen]";
        case "gif":
            return "[gif]";
        case "video":
            return "[vídeo]";
        case "audio":
            return "[audio]";
        case "web":
            return `[ventana: ${hostDeUrl(el.url) || "sitio web"}]`;
        case "app":
            return `[app: ${el.nombre || el.ruta || "app"}]`;
        case "vivo":
            return `[en vivo: ${el.vivo?.name || el.nombre || "app"}]`;
        case "archivo":
            return `[archivo: ${el.nombre || "archivo"}]`;
        case "forma":
            return "";
    }
}

/** Orden de lectura del lienzo: de arriba abajo y de izquierda a derecha. */
export function ordenLectura(elementos: ElementoLienzo[]): ElementoLienzo[] {
    return [...elementos].sort((a, b) => (Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x));
}

/**
 * Texto plano equivalente (body del mensaje: búsqueda, avisos, lectores de pantalla y clientes viejos).
 */
export function textoPlanoDeFormato(f: FormatoMensaje): string {
    const partes: string[] = [];
    const doc = textoPlanoDeDoc(f.doc);
    if (doc.trim()) partes.push(doc);
    if (f.lienzo) {
        for (const el of ordenLectura(f.lienzo.elementos)) {
            const m = marcadorElemento(el);
            if (m.trim()) partes.push(m);
        }
    }
    return partes
        .join("\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

// ───────────────────────────── Estilo → CSS ─────────────────────────────

const ALINEACION_CSS: Record<string, CSSProperties["textAlign"]> = {
    izquierda: "left",
    centro: "center",
    derecha: "right",
    justificado: "justify",
};

/** Alineación de bloque/estilo → `text-align`. */
export function alineacionCss(a?: string): CSSProperties["textAlign"] | undefined {
    return a ? ALINEACION_CSS[a] : undefined;
}

/** Familia CSS de una fuente del catálogo. */
export function fuenteCss(f?: FuenteMensaje | string | null): string | undefined {
    return f ? FUENTES_MENSAJE.find((x) => x.id === f)?.css : undefined;
}

/**
 * CSS de un `EstiloMensaje` (tipografía, color, marco, fondo, alineación). Vuelve a pasar cada campo
 * por su lista blanca: aunque llegue un objeto sin validar, aquí no entra nada que no sea un valor
 * conocido.
 */
export function estiloACss(e?: EstiloMensaje | null): CSSProperties {
    if (!e) return {};
    const s = validarEstilo(e);
    if (!s) return {};
    const css: CSSProperties = {};
    const familia = fuenteCss(s.fuente);
    if (familia) css.fontFamily = familia;
    if (s.tamano) css.fontSize = `${s.tamano}px`;
    if (s.color) css.color = s.color;
    const grosor = s.grosorMarco ?? (s.colorMarco ? 2 : 0);
    if (grosor > 0) css.border = `${grosor}px solid ${s.colorMarco ?? "rgba(255,255,255,.35)"}`;
    const fondo = fondoCssDe(s.fondo);
    if (fondo) css.background = fondo;
    const al = alineacionCss(s.alineacion);
    if (al) css.textAlign = al;
    if (s.negrita) css.fontWeight = 700;
    if (s.cursiva) css.fontStyle = "italic";
    return css;
}

/** Clases globales (definidas en `rico.module.css` bajo `.raiz`) de una animación de texto. */
export function claseAnimacionTexto(a?: AnimacionTexto): string {
    if (!a || a === "ninguna" || !IDS_ANIM_TEXTO.has(a)) return "";
    return `ss-rt-anim ss-rt-${a}`;
}

/** ¿La animación se pinta letra a letra? */
export function animacionPorLetra(a?: AnimacionTexto): boolean {
    return ANIMACIONES_TEXTO.find((x) => x.id === a)?.porLetra ?? false;
}

// ───────────────────────────── Ayudas para el editor y el chat ─────────────────────────────

/** Documento a partir de texto plano (un párrafo por línea). */
export function docDesdeTexto(texto: string): DocRico {
    const lineas = textoLimpio(texto, 100_000).split("\n");
    return { bloques: lineas.map((l) => ({ tipo: "parrafo", tramos: l ? [{ texto: l }] : [] })) };
}

/** ¿El documento no tiene nada que mostrar? */
export function docVacio(doc?: DocRico | null): boolean {
    if (!doc) return true;
    return doc.bloques.every((b) => {
        switch (b.tipo) {
            case "parrafo":
            case "titulo":
            case "cita":
                return !textoDeTramos(b.tramos).trim();
            case "lista":
                return b.items.every((it) => !textoDeTramos(it).trim());
            case "tareas":
                return b.items.every((it) => !textoDeTramos(it.tramos).trim());
            case "codigo":
                return !b.texto.trim();
            case "separador":
                return false;
        }
    });
}

/** ¿El estilo no cambia nada? */
export function estiloVacio(e?: EstiloMensaje | null): boolean {
    return !validarEstilo(e);
}

/** ¿El formato no aporta nada sobre un mensaje básico? */
export function formatoVacio(f?: FormatoMensaje | null): boolean {
    if (!f) return true;
    return estiloVacio(f.estilo) && docVacio(f.doc) && !(f.lienzo && f.lienzo.elementos.length);
}

/**
 * URLs de medios que ya pinta el lienzo: el chat puede no repetir esos adjuntos debajo de la burbuja
 * (siguen en `attachments` para que aparezcan en «Archivos del chat»).
 */
export function urlsDeFormato(f?: FormatoMensaje | null): Set<string> {
    const s = new Set<string>();
    for (const el of f?.lienzo?.elementos ?? []) {
        if (el.url) s.add(el.url);
        if (el.vivo?.sesionId) s.add(`vivo:${el.vivo.sesionId}`);
    }
    return s;
}

/** Adjunto de chat de un elemento de medio (para listarlo en los archivos del hilo). */
export function adjuntoDeElemento(el: ElementoLienzo): DmAttachment | null {
    if (el.tipo === "vivo" && el.vivo) return el.vivo;
    if (!el.url) return null;
    const kind = el.tipo === "imagen" || el.tipo === "gif" ? "image" : el.tipo === "video" ? "video" : el.tipo === "audio" ? "audio" : el.tipo === "archivo" ? "file" : null;
    if (!kind) return null;
    const a: DmAttachment = { kind, url: el.url };
    if (el.nombre) a.name = el.nombre;
    if (el.mime) a.mime = el.mime;
    return a;
}
