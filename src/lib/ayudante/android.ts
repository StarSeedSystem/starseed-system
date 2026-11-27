/**
 * Ayudante · contrato de Android sin root (TRM1125I · architecture/terminal-entre-neuronas.md
 * y control-remoto-entre-neuronas.md §3, §12, §13).
 *
 * Sin root no hay nivel administrador: la app solo puede usar el marco de acceso a
 * almacenamiento (Storage Access Framework) y abrir pantallas de ajustes del sistema
 * mediante intent. Las órdenes tipadas que exigen administrador completo o ayudante
 * NO existen en Android. Puro, sin `node:*`, nunca lanza.
 */

import { COMANDOS_AYUDANTE, type ComandoAyudante, type Sistema } from "./ordenes";

export type ComandoAndroid =
    | "almacen-estado"
    | "almacen-salud"
    | "almacen-verificar"
    | "almacen-formatear"
    | "almacen-montar"
    | "almacen-desmontar"
    | "servicio-estado"
    | "servicio-reiniciar"
    | "actualizar"
    | "registros"
    | "reiniciar-app"
    | "modo-completo"
    | "ajuste-almacenamiento"
    | "ajuste-accesibilidad"
    | "ajuste-aplicaciones"
    | "ajuste-bateria"
    | "ajuste-red"
    | "ajuste-seguridad"
    | "ajuste-notificaciones";

export interface ComandoAndroidInfo {
    nombre: ComandoAndroid;
    existe: boolean;
    descripcion: string;
    /** Texto que verá la persona si la orden NO existe en Android. */
    textoNoDisponible?: string;
    /** Orden del ayudante relacionada (si aplica). */
    ordenAyudante?: string;
    /** Ajuste del sistema que abre (para comandos de tipo ajuste-*). */
    accionAjuste?: string;
}

export const COMANDOS_ANDROID: readonly ComandoAndroidInfo[] = [
    {
        nombre: "almacen-estado",
        existe: true,
        descripcion: "Estado de los almacenes accesibles mediante el marco de acceso (SAF)",
        ordenAyudante: "almacen-estado",
    },
    {
        nombre: "almacen-salud",
        existe: true,
        descripcion: "Salud de un disco/volumen autorizado por su serie (requiere permiso SAF previo)",
        ordenAyudante: "almacen-salud",
    },
    {
        nombre: "almacen-verificar",
        existe: true,
        descripcion: "Verifica la integridad de un disco/volumen autorizado (requiere permiso SAF previo)",
        ordenAyudante: "almacen-verificar",
    },
    {
        nombre: "almacen-formatear",
        existe: false,
        descripcion: "Formatear un disco",
        textoNoDisponible: "Formatear discos no está disponible en Android sin root. Use un ordenador con la app de escritorio.",
        ordenAyudante: "almacen-formatear",
    },
    {
        nombre: "almacen-montar",
        existe: false,
        descripcion: "Montar un disco en un punto de montaje",
        textoNoDisponible: "Montar discos no está disponible en Android sin root. El sistema gestiona los volúmenes automáticamente.",
        ordenAyudante: "almacen-montar",
    },
    {
        nombre: "almacen-desmontar",
        existe: false,
        descripcion: "Desmontar un disco",
        textoNoDisponible: "Desmontar discos no está disponible en Android sin root. El sistema gestiona los volúmenes automáticamente.",
        ordenAyudante: "almacen-desmontar",
    },
    {
        nombre: "servicio-estado",
        existe: false,
        descripcion: "Estado de un servicio StarSeed",
        textoNoDisponible: "Los servicios del sistema no se pueden consultar desde Android sin root.",
        ordenAyudante: "servicio-estado",
    },
    {
        nombre: "servicio-reiniciar",
        existe: false,
        descripcion: "Reiniciar un servicio StarSeed",
        textoNoDisponible: "Reiniciar servicios no está disponible en Android sin root.",
        ordenAyudante: "servicio-reiniciar",
    },
    {
        nombre: "actualizar",
        existe: false,
        descripcion: "Actualizar el sistema (canal stable/beta/nightly)",
        textoNoDisponible: "Las actualizaciones del sistema se gestionan desde la tienda de aplicaciones o el instalador del APK.",
        ordenAyudante: "actualizar",
    },
    {
        nombre: "registros",
        existe: false,
        descripcion: "Leer registros de un servicio",
        textoNoDisponible: "Leer registros del sistema no está disponible en Android sin root.",
        ordenAyudante: "registros",
    },
    {
        nombre: "reiniciar-app",
        existe: false,
        descripcion: "Reiniciar la app StarSeed",
        textoNoDisponible: "Reiniciar la app se hace cerrándola y volviéndola a abrir desde el lanzador.",
        ordenAyudante: "reiniciar-app",
    },
    {
        nombre: "modo-completo",
        existe: false,
        descripcion: "Activar modo administrador completo con caducidad",
        textoNoDisponible: "El modo administrador completo no existe en Android sin root. Solo está disponible en Linux, macOS y Windows.",
        ordenAyudante: "modo-completo",
    },
    {
        nombre: "ajuste-almacenamiento",
        existe: true,
        descripcion: "Abre los ajustes de almacenamiento del sistema",
        accionAjuste: "android.settings.INTERNAL_STORAGE_SETTINGS",
    },
    {
        nombre: "ajuste-accesibilidad",
        existe: true,
        descripcion: "Abre los ajustes de accesibilidad (para activar el servicio de control remoto)",
        accionAjuste: "android.settings.ACCESSIBILITY_SETTINGS",
    },
    {
        nombre: "ajuste-aplicaciones",
        existe: true,
        descripcion: "Abre los ajustes de aplicaciones (para permisos de esta app)",
        accionAjuste: "android.settings.APPLICATION_DETAILS_SETTINGS",
    },
    {
        nombre: "ajuste-bateria",
        existe: true,
        descripcion: "Abre los ajustes de optimización de batería (para permitir funcionamiento en segundo plano)",
        accionAjuste: "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS",
    },
    {
        nombre: "ajuste-red",
        existe: true,
        descripcion: "Abre los ajustes de red e internet",
        accionAjuste: "android.settings.WIRELESS_SETTINGS",
    },
    {
        nombre: "ajuste-seguridad",
        existe: true,
        descripcion: "Abre los ajustes de seguridad y privacidad",
        accionAjuste: "android.settings.SECURITY_SETTINGS",
    },
    {
        nombre: "ajuste-notificaciones",
        existe: true,
        descripcion: "Abre los ajustes de notificaciones de esta app",
        accionAjuste: "android.settings.APP_NOTIFICATION_SETTINGS",
    },
];

