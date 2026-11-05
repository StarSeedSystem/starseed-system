/**
 * automejora-noche.ts — lógica pura para leer la última noche de automejora
 * y las propuestas pendientes. Sin disco, sin red, sin `node:*`.
 * Contrato: architecture/automejora-meta-n.md §5, §8 (tarea K2).
 */

export interface UltimaNoche {
    fecha: string;
    traido: number;
    motivo: string;
    directivas: Array<{
        capa: string;
        version: number | null;
        estado: string;
    }>;
    propuestas: Array<{
        id: string;
        capa: string;
        description: string;
        archivos: string[];
        prompt_inicio: string;
        referencia_funcion: string;
        enviada?: boolean;
    }>;
    errores?: Array<{ capa: string; motivo: string }>;
    sin_juez?: Array<{ capa: string; motivo: string }>;
    aplicadas?: Array<{ capa: string; version: number | null; estado: string }>;
}

export interface PropuestaAutomejoraArchivo {
    fecha: string;
    origen: string;
    propuestas: Array<{
        id: string;
        capa: string;
        description: string;
        archivos: string[];
        prompt_inicio: string;
        referencia_funcion: string;
        enviada?: boolean;
    }>;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function texto(v: unknown): string | null {
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function numero(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Criba el JSON de la última noche (`ultima-noche.json`). */
export function leerUltimaNoche(crudo: unknown): UltimaNoche | null {
    if (!esObjeto(crudo)) return null;

    const fecha = texto(crudo.fecha) ?? texto(crudo.ultima_noche);
    const traido = numero(crudo.traido) ?? Date.now();
    const motivo = texto(crudo.motivo) ?? "";

    const directivas: UltimaNoche["directivas"] = [];
    if (Array.isArray(crudo.directivas)) {
        for (const d of crudo.directivas) {
            if (!esObjeto(d)) continue;
            directivas.push({
                capa: texto(d.capa) ?? "desconocida",
                version: numero(d.version),
                estado: texto(d.estado) ?? "desconocido",
            });
        }
    }

    const propuestas: UltimaNoche["propuestas"] = [];
    if (Array.isArray(crudo.propuestas)) {
        for (const p of crudo.propuestas) {
            if (!esObjeto(p)) continue;
            propuestas.push({
                id: texto(p.id) ?? "",
                capa: texto(p.capa) ?? "desconocida",
                description: texto(p.description) ?? "",
                archivos: Array.isArray(p.archivos) ? p.archivos.filter((x): x is string => typeof x === "string") : [],
                prompt_inicio: texto(p.prompt_inicio) ?? "Comprueba primero si sigue haciendo falta",
                referencia_funcion: texto(p.referencia_funcion) ?? "",
                enviada: p.enviada === true,
            });
        }
    }

    const errores: UltimaNoche["errores"] = [];
    if (Array.isArray(crudo.errores)) {
        for (const e of crudo.errores) {
            if (!esObjeto(e)) continue;
            errores.push({
                capa: texto(e.capa) ?? "desconocida",
                motivo: texto(e.motivo) ?? "",
            });
        }
    }

    const sin_juez: UltimaNoche["sin_juez"] = [];
    if (Array.isArray(crudo.sin_juez)) {
        for (const s of crudo.sin_juez) {
            if (!esObjeto(s)) continue;
            sin_juez.push({
                capa: texto(s.capa) ?? "desconocida",
                motivo: texto(s.motivo) ?? "",
            });
        }
    }

    const aplicadas: UltimaNoche["aplicadas"] = [];
    if (Array.isArray(crudo.aplicadas)) {
        for (const a of crudo.aplicadas) {
            if (!esObjeto(a)) continue;
            aplicadas.push({
                capa: texto(a.capa) ?? "desconocida",
                version: numero(a.version),
                estado: texto(a.estado) ?? "desconocido",
            });
        }
    }

    return {
        fecha: fecha ?? new Date().toISOString().split("T")[0],
        traido,
        motivo,
        directivas,
        propuestas,
        errores,
        sin_juez,
        aplicadas,
    };
}

/** Criba un archivo de propuestas por fecha (`propuestas-automejora/<fecha>.json`). */
export function leerPropuestasArchivo(crudo: unknown): PropuestaAutomejoraArchivo | null {
    if (!esObjeto(crudo)) return null;

    const fecha = texto(crudo.fecha) ?? "";
    const origen = texto(crudo.origen) ?? "meta-n";

    const propuestas: PropuestaAutomejoraArchivo["propuestas"] = [];
    if (Array.isArray(crudo.propuestas)) {
        for (const p of crudo.propuestas) {
            if (!esObjeto(p)) continue;
            const id = texto(p.id);
            if (!id) continue;
            propuestas.push({
                id,
                capa: texto(p.capa) ?? "desconocida",
                description: texto(p.description) ?? "",
                archivos: Array.isArray(p.archivos) ? p.archivos.filter((x): x is string => typeof x === "string") : [],
                prompt_inicio: texto(p.prompt_inicio) ?? "Comprueba primero si sigue haciendo falta",
                referencia_funcion: texto(p.referencia_funcion) ?? "",
                enviada: p.enviada === true,
            });
        }
    }

    return { fecha, origen, propuestas };
}