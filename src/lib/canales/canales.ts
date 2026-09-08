/**
 * Canales StarSeed — modelo y persistencia (Ola 285 · 2026-09-08) · SOLO servidor
 * ─────────────────────────────────────────────────────────────────────────────
 * Catálogo local de los canales activos de StarSeed por plataforma (telegram hoy;
 * el resto «próximamente»). Cada canal es un canal ACTIVO atendido por un agente
 * telecomunicador (una personalidad del OS + su cerebro) que publica varias veces
 * al día. Se persiste en `starseed_memory_root/canales/` bajo `raizDelProyecto()`.
 *
 * Este módulo es PURO en su núcleo: las validaciones, el id y la fusión de sembrado
 * son funciones puras exportadas (testeables sin tocar disco); solo las envolturas
 * `leerCanales`/`guardarCanal`/… leen y escriben el sistema de archivos con
 * escritura atómica (`.tmp` + `fs.rename`) y tolerante a fallos.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { TG_SPACES, type TgSpace } from "@/lib/telegram-spaces";

export type PlataformaCanal = "telegram" | "youtube" | "whatsapp" | "x" | "instagram" | "rss" | "web";

/** Catálogo de plataformas soportadas; telegram es la única activa hoy. */
export interface PlataformaInfo {
    id: PlataformaCanal;
    nombre: string;
    estado: "activa" | "proximamente";
    nota: string;
}

export const PLATAFORMAS: PlataformaInfo[] = [
    {
        id: "telegram",
        nombre: "Telegram",
        estado: "activa",
        nota: "Los 7 espacios actuales ya publican vía el token del usuario.",
    },
    {
        id: "youtube",
        nombre: "YouTube",
        estado: "proximamente",
        nota: "Falta la cuenta/credenciales de la API de YouTube y decidir el formato de vídeo.",
    },
    {
        id: "whatsapp",
        nombre: "WhatsApp",
        estado: "proximamente",
        nota: "Requiere cuenta de negocio y la API de WhatsApp Cloud.",
    },
    {
        id: "x",
        nombre: "X (Twitter)",
        estado: "proximamente",
        nota: "Falta una cuenta de desarrollador y su API (tiers de pago).",
    },
    {
        id: "instagram",
        nombre: "Instagram",
        estado: "proximamente",
        nota: "Requiere cuenta de Facebook y la Graph API.",
    },
    {
        id: "rss",
        nombre: "Feed RSS",
        estado: "proximamente",
        nota: "Falta generar el feed consolidado de la red; sin credenciales externas.",
    },
    {
        id: "web",
        nombre: "Web",
        estado: "proximamente",
        nota: "Falta la página de publicaciones del ecosistema; sin credenciales externas.",
    },
];

/** Un canal del catálogo (los agentes telecomunicadores publican en él). */
export interface CanalStarSeed {
    id: string;
    nombre: string;
    plataforma: PlataformaCanal;
    enlace: string;
    /** chatId, canalId… identifica el destino real en la plataforma. */
    identificador: string;
    tipo: "canal" | "grupo";
    categorias: string[];
    descripcion: string;
    personalidadId: string | null;
    cerebroId: string | null;
    /** Publicaciones previstas al día (0-48); los canales son activos. */
    cadenciaDia: number;
    formatos: string[];
    activo: boolean;
    publicoEnDirectorio: boolean;
    creadoEn: string;
    actualizadoEn: string;
}

/** Una publicación registrada de un canal (historial en `historial.jsonl`). */
export interface HistorialCanal {
    canalId: string;
    t: string;
    texto: string;
    formato: string;
    ok: boolean;
    detalle?: string;
}

/** Entrada parcial para validar/crear un canal (lo que manda el panel). */
export type CanalParcial = Partial<CanalStarSeed> & Pick<CanalStarSeed, "nombre" | "plataforma">;

