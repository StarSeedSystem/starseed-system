/**
 * Privacidad — permisos del navegador y dónde vive cada dato (PURO).
 * ─────────────────────────────────────────────────────────────────────────────
 * Textos y reglas de la página «Privacidad y seguridad» de Mi Puente de Mando.
 * Separados del componente para probarlos y para que la explicación de qué
 * queda en el dispositivo y qué viaja a la cuenta tenga una sola versión.
 */

/** Permisos del navegador que importan en StarSeed (nombres de la Permissions API). */
export type PermisoNavegador = "microphone" | "camera" | "notifications" | "persistent-storage";

export type EstadoPermiso = "granted" | "denied" | "prompt" | "no-disponible";

export interface DefinicionPermisoNavegador {
    id: PermisoNavegador;
    etiqueta: string;
    /** Para qué lo usa StarSeed, en una línea. */
    para: string;
}

export const PERMISOS_NAVEGADOR: readonly DefinicionPermisoNavegador[] = [
    { id: "microphone", etiqueta: "Micrófono", para: "Hablar con Aurora y usar el dictado. Solo se activa cuando tú lo pides." },
    { id: "camera", etiqueta: "Cámara", para: "Videollamadas, realidad aumentada y que Aurora vea lo que le enseñas." },
    { id: "notifications", etiqueta: "Notificaciones", para: "Avisos de mensajes, recordatorios y de tus otros dispositivos." },
    { id: "persistent-storage", etiqueta: "Almacenamiento protegido", para: "Evita que el navegador borre tus datos locales cuando le falta espacio." },
];

/** Normaliza lo que devuelva el navegador (o un fallo) a un estado conocido. */
export function estadoPermiso(v: unknown): EstadoPermiso {
    return v === "granted" || v === "denied" || v === "prompt" ? v : "no-disponible";
}

export function etiquetaEstadoPermiso(e: EstadoPermiso): string {
    switch (e) {
        case "granted":
            return "Permitido";
        case "denied":
            return "Bloqueado";
        case "prompt":
            return "Se preguntará";
        default:
            return "No disponible en este navegador";
    }
}

/** Qué queda SOLO en el dispositivo y qué se guarda en la cuenta. */
export const DATOS_EN_DISPOSITIVO: readonly string[] = [
    "Tus claves de IA y contraseñas: cifradas y nunca salen de este dispositivo.",
    "El permiso de las carpetas que vinculas (el navegador no deja compartirlo).",
    "El perfil activo de este dispositivo y lo que dejaste a medias.",
    "Cachés y copias de trabajo (se pueden borrar sin perder nada de la cuenta).",
];

export const DATOS_EN_CUENTA: readonly string[] = [
    "Tus dispositivos vinculados: nombre, capacidades y los permisos que les das.",
    "Tu Biblioteca, tus apps y dónde está instalada cada una.",
    "Ajustes sincronizables (apariencia, dock, Aurora), sin claves ni contraseñas.",
    "Tus perfiles y lo que publicas con ellos, según la visibilidad que elijas.",
];
