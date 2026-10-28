/**
 * Novedades de modelos del vigía · lógica pura (Ola 1016M · vigia-modelos.md §2–§6).
 * Normaliza la última pasada de `scripts/puente/vigia_modelos.py`
 * (`starseed_memory_root/vigia/novedades-<fecha>.json`), la agrupa por área y superpone
 * las acciones del panel «Novedades de modelos» (encolar ficha / descartar). Puro: sin
 * disco, sin red, sin procesos. Nada no comercial como opción por defecto (§4).
 */

export type ClaseLicencia = "libre" | "personal" | "condicionada" | "desconocida";
export type EstadoFicha = "propuesto" | "en_catalogo" | "encolado" | "descartado";
export type MedioFicha = "navegador" | "mac" | "a1";
export type AccionFicha = "encolar" | "descartar";
export interface ArchivoPorMedio { medio: MedioFicha; cabe: boolean; archivo: string | null; motor: string | null; }
export interface FichaNovedad {
    id: string; clase: ClaseLicencia; licencia: string; gated: boolean;
    estado: EstadoFicha; motivo: string; tamanoGb: number | null; medios: ArchivoPorMedio[];
}
export interface AreaNovedades { id: string; nombre: string; catalogo: string | null; candidatos: FichaNovedad[]; }
export interface RegistroNovedades { fecha: string | null; areas: AreaNovedades[]; }
export interface AccionFichaRegistrada { area: string; id: string; accion: AccionFicha; motivo?: string; cuando: string; }

const CLASES_VALIDAS: ClaseLicencia[] = ["libre", "personal", "condicionada", "desconocida"];
const MEDIOS_VALIDOS: MedioFicha[] = ["navegador", "mac", "a1"];

function estadoDe(bruto: Record<string, unknown>): EstadoFicha {
    if (bruto.decision === "aceptado") return "propuesto";
    const motivo = typeof bruto.motivo === "string" ? bruto.motivo : "";
    if (/catálogo|catalogo/i.test(motivo)) return "en_catalogo";
    return /cola/i.test(motivo) ? "encolado" : "descartado";
}

function mediosDe(bruto: unknown): ArchivoPorMedio[] {
    if (!Array.isArray(bruto)) return [];
    return bruto.flatMap((elemento) => {
        if (!elemento || typeof elemento !== "object") return [];
        const e = elemento as Record<string, unknown>;
        if (typeof e.medio !== "string" || !(MEDIOS_VALIDOS as string[]).includes(e.medio)) return [];
        return [{ medio: e.medio as MedioFicha, cabe: e.cabe === true,
            archivo: typeof e.archivo === "string" ? e.archivo : null,
            motor: typeof e.motor === "string" ? e.motor : null }];
    });
}

function fichaDe(bruto: Record<string, unknown>): FichaNovedad | null {
    const id = typeof bruto.id === "string" ? bruto.id.trim() : "";
    if (!id) return null;
    const tamano = bruto.tamanio_gb;
    return {
        id,
        clase: (CLASES_VALIDAS as string[]).includes(String(bruto.clase)) ? (bruto.clase as ClaseLicencia) : "desconocida",
        licencia: typeof bruto.licencia === "string" ? bruto.licencia : "", gated: bruto.gated === true,
        estado: estadoDe(bruto), motivo: typeof bruto.motivo === "string" ? bruto.motivo : "",
        tamanoGb: typeof tamano === "number" && Number.isFinite(tamano) ? tamano : null, medios: mediosDe(bruto.medios),
    };
}

/** Agrupa una pasada cruda del vigía por área (la lógica de agrupado del panel). */
export function agruparPorArea(bruto: unknown): RegistroNovedades {
    const areasCrudas = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>).areas : null;
    if (!Array.isArray(areasCrudas)) return { fecha: null, areas: [] };
    const fechaCruda = (bruto as Record<string, unknown>).fecha;
    const areas = areasCrudas.flatMap((crudaArea) => {
        if (!crudaArea || typeof crudaArea !== "object") return [];
        const a = crudaArea as Record<string, unknown>;
        const id = typeof a.area === "string" ? a.area.trim() : "";
        if (!id) return [];
        const candidatos = [a.aceptados, a.descartados].flatMap((lista) =>
            (Array.isArray(lista) ? lista : []).flatMap((cruda) => {
                const ficha = cruda && typeof cruda === "object" ? fichaDe(cruda as Record<string, unknown>) : null;
                return ficha ? [ficha] : [];
            }));
        return [{ id,
            nombre: typeof a.nombre === "string" && a.nombre.trim() ? a.nombre.trim() : id,
            catalogo: typeof a.catalogo === "string" ? a.catalogo : null, candidatos }];
    });
    return { fecha: typeof fechaCruda === "string" ? fechaCruda : null, areas };
}

const PATRON_NOVEDADES = /^novedades-(\d{4}-\d{2}-\d{2})\.json$/;
export function nombreMasReciente(nombres: string[]): string | null {
    let mejor: { nombre: string; fecha: string } | null = null;
    for (const nombre of nombres) {
        const m = PATRON_NOVEDADES.exec(nombre);
        if (m && (!mejor || m[1] > mejor.fecha)) mejor = { nombre, fecha: m[1] };
    }
    return mejor?.nombre ?? null;
}

/** Aplica una acción del panel sobre una ficha y devuelve las áreas NUEVAS (inmutables). */
export function superponerAccion(areas: AreaNovedades[], area: string, id: string, accion: AccionFicha, motivo?: string): AreaNovedades[] {
    const estado: EstadoFicha = accion === "encolar" ? "encolado" : "descartado";
    const porQue = motivo?.trim() || (accion === "encolar"
        ? "Encolada desde el panel «Novedades de modelos» para su ficha en el catálogo"
        : "Descartada desde el panel «Novedades de modelos»");
    return areas.map((a) => (a.id !== area ? a : {
        ...a,
        candidatos: a.candidatos.map((f) => (f.id !== id ? f : { ...f, estado, motivo: porQue })),
    }));
}

/** Lee las acciones escritas en el estado del vigía; lo que no sea válido, se ignora. */
export function accionesDeTexto(texto: string | null | undefined): AccionFichaRegistrada[] {
    let bruto: unknown;
    try { bruto = JSON.parse(texto ?? "[]"); } catch { return []; }
    if (!Array.isArray(bruto)) return [];
    return bruto.flatMap((elemento) => {
        if (!elemento || typeof elemento !== "object") return [];
        const e = elemento as Record<string, unknown>;
        if ((e.accion !== "encolar" && e.accion !== "descartar") || typeof e.area !== "string" || !e.area.trim()
            || typeof e.id !== "string" || !e.id.trim()) return [];
        return [{
            area: e.area, id: e.id, accion: e.accion,
            motivo: typeof e.motivo === "string" && e.motivo.trim() ? e.motivo : undefined,
            cuando: typeof e.cuando === "string" ? e.cuando : "",
        }];
    });
}
