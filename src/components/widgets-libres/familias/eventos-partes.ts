/**
 * Lógica pura de la agenda de eventos (ola 0929 · F): qué eventos cuentan como próximos (y cuáles
 * siguen en curso), cómo se agrupan por día y la franja de la semana. Sin React: se prueba sola.
 */

export interface FilaEvento {
    id: string;
    slug: string;
    title: string;
    kind: string | null;
    starts_at: string | null;
    location: string | null;
    attendee_count: number | null;
}

export interface EventoAgenda {
    id: string;
    slug: string;
    titulo: string;
    tipo: string | null;
    inicio: Date;
    lugar: string | null;
    asistentes: number | null;
    /** Empezó hace menos de `EN_CURSO_MS` (la tabla no guarda la hora de fin). */
    enCurso: boolean;
}

/** Un evento que empezó hace menos de hora y media se enseña «en curso». */
export const EN_CURSO_MS = 90 * 60_000;

/** Cuenta atrás legible: «2 d 4 h», «3 h 12 min», «12:03» en la última hora. */
export function cuentaAtras(ms: number): string {
    if (ms <= 0) return "ahora";
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return `${d} d ${h % 24} h`;
    if (h > 0) return `${h} h ${m % 60} min`;
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Cuenta atrás mínima para «micro»: «3 d», «5 h», «12 min». */
export function cuentaCorta(ms: number): string {
    if (ms <= 0) return "ya";
    const min = Math.ceil(ms / 60_000);
    if (min < 60) return `${min} min`;
    const h = Math.round(min / 60);
    return h < 36 ? `${h} h` : `${Math.round(h / 24)} d`;
}

/** Próximos (y en curso), ordenados por hora de inicio. Filas sin fecha o sin título fuera. */
export function prepararEventos(filas: FilaEvento[], ahora: number): EventoAgenda[] {
    return filas
        .map((r) => ({ r, t: r.starts_at ? Date.parse(r.starts_at) : NaN }))
        .filter(({ r, t }) => Number.isFinite(t) && t >= ahora - EN_CURSO_MS && !!r.title?.trim())
        .sort((a, b) => a.t - b.t)
        .map(({ r, t }) => ({
            id: r.id, slug: r.slug, titulo: r.title.trim(), tipo: r.kind, inicio: new Date(t), lugar: r.location?.trim() || null,
            asistentes: typeof r.attendee_count === "number" ? r.attendee_count : null, enCurso: t < ahora,
        }));
}

/** Clave del día LOCAL: «2026-09-29». */
export function claveDia(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** «Hoy», «Mañana», «jueves 2 oct». */
export function etiquetaDia(d: Date, ahora: Date): string {
    const dias = Math.round((inicioDia(d).getTime() - inicioDia(ahora).getTime()) / 86_400_000);
    if (dias === 0) return "Hoy";
    if (dias === 1) return "Mañana";
    return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" }).replace(/\./g, "").replace(",", "");
}

/** Agrupa por día local, respetando el orden de entrada. */
export function agruparPorDia<T extends { inicio: Date }>(items: T[], ahora: Date): { clave: string; etiqueta: string; fecha: Date; items: T[] }[] {
    const grupos = new Map<string, { clave: string; etiqueta: string; fecha: Date; items: T[] }>();
    for (const it of items) {
        const clave = claveDia(it.inicio);
        if (!grupos.has(clave)) grupos.set(clave, { clave, etiqueta: etiquetaDia(it.inicio, ahora), fecha: inicioDia(it.inicio), items: [] });
        grupos.get(clave)!.items.push(it);
    }
    return [...grupos.values()];
}

/** La franja de la semana: `n` días desde hoy con cuántos eventos tiene cada uno. */
export function franjaSemana(eventos: { inicio: Date }[], ahora: Date, n = 7): { fecha: Date; clave: string; n: number; hoy: boolean; inicial: string; numero: number }[] {
    const cuenta = new Map<string, number>();
    for (const e of eventos) cuenta.set(claveDia(e.inicio), (cuenta.get(claveDia(e.inicio)) ?? 0) + 1);
    const base = inicioDia(ahora);
    return Array.from({ length: n }, (_, i) => {
        const fecha = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
        const clave = claveDia(fecha);
        return {
            fecha, clave, n: cuenta.get(clave) ?? 0, hoy: i === 0, numero: fecha.getDate(),
            inicial: fecha.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "").slice(0, 3),
        };
    });
}

/** Progreso hacia el evento para su anillo: dentro de 24 h, lo que queda del día; si no, de la semana. */
export function progresoHacia(inicio: Date, ahora: number): number {
    const falta = inicio.getTime() - ahora;
    if (falta <= 0) return 1;
    const ventana = falta <= 86_400_000 ? 86_400_000 : 7 * 86_400_000;
    return Math.max(0, Math.min(1, 1 - falta / ventana));
}
