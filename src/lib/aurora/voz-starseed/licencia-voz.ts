/**
 * LICENCIA DE VOZ POR CONTEXTO (Ola 1018V · tarea C)
 * ─────────────────────────────────────────────────────────────────────────────
 * Decide qué motores pueden sonar en cada sitio reutilizando la herencia de
 * capas de `preferencias-capas.ts` (sistema › comunidad › grupo › persona ›
 * neurona). Puro y determinista: misma entrada, mismo resultado; sin red, sin
 * disco, sin reloj y sin tocar los motores recibidos.
 *
 * Reglas del contrato `architecture/voz-voicestudio.md` §4:
 *  · `libre` suena en todos los contextos;
 *  · `condicionada` solo si las capas la habilitan y `condicionCumplida` es true;
 *  · `personal` (pesos no comerciales) solo en lo personal y si las capas lo
 *    habilitan; nunca por defecto ni en grupo, comunidad, público o comercial;
 *  · `comercial` se trata como `publico`, sin uso personal.
 */
import {
    preferenciasEfectivas,
    type CapasPrefs,
    type Contexto,
    type Licencias,
} from "@/lib/modelos/preferencias-capas";

/** Contextos de uso que deciden la licencia de un motor de voz. */
export type ContextoLicenciaVoz = "personal" | "grupo" | "comunidad" | "publico" | "comercial";

/** Clases de licencia de un motor; `desconocida` no entra nunca. */
export type ClaseLicenciaVoz = Exclude<Licencias, "desconocida">;

export interface MotorInfo {
    id: string;
    claseLicencia: ClaseLicenciaVoz;
    condicionCumplida?: boolean;
}

export interface MotorExcluido {
    id: string;
    motivo: string;
}

export interface ResultadoPermisos {
    permitidos: MotorInfo[];
    excluidos: MotorExcluido[];
}

/** Motivo legible de la exclusión: dice qué licencia falla y por qué. */
function motivoExclusion(
    motor: MotorInfo,
    contexto: ContextoLicenciaVoz,
    permitidaPorCapas: boolean,
): string {
    if (!permitidaPorCapas) {
        if (motor.claseLicencia === "personal") {
            return contexto === "personal"
                ? "las capas de este contexto no habilitan pesos personales"
                : "pesos no comerciales: solo uso personal";
        }
        if (motor.claseLicencia === "condicionada") {
            return "su licencia condicionada no está habilitada en las capas de este contexto";
        }
        return `licencia ${motor.claseLicencia} no permitida en contexto ${contexto}`;
    }
    return "Condición de uso no cumplida";
}

/**
 * Filtra los motores que pueden sonar en un contexto con las capas dadas.
 * Los `permitidos` conservan el orden de entrada y son los mismos objetos.
 */
export function motoresPermitidos(
    motores: MotorInfo[],
    contexto: ContextoLicenciaVoz,
    capas: CapasPrefs,
): ResultadoPermisos {
    // «comercial» comparte el filtro de «publico»: nunca habilita uso personal.
    const contextoCapas: Contexto = contexto === "comercial" ? "publico" : contexto;
    const { licenciaPermitida } = preferenciasEfectivas(capas, contextoCapas);

    const permitidos: MotorInfo[] = [];
    const excluidos: MotorExcluido[] = [];

    for (const motor of motores) {
        const permitidaPorCapas = licenciaPermitida.includes(motor.claseLicencia);
        const condicionOk =
            motor.claseLicencia !== "condicionada" || motor.condicionCumplida === true;
        if (permitidaPorCapas && condicionOk) {
            permitidos.push(motor);
        } else {
            excluidos.push({ id: motor.id, motivo: motivoExclusion(motor, contexto, permitidaPorCapas) });
        }
    }

    return { permitidos, excluidos };
}
