/**
 * App en vivo «Documento» (2026-09-28 · agente L2) — contrato LIVE-APP.
 *
 * Un documento tipo Word que varias personas escriben a la vez. Vive en `os_spaces`
 * (kind 'dashboard' + `doc.app = "documento"`, ver `doc-colaborativo/espacios.ts`) como una lista
 * de BLOQUES (`BloqueDoc` del editor de mensajes) con id estable, clave de orden, sello y autor:
 * dos personas en párrafos distintos no se pisan nunca; en el mismo párrafo gana la última
 * escritura y se avisa con suavidad. Ruta: `/documento/<id>` (acepta `?sesion=` sin más).
 *
 * Este archivo exporta lo que el integrador conecta en el catálogo de apps en vivo
 * (`crearVivoDocumento`, `listarMiosDocumento`, `INFO_VIVO_DOCUMENTO`) y las piezas puras que
 * usan la página y las pruebas (validación, Markdown/texto, recuento, esquema).
 */

import { normalizarDoc } from "@/components/messages/rico/doc-dom";
import { textoDeTramos, textoPlanoDeDoc, validarDoc } from "@/lib/mensajeria/formato";
import { FUENTES_MENSAJE, type BloqueDoc, type DocRico, type FuenteMensaje, type TramoTexto } from "@/lib/mensajeria/formato-tipos";
import { jsonEstable, type UnidadColab } from "./doc-colaborativo/modelo";

export const APP_DOCUMENTO = "documento" as const;

export const INFO_VIVO_DOCUMENTO = {
    etiqueta: "Documento",
    descripcion: "Texto con formato que varias personas escriben a la vez, con historial de versiones.",
    icono: "FileText",
    color: "#60A5FA",
} as const;

/** Tope de bloques vivos de un documento (el doc guardado además no pasa de ~2,5 MB). */
export const MAX_BLOQUES_DOCUMENTO = 4000;

export interface MetaDocumento {
    titulo: string;
    fuente?: FuenteMensaje;
    /** Tamaño base del texto (px, 13–22). */
    tamano?: number;
}

export const META_DOCUMENTO_INICIAL: MetaDocumento = { titulo: "" };

const IDS_FUENTE = new Set<string>(FUENTES_MENSAJE.map((f) => f.id));

export function rutaDocumento(id: string): string {
    return `/documento/${encodeURIComponent(id)}`;
}

// ───────────────────────────── Validación ─────────────────────────────

/** Un bloque que llega de fuera → bloque de la lista blanca, normalizado (o null). Nunca lanza. */
export function validarBloqueDocumento(raw: unknown): BloqueDoc | null {
    try {
        const d = validarDoc({ bloques: [raw] });
        if (!d || d.bloques.length !== 1) return null;
        return normalizarDoc(d).bloques[0] ?? null;
    } catch {
        return null;
    }
}

export function validarMetaDocumento(raw: unknown): MetaDocumento | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const meta: MetaDocumento = { titulo: typeof r.titulo === "string" ? r.titulo.slice(0, 200) : "" };
    if (typeof r.fuente === "string" && IDS_FUENTE.has(r.fuente)) meta.fuente = r.fuente as FuenteMensaje;
    if (typeof r.tamano === "number" && Number.isFinite(r.tamano)) meta.tamano = Math.round(Math.min(22, Math.max(13, r.tamano)));
    return meta;
}

/** ¿Mismo contenido? (referencia o JSON estable). */
export function igualesBloques(a: BloqueDoc, b: BloqueDoc): boolean {
    return a === b || jsonEstable(a) === jsonEstable(b);
}

/** El documento como `DocRico` (lo que pintan el editor y el visor). */
export function docDeUnidades(unidades: UnidadColab<BloqueDoc>[]): DocRico {
    return { bloques: unidades.flatMap((u) => (u.datos ? [u.datos] : [])) };
}

/** Doc inicial del espacio (vacío: el título vive en la fila y en la meta). */
export function docInicialDocumento(): Record<string, unknown> {
    return { app: APP_DOCUMENTO, v: 1, unidades: [], meta: null };
}

// ───────────────────────────── Contrato LIVE-APP ─────────────────────────────

/** Crea un documento compartido nuevo. Lanza un Error con mensaje en español si no se puede. */
export async function crearVivoDocumento(titulo: string): Promise<{ refId: string; ruta: string }> {
    const { crearEspacioApp } = await import("./doc-colaborativo/espacios");
    const t = (titulo ?? "").trim().slice(0, 200) || "Documento sin título";
    const space = await crearEspacioApp(APP_DOCUMENTO, t, docInicialDocumento());
    return { refId: space.id, ruta: rutaDocumento(space.id) };
}

/** Tus documentos (los que creaste). Para «compartir uno que ya existe» desde un chat. */
export async function listarMiosDocumento(): Promise<{ refId: string; titulo: string; ruta: string }[]> {
    const { listarEspaciosApp } = await import("./doc-colaborativo/espacios");
    const lista = await listarEspaciosApp(APP_DOCUMENTO, { soloPropios: true });
    return lista.map((e) => ({ refId: e.refId, titulo: e.titulo, ruta: rutaDocumento(e.refId) }));
}

// ───────────────────────────── Exportar ─────────────────────────────

