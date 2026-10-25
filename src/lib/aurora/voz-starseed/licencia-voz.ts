import {
    preferenciasEfectivas,
    type CapasPrefs,
    type Contexto,
    type Licencias,
} from "@/lib/modelos/preferencias-capas";

/** Contextos de uso de la voz. «comercial» no existe en las capas: se trata como «publico». */
export type ContextoVoz = "personal" | "grupo" | "comunidad" | "publico" | "comercial";

export interface MotorInfo {
    id: string;
    claseLicencia: "libre" | "condicionada" | "personal";
    /** Solo se mira en las condicionadas: sin `true` explícito, no entran. */
    condicionCumplida?: boolean;
}

export interface ExclusionVoz {
    id: string;
    motivo: string;
}

export interface ResultadoPermisos {
    permitidos: MotorInfo[];
    excluidos: ExclusionVoz[];
}

/** «comercial» se evalúa como «publico», donde el uso personal nunca entra. */
const CONTEXTO_EN_CAPAS: Record<ContextoVoz, Contexto> = {
    personal: "personal",
    grupo: "grupo",
    comunidad: "comunidad",
    publico: "publico",
    comercial: "publico",
};

const ETIQUETA_CONTEXTO: Record<ContextoVoz, string> = {
    personal: "personal",
    grupo: "de grupo",
    comunidad: "de comunidad",
    publico: "público",
    comercial: "comercial",
};

/**
 * Motivo legible de una exclusión, o `null` si el motor puede sonar.
 * No incluye datos del entorno: solo la clase de licencia y el contexto.
 */
function motivoExclusion(
    motor: MotorInfo,
    contexto: ContextoVoz,
    licenciaPermitida: Licencias[]
): string | null {
    const clase = motor.claseLicencia;

    if (clase === "personal") {
        if (contexto !== "personal") {
            return "pesos no comerciales: solo uso personal";
        }
        if (!licenciaPermitida.includes("personal")) {
            return "la capa de la neurona no admite pesos de uso personal";
        }
    }

    if (!licenciaPermitida.includes(clase)) {
        if (clase === "condicionada") {
            return `licencia condicionada sin autorización en el contexto ${ETIQUETA_CONTEXTO[contexto]}`;
        }
        return `licencia ${clase} no admitida en el contexto ${ETIQUETA_CONTEXTO[contexto]}`;
    }

    if (clase === "condicionada" && motor.condicionCumplida !== true) {
        return "condición de uso no cumplida";
    }

    return null;
}

/**
 * Filtra qué motores de voz pueden sonar en un contexto, heredando las capas
 * de conciencia de `preferenciasEfectivas` (sistema › comunidad › grupo ›
 * persona › neurona). Es puro y determinista: conserva el orden de entrada y,
 * ante entradas iguales, devuelve siempre el mismo resultado.
 *
 * Reglas:
 * - «comercial» se trata como «publico» sin uso personal.
 * - Fuera de lo personal solo entran motores libres o condicionados.
 * - Una condicionada necesita además `condicionCumplida === true`.
 * - Un motor personal solo suena en contexto personal y con la capa persona.
 */
export function motoresPermitidos(
    motores: MotorInfo[],
    contexto: ContextoVoz,
    capas: CapasPrefs
): ResultadoPermisos {
    const { licenciaPermitida } = preferenciasEfectivas(capas, CONTEXTO_EN_CAPAS[contexto]);

    const permitidos: MotorInfo[] = [];
    const excluidos: ExclusionVoz[] = [];

    for (const motor of motores) {
        const motivo = motivoExclusion(motor, contexto, licenciaPermitida);
        if (motivo === null) {
            permitidos.push(motor);
        } else {
            excluidos.push({ id: motor.id, motivo });
        }
    }

    return { permitidos, excluidos };
}
