/**
 * transferencias/aceptación — Lógica pura para aceptar o rechazar envíos entrantes.
 * ════════════════════════════════════════════════════════════════════════════════════
 * Reglas:
 * - Cada envío entrante pide aceptación con nombre, tamaño, tipo real, neurona de origen y medio.
 * - Ajuste por neurona reconocida: "aceptar sin preguntar" está apagado por defecto;
 *   la persona puede encender neurona a neurona.
 * - Nunca se acepta solo de neuronas desconocidas.
 * - Lo recibido queda en cuarentena hasta aceptar y analizar si así se eligió.
 * Español neutro, puro (sin red, sin disco, sin procesos lanzados).
 */

export interface DetalleEnvio {
    id: string;
    nombre: string;
    tamano: number;
    tipo: string;
    neuronaOrigen: string;
    medio: string;
    esNeuronaConocida: boolean;
}

/**
 * Estados posibles de un envío después de la decisión de la persona.
 */
export type EstadoEnvio = "aceptado" | "rechazado" | "enCuarentena";

/**
 * Solicitud de aceptación para un envío entrante.
 * Incluye todos los datos necesarios para que la persona decida.
 */
export function crearSolicitudAceptacion(detalle: DetalleEnvio): {
    id: string;
    nombre: string;
    tamano: string;
    tipo: string;
    neuronaOrigen: string;
    medio: string;
    esNeuronaConocida: boolean;
    textoAviso: string;
} {
    const formatoTamano = `${Math.round(detalle.tamano / 1024)} KB`;
    const tipoLimpio = detalle.tipo.toLowerCase().replace(/^[^a-z]+/, "");

    const textoAviso = `Recibiste un archivo desde "${detalle.neuronaOrigen}":\n` +
        `• Nombre: ${detalle.nombre}\n` +
        `• Tamaño: ${formatoTamano}\n` +
        `• Tipo: ${tipoLimpio}\n` +
        `• Medio: ${detalle.medio}\n` +
        `• ¿Conoces esta neurona? ${detalle.esNeuronaConocida ? "Sí" : "No"}\n\n` +
        "Pulsa 'Aceptar' para recibir o 'Rechazar' para cancelar.";

    return {
        id: detalle.id,
        nombre: detalle.nombre,
        tamano: formatoTamano,
        tipo: tipoLimpio,
        neuronaOrigen: detalle.neuronaOrigen,
        medio: detalle.medio,
        esNeuronaConocida: detalle.esNeuronaConocida,
        textoAviso,
    };
}

/**
 * Evalúa si un envío debe aceptarse automáticamente.
 * Por defecto, solo se acepta automáticamente si la neurona está marcada como conocida.
 * La persona puede configurar excepciones neurona a neurona.
 *
 * @param esNeuronaConocida - Si la neurona de origen está en la lista de conocidas
 * @param permitirAutoAceptar - Configuración global (por defecto false)
 * @returns true si se puede aceptar automáticamente, false si requiere confirmación
 */
export function debeAutoAceptar(
    esNeuronaConocida: boolean,
    permitirAutoAceptar: boolean = false,
): boolean {
    // Si la persona ha activado la opción global, y la neurona es conocida, autoaceptar
    if (permitirAutoAceptar && esNeuronaConocida) {
        return true;
    }
    // Si la neurona NO es conocida, NUNCA autoaceptar (regla de seguridad)
    if (!esNeuronaConocida) {
        return false;
    }
    // Neurona conocida pero autoaceptar desactivado: requiere confirmación
    return false;
}

/**
 * Procesa la decisión de la persona sobre un envío entrante.
 * Devuelve el nuevo estado y un motivo explicativo.
 *
 * @param esNeuronaConocida - Si la neurona de origen está en la lista de conocidas
 * @param autoAceptar - Si se debe autoaceptar (respecta la configuración del usuario)
 * @returns Estado resultante y motivo
 */
export function procesarDecision(
    esNeuronaConocida: boolean,
    autoAceptar: boolean = false,
): { estado: EstadoEnvio; motivo: string } {
    // Si la neurona no es conocida, nunca autoaceptar
    if (!esNeuronaConocida) {
        return { estado: "enCuarentena", motivo: "Neurona desconocida: requiere confirmación manual" };
    }

    // Si la neurona es conocida y se permite autoaceptar
    if (esNeuronaConocida && autoAceptar) {
        return { estado: "aceptado", motivo: "Neurona reconocida y autoaceptar activado" };
    }

    // Neurona conocida pero autoaceptar desactivado: requiere confirmación manual
    return { estado: "enCuarentena", motivo: "Requiere confirmación manual (neurona conocida)" };
}

/**
 * Configura una neurona como conocida (la persona la marca como segura).
 * En un módulo puro, esto retorna un nuevo mapa con la neurona añadida.
 *
 * @ neuronasConocidas - Set actual de IDs de neuronas conocidas
 * @ neuronaId - ID de la neurona a marcar como conocida
 * @returns Nuevo set con la neurona añadida
 */
export function marcarNeuronaConocida(
    neuronasConocidas: Set<string>,
    neuronaId: string,
): Set<string> {
    const nuevas = new Set(neuronasConocidas);
    nuevas.add(neuronaId);
    return nuevas;
}

/**
 * Verifica si una neurona está en la lista de conocidas.
 *
 * @ neuronasConocidas - Set de IDs de neuronas conocidas
 * @ neuronaId - ID de la neurona a verificar
 * @returns true si la neurona está en la lista
 */
export function esNeuronaConocida(
    neuronasConocidas: Set<string>,
    neuronaId: string,
): boolean {
    return neuronasConocidas.has(neuronaId);
}

export type { DetalleEnvio, EstadoEnvio };