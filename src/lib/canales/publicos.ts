"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Canales StarSeed (Ola 285 · K4) — directorio público.
 * ---------------------------------------------------------------------------
 * Capa de datos del CLIENTE sobre `public.os_canales` (+ `os_canales_seguidores`)
 * en la base del OS. Migración ya aplicada: supabase/migrations/
 * 20260908050000_os_canales.sql.
 *
 * Modelo de permisos (igual que os_mesh_relay): LECTURA pública (anon +
 * autenticado, RLS `select using (true)`); ESCRITURA solo del dueño
 * (`owner_id = auth.uid()`). Seguir/des-seguir es decisión exclusiva de la
 * cuenta (`seguidor = auth.uid()`).
 *
 * Reglas del repo:
 *   · `"use client"` — la sesión vive en el navegador (createClient singleton).
 *   · Funciones PURAS (normalizarCategorias, validarCanalPublico,
 *     deducirPlataforma, categoriasPopulares) sin red ni Supabase, probadas.
 *   · Funciones de datos (listar/publicar/editar/borrar/seguir) NUNCA lanzan:
 *     toleran fallo (red, RLS, tabla ausente) devolviendo `[]` / `{ok:false,error}`.
 *   · TypeScript estricto, sin `any`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

/** Catálogo CERRADO de plataformas (seguro para filtros e iconografía). */
export type CanalPlataforma =
    | "telegram"
    | "youtube"
    | "whatsapp"
    | "x"
    | "instagram"
    | "rss"
    | "web"
    | "otro";

/** Tipo de espacio: afecta a iconos y a la UI. */
export type CanalTipo = "canal" | "grupo" | "lista";

/** Vista previa libre del último mensaje (JSONB, sin contrato duro). */
export type CanalUltimoMensaje = { [clave: string]: unknown } | null;

/** Canal público tal y como vive en `os_canales` (mismos campos que la tabla). */
export interface CanalPublico {
    id: string;
    ownerId: string;
    nombre: string;
    plataforma: CanalPlataforma;
    enlace: string;
    identificador?: string;
    tipo: CanalTipo;
    descripcion: string;
    categorias: string[];
    idioma: string;
    imagen?: string;
    verificado: boolean;
    oficial: boolean;
    seguidores: number;
    ultimoMensaje: CanalUltimoMensaje;
    createdAt: string;
    updatedAt: string;
}

/** Parámetros de filtrado/ordenación de `listarCanales`. */
export interface ListarCanalesOpciones {
    categoria?: string;
    plataforma?: CanalPlataforma;
    texto?: string;
    limite?: number;
}

/**
 * Datos con los que se crea/edita un canal (ENTRADA, más permisiva que el
 * modelo final): `nombre` y `enlace` son obligatorios; la `plataforma` se puede
 * omitir (se deduce del enlace) y las `categorias` aceptan string o array
 * (normalizables), de ahí que no sea un simple `Pick<CanalPublico, …>`.
 */
export type ParcialCanal = Pick<CanalPublico, "nombre" | "enlace"> &
    Partial<{
        plataforma: CanalPlataforma;
        tipo: CanalTipo;
        descripcion: string;
        categorias: string | string[];
        idioma: string;
        imagen: string;
        identificador: string;
    }>;

/** Canal ya validado y normalizado (categorías limpias, plataforma resuelta). */
export interface CanalNormalizado {
    nombre: string;
    plataforma: CanalPlataforma;
    enlace: string;
    tipo: CanalTipo;
    descripcion: string;
    categorias: string[];
    idioma: string;
    imagen?: string;
    identificador?: string;
}

/** Resultado de una escritura (publicar/editar/borrar/seguir): nunca lanza. */
export type ResultadoCanal =
    | { ok: true; canal: CanalPublico }
    | { ok: false; error: string };

/** Categoría contada para el índice de populares. */
export interface CategoriaPopular {
    categoria: string;
    total: number;
}

/* ─────────────────────────── Funciones PURAS ──────────────────────────── */

/** Nº máximo de categorías por canal (coincide con el CHECK de la tabla). */
const MAX_CATEGORIAS = 8;

/**
 * Normaliza una categoría bruta (recortada): quita comas/espacios de los
 * extremos, pasa a minúsculas, y elimina acentos y almohadillas.
 * Devuelve `null` si tras la limpieza queda vacía o fuera de 2–30 caracteres.
 */
