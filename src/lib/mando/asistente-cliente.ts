/**
 * Estado compartido del asistente del Mando en el navegador (cliente)
 * ─────────────────────────────────────────────────────────────────────────────
 * La orbe flotante y la sección «Asistente» de la pestaña Chat son DOS vistas del mismo
 * chat: el id del chat actual y el modelo elegido viven en localStorage y cualquier cambio
 * se anuncia con un evento del `window` para que la otra vista se ponga al día.
 */

export const EVENTO_ASISTENTE = "starseed:mando-asistente";
const CLAVE_CHAT = "starseed.mando.asistente.chat";
const CLAVE_MODELO = "starseed.mando.asistente.modelo";
export const MODELO_POR_DEFECTO = "nim/moonshotai/kimi-k3";

export interface AvisoAsistente {
    /** toggle: abrir/cerrar el panel flotante · cambio: el chat o el modelo cambiaron · tarea: abrir una tarea en la ramificación */
    tipo: "toggle" | "abrir" | "cambio" | "tarea";
    chatId?: string | null;
    modelo?: string;
    tareaId?: string;
}

export function leerChatActual(): string | null {
    try {
        return window.localStorage.getItem(CLAVE_CHAT);
    } catch {
        return null;
    }
}

export function leerModeloActual(): string {
    try {
        return window.localStorage.getItem(CLAVE_MODELO) || MODELO_POR_DEFECTO;
    } catch {
        return MODELO_POR_DEFECTO;
    }
}

export function anunciar(aviso: AvisoAsistente): void {
    try {
        window.dispatchEvent(new CustomEvent<AvisoAsistente>(EVENTO_ASISTENTE, { detail: aviso }));
    } catch {
        // sin window
    }
}

export function fijarChatActual(id: string | null): void {
    try {
        if (id) window.localStorage.setItem(CLAVE_CHAT, id);
        else window.localStorage.removeItem(CLAVE_CHAT);
    } catch {
        // sin almacenamiento
    }
    anunciar({ tipo: "cambio", chatId: id });
}

export function fijarModeloActual(modelo: string): void {
    try {
        window.localStorage.setItem(CLAVE_MODELO, modelo);
    } catch {
        // sin almacenamiento
    }
    anunciar({ tipo: "cambio", modelo });
}

export function escuchar(fn: (aviso: AvisoAsistente) => void): () => void {
    const manejador = (e: Event) => fn((e as CustomEvent<AvisoAsistente>).detail);
    window.addEventListener(EVENTO_ASISTENTE, manejador);
    return () => window.removeEventListener(EVENTO_ASISTENTE, manejador);
}
