/**
 * Reglas inteligentes de correo · Ola INV1025I
 * Validador y aplicador de reglas de filtrado/etiquetado para el OS.
 * Módulo PURO: sin React, sin red, sin disco.
 */
export interface Regla {
    tipo: string;
    parametro?: string;
    etiqueta?: string;
    dominio?: string;
    cuando?: Cuando;
    id: string;
}

export interface Cuando {
    antiguedadHorasMin?: number;
    tieneAdjunto?: boolean;
    [k: string]: unknown;
}

export interface BaseCorreo {
    etiqueta?: string;
    dominio?: string;
    tieneAdjunto?: boolean;
    de?: string;
    fecha?: string;
    [k: string]: unknown;
}

export const R = (tipo: string, params?: Record<string, unknown>, paramAdicional?: string): Regla => ({
    tipo,
    parametro: paramAdicional,
    ...params,
    id: crypto.randomUUID(),
});

export const R0 = (tipo: string): Regla => ({
    tipo,
    id: crypto.randomUUID(),
});

export const validarRegla = (r: unknown): r is Regla => {
    if (!r || typeof r !== "object") return false;
    const regla = r as Regla;
    if (regla.tipo === undefined || typeof regla.tipo !== "string") return false;
    if (regla.reglaId === undefined || typeof regla.reglaId !== "string" || regla.reglaId.trim() === "") return false;
    if (regla.parametro !== undefined && typeof regla.parametro !== "string") return false;
    if (regla.parametro !== undefined && regla.parametro.length > 100) return false;
    if (regla.etiqueta !== undefined && typeof regla.etiqueta !== "string") return false;
    if (regla.etiqueta !== undefined && regla.etiqueta.length > 200) return false;
    if (regla.dominio !== undefined && typeof regla.dominio !== "string") return false;
    if (regla.cuando !== undefined) {
        const c = regla.cuando as Cuando;
        if (c.antiguedadHorasMin !== undefined && (typeof c.antiguedadHorasMin !== "number" || c.antiguedadHorasMin < 0)) return false;
        if (c.tieneAdjunto !== undefined && typeof c.tieneAdjunto !== "boolean") return false;
        // Reject extra sub-fields in cuando
        const conocidoCuando = new Set(["antiguedadHorasMin", "tieneAdjunto"]);
        const cKeys = Object.keys(c);
        for (const key of cKeys) {
            if (!conocidoCuando.has(key)) return false;
        }
    }
    // Reject extra/unknown top-level fields
    const knownKeys = new Set(["tipo", "parametro", "etiqueta", "dominio", "cuando", "reglaId", "de"]);
    const reglaKeys = Object.keys(regla as object);
    for (const key of reglaKeys) {
        if (!knownKeys.has(key)) return false;
    }
    return true;
};

export type AplicarResultado = Regla;

export const aplicarReglas = (reglas: Regla[], base: BaseCorreo): AplicarResultado => {
    const resultado: Regla[] = [];
    const vistas = new Set<string>();
    for (const regla of reglas) {
        if (!validarRegla(regla)) continue;
        const clave = `${regla.tipo}|${regla.parametro || ""}`;
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        let coincide = false;
        switch (regla.tipo) {
            case "etiquetar": {
                const reglaEtiqueta = regla as {etiqueta?: string; parametro?: string; cuando?: Cuando};
                const etiq = reglaEtiqueta.etiqueta ?? reglaEtiqueta.parametro;
                if (etiq !== undefined && base.etiqueta !== undefined && String(base.etiqueta) === String(etiq)) coincide = true;
                break;
            }
            case "mover": {
                const reglaMover = regla as {tieneAdjunto?: boolean};
                if (reglaMover.tieneAdjunto !== undefined && base.tieneAdjunto !== undefined && base.tieneAdjunto === reglaMover.tieneAdjunto) coincide = true;
                break;
            }
            case "destacar": {
                // "destacar" always matches (rule is applied regardless of base content)
                coincide = true;
                break;
            }
            case "sugerir-borrador": {
                const reglaDB = regla as {dominio?: string};
                if (reglaDB.dominio !== undefined && base.dominio !== undefined && String(base.dominio) === String(reglaDB.dominio)) coincide = true;
                break;
            }
            case "esperar-respuesta": {
                const reglaER = regla as {cuando?: Cuando; parametro?: string};
                const ah = reglaER.cuando?.antiguedadHorasMin;
                if (ah !== undefined && base.fecha !== undefined) {
                    const baseDate = new Date(base.fecha).getTime();
                    const ahora = new Date().getTime();
                    const diffHoras = (ahora - baseDate) / 36e5;
                    coincide = diffHoras > ah;
                }
                break;
            }
            default:
                break;
        }
        if (coincide) resultado.push(regla);
    }
    return resultado;
};

