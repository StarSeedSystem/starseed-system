/**
 * Motores de un ámbito de Genesis (§2 y §6.2 del contrato).
 * Funciones PURAS: validan el cuerpo del POST y arman la respuesta única
 * que enseña el token. La ruta hace la parte de servidor (RPC y guardián).
 * El token en claro solo aparece en la respuesta del POST, nunca dentro de
 * `instrucciones` ni en el GET (que lee la vista `mando_motores_publica`).
 */

import { capacidadesMotorValidas, type CapacidadMotor } from "./motor-token";

export const TIPOS_MOTOR = ["local", "nube-propia", "servidor-propio"] as const;
export type TipoMotor = (typeof TIPOS_MOTOR)[number];

export interface CuerpoMotorValido {
    nombre: string;
    tipo: TipoMotor;
    capacidades: CapacidadMotor[];
}

export type ResultadoValidacionMotor =
    | { ok: true; valor: CuerpoMotorValido }
    | { ok: false; error: string };

const NOMBRE_MAX = 60;

/** Valida {nombre, tipo, capacidades} del POST. Entrada → salida, nada más. */
export function validarCuerpoMotor(cuerpo: unknown): ResultadoValidacionMotor {
    if (typeof cuerpo !== "object" || cuerpo === null) {
        return { ok: false, error: "Cuerpo JSON inválido." };
    }
    const c = cuerpo as Record<string, unknown>;

    const nombre = typeof c.nombre === "string" ? c.nombre.trim() : "";
    if (nombre.length < 1 || nombre.length > NOMBRE_MAX) {
        return { ok: false, error: "El nombre del motor es obligatorio (máx. 60 caracteres)." };
    }

    const tipo = typeof c.tipo === "string" ? c.tipo : "";
    if (!TIPOS_MOTOR.includes(tipo as TipoMotor)) {
        return { ok: false, error: "Tipo de motor no válido: usa local, nube-propia o servidor-propio." };
    }

    const capacidades = c.capacidades === undefined ? [] : c.capacidades;
    const validas = capacidadesMotorValidas(capacidades);
    if (!validas.ok) {
        const detalle = validas.invalidas.length > 0 ? `: ${validas.invalidas.join(", ")}` : "";
        return { ok: false, error: `Capacidades de motor no válidas${detalle}.` };
    }

    return {
        ok: true,
        valor: { nombre, tipo: tipo as TipoMotor, capacidades: capacidades as CapacidadMotor[] },
    };
}

export interface RespuestaRegistroMotor {
    motor_id: string;
    huella: string;
    token: string;
    instrucciones: string;
}

/**
 * Arma la ÚNICA respuesta que enseña el token. El texto de `instrucciones`
 * dice dónde poner la variable de entorno sin repetir el valor del token:
 * así una copia del mensaje en un log o en el chat no filtra la clave.
 */
export function armarRespuestaMotor(args: {
    motorId: string;
    huella: string;
    token: string;
}): RespuestaRegistroMotor {
    const instrucciones =
        "Guarda este token como STARSEED_MOTOR_TOKEN en el archivo ~/.starseed/env del motor " +
        "(una línea STARSEED_MOTOR_TOKEN=<token>). Se enseña una sola vez: en el servidor solo " +
        `queda su huella ${args.huella}. Si lo pierdes, revoca este motor y registra otro.`;
    if (instrucciones.includes(args.token)) {
        throw new Error("Las instrucciones no deben contener el token.");
    }
    return {
        motor_id: args.motorId,
        huella: args.huella,
        token: args.token,
        instrucciones,
    };
}
