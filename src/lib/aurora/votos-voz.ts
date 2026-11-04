"use client";

export const CLAVE_VOTOS_VOZ = "starseed.votos-voz.v1";

export const MAX_VOTOS_TOTAL = 100;

export interface Voto {
    motor: string;
    voto: 1 | -1;
    timestamp: number;
}

export interface DepsVotos {
    leer: () => string | null;
    escribir: (texto: string) => boolean | undefined;
    ahora?: () => number;
}

export function anotarVoto(
    { motor, voto }: { motor: string; voto: 1 | -1 },
    deps: DepsVotos,
): boolean {
    if (voto !== 1 && voto !== -1) return false;
    const limpio = (motor || "").trim();
    if (!limpio) return false;
    if (!deps.escribir) return false;
    const ahora = deps.ahora ? deps.ahora() : Date.now();
    const leidos = deps.leer ? JSON.parse(deps.leer() || "[]") : [];
    const votos: Voto[] = Array.isArray(leidos) ? leidos : [];
    votos.push({ motor: limpio, voto, timestamp: ahora });
    if (votos.length > MAX_VOTOS_TOTAL) {
        votos.shift();
    }
    const texto = JSON.stringify(votos);
    return deps.escribir(texto) === true;
}

export function leerVotos(deps: DepsVotos): Voto[] {
    if (!deps.leer) return [];
    let crudo: string | null | undefined;
    try {
        crudo = deps.leer();
    } catch {
        return [];
    }
    if (!crudo) return [];
    let datos: unknown;
    try {
        datos = JSON.parse(crudo);
    } catch {
        return [];
    }
    if (!Array.isArray(datos)) return [];
    return datos
        .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null && typeof v.motor === "string" && typeof v.voto === "number" && typeof v.timestamp === "number" && v.motor.trim() !== "" && (v.voto === 1 || v.voto === -1))
        .map((v) => ({
            motor: (v.motor as string).trim(),
            voto: v.voto as 1 | -1,
            timestamp: v.timestamp as number,
        }));
}