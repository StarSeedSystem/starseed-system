/**
 * El REGISTRO compartido: validar lo que llega, reconstruir el estado repitiendo el diario y
 * FUSIONAR dos versiones sin que nadie pierda su trabajo ni la sala se parta en dos realidades.
 *
 * Reglas (todas deterministas: todos los dispositivos llegan al mismo resultado fusionen en el
 * orden que fusionen):
 *   1. El diario es una cadena `n = 0, 1, 2…` sin huecos; cada entrada tiene que ser válida para
 *      las reglas del motor en el estado al que se aplica. Al reconstruir, la cadena SE CORTA en
 *      la primera entrada inválida (todo lo posterior es de una rama que ya no existe).
 *   2. Si dos entradas distintas compiten por el mismo `n`, gana la aceptada por el motor con
 *      menor `(t, u, k, id)`. La perdedora se devuelve como «descartada» para que su autora
 *      pueda volver a intentarla encima del resultado.
 *   3. Entre dos registros distintos gana el de mayor `gen`; a igual `gen`, el más antiguo y, si
 *      aun así empatan, el de menor id. Con el mismo id y `gen`, se fusionan los diarios.
 *   4. El historial se une por id; los extras (p. ej. el dibujo) los gana la versión mayor.
 *
 * Módulo PURO.
 */
import {
    LIMITE_HISTORIAL,
    type Datos,
    type DocSala,
    type Entrada,
    type Extra,
    type Json,
    type Motor,
    type MotorCualquiera,
    type Registro,
    type ResumenPartida,
} from "./tipos";

/** Tope de entradas de un diario: una sala no puede tumbar el móvil más modesto. */
export const LIMITE_ENTRADAS = 4000;
/** Tope de tamaño (JSON) de los datos de una entrada. */
export const LIMITE_DATOS_ENTRADA = 24_000;

export type BuscarMotor = (tipo: string) => MotorCualquiera | null;

// ───────────────────────────── Validación de lo que llega ─────────────────────────────

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** ¿Es JSON plano y de tamaño razonable? (sin funciones, sin ciclos, sin undefined) */
export function esJsonPlano(v: unknown, profundidad = 0): v is Json {
    if (profundidad > 12) return false;
    if (v === null) return true;
    const t = typeof v;
    if (t === "string" || t === "boolean") return true;
    if (t === "number") return Number.isFinite(v as number);
    if (Array.isArray(v)) return v.every((x) => esJsonPlano(x, profundidad + 1));
    if (esObjeto(v)) return Object.values(v).every((x) => esJsonPlano(x, profundidad + 1));
    return false;
}

/** Entrada bien formada, o null. NO comprueba las reglas del juego (eso es del motor). */
export function sanearEntrada(x: unknown): Entrada | null {
    if (!esObjeto(x)) return null;
    const { id, n, u, t, k, d } = x;
    if (typeof id !== "string" || id.length === 0 || id.length > 48) return null;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > LIMITE_ENTRADAS) return null;
    if (typeof u !== "string" || u.length === 0 || u.length > 80) return null;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) return null;
    if (typeof k !== "string" || k.length === 0 || k.length > 40) return null;
    if (d !== undefined) {
        if (!esObjeto(d) || !esJsonPlano(d)) return null;
        if (JSON.stringify(d).length > LIMITE_DATOS_ENTRADA) return null;
    }
    const out: Entrada = { id, n, u, t, k };
    if (d !== undefined) out.d = d as Datos;
    return out;
}

/** Registro bien formado (con el diario depurado), o null. */
export function sanearRegistro(x: unknown): Registro | null {
    if (!esObjeto(x)) return null;
    const { id, tipo, gen, creada, base, log, continuidad } = x;
    if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
    if (typeof tipo !== "string" || tipo.length === 0 || tipo.length > 40) return null;
    if (typeof gen !== "number" || !Number.isInteger(gen) || gen < 0) return null;
    if (!esObjeto(base) || !esJsonPlano(base)) return null;
    if (!Array.isArray(log) || log.length > LIMITE_ENTRADAS) return null;
    const entradas: Entrada[] = [];
    for (const e of log) {
        const s = sanearEntrada(e);
        if (!s) break; // una entrada rota corta la cadena: lo posterior no es alcanzable
        entradas.push(s);
    }
    const out: Registro = {
        id,
        tipo,
        gen,
        creada: typeof creada === "number" && Number.isFinite(creada) ? creada : 0,
        base: base as Datos,
        log: entradas,
    };
    if (continuidad === true) out.continuidad = true;
    return out;
}

