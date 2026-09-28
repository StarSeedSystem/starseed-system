/**
 * Catálogo de apps en vivo (2026-09-28) — qué se puede compartir EN VIVO en un chat y con qué
 * implementación REAL se abre cada tipo.
 *
 * Regla de honestidad: un tipo solo está `disponible` si ya existe en el OS algo que sincroniza
 * de verdad entre personas. Hoy eso es `os_spaces` (RLS por invitación + realtime, ver
 * `@/lib/spaces/spaces`):
 *   · pizarra    → espacio `board`   abierto en `/pizarra?board-space=<id>` (lienzo colaborativo).
 *   · sala       → la misma pizarra compartida, sembrada con una plantilla de sala con propósito
 *                  (`@/lib/salas/plantillas-sala`: asamblea, aula, círculo de paz, retrospectiva).
 *   · escritorio → espacio `desktop` abierto en `/escritorios?space=<id>` (ventanas, archivos,
 *                  widgets que todos mueven a la vez).
 *   · navegador  → un escritorio compartido con UNA ventana de navegador (iframe con sandbox)
 *                  abierta en la dirección elegida. Honesto: todos abren la misma página; lo que
 *                  cada cual navega dentro de ella no se sincroniza todavía.
 * El resto (documento, presentación, tabla, juego, programa, panel, escena 3D, XR) queda como
 * «Próximamente» con su motivo: no hay todavía un editor que sincronice entre personas, y fingirlo
 * sería peor que decirlo.
 *
 * Permisos: el permiso de la sesión se traduce al rol del espacio (`editar` → editor; `ver` →
 * lector). `os_spaces` no distingue «comentar», así que esos tipos no lo ofrecen. Un espacio
 * público es de SOLO LECTURA para quien no está invitado (RLS `sp_update`), así que el enlace
 * público de estos tipos abre en modo lectura: para editar hay que invitar a la persona.
 */

import type { PermisoVivo, TipoVivo } from "@/lib/mensajeria/formato-tipos";
import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { DesktopsState } from "@/components/desktop/desktop-store";
import { PLANTILLAS, type PlantillaSala } from "@/lib/salas/plantillas-sala";
import {
    createSpace,
    deleteSpace,
    inviteToSpace,
    listOwnedSpaces,
    updateSpaceMeta,
    type Space,
} from "@/lib/spaces/spaces";

/** Nombres de icono de lucide-react (los resuelve `iconoVivo` en `comun-vivo.tsx`). */
export type NombreIconoVivo =
    | "DoorOpen"
    | "PenTool"
    | "FileText"
    | "Presentation"
    | "Table2"
    | "Globe"
    | "Gamepad2"
    | "AppWindow"
    | "Monitor"
    | "LayoutDashboard"
    | "Box"
    | "Glasses"
    /** Para llamadas (no son del catálogo, pero comparten tarjeta e invitación). */
    | "Phone"
    | "Video";

export interface OpcionesCrearVivo {
    /** Navegador: la dirección que se abre para todos. */
    url?: string;
    /** Sala: id de `PLANTILLAS` (o nada = sala en blanco). */
    plantillaId?: string | null;
}

export interface RecursoVivo {
    refId: string;
    titulo: string;
    ruta: string;
}

export interface EntradaCatalogoVivo {
    tipo: TipoVivo;
    etiqueta: string;
    descripcion: string;
    icono: NombreIconoVivo;
    color: string;
    disponible: boolean;
    /** Por qué no está disponible (solo si `disponible` es false). */
    motivo?: string;
    /** Matiz honesto de un tipo disponible (lo que aún no hace). */
    nota?: string;
    /** Dato extra que hay que pedir al crear. */
    pide?: "url" | "plantilla";
    /** Permisos que el tipo sabe hacer cumplir de verdad. */
    permisos: PermisoVivo[];
    /** ¿Quien entra por el enlace público puede editar? (si no, entra a ver). */
    edicionPorEnlacePublico: boolean;
    crear?: (titulo: string, opciones?: OpcionesCrearVivo) => Promise<{ refId: string; ruta: string }>;
    listarMios?: () => Promise<RecursoVivo[]>;
    /** Da acceso al recurso a estas cuentas (invitación en `os_spaces`). Devuelve cuántas lo lograron. */
    concederAcceso?: (refId: string, userIds: string[], permiso: PermisoVivo) => Promise<number>;
    /** Abre o cierra la lectura pública del recurso (enlace público). */
    cambiarPublico?: (refId: string, publico: boolean) => Promise<boolean>;
    /** Borra un recurso recién creado si la sesión no se pudo abrir (sin huérfanos). */
    deshacerCreacion?: (refId: string) => Promise<void>;
}