/** Quita acentos y pasa a minúsculas (para el slug). */
function normalizar(texto: string): string {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

/**
 * Id estable de un canal a partir de nombre + plataforma.
 * Slug en minúsculas sin acentos: «Noticias StarSeed» → «noticias-starseed».
 * Puro: sin disco, sin estado.
 */
export function idDeCanal(nombre: string, plataforma: PlataformaCanal): string {
    const base = normalizar(nombre)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
    return `${base}-${plataforma}`;
}

/**
 * Valida un canal parcial y, si es válido, lo completa con valores por defecto.
 * Puro: sin disco ni estado. Reglas: nombre 2-80 chars; plataforma de la lista;
 * categorías máximas 8, cada una 2-30 chars en minúsculas sin comas (LIBRES);
 * cadenciaDia entre 0 y 48. Devuelve el canal completo listo para guardar.
 */
export function validarCanal(
    parcial: CanalParcial,
): { ok: true; canal: CanalStarSeed } | { ok: false; error: string } {
    const nombre = (parcial.nombre ?? "").trim();
    if (nombre.length < 2 || nombre.length > 80) {
        return { ok: false, error: "El nombre debe tener entre 2 y 80 caracteres." };
    }

    const plataforma = parcial.plataforma;
    if (!PLATAFORMAS.some((p) => p.id === plataforma)) {
        return { ok: false, error: "Plataforma desconocida." };
    }

    const categorias = parcial.categorias ?? [];
    if (categorias.length > 8) {
        return { ok: false, error: "Máximo 8 categorías por canal." };
    }
    for (const c of categorias) {
        if (c.length < 2 || c.length > 30 || c.includes(",") || c !== c.toLowerCase()) {
            return { ok: false, error: `Categoría inválida: «${c}».` };
        }
    }

    const cadenciaDia = parcial.cadenciaDia ?? 3;
    if (!Number.isInteger(cadenciaDia) || cadenciaDia < 0 || cadenciaDia > 48) {
        return { ok: false, error: "La cadencia debe estar entre 0 y 48 publicaciones al día." };
    }

    const ahora = new Date().toISOString();
    const id = parcial.id ?? idDeCanal(nombre, plataforma);
    const canal: CanalStarSeed = {
        id,
        nombre,
        plataforma,
        enlace: parcial.enlace ?? "",
        identificador: parcial.identificador ?? "",
        tipo: parcial.tipo ?? "canal",
        categorias,
        descripcion: parcial.descripcion ?? "",
        personalidadId: parcial.personalidadId ?? null,
        cerebroId: parcial.cerebroId ?? null,
        cadenciaDia,
        formatos: (parcial.formatos ?? []).slice(0, 12),
        activo: parcial.activo ?? true,
        publicoEnDirectorio: parcial.publicoEnDirectorio ?? true,
        creadoEn: parcial.creadoEn ?? ahora,
        actualizadoEn: ahora,
    };
    return { ok: true, canal };
}

/**
 * Fusiona los espacios de Telegram existentes con el catálogo actual SIN duplicar
 * por `identificador`: si un espacio ya está presente se conserva (actualizando la
 * fecha si cambió el enlace), si no se crea de cero. Puro: devuelve la lista
 * completa; la envoltura de disco es la que persiste.
 */
export function fusionarSembrado(
    existentes: CanalStarSeed[],
    espacios: TgSpace[],
    ahora: string,
): CanalStarSeed[] {
    const porId = new Map<string, CanalStarSeed>();
    for (const c of existentes) porId.set(c.identificador, c);

    for (const e of espacios) {
        const previo = porId.get(e.chatId);
        if (previo) {
            if (previo.enlace !== e.url) {
                porId.set(e.chatId, { ...previo, enlace: e.url, actualizadoEn: ahora });
            }
            continue;
        }
        const plataforma: PlataformaCanal = "telegram";
        const canal: CanalStarSeed = {
            id: idDeCanal(e.name, plataforma),
            nombre: e.name,
            plataforma,
            enlace: e.url,
            identificador: e.chatId,
            tipo: e.kind === "Grupo" ? "grupo" : "canal",
            categorias: [],
            descripcion: "",
            personalidadId: null,
            cerebroId: null,
            cadenciaDia: 3,
            formatos: [],
            activo: true,
            publicoEnDirectorio: true,
            creadoEn: ahora,
            actualizadoEn: ahora,
        };
        porId.set(e.chatId, canal);
    }
    return [...porId.values()];
}

/** Ruta base de la persistencia de canales bajo la raíz del proyecto. */
function carpetaCanales(): string {
    return path.join(raizDelProyecto(), "starseed_memory_root", "canales");
}

/** Ruta del catálogo JSON. */
function rutaCatalogo(): string {
    return path.join(carpetaCanales(), "canales.json");
}

/** Ruta del historial de publicaciones (JSONL). */
function rutaHistorial(): string {
    return path.join(carpetaCanales(), "historial.jsonl");
}

/** Crea la carpeta si no existe (idempotente). */
async function asegurarCarpeta(): Promise<void> {
    await fs.mkdir(carpetaCanales(), { recursive: true });
}

/** Escritura atómica: vuelca a un `.tmp` y lo renombra encima del destino. */
async function escribirAtomico(ruta: string, contenido: string): Promise<void> {
    const tmp = `${ruta}.tmp`;
    await fs.writeFile(tmp, contenido, "utf8");
    await fs.rename(tmp, ruta);
}

/**
 * Lee el catálogo. Si el JSON está corrupto lo conserva como `.bak` y empieza de
 * cero (tolerante: nunca revienta la consola por un archivo roto).
 */
export async function leerCanales(): Promise<CanalStarSeed[]> {
    await asegurarCarpeta();
    try {
        const texto = await fs.readFile(rutaCatalogo(), "utf8");
        const datos = JSON.parse(texto) as unknown;
        if (!Array.isArray(datos)) return [];
        return datos.filter((d): d is CanalStarSeed => typeof d === "object" && d !== null);
    } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return [];
        try {
            await fs.copyFile(rutaCatalogo(), `${rutaCatalogo()}.bak`);
        } catch {
            /* si ni siquiera se puede copiar, no importa: se empieza de cero */
        }
        return [];
    }
}

