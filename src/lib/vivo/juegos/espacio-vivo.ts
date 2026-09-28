/**
 * Crear y listar los espacios (`os_spaces`) de las salas de juego y los programas en vivo.
 *
 * Tipo de espacio: se intenta el `kind` propio (`juego` / `programa`, que añade la migración
 * `20260928130000_l4-juegos.sql`); mientras esa migración no esté aplicada la base rechaza el
 * valor, y se cae —sin romper nada— al contenedor genérico `dashboard`, marcando el documento con
 * `doc.vivo.tipo` para reconocerlo. El espacio se abre siempre por su id, así que el `kind` solo
 * importa para listar. El acceso es el de los demás tipos en vivo: por invitación (`invite`); un
 * enlace público es de SOLO LECTURA (la RLS de `os_spaces` no da edición a quien no está invitado).
 */
import { createSpace, listOwnedSpaces, type Space, type SpaceKind } from "@/lib/spaces/spaces";
import { createClient } from "@/utils/supabase/client";
import type { DocSala } from "./tipos";

export type TipoEspacioVivo = "juego" | "programa";

export const MENSAJE_SIN_CUENTA_VIVO = "Inicia sesión para crear una sala en vivo.";
export const MENSAJE_NO_CREADO = "No se pudo crear. Comprueba tu conexión e inténtalo de nuevo.";

/** Tipos de espacio que este servidor ya rechazó en esta visita (migración sin aplicar). */
const kindsRechazados = new Set<string>();

/** Solo para pruebas. */
export function olvidarKindsRechazados(): void {
    kindsRechazados.clear();
}

async function haySesion(): Promise<boolean> {
    try {
        const { data } = await createClient().auth.getSession();
        return Boolean(data?.session?.user?.id);
    } catch {
        return false;
    }
}

/** Crea el espacio de una sala. Lanza `Error` con un mensaje en español si no se puede. */
export async function crearEspacioVivo(tipo: TipoEspacioVivo, titulo: string, doc: DocSala): Promise<Space> {
    if (!(await haySesion())) throw new Error(MENSAJE_SIN_CUENTA_VIVO);
    const candidatos: string[] = [tipo, "dashboard"];
    for (const kind of candidatos) {
        if (kindsRechazados.has(kind)) continue;
        const espacio = await createSpace({
            kind: kind as SpaceKind,
            title: titulo,
            access: "invite",
            doc: doc as unknown as Record<string, unknown>,
        });
        if (espacio) return espacio;
        if (kind !== "dashboard") kindsRechazados.add(kind);
    }
    throw new Error(MENSAJE_NO_CREADO);
}

/** Espacios propios de este tipo (los del `kind` propio y los que cayeron en `dashboard`). */
export async function listarEspaciosVivos(tipo: TipoEspacioVivo): Promise<{ refId: string; titulo: string }[]> {
    const [propios, genericos] = await Promise.all([
        listOwnedSpaces(tipo as SpaceKind),
        listOwnedSpaces("dashboard"),
    ]);
    const marcado = (s: Space) => (s.doc as { vivo?: { tipo?: unknown } } | null)?.vivo?.tipo === tipo;
    const vistos = new Set<string>();
    const out: { refId: string; titulo: string }[] = [];
    for (const s of [...propios.filter(marcado), ...genericos.filter(marcado)]) {
        if (vistos.has(s.id)) continue;
        vistos.add(s.id);
        out.push({ refId: s.id, titulo: s.title });
    }
    return out;
}
