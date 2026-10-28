// src/lib/aurora/voz-starseed/licencia-voz.ts
/**
 * LICENCIA DE VOZ POR CONTEXTO — Ola 1018V (VST1018C).
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: decide qué motores de voz pueden sonar en cada sitio sin tocar
 * red, disco, reloj ni audio. Reutiliza la herencia de capas de conciencia de
 * `preferencias-capas.ts`, la misma que usan los modelos.
 *
 * Reglas del contrato `architecture/voz-voicestudio.md` §4:
 *  · `comercial` se trata como `publico` y nunca permite uso personal.
 *  · Fuera de lo personal solo entran motores `libre` o `condicionada` con la
 *    condición cumplida (`condicionCumplida === true`), nunca por omisión.
 *  · Un motor `personal` (OmniVoice, VoiceMorphic) solo suena en lo personal.
 *  · El piso `libre` no se pierde nunca; las capas solo pueden restringir.
 */

import {
    preferenciasEfectivas,
    type CapasPrefs,
    type Contexto,
    type Licencias,
} from "@/lib/modelos/preferencias-capas";

/** Clases de licencia que puede declarar un motor de voz. */
export type ClaseLicenciaVoz = Exclude<Licencias, "desconocida">;

/** Contextos de escucha: los cuatro de las capas más el uso comercial. */
export type ContextoLicenciaVoz = Contexto | "comercial";

/** Motor candidato tal como lo entrega el catálogo de voces. */
export interface MotorInfo {
    id: string;
    claseLicencia: ClaseLicenciaVoz;
    /** Solo se mira en las «condicionada»; ausente equivale a no cumplida. */
    condicionCumplida?: boolean;
}

/** Una exclusión con su motivo legible para Ajustes → Voz. */
export interface MotorExcluido {
    id: string;
    motivo: string;
}

/** Resultado determinista, en el mismo orden en que llegaron los motores. */
export interface ResultadoPermisos {
    permitidos: MotorInfo[];
    excluidos: MotorExcluido[];
}

/** Nombres anteriores del contrato, conservados para quien ya los importa. */
export type ClaseLicencia = ClaseLicenciaVoz;
export type ContextoVoz = ContextoLicenciaVoz;
export type MotorVozLicencia = MotorInfo;
export type ExclusionVoz = MotorExcluido;
export type Excluido = MotorExcluido;
export type PermisosVoz = ResultadoPermisos;

const MOTIVO_PERSONAL_FUERA = "pesos no comerciales: solo uso personal";
const MOTIVO_PERSONAL_CAPAS = "las capas activas no autorizan pesos de uso personal";
const MOTIVO_CONDICIONADA_SIN_CAPA = "licencia condicionada sin autorización en este contexto";
const MOTIVO_CONDICION_NO_CUMPLIDA = "Condición de uso no cumplida";
const MOTIVO_LIBRE = "la licencia libre es el piso y no puede excluirse";

/** Motivo legible de una exclusión según la clase, el sitio y las capas. */
function motivoExclusion(
    clase: ClaseLicenciaVoz,
    contexto: ContextoLicenciaVoz,
    capas: CapasPrefs
): string {
    if (clase === "personal") {
        if (contexto !== "personal") return MOTIVO_PERSONAL_FUERA;
        const neuronaBloquea = capas.neurona !== undefined && capas.neurona !== "personal";
        return neuronaBloquea
            ? "la capa de la neurona no admite pesos de uso personal"
            : MOTIVO_PERSONAL_CAPAS;
    }
    if (clase === "condicionada") return MOTIVO_CONDICIONADA_SIN_CAPA;
    // Inalcanzable: `preferenciasEfectivas` siempre conserva el piso libre.
    return MOTIVO_LIBRE;
}

/**
 * Filtra los motores permitidos en un contexto de uso.
 *
 * @param motores Candidatos con su clase de licencia.
 * @param contexto Sitio donde va a sonar: personal, grupo, comunidad, público o comercial.
 * @param capas Preferencias de las capas de conciencia (sistema › comunidad › grupo › persona › neurona).
 */
export function motoresPermitidos(
    motores: MotorInfo[],
    contexto: ContextoLicenciaVoz,
    capas: CapasPrefs
): ResultadoPermisos {
    const contextoBase: Contexto = contexto === "comercial" ? "publico" : contexto;
    const { licenciaPermitida } = preferenciasEfectivas(capas, contextoBase);
    const autorizadas = new Set(licenciaPermitida);

    const permitidos: MotorInfo[] = [];
    const excluidos: MotorExcluido[] = [];

    for (const motor of motores) {
        const clase = motor.claseLicencia;
        const cumple = motor.condicionCumplida === true;

        if (clase === "condicionada" && !cumple) {
            excluidos.push({ id: motor.id, motivo: MOTIVO_CONDICION_NO_CUMPLIDA });
            continue;
        }

        if (!autorizadas.has(clase)) {
            excluidos.push({
                id: motor.id,
                motivo: motivoExclusion(clase, contexto, capas),
            });
            continue;
        }

        permitidos.push(motor);
    }

    return { permitidos, excluidos };
}