/** Guarda (crea o actualiza) un canal: valida, evita ids duplicados y persiste. */
export async function guardarCanal(parcial: CanalParcial): Promise<CanalStarSeed> {
    const validado = validarCanal(parcial);
    if (!validado.ok) throw new Error(validado.error);
    const canal = validado.canal;

    const canales = await leerCanales();
    const indice = canales.findIndex((c) => c.id === canal.id);
    if (indice >= 0) {
        canales[indice] = { ...canales[indice], ...canal, id: canal.id, actualizadoEn: canal.actualizadoEn };
    } else {
        canales.push(canal);
    }
    await escribirAtomico(rutaCatalogo(), JSON.stringify(canales, null, 2));
    return canal;
}

/** Borra un canal por id; devuelve true si existía y se borró. */
export async function borrarCanal(id: string): Promise<boolean> {
    const canales = await leerCanales();
    const restantes = canales.filter((c) => c.id !== id);
    if (restantes.length === canales.length) return false;
    await escribirAtomico(rutaCatalogo(), JSON.stringify(restantes, null, 2));
    return true;
}

/** Cambia el estado activo/inactivo de un canal; true si lo encontró. */
export async function cambiarEstado(id: string, activo: boolean): Promise<boolean> {
    const canales = await leerCanales();
    const indice = canales.findIndex((c) => c.id === id);
    if (indice < 0) return false;
    canales[indice] = { ...canales[indice], activo, actualizadoEn: new Date().toISOString() };
    await escribirAtomico(rutaCatalogo(), JSON.stringify(canales, null, 2));
    return true;
}

/** Siembra los canales de Telegram que falten desde `TG_SPACES`; devuelve los creados. */
export async function sembrarDesdeTelegram(): Promise<CanalStarSeed[]> {
    const canales = await leerCanales();
    const ahora = new Date().toISOString();
    const fusion = fusionarSembrado(canales, TG_SPACES, ahora);
    await escribirAtomico(rutaCatalogo(), JSON.stringify(fusion, null, 2));
    const previos = new Set(canales.map((c) => c.identificador));
    return fusion.filter((c) => !previos.has(c.identificador));
}

/** Añade una línea al historial de publicaciones (JSONL, append). */
export async function registrarPublicacion(h: HistorialCanal): Promise<void> {
    await asegurarCarpeta();
    await fs.appendFile(rutaHistorial(), `${JSON.stringify(h)}\n`, "utf8");
}

/** Lee el historial, por canal (opcional) y con límite (por defecto 50, el más reciente primero). */
export async function leerHistorial(canalId?: string, limite = 50): Promise<HistorialCanal[]> {
    await asegurarCarpeta();
    try {
        const texto = await fs.readFile(rutaHistorial(), "utf8");
        const lineas = texto
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
        const registros: HistorialCanal[] = [];
        for (const linea of lineas) {
            try {
                const dato = JSON.parse(linea) as unknown;
                if (typeof dato === "object" && dato !== null) registros.push(dato as HistorialCanal);
            } catch {
                /* una línea corrupta no debe tumbar el historial entero */
            }
        }
        const filtrados = canalId ? registros.filter((r) => r.canalId === canalId) : registros;
        return filtrados.slice(-limite).reverse();
    } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return [];
        return [];
    }
}