function escaparMd(t: string): string {
    return t.replace(/([\\`*_[\]<>~|])/g, "\\$1");
}

/** Escapa lo que al principio de línea Markdown leería como título, lista o cita. */
function escaparInicioMd(linea: string): string {
    return linea.replace(/^(\s*)([#>+-]|\d+\.)(\s)/, (_m, esp: string, marca: string, tras: string) => `${esp}${marca.replace(/([#>+.-])/, "\\$1")}${tras}`);
}

function urlMd(u: string): string {
    return u.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function tramoMd(t: TramoTexto): string {
    const marcas = t.marcas ?? [];
    if (marcas.includes("codigo")) {
        const cerca = t.texto.includes("`") ? "``" : "`";
        return `${cerca}${t.texto}${cerca}`;
    }
    const m = t.texto.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const [antes, nucleo, despues] = m ? [m[1], m[2], m[3]] : ["", t.texto, ""];
    if (!nucleo) return t.texto;
    let s = escaparMd(nucleo).replace(/\n/g, "  \n");
    if (marcas.includes("tachado")) s = `~~${s}~~`;
    if (marcas.includes("cursiva")) s = `*${s}*`;
    if (marcas.includes("negrita")) s = `**${s}**`;
    if (t.enlace) s = `[${s}](${urlMd(t.enlace)})`;
    return `${antes}${s}${despues}`;
}

function tramosMd(tramos: TramoTexto[]): string {
    return tramos.map(tramoMd).join("");
}

function bloqueMd(b: BloqueDoc): string {
    switch (b.tipo) {
        case "parrafo":
            return escaparInicioMd(tramosMd(b.tramos));
        case "titulo":
            return `${"#".repeat(b.nivel)} ${tramosMd(b.tramos).replace(/ {2}\n/g, " ")}`;
        case "lista":
            return b.items.map((it, i) => `${b.ordenada ? `${i + 1}.` : "-"} ${tramosMd(it)}`).join("\n");
        case "tareas":
            return b.items.map((it) => `- [${it.hecha ? "x" : " "}] ${tramosMd(it.tramos)}`).join("\n");
        case "cita":
            return tramosMd(b.tramos)
                .split(/ {2}\n|\n/)
                .map((l) => `> ${l}`)
                .join("\n");
        case "codigo": {
            const valla = b.texto.includes("```") ? "~~~~" : "```";
            return `${valla}${b.lenguaje ?? ""}\n${b.texto}\n${valla}`;
        }
        case "separador":
            return "---";
    }
}

/** Markdown (CommonMark + tareas GFM) del documento, con el título como encabezado. */
export function documentoAMarkdown(bloques: BloqueDoc[], titulo?: string | null): string {
    const partes: string[] = [];
    const t = (titulo ?? "").trim();
    if (t) partes.push(`# ${escaparMd(t)}`);
    for (const b of bloques) partes.push(bloqueMd(b));
    return `${partes.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

/** Texto plano del documento (con el título delante). */
export function documentoATexto(bloques: BloqueDoc[], titulo?: string | null): string {
    const t = (titulo ?? "").trim();
    const cuerpo = textoPlanoDeDoc({ bloques });
    return `${t ? `${t}\n${"=".repeat(Math.min(60, Math.max(3, t.length)))}\n\n` : ""}${cuerpo}\n`;
}

/** Nombre de archivo seguro a partir del título. */
export function nombreArchivo(titulo: string | null | undefined, extension: string): string {
    const base = (titulo ?? "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9 _-]+/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 60);
    return `${base || "documento"}.${extension}`;
}

// ───────────────────────────── Recuento y esquema ─────────────────────────────

export interface EstadisticasDocumento {
    palabras: number;
    caracteres: number;
    /** Minutos de lectura (a 200 palabras por minuto, mínimo 1 si hay texto). */
    minutos: number;
}

const RE_PALABRA = /[\p{L}\p{N}]/u;

export function estadisticasDocumento(bloques: BloqueDoc[]): EstadisticasDocumento {
    const texto = textoPlanoDeDoc({ bloques })
        .replace(/^(> |• |\d+\. |\[[x ]\] )/gm, "")
        .replace(/———/g, "");
    const palabras = texto.split(/\s+/).filter((p) => RE_PALABRA.test(p)).length;
    const caracteres = [...texto.replace(/\n/g, "")].length;
    return { palabras, caracteres, minutos: palabras ? Math.max(1, Math.round(palabras / 200)) : 0 };
}

export interface EntradaEsquema {
    id: string;
    nivel: 1 | 2 | 3;
    texto: string;
    /** Posición del bloque en el documento (para saltar a él). */
    indice: number;
}

/** Títulos del documento en orden (el navegador de la izquierda). */
export function esquemaDocumento(unidades: UnidadColab<BloqueDoc>[]): EntradaEsquema[] {
    const out: EntradaEsquema[] = [];
    unidades.forEach((u, indice) => {
        const b = u.datos;
        if (b?.tipo !== "titulo") return;
        const texto = textoDeTramos(b.tramos).replace(/\s+/g, " ").trim();
        out.push({ id: u.id, nivel: b.nivel, texto: texto.slice(0, 90) || "Título sin texto", indice });
    });
    return out;
}

/** Resumen corto (para el historial): el primer título o las primeras palabras. */
export function resumenDocumento(bloques: BloqueDoc[]): string {
    const titulo = bloques.find((b) => b.tipo === "titulo");
    const base = titulo && titulo.tipo === "titulo" ? textoDeTramos(titulo.tramos) : textoPlanoDeDoc({ bloques });
    const limpio = base.replace(/\s+/g, " ").trim();
    const { palabras } = estadisticasDocumento(bloques);
    return `${limpio.slice(0, 80) || "Documento vacío"} · ${palabras} ${palabras === 1 ? "palabra" : "palabras"}`;
}
