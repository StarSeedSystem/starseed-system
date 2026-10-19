import { createHmac, timingSafeEqual } from "node:crypto";
import { firmarCuerpo, verificarFirma } from "../../mando/gancho";

/**
 * Ganchos firmados por ámbito para Genesis abierto.
 * Proporciona verificación de entrada y firma de salida con HMAC-SHA256,
 * utilizando un secreto almacenado en la bóveda del ámbito.
 * Incluye ventana anti-repetición de 5 minutos basada en marca de tiempo.
 */

/** Cabecera donde se envía la firma (sha256=...). */
export const CABECERA_FIRMA = "x-starseed-firma";
/** Cabecera donde se envía la marca de tiempo (epoch ms). */
export const CABECERA_TIMESTAMP = "x-starseed-timestamp";
/** Prefijo de la firma HMAC-SHA256. */
export const PREFIJO_FIRMA = "sha256=";
/** Validez de la ventana anti-repetición en milisegundos (5 minutos). */
export const VALIDAD_ANTI_REPETICION_MS = 5 * 60 * 1000; // 5 minutos

// Re-exportar funciones de gancho.ts para uso en tests
export { firmarCuerpo, verificarFirma };

/**
 * Resultado de la verificación de entrada de un gancho.
 */
export interface EntradaVerificada {
    /** Cuerpo del request, ya verificado. */
    cuerpo: string | Uint8Array;
    /** Marca de tiempo del request (epoch ms). */
    timestamp: number;
}

/**
 * Errores posibles al verificar la entrada.
 */
export enum ErrorEntrada {
    FALTA_TIMESTAMP = "FALTA_TIMESTAMP",
    TIMESTAMP_INVALIDO = "TIMESTAMP_INVALIDO",
    TIMESTAMP_FUERA_VENTANA = "TIMESTAMP_FUERA_VENTANA",
    TIMESTAMP_REPETIDO = "TIMESTAMP_REPETIDO",
    FALTA_FIRMA = "FALTA_FIRMA",
    FIRMA_INVALIDA = "FIRMA_INVALIDA",
    SECRETO_NO_CONFIGURADO = "SECRETO_NO_CONFIGURADO",
}

/**
 * Obtiene el secreto HMAC para un ámbito dado.
 * Debe ser implementado por el llamador (ej. leyendo de la bóveda de Supabase).
 */
export type ObtenerSecreto = (ambitoId: string) => Promise<string | null>;

/**
 * Obtiene la marca de tiempo actual en milisegundos.
 * Debe ser implementado por el llamador (ej. usando Date.now()).
 */
export type ObtenerAhora = () => number;

/**
 * Almacén para la ventana anti-repetición.
 * Permite marcar una marca de tiempo como usada y verificar si ya fue usada recientemente.
 */
export interface AlmacenAntiRepeticion {
    /**
     * Marca una marca de tiempo como usada para un ámbito.
     * @param ambitoId Identificador del ámbito
     * @param timestamp Marca de tiempo en epoch ms
     */
    marcarUsado: (ambitoId: string, timestamp: number) => void;
    /**
     * Verifica si una marca de tiempo ya fue usada recientemente para un ámbito.
     * @returns true si ya fue usada, false en caso contrario
     */
    yaUsado: (ambitoId: string, timestamp: number) => boolean;
}

/**
 * Verifica la entrada de un webhook firmado por ámbito.
 * @param ambitoId Identificador del ámbito
 * @param cuerpo Cuerpo del request (string o Uint8Array)
 * @param cabeceraTimestamp Valor de la cabecera X-StarSeed-Timestamp
 * @param cabeceraFirma Valor de la cabecera X-StarSeed-Firma
 * @param obtenerSecreto Función para obtener el secreto del ámbito
 * @param obtenerAhora Función para obtener la marca de tiempo actual
 * @param almacenAntiRepeticion Almacén para controlar repeticiones
 * @returns El cuerpo y la marca de tiempo si es válido, o un error
 */
