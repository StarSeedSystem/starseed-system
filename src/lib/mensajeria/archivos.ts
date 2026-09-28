/**
 * archivos — helpers PUROS del contrato C7 para el panel "Archivos y enlaces" de
 * un hilo: deriva la lista de adjuntos/enlaces/mensajes-enriquecidos a partir de
 * los mensajes ya cargados (sin red ni I/O propios).
 */
import type { DmAttachment, DmMessage } from "@/lib/messages/dm";
import type { CategoriaArchivo } from "@/lib/mensajeria/carpetas-tipos";
import { urlVigenteAdjunto } from "@/lib/mensajeria/adjuntos";

export interface ArchivoHilo {
    id: string;
    mensajeId: string;
    /** Índice del adjunto dentro del mensaje; null = enlace de texto o mensaje enriquecido. */
    adjuntoIndice: number | null;
    categoria: CategoriaArchivo;
    nombre: string;
    url?: string;
    mime?: string;
    tamano?: number;
    extension?: string;
    remitente: string | null;
    mio: boolean;
    fecha: string;
    host?: string;
    ruta?: string;
}

const EXT_DOCUMENTO = new Set([
    "pdf",
    "doc",
    "docx",
    "odt",
    "txt",
    "md",
    "xls",
    "xlsx",
    "csv",
    "ppt",
    "pptx",
    "zip",
    "rar",
    "7z",
]);

const MIME_DOCUMENTO =
    /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.[a-z.-]+|vnd\.oasis\.opendocument\.[a-z]+|vnd\.ms-excel|vnd\.ms-powerpoint|zip|x-zip-compressed|x-rar-compressed|x-7z-compressed|csv)|text\/(plain|markdown|csv))$/i;

