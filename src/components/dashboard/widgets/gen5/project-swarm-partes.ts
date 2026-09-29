/**
 * Enjambre de Propósitos · lógica PURA (Ola 0929-C).
 *
 * Un proyecto es una etiqueta `#nombre` en tus Tareas rápidas (las mismas del widget de
 * Tareas, sincronizadas con tu cuenta): «Montar el riego #huerto» pertenece al proyecto
 * «huerto». Así no hay un segundo almacén que se desincronice y cualquier tarea puede entrar
 * en un proyecto con solo escribir su etiqueta.
 */
import type { QuickTask } from "@/lib/tasks/quick-tasks";

/** Letras (con tildes y ñ), números, guion y guion bajo; de 2 a 32 caracteres. */
const ETIQUETA = /(^|\s)#([\p{L}\p{N}_-]{2,32})/gu;

export function extraerEtiquetas(texto: string): string[] {
    const out: string[] = [];
    for (const m of texto.matchAll(ETIQUETA)) {
        const t = m[2].toLocaleLowerCase("es");
        if (!out.includes(t)) out.push(t);
    }
    return out;
}

/** El texto sin las etiquetas (para mostrar la tarea limpia dentro de su proyecto). */
export function sinEtiquetas(texto: string): string {
    return texto.replace(ETIQUETA, "$1").replace(/\s{2,}/g, " ").trim() || texto.trim();
}

/** Añade `#etiqueta` al final si el texto aún no la lleva. */
export function conEtiqueta(texto: string, etiqueta: string): string {
    const t = texto.trim();
    if (!t) return t;
    return extraerEtiquetas(t).includes(etiqueta.toLocaleLowerCase("es")) ? t : `${t} #${etiqueta}`;
}

/** Normaliza lo que la persona escribe como nombre de proyecto a una etiqueta válida. */
export function aEtiqueta(nombre: string): string | null {
    const t = nombre.trim().replace(/^#/, "").toLocaleLowerCase("es").replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 32);
    return t.length >= 2 ? t : null;
}

export interface Proyecto {
    etiqueta: string;
    total: number;
    hechas: number;
    pendientes: QuickTask[];
    progreso: number;
    /** La próxima tarea: primero la de prioridad alta, si no la más antigua pendiente. */
    siguiente: QuickTask | null;
    /** Última actividad (creación o cierre de alguna de sus tareas). */
    actividad: number;
}

function actividadDe(t: QuickTask): number {
    return Math.max(t.createdAt, t.doneAt ?? 0);
}

export function siguienteDe(pendientes: QuickTask[]): QuickTask | null {
    if (!pendientes.length) return null;
    const alta = pendientes.filter((t) => t.priority === "alta");
    const base = alta.length ? alta : pendientes;
    return [...base].sort((a, b) => a.createdAt - b.createdAt)[0];
}

/** Proyectos a partir de las tareas, del más activo al menos activo. */
export function proyectosDe(tareas: QuickTask[]): Proyecto[] {
    const mapa = new Map<string, QuickTask[]>();
    for (const t of tareas) {
        for (const e of extraerEtiquetas(t.text)) {
            const l = mapa.get(e) ?? [];
            l.push(t);
            mapa.set(e, l);
        }
    }
    return [...mapa.entries()].map(([etiqueta, ts]) => {
        const pendientes = ts.filter((t) => !t.done);
        const hechas = ts.length - pendientes.length;
        return {
            etiqueta,
            total: ts.length,
            hechas,
            pendientes,
            progreso: ts.length ? hechas / ts.length : 0,
            siguiente: siguienteDe(pendientes),
            actividad: ts.reduce((m, t) => Math.max(m, actividadDe(t)), 0),
        };
    }).sort((a, b) => b.actividad - a.actividad || b.total - a.total);
}

/** Tareas pendientes que no pertenecen a ningún proyecto. */
export function sueltas(tareas: QuickTask[]): number {
    return tareas.filter((t) => !t.done && extraerEtiquetas(t.text).length === 0).length;
}

/** Centros de un panal (hexágonos con punta arriba) en espiral: centro, anillo 1, anillo 2. */
export function panal(n: number, tam: number): { x: number; y: number }[] {
    const axiales: [number, number][] = [[0, 0]];
    const dirs: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    for (let radio = 1; axiales.length < n; radio++) {
        let q = -radio, r = radio; // empieza abajo a la izquierda
        for (let lado = 0; lado < 6 && axiales.length < n; lado++) {
            for (let paso = 0; paso < radio && axiales.length < n; paso++) {
                axiales.push([q, r]);
                q += dirs[lado][0];
                r += dirs[lado][1];
            }
        }
    }
    return axiales.slice(0, n).map(([q, r]) => ({ x: tam * Math.sqrt(3) * (q + r / 2), y: tam * 1.5 * r }));
}

/** Trazo de un hexágono con punta arriba centrado en (x, y). */
export function trazoHex(x: number, y: number, r: number): string {
    const p = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 180) * (60 * i - 90);
        return `${(x + r * Math.cos(a)).toFixed(2)} ${(y + r * Math.sin(a)).toFixed(2)}`;
    });
    return `M${p.join("L")}Z`;
}
