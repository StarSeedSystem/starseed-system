/**
 * Ajustes de Mensajería (2026-09-28) — contrato. Dos niveles:
 *  1. Ajustes de TODA la sección (mensajes y correos): `AjustesMensajeria` sin `hilos`.
 *  2. Ajustes de CADA hilo (chat, grupo o correo): `AjustesHilo`, que solo guarda lo que se
 *     cambia; lo demás hereda del nivel 1. `ajustesEfectivos()` (en `ajustes.ts`) los combina.
 *
 * Persisten en `entity_state` de la cuenta (`{kind:"user", id:<uid>}`, clave `CLAVE_MENSAJERIA`),
 * local primero con caché en localStorage; se sincronizan entre las neuronas de la cuenta.
 * Son ajustes PERSONALES: vaciar, silenciar, archivar o restringir un chat solo cambia lo que
 * ve quien lo decide — nunca borra nada del otro ni le castiga (Justicia restaurativa, §6).
 */

export const CLAVE_MENSAJERIA = "mensajeria";
export const LS_MENSAJERIA = "starseed.mensajeria.ajustes.v1";

export type TamanoLetra = "s" | "m" | "l" | "xl";
export type Densidad = "compacta" | "comoda";

export type FondoChat =
    | { tipo: "ninguno" }
    /** id de `FONDOS_PRESET`. */
    | { tipo: "preset"; id: string }
    | { tipo: "color"; color: string }
    | { tipo: "imagen"; url: string };

export interface AjustesApariencia {
    fondo: FondoChat;
    tamanoLetra: TamanoLetra;
    /** Color (hex) de MIS burbujas. */
    colorBurbuja: string;
    densidad: Densidad;
    mostrarHora: boolean;
    formato24h: boolean;
}

/** `silencioHasta`: null = suena · ISO = silenciado hasta esa fecha · "siempre". */
export interface AjustesNotificaciones {
    activas: boolean;
    sonido: boolean;
    vistaPrevia: boolean;
    silencioHasta: string | null;
}

export type CargaMultimedia = "siempre" | "wifi" | "nunca";

/** Lo que se puede personalizar por hilo; todo opcional (ausente = hereda). */
export interface AjustesHilo {
    /** Nombre con el que yo veo este chat (no cambia el del otro). */
    apodo?: string;
    apariencia?: Partial<AjustesApariencia>;
    notificaciones?: Partial<AjustesNotificaciones>;
    fijado?: boolean;
    archivado?: boolean;
    /** Personal: sus mensajes no avisan y el chat va a «Restringidos». No bloquea ni avisa al otro. */
    restringido?: boolean;
    confirmacionesLectura?: boolean;
    vistaPreviaEnlaces?: boolean;
    cargarMultimedia?: CargaMultimedia;
    /** Oculta PARA MÍ los mensajes anteriores a esta fecha (ISO). Nada se borra. */
    vaciadoEn?: string | null;
    /** Etiquetas propias (útil en correos). */
    etiquetas?: string[];
    actualizado?: string;
}

export interface AjustesMensajeria {
    v: 1;
    chats: {
        apariencia: AjustesApariencia;
        enviarConEnter: boolean;
        vistaPreviaEnlaces: boolean;
        cargarMultimedia: CargaMultimedia;
        calidadSubida: "optimizada" | "original";
        ordenLista: "reciente" | "no-leidos" | "nombre";
        /** Ver arriba los fijados. */
        fijadosArriba: boolean;
    };
    privacidad: {
        /** "nadie" = no publico mi «en línea» ni mi última vez (y tampoco veo la de los demás). */
        mostrarEnLinea: "todos" | "nadie";
        confirmacionesLectura: boolean;
        mostrarEscribiendo: boolean;
        /** "contactos" = lo de desconocidos llega a «Solicitudes», sin aviso. */
        escribirme: "todos" | "contactos";
    };
    notificaciones: {
        mensajes: AjustesNotificaciones;
        grupos: AjustesNotificaciones;
        correos: AjustesNotificaciones;
        horasSilencio: { activo: boolean; desde: string; hasta: string };
    };
    correos: {
        firma: string;
        vista: "conversacion" | "lista";
        cargarImagenesRemotas: boolean;
        confirmarEnvio: boolean;
    };
    aurora: {
        activaPorDefecto: boolean;
        responderMenciones: boolean;
    };
    /** Ajustes por hilo, por id de hilo. */
    hilos: Record<string, AjustesHilo>;
    actualizado: string;
}

