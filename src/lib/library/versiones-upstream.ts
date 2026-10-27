// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Resumen de versiones upstream (LIB1025A)
// ════════════════════════════════════════════════════════════════════════════

export type EstadoActualizacion = "igual" | "hay-actualizacion" | "desconocida";

/** Copia estructural de FuenteActualizacion (no importamos la ruta). */
export interface FuenteVersion {
    id: string;
    instalada: string;
    remota: string | null;
    estado: EstadoActualizacion;
    fecha: string | null;
    upstream: string;
    aviso: string | null;
}

export type TonoVersion = "al-dia" | "novedad" | "sin-comprobar";

export interface ResumenVersion {
    id: string;
    tono: TonoVersion;
    texto: string;
    instalada: string;
    remota: string | null;
    fecha: string | null;
    upstream: string;
}

const RE_SHA = /^[0-9a-f]{7,40}$/i;

function esSha(v: string): boolean {
    return RE_SHA.test(v);
}

export function normalizarVersion(v: string): string {
    if (typeof v !== "string") return "";
    let s = v.toLowerCase();
    // Sin espacios
    s = s.replace(/\s+/g, "");
    // Se queda con lo que va tras la última @
    const ultimaArroba = s.lastIndexOf("@");
    if (ultimaArroba !== -1 && ultimaArroba < s.length - 1) {
        s = s.slice(ultimaArroba + 1);
    }
    // Sin una v inicial seguida de dígito
    if (/^v[0-9]/.test(s)) {
        s = s.slice(1);
    }
    // Si es un SHA de 7 a 40 hexadecimales, sus 7 primeros caracteres
    if (esSha(s)) {
        return s.slice(0, 7);
    }
    return s;
}

function versionesCoinciden(instalada: string, remota: string): boolean {
    const ni = normalizarVersion(instalada);
    const nr = normalizarVersion(remota);
    if (!ni || !nr) return false;
    if (esSha(instalada) || esSha(remota)) {
        return ni === nr || ni.startsWith(nr) || nr.startsWith(ni);
    }
    return ni === nr;
}

export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    const resultado: ResumenVersion[] = [];
    for (const f of fuentes) {
        if (!idsInstalados.has(f.id)) continue;
        if (!f.remota) {
            const texto = f.fecha
                ? `No se pudo comprobar ahora (${f.fecha})`
                : "No se pudo comprobar ahora";
            resultado.push({
                id: f.id,
                tono: "sin-comprobar",
                texto,
                instalada: f.instalada,
                remota: f.remota,
                fecha: f.fecha,
                upstream: f.upstream,
            });
            continue;
        }
        if (f.estado === "hay-actualizacion") {
            const fechaTxt = f.fecha ? ` (${f.fecha})` : "";
            const texto = `Versión nueva publicada: ${f.remota} (la ficha tiene ${f.instalada})${fechaTxt}`;
            resultado.push({
                id: f.id,
                tono: "novedad",
                texto,
                instalada: f.instalada,
                remota: f.remota,
                fecha: f.fecha,
                upstream: f.upstream,
            });
            continue;
        }
        if (f.estado === "igual") {
            const fechaTxt = f.fecha ? ` (${f.fecha})` : "";
            const texto = `Al día (${f.instalada})${fechaTxt}`;
            resultado.push({
                id: f.id,
                tono: "al-dia",
                texto,
                instalada: f.instalada,
                remota: f.remota,
                fecha: f.fecha,
                upstream: f.upstream,
            });
            continue;
        }
        // estado desconocida - mirar si difieren o coinciden
        if (versionesCoinciden(f.instalada, f.remota)) {
            const fechaTxt = f.fecha ? ` (${f.fecha})` : "";
            const texto = `Al día (${f.instalada})${fechaTxt}`;
            resultado.push({
                id: f.id,
                tono: "al-dia",
                texto,
                instalada: f.instalada,
                remota: f.remota,
                fecha: f.fecha,
                upstream: f.upstream,
            });
        } else {
            const fechaTxt = f.fecha ? ` (${f.fecha})` : "";
            const texto = `Versión nueva publicada: ${f.remota} (la ficha tiene ${f.instalada})${fechaTxt}`;
            resultado.push({
                id: f.id,
                tono: "novedad",
                texto,
                instalada: f.instalada,
                remota: f.remota,
                fecha: f.fecha,
                upstream: f.upstream,
            });
        }
    }
    return resultado;
}

export function contarNovedades(r: ResumenVersion[]): number {
    let n = 0;
    for (const item of r) {
        if (item.tono === "novedad") n++;
    }
    return n;
}
