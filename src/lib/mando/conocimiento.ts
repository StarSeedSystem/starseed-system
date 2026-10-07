/**
 * /api/conocimiento — lógica PURA de la API de conocimiento de Genesis (FLU1005E · ola 1005F).
 *
 * Forma de respuesta del subconjunto de Dify que usamos (architecture/puente-propio-flujos.md §4):
 *   GET  /datasets                      → { data: Dataset[], total }
 *   POST /datasets                      → Dataset creado          ({name, description?})
 *   POST /datasets/{id}/document/create-by-text → { document: Documento, ... } ({name, text})
 *   GET  /datasets/{id}/documents       → { data: Documento[], total }
 *   POST /datasets/{id}/retrieve        → { query: {content}, records: Rec[] } ({query, top_k?})
 * Solo se respetan estos campos (id, name, description, document_count, word_count,
 * created_at; en records: segment{id, document_id, content} y score). Lo demás de Dify
 * (embedding models, processing rules, data_source tipado…) no se implementa: embeddings
 * opcionales vendrán por pasarela gratuita, ver §4.
 *
 * Sin `fs`/red aquí: este módulo es puro y testeable; la ruta hace disco y procesos.
 */

export interface BaseConocimiento {
    id: string;
    name: string;
    description: string;
    created_at: number;
    document_count: number;
    word_count: number;
}

export interface DocumentoConocimiento {
    id: string;
    name: string;
    created_at: number;
    word_count: number;
    tokens_totales: number;
}

export interface RegistroRecuperado {
    segment: { id: string; document_id: string; content: string };
    score: number;
}

export interface ResultadoRecuperacion {
    query: { content: string };
    records: RegistroRecuperado[];
}

const PATRON_ID = /^[a-z0-9-]{1,64}$/;

/** Cierto si el id de base es un slug seguro (nada de `..`, rutas ni espacios). */
export function idBaseValido(id: unknown): id is string {
    return typeof id === "string" && PATRON_ID.test(id);
}

/** Clave propia: solo si `CONOCIMIENTO_CLAVE` está definida y la cabecera Bearer coincide. */
export function claveAceptada(cabeceraAuthorization: string | null, claveConfigurada: string | undefined): boolean {
    if (!claveConfigurada) return false;
    return cabeceraAuthorization === `Bearer ${claveConfigurada}`;
}

/** ¿Sujeto válido para crear una base? Devuelve el error o null. */
export function validarCrearBase(cuerpo: unknown): string | null {
    const c = cuerpo as { name?: unknown; description?: unknown };
    if (!c || typeof c.name !== "string" || c.name.trim().length === 0) return "Falta `name`.";
    if (typeof c.description !== "undefined" && typeof c.description !== "string") return "`description` debe ser texto.";
    return null;
}

/** ¿Sujeto válido para create-by-text? Devuelve el error o null. */
export function validarCrearDocumento(cuerpo: unknown): string | null {
    const c = cuerpo as { name?: unknown; text?: unknown };
    if (!c || typeof c.name !== "string" || c.name.trim().length === 0) return "Falta `name`.";
    if (typeof c.text !== "string" || c.text.trim().length === 0) return "Falta `text`.";
    return null;
}

/** ¿Sujeto válido para retrieve? Devuelve el error o null. */
export function validarRecuperar(cuerpo: unknown): string | null {
    const c = cuerpo as { query?: unknown; top_k?: unknown };
    if (!c || typeof c.query !== "string" || c.query.trim().length === 0) return "Falta `query`.";
    if (typeof c.top_k !== "undefined" && !(typeof c.top_k === "number" && c.top_k > 0 && c.top_k <= 20)) {
        return "`top_k` debe ser un número entre 1 y 20.";
    }
    return null;
}