function normalizarUnaCategoria(bruto: string): string | null {
    const limpia = bruto
        .trim()
        .toLowerCase()
        .replace(/[#]/g, "")
        // Quita los signos diacríticos, quedándose con las letras base:
        // "ciencia" y "Ciencia" son la misma categoría en el índice.
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    if (limpia.length < 2 || limpia.length > 30) return null;
    return limpia;
}

/**
 * PURA. Normaliza una entrada de categorías (string con separadores o array)
 * a un array limpio: minúsculas, sin acentos ni `#`, sin duplicados, cada una
 * de 2–30 caracteres, con un máximo de 8 (tope de la tabla). El orden de
 * aparición se conserva; las inválidas se descartan silenciosamente.
 */
export function normalizarCategorias(bruto: string | string[]): string[] {
    const piezas: string[] = typeof bruto === "string" ? bruto.split(/[\s,]+/) : bruto;
    const resultado: string[] = [];
    for (const pieza of piezas) {
        // Ya se alcanzó el tope de la tabla: no seguir recopilando.
        if (resultado.length >= MAX_CATEGORIAS) break;
        const limpia = normalizarUnaCategoria(pieza);
        // Descarta vacías/inválidas y duplicados (el mismo normalizado ya visto).
        if (limpia && !resultado.includes(limpia)) resultado.push(limpia);
    }
    return resultado;
}

/**
 * PURA. Deduce la plataforma de un enlace a partir de su dominio/huella.
 * Orden de precedencia: t.me → telegram; youtube.com/youtu.be → youtube;
 * wa.me → whatsapp; x.com/twitter → x; instagram → instagram; .xml/.rss → rss;
 * cualquier otra URL → web. NUNCA lanza (defensivo ante entradas raras).
 */
export function deducirPlataforma(enlace: string): CanalPlataforma {
    const url = (enlace || "").toLowerCase();
    if (url.includes("t.me")) return "telegram";
    if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
    if (url.includes("wa.me") || url.includes("whatsapp.com")) return "whatsapp";
    if (url.includes("x.com") || url.includes("twitter.com")) return "x";
    if (url.includes("instagram.com")) return "instagram";
    if (url.endsWith(".xml") || url.endsWith(".rss")) return "rss";
    return "web";
}

/** Lista de plataformas aceptadas al validar (catálogo cerrado de la tabla). */
const PLATAFORMAS_VALIDAS: readonly CanalPlataforma[] = [
    "telegram",
    "youtube",
    "whatsapp",
    "x",
    "instagram",
    "rss",
    "web",
    "otro",
];

/**
 * PURA. Valida un borrador de canal y devuelve un veredicto tipado.
 * Reglas: nombre de 2–80 caracteres; enlace obligatorio y bien formado
 * (`https://` o `t.me/`, comprobado con `new URL`); plataforma dentro del
 * catálogo. Si la plataforma no se indicó, se deduce del enlace. En caso de
 * éxito devuelve el valor ya normalizado (categorías limpias incluidas).
 */
export function validarCanalPublico(
    parcial: ParcialCanal,
): { ok: true; valor: CanalNormalizado } | { ok: false; error: string } {
    const nombre = (parcial.nombre || "").trim();
    if (nombre.length < 2 || nombre.length > 80) {
        return { ok: false, error: "El nombre debe tener entre 2 y 80 caracteres." };
    }

    const enlace = (parcial.enlace || "").trim();
    if (!enlace) return { ok: false, error: "El enlace es obligatorio." };
    if (!esEnlaceValido(enlace)) {
        return { ok: false, error: "El enlace debe ser una URL válida (https://… o t.me/…)." };
    }

    const plataforma = parcial.plataforma || deducirPlataforma(enlace);
    if (!PLATAFORMAS_VALIDAS.includes(plataforma)) {
        return { ok: false, error: "Plataforma no reconocida." };
    }

    const valor: CanalNormalizado = {
        nombre,
        enlace,
        plataforma,
        tipo: parcial.tipo ?? "canal",
        descripcion: (parcial.descripcion || "").trim(),
        categorias: normalizarCategorias(parcial.categorias ?? []),
        idioma: (parcial.idioma || "es").trim().toLowerCase().slice(0, 8) || "es",
        imagen: parcial.imagen?.trim() || undefined,
        identificador: parcial.identificador?.trim() || undefined,
    };
    return { ok: true, valor };
}

/** Verifica que una URL sea `https://…` o `t.me/…` usando `new URL` (nunca lanza). */
function esEnlaceValido(enlace: string): boolean {
    if (enlace.startsWith("t.me/")) return true;
    if (!enlace.startsWith("https://")) return false;
    try {
        const parsed = new URL(enlace);
        return parsed.protocol === "https:" && parsed.host.length > 0;
    } catch {
        return false;
    }
}

/** Ordena las categorías de un conjunto de canales por frecuencia (PURA). */
export function categoriasPopulares(canales: CanalPublico[]): CategoriaPopular[] {
    const conteos = new Map<string, number>();
    for (const canal of canales) {
        for (const categoria of canal.categorias) {
            conteos.set(categoria, (conteos.get(categoria) ?? 0) + 1);
        }
    }
    return Array.from(conteos.entries())
        .map(([categoria, total]) => ({ categoria, total }))
        .sort((a, b) => b.total - a.total);
}

/* ─────────────────────────── Funciones de datos ───────────────────────── */

/** Fila cruda de `os_canales` (snake_case, tal y como la devuelve Supabase). */
interface CanalRow {
    id: string;
    owner_id: string;
    nombre: string;
    plataforma: CanalPlataforma;
    enlace: string;
    identificador?: string | null;
    tipo: CanalTipo;
    descripcion?: string | null;
    categorias?: string[] | null;
    idioma?: string | null;
    imagen?: string | null;
    verificado?: boolean | null;
    oficial?: boolean | null;
    seguidores?: number | null;
    ultimo_mensaje?: CanalUltimoMensaje;
    created_at?: string | null;
    updated_at?: string | null;
}

/** Convierte una fila cruda de BD en `CanalPublico` con valores por defecto. */
function normalizarFila(fila: CanalRow): CanalPublico {
    return {
        id: fila.id,
        ownerId: fila.owner_id,
        nombre: fila.nombre,
        plataforma: fila.plataforma,
        enlace: fila.enlace,
        identificador: fila.identificador || undefined,
        tipo: fila.tipo,
        descripcion: fila.descripcion || "",
        categorias: Array.isArray(fila.categorias) ? fila.categorias : [],
        idioma: fila.idioma || "es",
        imagen: fila.imagen || undefined,
        verificado: fila.verificado !== false,
        oficial: fila.oficial === true,
        seguidores: fila.seguidores ?? 0,
        ultimoMensaje: fila.ultimo_mensaje ?? null,
        createdAt: fila.created_at || new Date().toISOString(),
        updatedAt: fila.updated_at || new Date().toISOString(),
    };
}

/** Única instancia del cliente (singleton del OS); null si no hay navegador. */
function cliente(): ReturnType<typeof createClient> | null {
    if (typeof window === "undefined") return null;
    try {
        return createClient();
    } catch {
        return null;
    }
}

/**
 * Lista los canales públicos con filtros opcionales (categoría, plataforma y
 * texto libre sobre nombre/descripción) y un límite (por defecto 50). LEE en
 * público (no requiere sesión). Nunca lanza: devuelve `[]` ante cualquier fallo.
 */
export async function listarCanales(
    opciones?: ListarCanalesOpciones,
): Promise<CanalPublico[]> {
    const supabase = cliente();
    if (!supabase) return [];

    try {
        let query = supabase
            .from("os_canales")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(Math.min(Math.max(opciones?.limite ?? 50, 1), 100));

        if (opciones?.plataforma) {
            query = query.eq("plataforma", opciones.plataforma);
        }
        if (opciones?.categoria) {
            // `categorias` es un array de texto libre: el filtro GIN usa el
            // operador de contención `@>` para coincidir con la categoría exacta.
            query = query.contains("categorias", [opciones.categoria]);
        }
        if (opciones?.texto) {
            const termino = opciones.texto.trim();
            if (termino) {
                query = query.or(`nombre.ilike.%${termino}%,descripcion.ilike.%${termino}%`);
            }
        }

        const { data, error } = await query;
        if (error || !Array.isArray(data)) return [];
        return (data as CanalRow[]).map(normalizarFila);
    } catch {
        return [];
    }
}

/** Id del usuario en sesión (para escribir), o null sin sesión/red. */
async function usuarioEnSesion(): Promise<string | null> {
    const supabase = cliente();
    if (!supabase) return null;
    try {
        const { data } = await supabase.auth.getUser();
        return data.user?.id ?? null;
    } catch {
        return null;
    }
}

/** Inserta un canal; requiere sesión (escribe solo el dueño). Nunca lanza. */
export async function publicarCanal(parcial: ParcialCanal): Promise<ResultadoCanal> {
    const veredicto = validarCanalPublico(parcial);
    if (!veredicto.ok) return veredicto;

    const ownerId = await usuarioEnSesion();
    if (!ownerId) return { ok: false, error: "Entra con tu cuenta para publicar un canal." };

    const supabase = cliente();
    if (!supabase) return { ok: false, error: "No hay cliente de base de datos disponible." };

    try {
        const { data, error } = await supabase
            .from("os_canales")
            .insert({
                owner_id: ownerId,
                nombre: veredicto.valor.nombre,
                plataforma: veredicto.valor.plataforma,
                enlace: veredicto.valor.enlace,
                identificador: veredicto.valor.identificador ?? null,
                tipo: veredicto.valor.tipo ?? "canal",
                descripcion: veredicto.valor.descripcion ?? "",
                categorias: veredicto.valor.categorias ?? [],
                idioma: veredicto.valor.idioma ?? "es",
                imagen: veredicto.valor.imagen ?? null,
            })
            .select("*")
            .single();
        if (error || !data) {
            return { ok: false, error: error?.message || "No se pudo publicar el canal." };
        }
        return { ok: true, canal: normalizarFila(data as CanalRow) };
    } catch {
        return { ok: false, error: "No se pudo publicar el canal." };
    }
}

/**
 * Edita un canal propio (solo el dueño por RLS). Acepta un parche PARCIAL:
 * solo actualiza los campos presentes y valida cada uno de ellos; el enlace,
 * si viene, debe seguir siendo una URL válida. Nunca lanza.
 */
export async function editarCanal(id: string, parche: ParcialCanal): Promise<ResultadoCanal> {
    const supabase = cliente();
    if (!supabase) return { ok: false, error: "No hay cliente de base de datos disponible." };

    // Valida solo lo que el parche aporta (enlace, nombre y plataforma juntos).
    const veredicto = validarCanalPublico({
        nombre: parche.nombre ?? "pn",
        enlace: parche.enlace ?? "https://dummy.local",
        plataforma: parche.plataforma ?? "web",
        tipo: parche.tipo,
        descripcion: parche.descripcion,
        categorias: parche.categorias,
        idioma: parche.idioma,
        imagen: parche.imagen,
    });
    if (!veredicto.ok) return veredicto;

    // Solo las claves realmente presentes pasan a la escritura (patch limpio).
    const cambios: Record<string, unknown> = {};
    if (parche.nombre !== undefined) cambios.nombre = veredicto.valor.nombre;
    if (parche.plataforma !== undefined) cambios.plataforma = veredicto.valor.plataforma;
    if (parche.enlace !== undefined) cambios.enlace = veredicto.valor.enlace;
    if (parche.identificador !== undefined) cambios.identificador = parche.identificador ?? null;
    if (parche.tipo !== undefined) cambios.tipo = parche.tipo;
    if (parche.descripcion !== undefined) cambios.descripcion = parche.descripcion ?? "";
    if (parche.categorias !== undefined) cambios.categorias = veredicto.valor.categorias ?? [];
    if (parche.idioma !== undefined) cambios.idioma = parche.idioma ?? "es";
    if (parche.imagen !== undefined) cambios.imagen = parche.imagen ?? null;

    try {
        const { data, error } = await supabase
            .from("os_canales")
            .update(cambios)
            .eq("id", id)
            .select("*")
            .single();
        if (error || !data) {
            return { ok: false, error: error?.message || "No se pudo editar el canal." };
        }
        return { ok: true, canal: normalizarFila(data as CanalRow) };
    } catch {
        return { ok: false, error: "No se pudo editar el canal." };
    }
}

/** Borra un canal propio (solo el dueño por RLS). Nunca lanza. */
export async function borrarCanal(id: string): Promise<{ ok: boolean; error?: string }> {
    const supabase = cliente();
    if (!supabase) return { ok: false, error: "No hay cliente de base de datos disponible." };
    try {
        const { error } = await supabase.from("os_canales").delete().eq("id", id);
        if (error) return { ok: false, error: error.message || "No se pudo borrar el canal." };
        return { ok: true };
    } catch {
        return { ok: false, error: "No se pudo borrar el canal." };
    }
}

/**
 * Sigue o deja de seguir un canal (tabla N:M, decisión solo de la propia
 * cuenta). Nunca lanza.
 */
export async function seguirCanal(
    id: string,
    seguir: boolean,
): Promise<{ ok: boolean; error?: string }> {
    const supabase = cliente();
    if (!supabase) return { ok: false, error: "No hay cliente de base de datos disponible." };

    const seguidor = await usuarioEnSesion();
    if (!seguidor) return { ok: false, error: "Entra con tu cuenta para seguir canales." };

    try {
        if (seguir) {
            const { error } = await supabase
                .from("os_canales_seguidores")
                .insert({ canal_id: id, seguidor });
            if (error) return { ok: false, error: error.message || "No se pudo seguir el canal." };
        } else {
            const { error } = await supabase
                .from("os_canales_seguidores")
                .delete()
                .eq("canal_id", id)
                .eq("seguidor", seguidor);
            if (error) return { ok: false, error: error.message || "No se pudo dejar de seguir." };
        }
        return { ok: true };
    } catch {
        return { ok: false, error: "Operación de seguimiento fallida." };
    }
}