export async function verificarEntradaGancho(
    ambitoId: string,
    cuerpo: string | Uint8Array,
    cabeceraTimestamp: string | null,
    cabeceraFirma: string | null,
    obtenerSecreto: ObtenerSecreto,
    obtenerAhora: ObtenerAhora,
    almacenAntiRepeticion: AlmacenAntiRepeticion
): Promise<{ ok: true; entrada: EntradaVerificada } | { ok: false; error: ErrorEntrada }> {
    // 1. Validar cabeceraTimestamp
    if (cabeceraTimestamp === null) {
        return { ok: false, error: ErrorEntrada.FALTA_TIMESTAMP };
    }
    const timestampNum = Number(cabeceraTimestamp);
    if (Number.isNaN(timestampNum) || !Number.isFinite(timestampNum)) {
        return { ok: false, error: ErrorEntrada.TIMESTAMP_INVALIDO };
    }
    const timestamp = timestampNum;

    // 2. Validar ventana de tiempo
    const ahora = obtenerAhora();
    if (timestamp < ahora - VALIDAD_ANTI_REPETICION_MS || timestamp > ahora + VALIDAD_ANTI_REPETICION_MS) {
        return { ok: false, error: ErrorEntrada.TIMESTAMP_FUERA_VENTANA };
    }

    // 3. Validar anti-repetición
    if (almacenAntiRepeticion.yaUsado(ambitoId, timestamp)) {
        return { ok: false, error: ErrorEntrada.TIMESTAMP_REPETIDO };
    }

    // 4. Validar cabeceraFirma
    if (cabeceraFirma === null) {
        return { ok: false, error: ErrorEntrada.FALTA_FIRMA };
    }
    if (!cabeceraFirma.startsWith(PREFIJO_FIRMA)) {
        return { ok: false, error: ErrorEntrada.FIRMA_INVALIDA };
    }
    const firmaHex = cabeceraFirma.slice(PREFIJO_FIRMA.length).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(firmaHex)) {
        return { ok: false, error: ErrorEntrada.FIRMA_INVALIDA };
    }

    // 5. Obtener secreto del ámbito
    const secreto = await obtenerSecreto(ambitoId);
    if (secreto === null) {
        return { ok: false, error: ErrorEntrada.SECRETO_NO_CONFIGURADO };
    }

    // 6. Verificar firma
    const firmaValida = verificarFirma(cuerpo, cabeceraFirma, secreto);
    if (!firmaValida) {
        return { ok: false, error: ErrorEntrada.FIRMA_INVALIDA };
    }

    // 7. Marcar timestamp como usado
    almacenAntiRepeticion.marcarUsado(ambitoId, timestamp);

    // 8. Éxito
    return { ok: true, entrada: { cuerpo, timestamp } };
}

/**
 * Firma un cuerpo de respuesta para ser enviado en un gancho de ámbito.
 * @param ambitoId Identificador del ámbito
 * @param cuerpo Cuerpo a firmar (string o Uint8Array)
 * @param obtenerSecreto Función para obtener el secreto del ámbito
 * @param obtenerAhora Función para obtener la marca de tiempo actual
 * @returns Cabeceras a incluir en la respuesta (incluyendo firma y timestamp)
 */
export async function firmarSalidaGancho(
    ambitoId: string,
    cuerpo: string | Uint8Array,
    obtenerSecreto: ObtenerSecreto,
    obtenerAhora: ObtenerAhora
): Promise<{ [clave: string]: string }> {
    const secreto = await obtenerSecreto(ambitoId);
    if (secreto === null) {
        throw new Error(`Secreto no configurado para el ámbito: ${ambitoId}`);
    }
    const timestamp = obtenerAhora();
    const firma = firmarCuerpo(cuerpo, secreto);
    const cabeceraFirma = PREFIJO_FIRMA + firma;
    return {
        [CABECERA_FIRMA]: cabeceraFirma,
        [CABECERA_TIMESTAMP]: timestamp.toString()
    };
}