export const FONDOS_PRESET: { id: string; nombre: string; css: string }[] = [
    { id: "nebulosa", nombre: "Nebulosa", css: "radial-gradient(120% 90% at 10% 0%, #2a1650 0%, transparent 55%), radial-gradient(90% 80% at 100% 100%, #0b2a4a 0%, transparent 60%), #0a0a14" },
    { id: "aurora", nombre: "Aurora", css: "linear-gradient(160deg, #041b1a 0%, #062a2a 35%, #0b1030 70%, #09070f 100%)" },
    { id: "solar", nombre: "Solar", css: "radial-gradient(100% 70% at 80% 0%, #3a2204 0%, transparent 60%), radial-gradient(80% 60% at 0% 100%, #2a0a18 0%, transparent 60%), #0c0906" },
    { id: "bosque", nombre: "Bosque", css: "linear-gradient(180deg, #06140c 0%, #0a1f14 50%, #050a08 100%)" },
    { id: "cristal", nombre: "Cristal", css: "linear-gradient(135deg, #0f1226 0%, #151a33 50%, #0b0d1a 100%)" },
    { id: "noche", nombre: "Noche pura", css: "#07070b" },
];

export const COLORES_BURBUJA = ["#7C5CFF", "#007FFF", "#10B981", "#FFBF00", "#DC143C", "#EC4899", "#14B8A6", "#64748B"];

const NOTIF_DEFECTO: AjustesNotificaciones = { activas: true, sonido: true, vistaPrevia: true, silencioHasta: null };

export const AJUSTES_DEFECTO: AjustesMensajeria = {
    v: 1,
    chats: {
        apariencia: {
            fondo: { tipo: "preset", id: "nebulosa" },
            tamanoLetra: "m",
            colorBurbuja: "#7C5CFF",
            densidad: "comoda",
            mostrarHora: true,
            formato24h: true,
        },
        enviarConEnter: true,
        vistaPreviaEnlaces: true,
        cargarMultimedia: "siempre",
        calidadSubida: "optimizada",
        ordenLista: "reciente",
        fijadosArriba: true,
    },
    privacidad: {
        mostrarEnLinea: "todos",
        confirmacionesLectura: true,
        mostrarEscribiendo: true,
        escribirme: "todos",
    },
    notificaciones: {
        mensajes: { ...NOTIF_DEFECTO },
        grupos: { ...NOTIF_DEFECTO },
        correos: { ...NOTIF_DEFECTO, sonido: false },
        horasSilencio: { activo: false, desde: "23:00", hasta: "07:00" },
    },
    correos: {
        firma: "",
        vista: "conversacion",
        cargarImagenesRemotas: false,
        confirmarEnvio: false,
    },
    aurora: { activaPorDefecto: false, responderMenciones: true },
    hilos: {},
    actualizado: "1970-01-01T00:00:00.000Z",
};

export type TipoHilo = "dm" | "grupo" | "correo";

/** Resultado de combinar sección + hilo (lo que la UI usa para pintar y decidir). */
export interface AjustesEfectivos {
    apariencia: AjustesApariencia;
    notificaciones: AjustesNotificaciones;
    silenciado: boolean;
    confirmacionesLectura: boolean;
    vistaPreviaEnlaces: boolean;
    cargarMultimedia: CargaMultimedia;
    enviarConEnter: boolean;
    fijado: boolean;
    archivado: boolean;
    restringido: boolean;
    vaciadoEn: string | null;
    apodo: string | null;
}

/** API del almacén (`useAjustesMensajeria()` en `ajustes-store.ts`). */
export interface AjustesMensajeriaApi {
    listo: boolean;
    ajustes: AjustesMensajeria;
    /** Cambia un bloque de la sección (fusión superficial por bloque). */
    cambiar<K extends Exclude<keyof AjustesMensajeria, "v" | "hilos" | "actualizado">>(bloque: K, cambios: Partial<AjustesMensajeria[K]>): void;
    /** Ajustes de un hilo concreto (fusión profunda de apariencia/notificaciones). */
    cambiarHilo(hiloId: string, cambios: AjustesHilo): void;
    /** Vuelve un hilo a heredar todo. */
    restablecerHilo(hiloId: string): void;
    efectivos(hiloId: string | null, tipo: TipoHilo): AjustesEfectivos;
    restablecerTodo(): void;
}