function sanearResumen(x: unknown): ResumenPartida | null {
    if (!esObjeto(x)) return null;
    if (typeof x.id !== "string" || typeof x.juego !== "string" || typeof x.gen !== "number" || typeof x.t !== "number") return null;
    if (!Array.isArray(x.nombres) || !Array.isArray(x.uids)) return null;
    return {
        id: x.id,
        juego: x.juego,
        gen: x.gen,
        t: x.t,
        nombres: x.nombres.map((n) => String(n).slice(0, 40)),
        uids: x.uids.map((n) => String(n).slice(0, 80)),
        ganador: typeof x.ganador === "number" ? x.ganador : null,
        motivo: typeof x.motivo === "string" ? x.motivo.slice(0, 80) : "",
        ...(Array.isArray(x.puntos) ? { puntos: x.puntos.filter((p): p is number => typeof p === "number") } : {}),
    };
}

/** Un documento de sala leído de la base (no fiable): lo deja limpio, o null si no es de una sala viva. */
export function sanearDoc(x: unknown): DocSala | null {
    if (!esObjeto(x)) return null;
    const vivo = esObjeto(x.vivo) ? x.vivo.tipo : null;
    if (vivo !== "juego" && vivo !== "programa") return null;
    const historial = Array.isArray(x.historial)
        ? x.historial.map(sanearResumen).filter((r): r is ResumenPartida => r !== null)
        : [];
    const extras: Record<string, Extra> = {};
    if (esObjeto(x.extras)) {
        for (const [clave, val] of Object.entries(x.extras)) {
            if (!esObjeto(val) || typeof val.v !== "number" || !esJsonPlano(val.d)) continue;
            extras[clave.slice(0, 40)] = { v: val.v, d: val.d as Json };
        }
    }
    return {
        v: 1,
        vivo: { tipo: vivo },
        registro: sanearRegistro(x.registro),
        historial: historial.slice(-LIMITE_HISTORIAL),
        extras,
    };
}

export function docVacio(tipo: "juego" | "programa"): DocSala {
    return { v: 1, vivo: { tipo }, registro: null, historial: [], extras: {} };
}

// ───────────────────────────── Reconstruir ─────────────────────────────

export interface Reconstruccion<E> {
    estado: E;
    /** El diario válido: la cadena cortada en la primera entrada que las reglas no aceptan. */
    log: Entrada[];
    /** Cuántas entradas se descartaron por inválidas (o por venir después de una inválida). */
    descartadas: number;
    /** Motivo de la primera rechazada, para poder explicarlo. */
    motivo: string | null;
}

/** Repite el diario con las reglas del motor. Determinista. */
export function reconstruir<E>(motor: Motor<E>, registro: Registro): Reconstruccion<E> {
    let estado = motor.inicial(registro.base);
    const log: Entrada[] = [];
    let motivo: string | null = null;
    for (let i = 0; i < registro.log.length; i++) {
        const entrada = registro.log[i];
        if (entrada.n !== i) {
            motivo = "Diario con un hueco.";
            break;
        }
        const r = motor.aplicar(estado, entrada);
        if (!r.ok) {
            motivo = r.motivo;
            break;
        }
        estado = r.estado;
        log.push(entrada);
    }
    return { estado, log, descartadas: registro.log.length - log.length, motivo };
}

// ───────────────────────────── Fusionar ─────────────────────────────

/** Orden total y determinista entre entradas que compiten por el mismo `n`. */
export function compararEntradas(a: Entrada, b: Entrada): number {
    if (a.t !== b.t) return a.t - b.t;
    if (a.u !== b.u) return a.u < b.u ? -1 : 1;
    if (a.k !== b.k) return a.k < b.k ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
}

export interface LogFusionado {
    log: Entrada[];
    /** Entradas de cualquiera de los dos diarios que no entraron en la cadena resultante. */
    descartadas: Entrada[];
}