function extensionDe(nombreOUrl: string | undefined): string | undefined {
    if (!nombreOUrl) return undefined;
    const limpio = nombreOUrl.split(/[?#]/)[0];
    const m = /\.([a-z0-9]{1,8})$/i.exec(limpio);
    return m ? m[1].toLowerCase() : undefined;
}

function esDocumento(att: DmAttachment): boolean {
    if (att.mime && MIME_DOCUMENTO.test(att.mime)) return true;
    const ext = extensionDe(att.name) ?? extensionDe(att.url);
    return !!ext && EXT_DOCUMENTO.has(ext);
}

function categoriaDeAdjunto(att: DmAttachment): CategoriaArchivo {
    switch (att.kind) {
        case "image":
        case "gif":
            return "imagen";
        case "video":
            return "video";
        case "audio":
            return "audio";
        case "vivo":
            return "vivo";
        case "llamada":
            return "llamada";
        case "file":
        case "ref":
            return esDocumento(att) ? "documento" : "otro";
        default:
            return "otro";
    }
}

function nombreDeAdjunto(att: DmAttachment): string {
    if (att.name) return att.name;
    if (att.url) {
        try {
            const u = new URL(att.url, "https://x.invalid");
            const ultimo = u.pathname.split("/").filter(Boolean).pop();
            if (ultimo) return decodeURIComponent(ultimo);
        } catch {
            /* url relativa o inválida: se deja el fallback de abajo */
        }
    }
    return "Archivo";
}

const PATRON_URL = /https?:\/\/[^\s<>"']+/gi;

/** Quita puntuación colgante y cierra paréntesis desbalanceados al final de una URL detectada en texto libre. */
function limpiarUrl(cruda: string): string {
    let url = cruda.replace(/[.,;:!?'"”’]+$/u, "");
    let abiertos = 0;
    for (const ch of url) {
        if (ch === "(") abiertos++;
        else if (ch === ")") abiertos--;
    }
    while (abiertos < 0 && url.endsWith(")")) {
        url = url.slice(0, -1);
        abiertos++;
    }
    return url;
}

function hostDe(url: string): string | undefined {
    try {
        return new URL(url).hostname;
    } catch {
        return undefined;
    }
}

/** Enlaces http(s) de un cuerpo de texto, deduplicados dentro del mismo mensaje. */
function enlacesDe(body: string): string[] {
    const vistos = new Set<string>();
    const out: string[] = [];
    for (const m of body.matchAll(PATRON_URL)) {
        const limpio = limpiarUrl(m[0]);
        if (!limpio || vistos.has(limpio)) continue;
        vistos.add(limpio);
        out.push(limpio);
    }
    return out;
}

/** Deriva la lista de "archivos" (adjuntos, enlaces de texto y mensajes enriquecidos) de un hilo. Mensajes borrados se saltan. */
export function recopilarArchivos(mensajes: DmMessage[], miUid: string | null): ArchivoHilo[] {
    const out: ArchivoHilo[] = [];

    for (const msg of mensajes) {
        if (msg.deleted) continue;
        const mio = !!miUid && msg.sender === miUid;

        msg.attachments.forEach((att, indice) => {
            const url = urlVigenteAdjunto(att.url);
            out.push({
                id: `${msg.id}:adj:${indice}`,
                mensajeId: msg.id,
                adjuntoIndice: indice,
                categoria: categoriaDeAdjunto(att),
                nombre: nombreDeAdjunto(att),
                url,
                mime: att.mime,
                tamano: att.size,
                extension: extensionDe(att.name) ?? extensionDe(att.url),
                remitente: msg.sender,
                mio,
                fecha: msg.createdAt,
                host: url ? hostDe(url) : undefined,
                ruta: att.route,
            });
        });

        if (msg.body) {
            enlacesDe(msg.body).forEach((url, i) => {
                out.push({
                    id: `${msg.id}:link:${i}`,
                    mensajeId: msg.id,
                    adjuntoIndice: null,
                    categoria: "enlace",
                    nombre: hostDe(url) ?? url,
                    url,
                    remitente: msg.sender,
                    mio,
                    fecha: msg.createdAt,
                    host: hostDe(url),
                });
            });
        }

        // Mensaje enriquecido: solo cuenta como "archivo" si trae lienzo o documento
        // (así el panel puede listar mensajes ricos de verdad, no cualquier estilo).
        if (msg.formato && (msg.formato.lienzo || msg.formato.doc)) {
            out.push({
                id: `${msg.id}:formato`,
                mensajeId: msg.id,
                adjuntoIndice: null,
                categoria: "mensaje",
                nombre: msg.body ? msg.body.slice(0, 80) : "Mensaje enriquecido",
                remitente: msg.sender,
                mio,
                fecha: msg.createdAt,
            });
        }
    }

    return out;
}

export interface FiltroArchivos {
    categoria?: CategoriaArchivo | "todo";
    texto?: string;
    remitente?: "todos" | "yo" | "otros";
}

export function filtrarArchivos(xs: ArchivoHilo[], f: FiltroArchivos): ArchivoHilo[] {
    const texto = f.texto?.trim().toLowerCase();
    return xs.filter((x) => {
        if (f.categoria && f.categoria !== "todo" && x.categoria !== f.categoria) return false;
        if (f.remitente === "yo" && !x.mio) return false;
        if (f.remitente === "otros" && x.mio) return false;
        if (texto) {
            const enNombre = x.nombre.toLowerCase().includes(texto);
            const enHost = x.host?.toLowerCase().includes(texto) ?? false;
            if (!enNombre && !enHost) return false;
        }
        return true;
    });
}

export type OrdenArchivos = "reciente" | "antiguo" | "nombre" | "tamano" | "tipo";

/** Sort ESTABLE (desempata por la posición original: `Array.sort` no garantiza estabilidad en todos los motores). */
function ordenarEstable<T>(xs: T[], comparar: (a: T, b: T) => number): T[] {
    return xs
        .map((valor, indice) => ({ valor, indice }))
        .sort((a, b) => comparar(a.valor, b.valor) || a.indice - b.indice)
        .map((x) => x.valor);
}

export function ordenarArchivos(xs: ArchivoHilo[], orden: OrdenArchivos): ArchivoHilo[] {
    switch (orden) {
        case "reciente":
            return ordenarEstable(xs, (a, b) => Date.parse(b.fecha) - Date.parse(a.fecha));
        case "antiguo":
            return ordenarEstable(xs, (a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));
        case "nombre":
            return ordenarEstable(xs, (a, b) => a.nombre.localeCompare(b.nombre, "es"));
        case "tamano":
            return ordenarEstable(xs, (a, b) => (b.tamano ?? -1) - (a.tamano ?? -1));
        case "tipo":
            return ordenarEstable(xs, (a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre, "es"));
        default:
            return xs;
    }
}

const MESES_ES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
];

export interface GrupoArchivosMes {
    clave: string;
    titulo: string;
    archivos: ArchivoHilo[];
}

/** Agrupa por mes calendario (más reciente primero), con título es-ES tipo "septiembre de 2026". */
export function agruparArchivosPorMes(xs: ArchivoHilo[]): GrupoArchivosMes[] {
    const grupos = new Map<string, ArchivoHilo[]>();
    for (const x of xs) {
        const fecha = new Date(x.fecha);
        if (Number.isNaN(fecha.getTime())) continue;
        const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
        const lista = grupos.get(clave);
        if (lista) lista.push(x);
        else grupos.set(clave, [x]);
    }
    return Array.from(grupos.entries())
        .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
        .map(([clave, archivos]) => {
            const [anio, mes] = clave.split("-").map(Number);
            return { clave, titulo: `${MESES_ES[mes - 1]} de ${anio}`, archivos };
        });
}

const TODAS_CATEGORIAS: CategoriaArchivo[] = [
    "imagen",
    "video",
    "audio",
    "documento",
    "enlace",
    "vivo",
    "llamada",
    "mensaje",
    "otro",
];

export function contarPorCategoria(xs: ArchivoHilo[]): Record<CategoriaArchivo, number> {
    const out = Object.fromEntries(TODAS_CATEGORIAS.map((c) => [c, 0])) as Record<CategoriaArchivo, number>;
    for (const x of xs) out[x.categoria] = (out[x.categoria] ?? 0) + 1;
    return out;
}