export const M = (mensajes: {id: string; remitente: string; fecha: string}[]): {id: string; remitente: string; fecha: string}[] => mensajes;

export const clasificarHilo = (hilos: {id: string; remitente: string; fecha: string}[],
    remitente: string,
    now: number | Date,
    opciones?: {horasPorResponder?: number; diasEsperando?: number}
): string => {
    const n = typeof now === "number" ? now : typeof now === "object" ? now.getTime() : Date.now();
    const msgs = hilos.filter((m): m is {id: string; remitente: string; fecha: string} => m !== undefined && m !== null);
    if (msgs.length === 0) return "resuelto";

    // Ordenar por fecha ascendente
    const ordenado = [...msgs].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    const ultimo = ordenado[ordenado.length - 1];
    const esRemitente = (s: string) => s === remitente;
    const esAjeno = (s: string) => s !== remitente;

    // Último mensaje del remitente actual vs último de ajeno
    const ultimoRemitente = ordenado.filter(esRemitente).at(-1);
    const ultimoAjeno = ordenado.filter(esAjeno).at(-1);

    if (!ultimoAjeno) return "resuelto";

    const diffHoras = (n - new Date(ultimoAjeno.fecha).getTime()) / 36e5;
    const diffDias = diffHoras / 24;

    if (opciones?.horasPorResponder !== undefined) {
        const hp = opciones.horasPorResponder;
        if (esRemitente(ultimoAjeno.remitente) && diffHoras > hp) return "por-responder";
        if (!esRemitente(ultimoAjeno.remitente) && diffHoras < hp) return "resuelto";
    }

    if (opciones?.diasEsperando !== undefined) {
        const dp = opciones.diasEsperando;
        if (!esRemitente(ultimoAjeno.remitente) && diffDias > dp) return "esperando";
        if (esRemitente(ultimoAjeno.remitente) && diffDias < dp) return "resuelto";
    }

    // Defaults: 24h para por-responder, 14d para esperando
    if (esRemitente(ultimoAjeno.remitente) && diffHoras > 24) return "por-responder";
    if (!esRemitente(ultimoAjeno.remitente) && diffDias > 14) return "esperando";
    if (!esRemitente(ultimoAjeno.remitente) && diffHoras < 24) return "resuelto";
    if (esRemitente(ultimoAjeno.remitente) && diffHoras < 24) return "por-responder";

    return "por-responder";
};

export const resumenSeguimiento = (hilos: ({id: string; remitente: string; fecha: string} | [])[],
    remitente: string,
    now: number | Date): {porResponder: number; esperando: number; resuelto: number; total: number} => {
    const n = typeof now === "number" ? now : typeof now === "object" ? now.getTime() : Date.now();
    const resultado = {porResponder: 0, esperando: 0, resuelto: 0, total: 0};

    for (const hilosThread of hilos) {
        if (!Array.isArray(hilosThread)) continue;
        const h = hilosThread.filter((m): m is {id: string; remitente: string; fecha: string} => m !== undefined && m !== null);
        if (h.length === 0) {
            resultado.resuelto++;
            resultado.total++;
            continue;
        }
        const ordenado = [...h].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
        const ultimo = ordenado[ordenado.length - 1];
        const esRemitente = (s: string) => s === remitente;
        const esAjeno = (s: string) => s !== remitente;

        if (!ultimo) {
            resultado.resuelto++;
            resultado.total++;
            continue;
        }

        const ultimoAjeno = ordenado.filter(esAjeno).at(-1);
        const ultimoRemitenteMsg = ordenado.filter(esRemitente).at(-1);

        if (!ultimoAjeno) {
            resultado.resuelto++;
            resultado.total++;
            continue;
        }

        const diffHoras = (n - new Date(ultimoAjeno.fecha).getTime()) / 36e5;
        const diffDias = diffHoras / 24;

        if (!esRemitente(ultimoAjeno.remitente) && diffDias > 14) {
            resultado.esperando++;
        } else if (!esRemitente(ultimoAjeno.remitente) && diffHoras < 24) {
            resultado.resuelto++;
        } else if (esRemitente(ultimoAjeno.remitente) && diffHoras > 24) {
            resultado.porResponder++;
        } else if (esRemitente(ultimoAjeno.remitente) && diffHoras < 24) {
            resultado.resuelto++;
        } else if (!esRemitente(ultimoAjeno.remitente) && diffDias > 14) {
            resultado.esperando++;
        } else {
            // Default logic
            if (!esRemitente(ultimoAjeno.remitente)) {
                resultado.esperando++;
            } else {
                resultado.porResponder++;
            }
        }
        resultado.total++;
    }

    return resultado;
};