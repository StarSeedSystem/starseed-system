/**
 * Carpetas de un chat (2026-09-28) — contrato. Cada chat (de dos o de grupo) puede tener
 * carpetas para ordenar sus archivos y mensajes:
 *  - «privada»: solo la ve quien la crea. Vive en `entity_state` de su cuenta, clave
 *    `CLAVE_CARPETAS_PRIVADAS` → `{ hilos: { [hiloId]: CarpetaHilo[] } }`.
 *  - «chat»: la ven y editan todos los miembros. Vive en `os_dm_threads.meta.carpetas`
 *    (la RLS del hilo ya limita a los miembros), con lectura-fusión-escritura por elemento.
 *  - «publica»: como «chat», y además se publica en la Biblioteca de quien la publica, en una
 *    carpeta con ACL pública (la Biblioteca ya sabe compartir). Solo se publican referencias y
 *    URLs de archivos, nunca el texto de mensajes privados sin que la persona lo elija.
 * Borrados con lápida y fusión por `actualizado`, como Contactos.
 */

export const CLAVE_CARPETAS_PRIVADAS = "carpetas-hilos";

export type VisibilidadCarpeta = "privada" | "chat" | "publica";

export type CategoriaArchivo = "imagen" | "video" | "audio" | "documento" | "enlace" | "vivo" | "llamada" | "mensaje" | "otro";

export interface ItemCarpeta {
    id: string;
    mensajeId: string;
    /** Índice del adjunto dentro del mensaje; null = el mensaje entero (texto/formato). */
    adjuntoIndice: number | null;
    titulo: string;
    categoria: CategoriaArchivo;
    url?: string;
    agregado: string;
    /** uid de quien lo guardó. */
    por: string;
    borrado?: string | null;
}

export interface CarpetaHilo {
    id: string;
    hiloId: string;
    nombre: string;
    color: string;
    visibilidad: VisibilidadCarpeta;
    creador: string;
    items: ItemCarpeta[];
    /** Si se publicó en la Biblioteca: id de la carpeta allí. */
    carpetaBibliotecaId?: string | null;
    creado: string;
    actualizado: string;
    borrado?: string | null;
}
