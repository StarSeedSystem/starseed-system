import {
    preferenciasEfectivas,
    type CapasPrefs,
    type Contexto,
} from "@/lib/modelos/preferencias-capas";

/** Clase de licencia de los pesos de un motor de voz (misma escala que `Licencias`). */
export type ClaseLicenciaVoz = "libre" | "condicionada" | "personal";

/** Contexto de uso; «comercial» se evalúa como «publico» y sin uso personal. */
export type ContextoUsoVoz = Contexto | "comercial";

export interface MotorInfo {
    id: string;
    claseLicencia: ClaseLicenciaVoz;
    condicionCumplida?: boolean;
}

export interface Excluido {
    id: string;
    motivo: string;
}

export interface ResultadoPermisos {
    permitidos: MotorInfo[];
    excluidos: Excluido[];
}

const MOTIVO_PERSONAL = "pesos no comerciales: solo uso personal";
const MOTIVO_CONDICION = "condición de uso no cumplida";

/**
 * Filtra los motores que pueden sonar en cada contexto, heredando las capas de
 * conciencia con `preferenciasEfectivas`.
 *
 * Reglas:
 * - `libre` es el piso del sistema y siempre entra.
 * - `condicionada` entra solo si las capas la habilitan Y la condición se cumple.
 * - `personal` (pesos no comerciales) solo se habilita en contexto personal y
 *   cuando la capa `persona` lo pide; nunca es la opción por defecto.
 * - `comercial` se trata como `publico`: no hay uso personal.
 * - El orden de entrada se conserva y el resultado es determinista.
 */
export function motoresPermitidos(
    motores: MotorInfo[],
    contexto: ContextoUsoVoz,
    capas: CapasPrefs
): ResultadoPermisos {
    const contextoEfectivo: Contexto = contexto === "comercial" ? "publico" : contexto;
    const { licenciaPermitida } = preferenciasEfectivas(capas, contextoEfectivo);
    const permitidas = new Set<string>(licenciaPermitida);

    const permitidos: MotorInfo[] = [];
    const excluidos: Excluido[] = [];

    for (const motor of motores) {
        if (!permitidas.has(motor.claseLicencia)) {
            excluidos.push({ id: motor.id, motivo: motivoPorClase(motor.claseLicencia, contexto) });
            continue;
        }

        if (motor.claseLicencia === "condicionada" && motor.condicionCumplida !== true) {
            excluidos.push({ id: motor.id, motivo: MOTIVO_CONDICION });
            continue;
        }

        permitidos.push(motor);
    }

    return { permitidos, excluidos };
}

/** Motivo legible y estable para un motor excluido por su clase de licencia. */
function motivoPorClase(clase: ClaseLicenciaVoz, contexto: ContextoUsoVoz): string {
    if (clase === "personal") return MOTIVO_PERSONAL;
    return `licencia ${clase} no habilitada para el contexto ${contexto}`;
}
