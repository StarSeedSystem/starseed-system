/**
 * Filtros, orden y secciones de la lista de chats (2026-09-28) — lógica PURA, sin React.
 *
 * Reglas (todas personales: filtrar no cambia nada para la otra persona):
 *  - «Todos» esconde los archivados, los restringidos y las solicitudes.
 *  - «Solicitudes» solo existe con `privacidad.escribirme === "contactos"`: DMs que me abrió
 *    alguien que no está en mis contactos. Llegan ahí sin avisar.
 *  - «Restringidos» y «Archivados» son las únicas puertas a lo que «Todos» esconde.
 *  - Con `fijadosArriba`, los fijados van en su propia sección antes que el resto.
 */

import type { DmThreadSummary } from "@/lib/messages/dm";

export type FiltroLista =
    | "todos"
    | "no-leidos"
    | "grupos"
    | "contactos"
    | "solicitudes"
    | "restringidos"
    | "archivados";

export type OrdenLista = "reciente" | "no-leidos" | "nombre";

export const ETIQUETAS_FILTRO: Record<FiltroLista, string> = {
    todos: "Todos",
    "no-leidos": "No leídos",
    grupos: "Grupos",
    contactos: "Contactos",
    solicitudes: "Solicitudes",
    restringidos: "Restringidos",
    archivados: "Archivados",
};

/** Lo que la lista necesita saber de los ajustes efectivos de cada hilo. */
export interface EstadoHiloLista {
    fijado: boolean;
    archivado: boolean;
    restringido: boolean;
    silenciado: boolean;
    apodo: string | null;
}

export interface EntradaLista {
    hilo: DmThreadSummary;
    /** Nombre final que se pinta (apodo del hilo › contacto › perfil). */
    titulo: string;
    /** Texto extra por el que también se puede buscar (nombre del contacto, @usuario…). */
    buscable: string;
    estado: EstadoHiloLista;
    /** DM con alguien que está en mis contactos. */
    esContacto: boolean;
    /** DM de alguien ajeno a mis contactos, con «escribirme: solo contactos». */
    esSolicitud: boolean;
}

/** El otro miembro de un DM (o null si es un grupo o un hilo conmigo mismo). */
export function companeroDm(hilo: Pick<DmThreadSummary, "kind" | "memberIds">, miUid: string | null): string | null {
    if (hilo.kind !== "dm") return null;
    return hilo.memberIds.find((id) => id !== miUid) ?? null;
}

/**
 * ¿Es una solicitud? Solo con «escribirme: solo contactos», solo DMs, solo si la otra persona no
 * está en mis contactos y el chat no lo abrí yo (lo que yo empiezo nunca es una solicitud).
 */
export function esSolicitud(
    hilo: Pick<DmThreadSummary, "kind" | "memberIds" | "createdBy">,
    miUid: string | null,
    escribirme: "todos" | "contactos",
    esContactoFn: (userId: string) => boolean,
): boolean {
    if (escribirme !== "contactos") return false;
    const otro = companeroDm(hilo, miUid);
    if (!otro) return false;
    if (miUid && hilo.createdBy === miUid) return false;
    return !esContactoFn(otro);
}

/** Qué chips se enseñan: «Solicitudes» solo cuando existen como concepto. */
export function filtrosVisibles(escribirme: "todos" | "contactos"): FiltroLista[] {
    const base: FiltroLista[] = ["todos", "no-leidos", "grupos", "contactos"];
    if (escribirme === "contactos") base.push("solicitudes");
    base.push("restringidos", "archivados");
    return base;
}

function normalizar(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
}

/** ¿Pasa esta entrada el filtro elegido? */
export function pasaFiltro(e: EntradaLista, filtro: FiltroLista): boolean {
    const { archivado, restringido } = e.estado;
    switch (filtro) {
        case "archivados":
            return archivado;
        case "restringidos":
            return restringido;
        case "solicitudes":
            return e.esSolicitud && !archivado;
        case "no-leidos":
            return !archivado && !restringido && !e.esSolicitud && e.hilo.unreadCount > 0;
        case "grupos":
            return !archivado && !restringido && e.hilo.kind === "group";
        case "contactos":
            return !archivado && !restringido && e.esContacto;
        case "todos":
        default:
            return !archivado && !restringido && !e.esSolicitud;
    }
}

