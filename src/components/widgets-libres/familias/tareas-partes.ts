/**
 * Lógica de las tareas del inicio (ola 0929 · F) sobre el MISMO almacén de siempre
 * (`starseed.tasks.quick.v1`, lib/tasks/quick-tasks.ts), que viaja con la cuenta tal cual: se
 * añaden dos campos opcionales a cada tarea —`vence` (día local «AAAA-MM-DD») y `orden` (el que
 * deja el arrastre)— sin tocar el formato `{ v: 1, items }`. Las lecturas y las altas siguen
 * pasando por quick-tasks; aquí solo se reordena y se fija el vencimiento.
 */
import { QUICK_TASKS_EVENT, QUICK_TASKS_KEY, readQuickTasks, type QuickTask } from "@/lib/tasks/quick-tasks";

export type TareaInicio = QuickTask & { vence?: string; orden?: number };
export type EstadoVence = "atrasada" | "hoy" | "manana" | "proxima";

/** Día local «AAAA-MM-DD». */
export function diaISO(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const sumarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function estadoVence(t: Pick<TareaInicio, "vence" | "done">, hoy: string, manana: string): EstadoVence | null {
    if (!t.vence || t.done) return null;
    if (t.vence < hoy) return "atrasada";
    if (t.vence === hoy) return "hoy";
    if (t.vence === manana) return "manana";
    return "proxima";
}

const PESO_PRIORIDAD: Record<string, number> = { alta: 0, normal: 1, baja: 2 };

/**
 * Orden de las pendientes: las que el usuario ordenó arrastrando mandan (`orden`); las nuevas,
 * sin orden, van arriba (la más reciente primero); a igualdad, la prioridad alta antes.
 */
export function ordenarPendientes<T extends TareaInicio>(tareas: T[]): T[] {
    return [...tareas].sort((a, b) => {
        const oa = a.orden ?? -1, ob = b.orden ?? -1;
        if (oa !== ob) return oa - ob;
        const pa = PESO_PRIORIDAD[a.priority ?? "normal"], pb = PESO_PRIORIDAD[b.priority ?? "normal"];
        if (pa !== pb) return pa - pb;
        return b.createdAt - a.createdAt;
    });
}

/**
 * Atajos al escribir: «!» (al principio o al final) = prioridad alta; «hoy» o «mañana» al final =
 * vence ese día. «Llamar a Ana mañana!» → texto «Llamar a Ana», vence mañana, alta.
 */
export function analizarEntrada(crudo: string, ahora: Date = new Date()): { texto: string; vence?: string; prioridad?: "alta" } {
    let texto = crudo.trim();
    let prioridad: "alta" | undefined;
    let vence: string | undefined;
    for (let i = 0; i < 3; i++) {
        const antes = texto;
        if (/^!+\s*/.test(texto) || /\s*!+$/.test(texto)) { prioridad = "alta"; texto = texto.replace(/^!+\s*/, "").replace(/\s*!+$/, ""); }
        const m = texto.match(/\s+(hoy|mañana|manana)$/i);
        if (m && texto.length > m[0].length) {
            vence = diaISO(/^hoy$/i.test(m[1]) ? ahora : sumarDias(ahora, 1));
            texto = texto.slice(0, -m[0].length);
        }
        if (texto === antes) break;
    }
    return { texto: texto.trim(), ...(vence ? { vence } : {}), ...(prioridad ? { prioridad } : {}) };
}

export interface ResumenTareas { pendientes: number; atrasadas: number; paraHoy: number; hechasHoy: number }

export function resumen(tareas: TareaInicio[], ahora: Date = new Date()): ResumenTareas {
    const hoy = diaISO(ahora), manana = diaISO(sumarDias(ahora, 1));
    let pendientes = 0, atrasadas = 0, paraHoy = 0, hechasHoy = 0;
    for (const t of tareas) {
        if (t.done) { if (t.doneAt && diaISO(new Date(t.doneAt)) === hoy) hechasHoy++; continue; }
        pendientes++;
        const e = estadoVence(t, hoy, manana);
        if (e === "atrasada") atrasadas++;
        if (e === "hoy") paraHoy++;
    }
    return { pendientes, atrasadas, paraHoy, hechasHoy };
}

/** Progreso del día: hechas hoy frente a lo que quedaba (lo de hoy y lo atrasado; si no hay
 *  nada con fecha, todas las pendientes). null si no hay nada que medir. */
export function progresoDelDia(r: ResumenTareas): number | null {
    const objetivo = r.paraHoy + r.atrasadas > 0 ? r.paraHoy + r.atrasadas : r.pendientes;
    const total = objetivo + r.hechasHoy;
    return total > 0 ? r.hechasHoy / total : null;
}

/** Hechas por día en los últimos `n` días (el último es hoy). */
export function hechasPorDia(tareas: TareaInicio[], ahora: Date = new Date(), n = 7): { dia: string; inicial: string; n: number }[] {
    const cuenta = new Map<string, number>();
    for (const t of tareas) if (t.done && t.doneAt) { const k = diaISO(new Date(t.doneAt)); cuenta.set(k, (cuenta.get(k) ?? 0) + 1); }
    return Array.from({ length: n }, (_, i) => {
        const d = sumarDias(ahora, i - n + 1);
        return { dia: diaISO(d), inicial: d.toLocaleDateString("es-ES", { weekday: "narrow" }), n: cuenta.get(diaISO(d)) ?? 0 };
    });
}

// ── Escritura (mismo formato y mismo evento que quick-tasks) ────────────────────────────────

function guardar(items: TareaInicio[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(QUICK_TASKS_KEY, JSON.stringify({ v: 1, items }));
        window.dispatchEvent(new CustomEvent(QUICK_TASKS_EVENT));
    } catch { /* cuota llena o almacén bloqueado: no se rompe nada */ }
}

/** Fija (o quita, con null) el día de vencimiento de una tarea. */
export function fijarVence(id: string, vence: string | null): void {
    guardar((readQuickTasks() as TareaInicio[]).map((t) => {
        if (t.id !== id) return t;
        const { vence: _fuera, ...resto } = t;
        return vence ? { ...resto, vence } : resto;
    }));
}

/** Guarda el orden que dejó el arrastre: `ids` son las pendientes en su nuevo orden. */
export function reordenar(ids: string[]): void {
    const pos = new Map(ids.map((id, i) => [id, i]));
    guardar((readQuickTasks() as TareaInicio[]).map((t) => (pos.has(t.id) ? { ...t, orden: pos.get(t.id)! } : t)));
}

/** Mueve una tarea un puesto arriba (-1) o abajo (+1) dentro de `ids` (para el teclado). */
export function mover(ids: string[], id: string, paso: -1 | 1): string[] {
    const i = ids.indexOf(id), j = i + paso;
    if (i < 0 || j < 0 || j >= ids.length) return ids;
    const copia = [...ids];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
}

/** Marca o desmarca la prioridad alta. */
export function fijarPrioridad(id: string, alta: boolean): void {
    guardar((readQuickTasks() as TareaInicio[]).map((t) => {
        if (t.id !== id) return t;
        const { priority: _fuera, ...resto } = t;
        return alta ? { ...resto, priority: "alta" } : resto;
    }));
}
