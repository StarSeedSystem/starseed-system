/**
 * Errores de las neuronas con formato de evento de Sentry · RLB1020J (Ola 1020S, 2026-10-20).
 *
 * QUÉ HACE DE VERDAD: traduce un error de un poco de trabajo de Genesis (neurona, cerebro,
 * perfil, cuenta, página, proceso o contenido) al FORMATO de evento del SDK de Sentry, quita
 * los datos personales (correo, teléfono, IP, claves y rutas de usuario), calcula una huella
 * y agrupa las repeticiones para la autocuración que ya existe en Genesis.
 *
 * HONESTIDAD: módulo PURO, sin red, sin disco y sin procesos: no envía nada a ningún sitio.
 * El servidor de Sentry no cabe autoalojado (16 GB + swap) y su FSL no es abierta; por eso
 * Genesis usa su formato de evento con su propia cadena, y si Alex decide algún día un
 * servidor compatible, estos eventos salen tal cual sin convertirlos de nuevo.
 */
export type AmbitoError =
    | "neurona"
    | "cerebro"
    | "perfil"
    | "cuenta"
    | "pagina"
    | "proceso"
    | "contenido";

export type NivelError = "error" | "warning" | "info" | "fatal";

export interface ContextoError {
    ambito: AmbitoError;
    neurona?: string;
    proceso?: string;
    nivel?: NivelError;
}

export interface MarcoPila {
    archivo: string;
    funcion: string;
    linea: number;
    columna: number;
    enApp: boolean;
}

export interface ValorExcepcion {
    type: string;
    value: string;
    stacktrace?: { frames: MarcoPila[] };
}

export interface EventoError {
    event_id: string;
    timestamp: number;
    level: NivelError;
    platform: string;
    exception: { values: ValorExcepcion[] };
    tags: { ambito: AmbitoError; neurona?: string; proceso?: string };
    fingerprint: string[];
}

export interface GrupoError {
    huella: string;
    veces: number;
    primero: number;
    ultimo: number;
    ejemplo: EventoError;
}
