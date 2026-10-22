// Tipos y resumen PUROS de la Imaginación para Genesis (sin red, sin disco, reloj por parámetro).
// Contrato: architecture/imaginacion-autodesarrollo.md §3, §4 y §6; espeja autodesarrollo_logica.py.

export type FuentePropuesta = "diaria" | "profunda" | "astraura" | "directores";
export type ImportanciaPropuesta = "baja" | "media" | "alta" | "critica";
export type EstadoPropuesta =
    | "nueva" | "autodesarrollo" | "esperando-aprobacion" | "pregunta" | "descartada"
    | "aprobada" | "rechazada" | "pospuesta" | "hecha";
export type AccionPropuesta = "aprobar" | "rechazar" | "posponer" | "ver-origen";
export type TonoPastilla = "ok" | "pendiente" | "atencion";

export interface PropuestaImaginacion {
    id: string;
    fuente: FuentePropuesta;
    titulo: string;
    cuerpo: string;
    archivos: string[];
    utilidad: number; // 0–1
    importancia: ImportanciaPropuesta;
    estado: EstadoPropuesta;
    motivo: string;
    tarea?: string;
    t: string; // ISO 8601
}
export interface FranjaHoraria { dias: number[]; desde: string; hasta: string } // 0 = lunes … 6 = domingo
export interface AjustesAutodesarrollo {
    automatico: boolean;
    rango: { min: number; max: number };
    fuentes: Record<FuentePropuesta, boolean>;
    horario: { modo: "inteligente" | "franjas"; franjas: FranjaHoraria[]; repartir: boolean };
    profunda: { cada_dias: number };
}
export const NOMBRE_FUENTE: Record<FuentePropuesta, string> = {
    diaria: "Imaginación diaria",
    profunda: "Imaginación profunda",
    astraura: "Procesos imaginativos de Astraura",
    directores: "Directores",
};

export const AJUSTES_POR_DEFECTO: AjustesAutodesarrollo = {
    automatico: true,
    rango: { min: 0, max: 10 },
    fuentes: { diaria: true, profunda: true, astraura: true, directores: true },
    horario: { modo: "inteligente", franjas: [{ dias: [0, 1, 2, 3, 4, 5, 6], desde: "02:00", hasta: "06:00" }], repartir: true },
    profunda: { cada_dias: 7 },
};
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const entero = (v: unknown, def: number, lo: number, hi: number): number =>
    typeof v === "number" && Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : def;

function franja(f: unknown): FranjaHoraria | null {
    if (!esObj(f) || !Array.isArray(f.dias)) return null;
    const dias = [...new Set(f.dias.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    const { desde, hasta } = f;
    if (!dias.length || typeof desde !== "string" || typeof hasta !== "string" || desde === hasta) return null;
    if (!HORA.test(desde) || !HORA.test(hasta)) return null;
    return { dias, desde, hasta };
}

/** Ajustes completos y válidos; lo inválido vuelve al defecto (igual que Python). */
export function validarAjustes(d: unknown): AjustesAutodesarrollo {
    const r = structuredClone(AJUSTES_POR_DEFECTO);
    if (!esObj(d)) return r;
    if (typeof d.automatico === "boolean") r.automatico = d.automatico;
    const rg = esObj(d.rango) ? d.rango : {};
    const [mn, mx] = [entero(rg.min, 0, 0, 10), entero(rg.max, 10, 0, 10)];
    r.rango = { min: Math.min(mn, mx), max: mx };
    const fu = esObj(d.fuentes) ? d.fuentes : {};
    for (const k of Object.keys(r.fuentes) as FuentePropuesta[]) if (typeof fu[k] === "boolean") r.fuentes[k] = fu[k] as boolean;
    const h = esObj(d.horario) ? d.horario : {};
    if (h.modo === "inteligente" || h.modo === "franjas") r.horario.modo = h.modo;
    if (typeof h.repartir === "boolean") r.horario.repartir = h.repartir;
    if (Array.isArray(h.franjas)) {
        const validas = h.franjas.map(franja).filter((x): x is FranjaHoraria => x !== null);
        if (validas.length || h.franjas.length === 0) r.horario.franjas = validas;
    }
    r.profunda.cada_dias = entero(esObj(d.profunda) ? d.profunda.cada_dias : undefined, 7, 0, 365);
    return r;
}

const ESPERA: EstadoPropuesta[] = ["esperando-aprobacion", "pregunta"];
const dia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const PESO: Record<ImportanciaPropuesta, number> = { critica: 3, alta: 2, media: 1, baja: 0 };

/** «N por aprobar · M autodesarrolladas hoy (rango a–b)» y el tono de la pastilla. */
export function resumenPastilla(propuestas: PropuestaImaginacion[], ajustes: AjustesAutodesarrollo, hoy: Date): { texto: string; tono: TonoPastilla } {
    const porAprobar = propuestas.filter((p) => ESPERA.includes(p.estado));
    const hechasHoy = propuestas.filter((p) => {
        const t = new Date(p.t);
        return p.tarea && (p.estado === "autodesarrollo" || p.estado === "hecha") && !Number.isNaN(t.getTime()) && dia(t) === dia(hoy);
    });
    const { min, max } = validarAjustes(ajustes).rango;
    const texto = `${porAprobar.length} por aprobar · ${hechasHoy.length} autodesarrolladas hoy (rango ${min}–${max})`;
    const urgente = porAprobar.some((p) => PESO[p.importancia] >= 2);
    return { texto, tono: urgente ? "atencion" : porAprobar.length ? "pendiente" : "ok" };
}

export interface FilaMedidor {
    id: string;
    titulo: string;
    fuente: string;
    utilidad: number;
    importancia: ImportanciaPropuesta;
    estado: EstadoPropuesta;
    tarea?: string;
    esperaAAlex: boolean;
    acciones: AccionPropuesta[];
}

/** Filas del medidor: primero lo que espera a Alex, por importancia y utilidad; sin cambiar el original. */
export function filasMedidor(propuestas: PropuestaImaginacion[]): FilaMedidor[] {
    const filas = propuestas.map((p) => {
        const esperaAAlex = ESPERA.includes(p.estado);
        const acciones: AccionPropuesta[] = esperaAAlex || p.estado === "pospuesta" || p.estado === "nueva" ? ["aprobar", "rechazar", "posponer", "ver-origen"] : ["ver-origen"];
        return { id: p.id, titulo: p.titulo, fuente: NOMBRE_FUENTE[p.fuente], utilidad: p.utilidad, importancia: p.importancia, estado: p.estado, tarea: p.tarea, esperaAAlex, acciones };
    });
    return filas.sort((a, b) =>
        Number(b.esperaAAlex) - Number(a.esperaAAlex) || PESO[b.importancia] - PESO[a.importancia] || b.utilidad - a.utilidad || a.id.localeCompare(b.id));
}