// ───────────────────────────── Rutas ─────────────────────────────

export function rutaPizarraCompartida(spaceId: string, motor: "starseed" | "tldraw" = "starseed"): string {
    return `/pizarra?board-space=${encodeURIComponent(spaceId)}&engine=${motor}`;
}

export function rutaEscritorioCompartido(spaceId: string): string {
    return `/escritorios?space=${encodeURIComponent(spaceId)}`;
}

/** Solo direcciones web http(s); añade https:// si falta. null si no es una dirección válida. */
export function normalizarUrlWeb(entrada: string | null | undefined): string | null {
    const t = (entrada ?? "").trim();
    if (!t || /\s/.test(t)) return null;
    const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
    try {
        const u = new URL(conEsquema);
        if (u.protocol !== "https:" && u.protocol !== "http:") return null;
        if (!u.hostname || (!u.hostname.includes(".") && u.hostname !== "localhost")) return null;
        return u.toString();
    } catch {
        return null;
    }
}

// ───────────────────────────── Documentos semilla (puros) ─────────────────────────────

let secuencia = 0;
function nuevoId(prefijo: string): string {
    secuencia += 1;
    return `${prefijo}_${Date.now().toString(36)}${secuencia.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Plantillas de sala que hoy se pueden abrir de verdad (las de tipo pizarra). */
export function plantillasDeSala(): PlantillaSala[] {
    return PLANTILLAS.filter((p) => p.tipo === "pizarra");
}

/**
 * Doc de pizarra (`{ blocks, edges }`) con los andamios de la plantilla como notas VACÍAS con su
 * rótulo — nunca contenido de ejemplo inventado. Rejilla de 3 columnas.
 */
export function docPizarraDesdePlantilla(plantilla: PlantillaSala | null): { blocks: CanvasBlock[]; edges: [] } {
    if (!plantilla) return { blocks: [], edges: [] };
    const blocks: CanvasBlock[] = plantilla.elementos.map((el, i) => {
        const rotulo = typeof el.datos.rotulo === "string" ? el.datos.rotulo : "Nota";
        return {
            id: nuevoId("blk"),
            kind: "text",
            x: 40 + (i % 3) * 320,
            y: 40 + Math.floor(i / 3) * 240,
            w: 290,
            h: 200,
            title: rotulo,
            data: { text: "" },
        };
    });
    return { blocks, edges: [] };
}

/** Estado de escritorios (`DesktopsState`) con un escritorio nuevo; con `url`, una ventana de navegador maximizada. */
export function docEscritorioNuevo(titulo: string, url?: string | null): DesktopsState {
    const id = nuevoId("desk");
    const windows = url
        ? [{
            id: nuevoId("win"),
            contentRef: { type: "browser" as const, ref: url, name: titulo },
            x: 64,
            y: 50,
            w: 960,
            h: 620,
            z: 1,
            minimized: false,
            maximized: true,
        }]
        : [];
    return {
        desktops: [{ id, name: titulo || "Escritorio compartido", icons: [], windows }],
        activeId: id,
        snap: true,
        savedAt: Date.now(),
    };
}

function esDocPizarra(doc: Record<string, unknown>): boolean {
    return Array.isArray(doc.blocks) || doc.engine === "tldraw";
}

function esDocEscritorio(doc: Record<string, unknown>): boolean {
    return Array.isArray(doc.desktops);
}

// ───────────────────────────── Acceso sobre os_spaces ─────────────────────────────

async function concederEnEspacio(refId: string, userIds: string[], permiso: PermisoVivo): Promise<number> {
    const rol = permiso === "editar" ? "editor" : "viewer";
    const unicos = [...new Set(userIds.filter((u) => typeof u === "string" && u.length > 0))];
    const resultados = await Promise.all(unicos.map((u) => inviteToSpace(refId, u, rol)));
    return resultados.filter(Boolean).length;
}

async function publicarEspacio(refId: string, publico: boolean): Promise<boolean> {
    return updateSpaceMeta(refId, { access: publico ? "public" : "invite" });
}

async function borrarEspacio(refId: string): Promise<void> {
    await deleteSpace(refId);
}

const SIN_CUENTA = "No se pudo crear. Inicia sesión e inténtalo de nuevo.";

async function crearEspacio(
    kind: "board" | "desktop",
    titulo: string,
    doc: Record<string, unknown>,
): Promise<Space> {
    const space = await createSpace({ kind, title: titulo, access: "invite", doc });
    if (!space) throw new Error(SIN_CUENTA);
    return space;
}

const ACCESO_ESPACIOS = {
    permisos: ["ver", "editar"] as PermisoVivo[],
    edicionPorEnlacePublico: false,
    concederAcceso: concederEnEspacio,
    cambiarPublico: publicarEspacio,
    deshacerCreacion: borrarEspacio,
};

// ───────────────────────────── El catálogo ─────────────────────────────

export const CATALOGO_VIVO: Record<TipoVivo, EntradaCatalogoVivo> = {
    sala: {
        tipo: "sala",
        etiqueta: "Sala con propósito",
        descripcion: "Una pizarra compartida ya preparada para asamblea, aula, círculo de paz o retrospectiva.",
        icono: "DoorOpen",
        color: "#7C5CFF",
        disponible: true,
        pide: "plantilla",
        ...ACCESO_ESPACIOS,
        crear: async (titulo, opciones) => {
            const plantilla = plantillasDeSala().find((p) => p.id === opciones?.plantillaId) ?? null;
            const space = await crearEspacio(
                "board",
                titulo || plantilla?.nombre || "Sala",
                docPizarraDesdePlantilla(plantilla) as unknown as Record<string, unknown>,
            );
            return { refId: space.id, ruta: rutaPizarraCompartida(space.id) };
        },
    },
    pizarra: {
        tipo: "pizarra",
        etiqueta: "Pizarra",
        descripcion: "Lienzo colaborativo: notas, imágenes, enlaces y ventanas que todos editan a la vez.",
        icono: "PenTool",
        color: "#FFBF00",
        disponible: true,
        ...ACCESO_ESPACIOS,
        crear: async (titulo) => {
            const space = await crearEspacio("board", titulo || "Pizarra compartida", { blocks: [], edges: [] });
            return { refId: space.id, ruta: rutaPizarraCompartida(space.id) };
        },
        listarMios: async () => {
            const propios = await listOwnedSpaces("board");
            return propios
                .filter((s) => esDocPizarra(s.doc))
                .map((s) => ({
                    refId: s.id,
                    titulo: s.title,
                    ruta: rutaPizarraCompartida(s.id, s.doc.engine === "tldraw" ? "tldraw" : "starseed"),
                }));
        },
    },
    escritorio: {
        tipo: "escritorio",
        etiqueta: "Escritorio",
        descripcion: "Un escritorio del OS compartido: ventanas, archivos y widgets que todos mueven en vivo.",
        icono: "Monitor",
        color: "#38BDF8",
        disponible: true,
        ...ACCESO_ESPACIOS,
        crear: async (titulo) => {
            const doc = docEscritorioNuevo(titulo || "Escritorio compartido");
            const space = await crearEspacio("desktop", titulo || "Escritorio compartido", doc as unknown as Record<string, unknown>);
            return { refId: space.id, ruta: rutaEscritorioCompartido(space.id) };
        },
        listarMios: async () => {
            const propios = await listOwnedSpaces("desktop");
            return propios
                .filter((s) => esDocEscritorio(s.doc))
                .map((s) => ({ refId: s.id, titulo: s.title, ruta: rutaEscritorioCompartido(s.id) }));
        },
    },
    navegador: {
        tipo: "navegador",
        etiqueta: "Ventana web",
        descripcion: "Una página web abierta para todos en un escritorio compartido.",
        icono: "Globe",
        color: "#22D3EE",
        disponible: true,
        nota: "Todos abren la misma página; lo que cada cual navega dentro de ella aún no se sincroniza.",
        pide: "url",
        ...ACCESO_ESPACIOS,
        crear: async (titulo, opciones) => {
            const url = normalizarUrlWeb(opciones?.url);
            if (!url) throw new Error("Escribe una dirección web válida (https://…).");
            const nombre = titulo || new URL(url).hostname;
            const doc = docEscritorioNuevo(nombre, url);
            const space = await crearEspacio("desktop", nombre, doc as unknown as Record<string, unknown>);
            return { refId: space.id, ruta: rutaEscritorioCompartido(space.id) };
        },
    },
    documento: {
        tipo: "documento",
        etiqueta: "Documento",
        descripcion: "Texto con formato que se escribe entre varias personas.",
        icono: "FileText",
        color: "#60A5FA",
        disponible: false,
        motivo: "Aún no hay un editor de documentos con escritura simultánea. Mientras tanto, una pizarra admite notas de texto que todos editan.",
        permisos: ["ver", "comentar", "editar"],
        edicionPorEnlacePublico: false,
    },
    presentacion: {
        tipo: "presentacion",
        etiqueta: "Presentación",
        descripcion: "Diapositivas que se presentan y se editan juntos.",
        icono: "Presentation",
        color: "#F43F5E",
        disponible: false,
        motivo: "El OS todavía no tiene un editor de diapositivas compartido.",
        permisos: ["ver", "comentar", "editar"],
        edicionPorEnlacePublico: false,
    },
    tabla: {
        tipo: "tabla",
        etiqueta: "Tabla de datos",
        descripcion: "Una hoja de cálculo que se rellena entre varias personas.",
        icono: "Table2",
        color: "#10B981",
        disponible: false,
        motivo: "Todavía no existe una hoja de datos con edición simultánea.",
        permisos: ["ver", "comentar", "editar"],
        edicionPorEnlacePublico: false,
    },
    juego: {
        tipo: "juego",
        etiqueta: "Juego",
        descripcion: "Una partida en tiempo real con quien quieras.",
        icono: "Gamepad2",
        color: "#39FF14",
        disponible: false,
        motivo: "Los servidores de apps ya tienen estado compartido, pero aún no hay juegos que lo usen.",
        permisos: ["ver", "editar"],
        edicionPorEnlacePublico: false,
    },
    programa: {
        tipo: "programa",
        etiqueta: "Programa",
        descripcion: "Una app del OS abierta a la vez por varias personas.",
        icono: "AppWindow",
        color: "#EC4899",
        disponible: false,
        motivo: "Las apps del catálogo aún no comparten su estado entre personas. Puedes abrirlas dentro de un escritorio compartido.",
        permisos: ["ver", "editar"],
        edicionPorEnlacePublico: false,
    },
    dashboard: {
        tipo: "dashboard",
        etiqueta: "Panel",
        descripcion: "Un panel de widgets que el grupo mira y ordena junto.",
        icono: "LayoutDashboard",
        color: "#007FFF",
        disponible: false,
        motivo: "Los paneles todavía no se abren en modo compartido.",
        permisos: ["ver", "editar"],
        edicionPorEnlacePublico: false,
    },
    escena3d: {
        tipo: "escena3d",
        etiqueta: "Escena 3D",
        descripcion: "Objetos y avatares en un mismo espacio tridimensional.",
        icono: "Box",
        color: "#F97316",
        disponible: false,
        motivo: "Las escenas 3D aún no sincronizan entre personas.",
        permisos: ["ver", "editar"],
        edicionPorEnlacePublico: false,
    },
    xr: {
        tipo: "xr",
        etiqueta: "Sala XR",
        descripcion: "Realidad virtual o aumentada compartida.",
        icono: "Glasses",
        color: "#DC143C",
        disponible: false,
        motivo: "El hub XR muestra tu propia red; la sala XR compartida todavía no existe.",
        permisos: ["ver", "editar"],
        edicionPorEnlacePublico: false,
    },
};

/** Orden de presentación: lo disponible primero. */
export const ORDEN_TIPOS_VIVO: TipoVivo[] = [
    "pizarra", "sala", "escritorio", "navegador",
    "documento", "presentacion", "tabla", "juego", "programa", "dashboard", "escena3d", "xr",
];

/** Entrada del catálogo desde «pizarra» o «vivo:pizarra». null para llamadas o tipos desconocidos. */
export function entradaVivo(tipo: string | null | undefined): EntradaCatalogoVivo | null {
    if (typeof tipo !== "string") return null;
    const base = tipo.startsWith("vivo:") ? tipo.slice(5) : tipo;
    return (CATALOGO_VIVO as Record<string, EntradaCatalogoVivo>)[base] ?? null;
}

export function tiposDisponibles(): EntradaCatalogoVivo[] {
    return ORDEN_TIPOS_VIVO.map((t) => CATALOGO_VIVO[t]).filter((e) => e.disponible);
}

export function tiposProximamente(): EntradaCatalogoVivo[] {
    return ORDEN_TIPOS_VIVO.map((t) => CATALOGO_VIVO[t]).filter((e) => !e.disponible);
}
