/**
 * PROGRAMAS EN VIVO — contrato de app en vivo (L4 · 2026-09-28).
 *
 * Un «programa» es un espacio de `os_spaces` (`kind: "programa"`) cuyo documento guarda una
 * ESPECIFICACIÓN declarativa (títulos, textos, listas de tareas, contadores, encuestas, tableros
 * kanban y formularios) y el DIARIO de acciones que construye su estado compartido. Todas las
 * personas ven los cambios al momento por un canal de difusión y cada cliente valida cada acción
 * con las mismas reglas puras (`programas/motor.ts`). Se abre en `/programa/<id>` (acepta
 * `?sesion=<id>` sin más).
 *
 * Alcance honesto: NO ejecuta código de nadie (CLAUDE.md, «editable sí, ejecutable no»). Es un
 * vocabulario cerrado de bloques con estado compartido, no un lenguaje de programación. El
 * enlace público abre en modo lectura; para participar hay que tener cuenta e invitación.
 *
 * Contrato con el catálogo (`src/components/messages/vivo/catalogo-vivo.ts`, que cablea el
 * integrador): `crearVivoPrograma`, `listarMiosPrograma`, `INFO_VIVO_PROGRAMA`.
 */
import { createClient } from "@/utils/supabase/client";
import { crearEspacioVivo, listarEspaciosVivos } from "./juegos/espacio-vivo";
import { docVacio } from "./juegos/registro";
import type { DocSala } from "./juegos/tipos";
import { basePrograma, TIPO_REGISTRO_PROGRAMA } from "./programas/motor";
import { esIdPlantilla, especificacionDePlantilla, plantillaPorId, type IdPlantilla } from "./programas/plantillas";

export const INFO_VIVO_PROGRAMA = {
    etiqueta: "Programa",
    descripcion: "Una mini-app compartida: encuesta, lista de tareas, tablero kanban, contador o formulario, en tiempo real.",
    icono: "AppWindow",
    color: "#EC4899",
} as const;

export function rutaPrograma(spaceId: string): string {
    return `/programa/${encodeURIComponent(spaceId)}`;
}

export interface OpcionesCrearPrograma {
    /** Plantilla de partida (por defecto, un programa en blanco). */
    plantilla?: IdPlantilla;
}

function idNuevo(): string {
    try {
        const c = globalThis.crypto;
        if (c?.randomUUID) return c.randomUUID().replace(/-/g, "").slice(0, 16);
    } catch {
        /* sigue */
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Documento de un programa nuevo, con su primer registro ya preparado. */
export function docProgramaNuevo(creador: string, titulo: string, opciones: OpcionesCrearPrograma = {}, ahora = Date.now()): DocSala {
    const plantilla = opciones.plantilla && esIdPlantilla(opciones.plantilla) ? opciones.plantilla : "en-blanco";
    const doc = docVacio("programa");
    doc.registro = {
        id: idNuevo(),
        tipo: TIPO_REGISTRO_PROGRAMA,
        gen: 1,
        creada: ahora,
        base: basePrograma(creador, especificacionDePlantilla(plantilla, titulo)),
        log: [],
    };
    return doc;
}

async function miUid(): Promise<string> {
    try {
        const { data } = await createClient().auth.getSession();
        return data?.session?.user?.id ?? "";
    } catch {
        return "";
    }
}

/** Crea el programa y devuelve su id y su ruta. Lanza `Error` con un mensaje en español. */
export async function crearVivoPrograma(
    titulo: string,
    opciones: OpcionesCrearPrograma = {},
): Promise<{ refId: string; ruta: string }> {
    const uid = await miUid();
    const nombre = (titulo ?? "").trim() || (opciones.plantilla ? (plantillaPorId(opciones.plantilla)?.titulo ?? "Programa") : "Programa");
    const espacio = await crearEspacioVivo("programa", nombre, docProgramaNuevo(uid, nombre, opciones));
    return { refId: espacio.id, ruta: rutaPrograma(espacio.id) };
}

/** Mis programas. */
export async function listarMiosPrograma(): Promise<{ refId: string; titulo: string; ruta: string }[]> {
    const mios = await listarEspaciosVivos("programa");
    return mios.map((m) => ({ refId: m.refId, titulo: m.titulo, ruta: rutaPrograma(m.refId) }));
}
