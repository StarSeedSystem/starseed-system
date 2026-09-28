/**
 * Lecturas derivadas del estado de un programa: totales, resultados, columnas… Las usan el motor
 * (para validar) y la interfaz (para pintar), así que una sola definición decide qué es «el
 * total» o «quién ha votado». Funciones puras.
 */
import { limpiarLinea, limpiarParrafo } from "./esquema";
import {
    LIM,
    type BloqueContador,
    type BloqueEncuesta,
    type BloqueFormulario,
    type BloqueKanban,
    type DatosBloque,
    type Respuesta,
    type Tarjeta,
} from "./tipos";

type DatosDe<T extends DatosBloque["tipo"]> = Extract<DatosBloque, { tipo: T }>;

export function datosDeTipo<T extends DatosBloque["tipo"]>(datos: DatosBloque | undefined, tipo: T): DatosDe<T> | null {
    return datos && datos.tipo === tipo ? (datos as DatosDe<T>) : null;
}

// ───────────────────────────── Contador ─────────────────────────────

export function totalContador(b: BloqueContador, aportes: Record<string, number>): number {
    let suma = 0;
    for (const n of Object.values(aportes)) suma += n;
    return b.inicial + suma * b.paso;
}

export function aporteDe(aportes: Record<string, number>, uid: string | null): number {
    return uid ? (aportes[uid] ?? 0) : 0;
}

/** ¿Puede esta persona dar un paso en `dir` (+1 / -1)? Devuelve el motivo si no. */
export function comprobarPasoContador(
    b: BloqueContador,
    aportes: Record<string, number>,
    uid: string,
    dir: 1 | -1,
): { ok: true; aporte: number } | { ok: false; motivo: string } {
    const actual = aporteDe(aportes, uid);
    const nuevo = actual + dir;
    if (b.porPersona !== null) {
        if (nuevo < 0) return { ok: false, motivo: "Aún no has aportado nada que quitar." };
        if (nuevo > b.porPersona) {
            return { ok: false, motivo: b.porPersona === 1 ? "Ya has sumado tu voto." : `Solo puedes aportar hasta ${b.porPersona}.` };
        }
    }
    if (actual === 0 && nuevo !== 0 && Object.keys(aportes).length >= LIM.aportantes) {
        return { ok: false, motivo: "El contador ya tiene demasiadas personas." };
    }
    const total = totalContador(b, aportes) + dir * b.paso;
    if (b.min !== null && total < b.min) return { ok: false, motivo: "Ya está en el mínimo." };
    if (b.max !== null && total > b.max) return { ok: false, motivo: "Ya está en el máximo." };
    if (Math.abs(total) > LIM.contadorTope) return { ok: false, motivo: "El número es demasiado grande." };
    return { ok: true, aporte: nuevo };
}

// ───────────────────────────── Encuesta ─────────────────────────────

export interface ResultadoOpcion {
    id: string;
    texto: string;
    votos: number;
    /** 0–100, redondeado. */
    porcentaje: number;
    mia: boolean;
}

export interface ResultadosEncuesta {
    /** Personas que han votado. */
    votantes: number;
    /** Votos emitidos (con elección múltiple puede superar a los votantes). */
    votosTotales: number;
    opciones: ResultadoOpcion[];
    /** Opciones más votadas (varias si hay empate y hay algún voto). */
    ganadoras: string[];
}

export function resultadosEncuesta(b: BloqueEncuesta, votos: Record<string, string[]>, uid: string | null): ResultadosEncuesta {
    const cuenta = new Map<string, number>();
    for (const o of b.opciones) cuenta.set(o.id, 0);
    let votosTotales = 0;
    const votantes = Object.keys(votos).length;
    for (const lista of Object.values(votos)) {
        for (const o of lista) {
            if (cuenta.has(o)) {
                cuenta.set(o, (cuenta.get(o) ?? 0) + 1);
                votosTotales += 1;
            }
        }
    }
    const mios = new Set(uid ? (votos[uid] ?? []) : []);
    const maximo = Math.max(0, ...cuenta.values());
    return {
        votantes,
        votosTotales,
        opciones: b.opciones.map((o) => {
            const v = cuenta.get(o.id) ?? 0;
            return { id: o.id, texto: o.texto, votos: v, porcentaje: votantes === 0 ? 0 : Math.round((v / votantes) * 100), mia: mios.has(o.id) };
        }),
        ganadoras: maximo === 0 ? [] : b.opciones.filter((o) => cuenta.get(o.id) === maximo).map((o) => o.id),
    };
}

// ───────────────────────────── Kanban ─────────────────────────────

export interface ColumnaConTarjetas {
    id: string;
    titulo: string;
    tarjetas: Tarjeta[];
}

export function columnasKanban(b: BloqueKanban, tarjetas: Tarjeta[]): ColumnaConTarjetas[] {
    return b.columnas.map((c) => ({ id: c.id, titulo: c.titulo, tarjetas: tarjetas.filter((t) => t.col === c.id) }));
}

// ───────────────────────────── Formulario ─────────────────────────────

export function respuestaDe(respuestas: Respuesta[], uid: string | null): Respuesta | null {
    return uid ? (respuestas.find((r) => r.uid === uid) ?? null) : null;
}

export function plazasLibres(b: BloqueFormulario, respuestas: Respuesta[]): number | null {
    return b.cupo === null ? null : Math.max(0, b.cupo - respuestas.length);
}

export type ResultadoValidacion = { ok: true; v: Respuesta["v"] } | { ok: false; motivo: string; campo?: string };

/** Valida y normaliza lo que se envía a un formulario, campo a campo. */
export function validarRespuesta(b: BloqueFormulario, bruto: unknown): ResultadoValidacion {
    const entrada = typeof bruto === "object" && bruto !== null && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {};
    const v: Respuesta["v"] = {};
    for (const c of b.campos) {
        const x = entrada[c.id];
        switch (c.tipo) {
            case "texto":
            case "largo": {
                const s = c.tipo === "texto" ? limpiarLinea(x, LIM.valorCorto) : limpiarParrafo(x, LIM.valorLargo);
                if (s) v[c.id] = s;
                else if (c.obligatorio) return { ok: false, motivo: `Falta «${c.etiqueta}».`, campo: c.id };
                break;
            }
            case "numero": {
                const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x.trim().replace(",", ".")) : null;
                if (n !== null && Number.isFinite(n) && Math.abs(n) <= 1e12) v[c.id] = n;
                else if (n !== null && x !== "") return { ok: false, motivo: `«${c.etiqueta}» debe ser un número.`, campo: c.id };
                else if (c.obligatorio) return { ok: false, motivo: `Falta «${c.etiqueta}».`, campo: c.id };
                break;
            }
            case "opcion": {
                if (typeof x === "string" && x && (c.opciones ?? []).includes(x)) v[c.id] = x;
                else if (x !== undefined && x !== "" && x !== null) return { ok: false, motivo: `Elige una opción válida en «${c.etiqueta}».`, campo: c.id };
                else if (c.obligatorio) return { ok: false, motivo: `Elige una opción en «${c.etiqueta}».`, campo: c.id };
                break;
            }
            case "casilla": {
                const marcada = x === true;
                if (marcada) v[c.id] = true;
                else if (c.obligatorio) return { ok: false, motivo: `Tienes que marcar «${c.etiqueta}».`, campo: c.id };
                break;
            }
        }
    }
    return { ok: true, v };
}
