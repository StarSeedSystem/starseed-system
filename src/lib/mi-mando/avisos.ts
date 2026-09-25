/**
 * Mi Puente de Mando — avisos de Inicio y formatos (PURO).
 * ─────────────────────────────────────────────────────────────────────────────
 * La página de Inicio muestra solo avisos que piden una acción concreta y que
 * salen de datos reales (nunca de ejemplo). Se construyen aquí a partir de un
 * pequeño estado de entrada para poder probar qué aparece y en qué orden.
 */

import type { IdPagina } from "./paginas";

export type TonoAviso = "atencion" | "info";

export type AccionAviso =
    | { tipo: "enlace"; href: string; etiqueta: string }
    | { tipo: "pagina"; pagina: IdPagina; etiqueta: string };

export interface Aviso {
    id: string;
    tono: TonoAviso;
    texto: string;
    accion?: AccionAviso;
}

export interface EntradaAvisos {
    /** ¿Hay sesión iniciada? null = aún no se sabe (no se avisa). */
    sesion: boolean | null;
    /** Instalaciones pedidas desde otra neurona que esperan el «sí» de ESTE dispositivo. */
    instalacionesPendientes: number;
    /** Carpetas del dispositivo listadas pero sin permiso vivo en esta sesión. */
    carpetasSinAcceso: number;
    /** Uso del almacenamiento del navegador (0-1), o null si no se pudo medir. */
    usoAlmacenamiento: number | null;
    /** Estado del motor de sincronización en tiempo real. */
    estadoSync?: string | null;
}

/** Umbral a partir del cual el almacenamiento se considera casi lleno. */
export const UMBRAL_ALMACENAMIENTO = 0.8;

export function construirAvisos(e: EntradaAvisos): Aviso[] {
    const avisos: Aviso[] = [];
    if (e.sesion === false) {
        avisos.push({
            id: "sin-sesion",
            tono: "atencion",
            texto: "No has iniciado sesión: solo ves este dispositivo y nada se guarda en tu cuenta.",
            accion: { tipo: "enlace", href: "/login", etiqueta: "Iniciar sesión" },
        });
    }
    if (e.instalacionesPendientes > 0) {
        const n = e.instalacionesPendientes;
        avisos.push({
            id: "instalaciones-pendientes",
            tono: "atencion",
            texto: `${n} ${n === 1 ? "app espera" : "apps esperan"} tu permiso para instalarse en este dispositivo.`,
            accion: { tipo: "enlace", href: "/library", etiqueta: "Revisar en la Biblioteca" },
        });
    }
    if (e.carpetasSinAcceso > 0) {
        const n = e.carpetasSinAcceso;
        avisos.push({
            id: "carpetas-sin-acceso",
            tono: "info",
            texto: `${n} ${n === 1 ? "carpeta vinculada necesita" : "carpetas vinculadas necesitan"} que vuelvas a dar permiso (el navegador lo olvida al cerrarse).`,
            accion: { tipo: "pagina", pagina: "archivos", etiqueta: "Ver carpetas" },
        });
    }
    if (e.usoAlmacenamiento !== null && e.usoAlmacenamiento >= UMBRAL_ALMACENAMIENTO) {
        avisos.push({
            id: "almacenamiento-lleno",
            tono: "atencion",
            texto: `El espacio de StarSeed en este dispositivo está al ${Math.round(e.usoAlmacenamiento * 100)} %.`,
            accion: { tipo: "pagina", pagina: "privacidad", etiqueta: "Ver almacenamiento" },
        });
    }
    if (e.sesion === true && e.estadoSync === "error") {
        avisos.push({
            id: "sync-error",
            tono: "atencion",
            texto: "La sincronización en tiempo real tuvo un problema. Prueba a sincronizar ahora.",
            accion: { tipo: "pagina", pagina: "archivos", etiqueta: "Ir a sincronización" },
        });
    }
    return avisos;
}

/** 1536 → «1,5 KB». Unidades decimales (como las muestran los sistemas). */
export function bytesLegibles(bytes: number | null | undefined): string {
    if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "—";
    const unidades = ["B", "KB", "MB", "GB", "TB"];
    let v = bytes;
    let i = 0;
    while (v >= 1000 && i < unidades.length - 1) {
        v /= 1000;
        i++;
    }
    const redondeado = i === 0 ? Math.round(v).toString() : v.toFixed(v < 10 ? 1 : 0);
    return `${redondeado.replace(".", ",")} ${unidades[i]}`;
}

/** Fracción de uso (0-1) o null si no hay cuota conocida. */
export function fraccionUso(usado: number | undefined, cuota: number | undefined): number | null {
    if (typeof usado !== "number" || typeof cuota !== "number" || cuota <= 0) return null;
    return Math.min(1, Math.max(0, usado / cuota));
}

/** «hace 3 min» a partir de epoch ms (null = «nunca desde este panel»). */
export function haceCuantoMs(ms: number | null, ahora = Date.now()): string {
    if (ms === null || !Number.isFinite(ms)) return "todavía no";
    const d = ahora - ms;
    if (d < 45_000) return "ahora mismo";
    const min = Math.floor(d / 60_000);
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const dias = Math.floor(h / 24);
    return `hace ${dias} día${dias === 1 ? "" : "s"}`;
}

/** Estado del motor de sincronización en tiempo real, en palabras. */
export function etiquetaTiempoReal(estado: string | null | undefined): string {
    switch (estado) {
        case "connected":
            return "activa";
        case "connecting":
            return "conectando…";
        case "error":
            return "con problemas";
        case "disabled":
            return "apagada en este dispositivo";
        case "no-session":
            return "sin sesión";
        case "idle":
            return "en espera";
        default:
            return "sin datos";
    }
}