/** Busca por título, texto buscable y último mensaje (sin tildes ni mayúsculas). */
export function coincideTexto(e: EntradaLista, texto: string): boolean {
    const q = normalizar(texto.trim());
    if (!q) return true;
    const pajar = normalizar([e.titulo, e.buscable, e.hilo.lastMessage?.body ?? ""].join(" "));
    return pajar.includes(q);
}

/**
 * Aplica filtro + búsqueda. Con texto de búsqueda se mira en TODO lo no archivado (y, si el
 * filtro es Archivados/Restringidos, dentro de ese filtro): buscar no debe esconder nada que
 * la persona sepa que existe.
 */
export function filtrarEntradas(entradas: EntradaLista[], filtro: FiltroLista, texto = ""): EntradaLista[] {
    const hayTexto = texto.trim().length > 0;
    return entradas.filter((e) => {
        if (hayTexto && filtro === "todos") {
            if (e.estado.archivado) return false;
            return coincideTexto(e, texto);
        }
        return pasaFiltro(e, filtro) && coincideTexto(e, texto);
    });
}

function marcaTiempo(h: DmThreadSummary): number {
    const t = new Date(h.lastMsgAt || h.createdAt).getTime();
    return Number.isNaN(t) ? 0 : t;
}

export function ordenarEntradas(entradas: EntradaLista[], orden: OrdenLista): EntradaLista[] {
    const copia = [...entradas];
    const porReciente = (a: EntradaLista, b: EntradaLista) => marcaTiempo(b.hilo) - marcaTiempo(a.hilo);
    if (orden === "nombre") {
        copia.sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" }) || porReciente(a, b));
    } else if (orden === "no-leidos") {
        copia.sort((a, b) => {
            const na = a.hilo.unreadCount > 0 && !a.estado.silenciado ? 1 : 0;
            const nb = b.hilo.unreadCount > 0 && !b.estado.silenciado ? 1 : 0;
            return nb - na || porReciente(a, b);
        });
    } else {
        copia.sort(porReciente);
    }
    return copia;
}

/** Divide en «Fijados» y «Chats». Sin `fijadosArriba`, todo va junto en «Chats». */
export function seccionarEntradas(
    entradas: EntradaLista[],
    fijadosArriba: boolean,
): { fijados: EntradaLista[]; resto: EntradaLista[] } {
    if (!fijadosArriba) return { fijados: [], resto: entradas };
    return {
        fijados: entradas.filter((e) => e.estado.fijado),
        resto: entradas.filter((e) => !e.estado.fijado),
    };
}

/** Recuento por filtro (para los números de los chips). */
export function contarPorFiltro(entradas: EntradaLista[]): Record<FiltroLista, number> {
    const cuenta: Record<FiltroLista, number> = {
        todos: 0,
        "no-leidos": 0,
        grupos: 0,
        contactos: 0,
        solicitudes: 0,
        restringidos: 0,
        archivados: 0,
    };
    for (const e of entradas) {
        for (const f of Object.keys(cuenta) as FiltroLista[]) {
            if (pasaFiltro(e, f)) cuenta[f]++;
        }
    }
    return cuenta;
}

/** Mensaje honesto para una lista vacía, según el filtro. */
export function textoVacio(filtro: FiltroLista, busqueda: string): { titulo: string; detalle?: string } {
    if (busqueda.trim()) return { titulo: `Sin resultados para «${busqueda.trim()}»` };
    switch (filtro) {
        case "no-leidos":
            return { titulo: "Todo leído", detalle: "No tienes mensajes pendientes." };
        case "grupos":
            return { titulo: "Aún no estás en ningún grupo", detalle: "Crea uno desde «Nuevo chat»." };
        case "contactos":
            return { titulo: "Sin chats con tus contactos", detalle: "Escribe a alguien de tu libreta desde «Nuevo chat»." };
        case "solicitudes":
            return {
                titulo: "No hay solicitudes",
                detalle: "Cuando te escriba alguien que no está en tus contactos, llegará aquí, sin avisos.",
            };
        case "restringidos":
            return { titulo: "Nadie restringido", detalle: "Restringir es personal: el otro no se entera y nada se borra." };
        case "archivados":
            return { titulo: "No tienes chats archivados" };
        default:
            return { titulo: "Sin conversaciones todavía", detalle: "Empieza un chat con alguien de tu libreta o de la red." };
    }
}
