// ════════════════════════════════════════════════════════════════════════════
// Resumen puro de versiones upstream de la Biblioteca.
// ════════════════════════════════════════════════════════════════════════════

export type EstadoActualizacion = "igual" | "hay-actualizacion" | "desconocida";

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

function quitarVInicial(v: string): string {
    if (v.length >= 2 && v[0] === "v" && /\d/.test(v[1])) return v.slice(1);
    return v;
}

export function normalizarVersion(v: string): string {
    if (typeof v !== "string") return "";
    let s = v.toLowerCase().replace(/\s+/g, "");
    const ultimoArroba = s.lastIndexOf("@");
    if (ultimoArroba >= 0 && ultimoArroba < s.length - 1) s = s.slice(ultimoArroba + 1);
    s = quitarVInicial(s);
    if (RE_SHA.test(s)) return s.slice(0, 7);
    return s;
}

function versionesCoinciden(instalada: string, remota: string): boolean {
    const ni = normalizarVersion(instalada);
    const nr = normalizarVersion(remota);
    if (!ni || !nr) return false;
    if (ni === nr) return true;
    if (RE_SHA.test(ni) && RE_SHA.test(nr)) return ni.startsWith(nr) || nr.startsWith(ni);
    return false;
}

export function resumirVersiones(
    fuentes: FuenteVersion[],
    idsInstalados: ReadonlySet<string>,
): ResumenVersion[] {
    const resultado: ResumenVersion[] = [];
    for (let i = 0; i < fuentes.length; i++) {
        const f = fuentes[i];
        if (!idsInstalados.has(f.id)) continue;
        if (f.remota === null || f.remota === undefined) {
            const texto = f.fecha ? `No se pudo comprobar ahora (${f.fecha})` : "No se pudo comprobar ahora";
            resultado.push({ id: f.id, tono: "sin-comprobar", texto, instalada: f.instalada, remota: null, fecha: f.fecha, upstream: f.upstream });
            continue;
        }
        const esNovedad = f.estado === "hay-actualizacion" || !versionesCoinciden(f.instalada, f.remota);
        if (esNovedad) {
            const textoBase = `Versión nueva publicada: ${f.remota} (la ficha tiene ${f.instalada})`;
            const texto = f.fecha ? `${textoBase} (${f.fecha})` : textoBase;
            resultado.push({ id: f.id, tono: "novedad", texto, instalada: f.instalada, remota: f.remota, fecha: f.fecha, upstream: f.upstream });
            continue;
        }
        const textoBase = `Al día (${f.instalada})`;
        const texto = f.fecha ? `${textoBase} (${f.fecha})` : textoBase;
        resultado.push({ id: f.id, tono: "al-dia", texto, instalada: f.instalada, remota: f.remota, fecha: f.fecha, upstream: f.upstream });
    }
    return resultado;
}

export function contarNovedades(r: ResumenVersion[]): number {
    let c = 0;
    for (let i = 0; i < r.length; i++) if (r[i].tono === "novedad") c++;
    return c;
}