export function comandoAndroid(nombre: ComandoAndroid): ComandoAndroidInfo | null {
    return COMANDOS_ANDROID.find((c) => c.nombre === nombre) ?? null;
}

export function comandosAndroidDisponibles(): readonly ComandoAndroidInfo[] {
    return COMANDOS_ANDROID.filter((c) => c.existe);
}

export function comandosAndroidNoDisponibles(): readonly ComandoAndroidInfo[] {
    return COMANDOS_ANDROID.filter((c) => !c.existe);
}

export function esComandoAndroid(nombre: string): nombre is ComandoAndroid {
    return COMANDOS_ANDROID.some((c) => c.nombre === nombre);
}

/**
 * Filtra los comandos del ayudante que SÍ existen en Android (marco de acceso SAF).
 * Los comandos que requieren administrador completo o ayudante NO están en Android.
 */
export function comandosAyudanteParaAndroid(): readonly ComandoAyudante[] {
    return COMANDOS_AYUDANTE.filter((c) => c.sistemas.includes("android" as Sistema));
}

/**
 * Devuelve el texto que verá la persona para una orden del ayudante en Android.
 * Si la orden existe, devuelve null. Si no existe, devuelve el texto explicativo.
 */
export function textoOrdenAyudanteEnAndroid(nombre: string): string | null {
    const cmdAndroid = comandoAndroid(nombre as ComandoAndroid);
    if (!cmdAndroid) return null;
    if (cmdAndroid.existe) return null;
    return cmdAndroid.textoNoDisponible ?? "Esta orden no está disponible en Android sin root.";
}

/**
 * Verifica si una orden del ayudante está disponible en Android.
 */
export function ordenAyudanteDisponibleEnAndroid(nombre: string): boolean {
    const cmd = COMANDOS_AYUDANTE.find((c) => c.nombre === nombre);
    if (!cmd) return false;
    return cmd.sistemas.includes("android" as Sistema);
}

/**
 * Mapea un comando de ajuste de Android a la acción de Intent correspondiente.
 * Devuelve null si no es un comando de ajuste o no existe.
 */
export function accionAjusteAndroid(nombre: ComandoAndroid): string | null {
    const cmd = comandoAndroid(nombre);
    if (!cmd || !cmd.existe || !cmd.accionAjuste) return null;
    return cmd.accionAjuste;
}

export const SISTEMA_ANDROID: Sistema = "android";

export const NIVELES_TERMINAL_ANDROID: readonly ("usuario" | "administrador")[] = ["usuario"];

export function nivelTerminalAndroid(nivel: string): "usuario" | null {
    return nivel === "usuario" ? "usuario" : null;
}

export const MODO_ADMIN_ANDROID: readonly ("tipado" | "completo")[] = ["tipado"];