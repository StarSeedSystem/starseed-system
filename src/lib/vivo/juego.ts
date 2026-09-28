/**
 * JUEGOS EN VIVO — contrato de app en vivo (L4 · 2026-09-28).
 *
 * Una «sala de juegos» es un espacio de `os_spaces` (`kind: "juego"`) cuyo documento guarda el
 * DIARIO de la partida en curso y el historial de las anteriores; las jugadas viajan al momento
 * por un canal de difusión y cada cliente las valida con las mismas reglas puras. Se abre en
 * `/juego/<id>` (acepta `?sesion=<id>` sin más). Ver `juegos/controlador.ts` y `juegos/mesa.ts`.
 *
 * Contrato con el catálogo (`src/components/messages/vivo/catalogo-vivo.ts`, que cablea el
 * integrador): `crearVivoJuego`, `listarMiosJuego`, `INFO_VIVO_JUEGO`. Honesto: el enlace público
 * abre en modo lectura (se mira, no se juega); para jugar hay que estar invitada o ser del chat.
 */
import { createClient } from "@/utils/supabase/client";
import { crearEspacioVivo, listarEspaciosVivos } from "./juegos/espacio-vivo";
import { baseDePartida } from "./juegos/mesa";
import { docVacio } from "./juegos/registro";
import { esIdJuego, type Datos, type DocSala, type IdJuego } from "./juegos/tipos";

export const INFO_VIVO_JUEGO = {
    etiqueta: "Juego",
    descripcion: "Una partida en tiempo real: tres en raya, Conecta 4, ajedrez o Dibujo-adivina.",
    icono: "Gamepad2",
    color: "#39FF14",
} as const;

export function rutaJuego(spaceId: string): string {
    return `/juego/${encodeURIComponent(spaceId)}`;
}

export interface OpcionesCrearJuego {
    /** Juego ya elegido (si no, la sala se abre en el vestíbulo para elegir). */
    juego?: IdJuego;
    /** Opciones del juego: `{ segundos, vueltas }` en el Dibujo-adivina. */
    opciones?: Datos;
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

/** Documento de una sala nueva: vacía (vestíbulo) o con la primera partida ya preparada. */
export function docJuegoNuevo(creador: string, opciones: OpcionesCrearJuego = {}, ahora = Date.now()): DocSala {
    const doc = docVacio("juego");
    if (opciones.juego && esIdJuego(opciones.juego)) {
        doc.registro = {
            id: idNuevo(),
            tipo: opciones.juego,
            gen: 1,
            creada: ahora,
            base: baseDePartida(opciones.juego, creador, Math.floor(ahora % 2 ** 31), opciones.opciones ?? {}),
            log: [],
        };
    }
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

/** Crea la sala y devuelve su id y su ruta. Lanza `Error` con un mensaje en español. */
export async function crearVivoJuego(
    titulo: string,
    opciones: OpcionesCrearJuego = {},
): Promise<{ refId: string; ruta: string }> {
    const uid = await miUid();
    const nombre = (titulo ?? "").trim() || "Sala de juegos";
    const espacio = await crearEspacioVivo("juego", nombre, docJuegoNuevo(uid, opciones));
    return { refId: espacio.id, ruta: rutaJuego(espacio.id) };
}

/** Mis salas de juego. */
export async function listarMiosJuego(): Promise<{ refId: string; titulo: string; ruta: string }[]> {
    const mias = await listarEspaciosVivos("juego");
    return mias.map((m) => ({ refId: m.refId, titulo: m.titulo, ruta: rutaJuego(m.refId) }));
}
