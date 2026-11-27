import { normalizarMarco } from "@/lib/profile/marco-foto";
import type { ChartDatum, ChartKind, CodeLang, PostBlock, PostBlockRef, PostBlockRefKind, PostBlockType } from "./post-blocks";

type Campo = keyof PostBlock;

const IDIOMAS: readonly CodeLang[] = ["html", "css", "js", "jsx"];
const TIPOS_GRAFICA: readonly ChartKind[] = ["bar", "line", "area", "pie"];
const TIPOS_REF: readonly PostBlockRefKind[] = [
    "brain", "library", "folder", "file", "page", "profile",
    "group", "community", "event", "neuron", "url",
];

const TODOS: readonly Campo[] = [
    "text", "url", "name", "code", "language", "lat", "lng", "place",
    "chartType", "data", "system", "persona", "ref", "marco",
];

const CAMPOS: Partial<Record<PostBlockType, readonly Campo[]>> = {
    portada: ["text", "url", "name", "marco"],
    codigo: ["code", "language"],
    pagina: ["code", "language"],
    repo: ["text", "url"],
    pizarra: ["text", "url"],
    agente: ["name", "persona", "system"],
    mapa: ["place", "lat", "lng"],
    grafica: ["chartType", "data"],
    referencia: ["text", "url", "name", "ref"],
    entidad: ["text", "ref"],
    penpot: ["text", "url", "system"],
    video: ["text", "url", "name", "marco"],
    protomolecula: ["code"],
    "respuesta-viva": ["code"],
};

function texto(v: unknown): string | undefined {
    return typeof v === "string" && v !== "" ? v : undefined;
}

function numero(v: unknown): number | undefined {
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function referencia(v: unknown): PostBlockRef | undefined {
    if (!v || typeof v !== "object") return undefined;
    const r = v as Partial<PostBlockRef>;
    const id = texto(r.id);
    const kind = r.kind;
    if (!id || !TIPOS_REF.includes(kind as PostBlockRefKind)) return undefined;
    const out: PostBlockRef = { kind: kind as PostBlockRefKind, id };
    const label = texto(r.label);
    const route = texto(r.route);
    const url = texto(r.url);
    const itemId = texto(r.itemId);
    const libraryKind = texto(r.libraryKind);
    const folderId = texto(r.folderId);
    if (label) out.label = label;
    if (route) out.route = route;
    if (url) out.url = url;
    if (itemId) out.itemId = itemId;
    if (libraryKind) out.libraryKind = libraryKind;
    if (folderId) out.folderId = folderId;
    else if (r.folderId === null) out.folderId = null;
    return out;
}

function datos(v: unknown): ChartDatum[] | undefined {
    if (!Array.isArray(v)) return undefined;
    const out = v
        .map((d) => {
            const fila = (d ?? {}) as Partial<ChartDatum>;
            return { label: texto(fila.label) ?? "", value: numero(fila.value) };
        })
        .filter((d): d is ChartDatum => d.value !== undefined);
    return out.length > 0 ? out : undefined;
}

export function serializarBloqueRich(b: PostBlock): PostBlock {
    const out: PostBlock = { id: b.id, type: b.type };
    const destino = out as unknown as Record<string, unknown>;
    for (const campo of CAMPOS[b.type] ?? TODOS) {
        switch (campo) {
            case "lat":
            case "lng": {
                const n = numero(b[campo]);
                if (n !== undefined) destino[campo] = n;
                break;
            }
            case "language":
                if (IDIOMAS.includes(b.language as CodeLang)) destino.language = b.language;
                break;
            case "chartType":
                if (TIPOS_GRAFICA.includes(b.chartType as ChartKind)) destino.chartType = b.chartType;
                break;
            case "data": {
                const filas = datos(b.data);
                if (filas) destino.data = filas;
                break;
            }
            case "ref": {
                const limpia = referencia(b.ref);
                if (limpia) destino.ref = limpia;
                break;
            }
            case "marco":
                if (b.marco && typeof b.marco === "object") destino.marco = normalizarMarco(b.marco);
                break;
            default: {
                const s = texto(b[campo]);
                if (s !== undefined) destino[campo] = s;
            }
        }
    }
    return out;
}