/**
 * Fusiona dos o más diarios del MISMO registro. El resultado es la cadena más larga que el motor
 * acepta, escogiendo en cada posición la candidata aceptada de menor orden.
 */
export function fusionarLogs<E>(motor: Motor<E>, base: Datos, ...diarios: Entrada[][]): LogFusionado {
    const porN = new Map<number, Entrada[]>();
    const vistas = new Set<string>();
    const todas: Entrada[] = [];
    for (const diario of diarios) {
        for (const e of diario) {
            if (vistas.has(e.id)) continue;
            vistas.add(e.id);
            todas.push(e);
            const lista = porN.get(e.n);
            if (lista) lista.push(e);
            else porN.set(e.n, [e]);
        }
    }
    let estado = motor.inicial(base);
    const log: Entrada[] = [];
    for (let n = 0; n <= LIMITE_ENTRADAS; n++) {
        const candidatas = porN.get(n);
        if (!candidatas) break;
        candidatas.sort(compararEntradas);
        let elegida: Entrada | null = null;
        for (const c of candidatas) {
            const r = motor.aplicar(estado, c);
            if (r.ok) {
                elegida = c;
                estado = r.estado;
                break;
            }
        }
        if (!elegida) break;
        log.push(elegida);
    }
    const dentro = new Set(log.map((e) => e.id));
    return { log, descartadas: todas.filter((e) => !dentro.has(e.id)) };
}

/** ¿Cuál de dos registros DISTINTOS gana? (mayor gen; luego el más antiguo; luego menor id). */
export function ganaRegistro(a: Registro, b: Registro): boolean {
    if (a.gen !== b.gen) return a.gen > b.gen;
    if (a.creada !== b.creada) return a.creada < b.creada;
    return a.id <= b.id;
}

/** Fusiona dos versiones del registro de una sala. */
export function fusionarRegistros(
    buscarMotor: BuscarMotor,
    a: Registro | null,
    b: Registro | null,
): { registro: Registro | null; descartadas: Entrada[] } {
    if (!a) return { registro: b, descartadas: [] };
    if (!b) return { registro: a, descartadas: [] };
    if (a.id !== b.id || a.gen !== b.gen) {
        return { registro: ganaRegistro(a, b) ? a : b, descartadas: [] };
    }
    const motor = buscarMotor(a.tipo);
    if (!motor) return { registro: a, descartadas: [] };
    const { log, descartadas } = fusionarLogs(motor, a.base, a.log, b.log);
    return { registro: { ...a, log }, descartadas };
}

function unirHistorial(a: ResumenPartida[], b: ResumenPartida[]): ResumenPartida[] {
    const porId = new Map<string, ResumenPartida>();
    for (const r of [...a, ...b]) if (!porId.has(r.id)) porId.set(r.id, r);
    return [...porId.values()].sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : 1)).slice(-LIMITE_HISTORIAL);
}

/** Fusiona dos documentos de sala (el guardado y el local). */
export function fusionarDocs(
    buscarMotor: BuscarMotor,
    a: DocSala | null,
    b: DocSala | null,
): { doc: DocSala | null; descartadas: Entrada[] } {
    if (!a) return { doc: b, descartadas: [] };
    if (!b) return { doc: a, descartadas: [] };
    const { registro, descartadas } = fusionarRegistros(buscarMotor, a.registro, b.registro);
    const extras: Record<string, Extra> = { ...a.extras };
    for (const [clave, val] of Object.entries(b.extras)) {
        const actual = extras[clave];
        if (!actual || val.v > actual.v) extras[clave] = val;
    }
    return {
        doc: {
            v: 1,
            vivo: a.vivo,
            registro,
            historial: unirHistorial(a.historial, b.historial),
            extras,
        },
        descartadas,
    };
}

/** Deja un registro con el diario validado por el motor (corta lo que las reglas no aceptan). */
export function validarRegistro<E>(motor: Motor<E>, registro: Registro): { registro: Registro; estado: E; descartadas: number } {
    const r = reconstruir(motor, registro);
    return {
        registro: r.descartadas === 0 ? registro : { ...registro, log: r.log },
        estado: r.estado,
        descartadas: r.descartadas,
    };
}
