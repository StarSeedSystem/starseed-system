/**
 * (2026-11-11, MED1111E) La puerta de integración, legible sin adivinar.
 *
 * Las ramas de los agentes llegan a main por un script que el supervisor corre en la Mac
 * (`~/.starseed/opus1031/aplicar-*.py`): fusiona, corre todas las pruebas, el tsc y la comprobación del
 * service worker, y deshace la fusión si algo sale en rojo. Antes su único rastro era un log.
 *
 * Hay dos fuentes, en este orden de preferencia:
 *  1. `~/.starseed/produccion/puerta-estado.json`, que escribe `scripts/puente/puerta_estado.py` en cada
 *     paso (campos fijos: ramas, base, paso, inicio, actualizado, fin, resultado, pruebas, fallo).
 *  2. El `aplicar-*.log` más nuevo, para la puerta que ya está corriendo y no escribe estado.
 *
 * Honestidad: una puerta «en curso» es viva solo si su rastro es reciente (`TOPE_SIN_SENAL_MIN`); si no,
 * se dice «sin señal desde hace N min». Módulo puro: lo importa código de cliente. Nada de rutas ni de
 * salidas completas: solo ids de rama, pasos, cuentas y una frase de fallo recortada.
 */
import { instanteDe } from "./agentes-claude-nube";
import { duracionCorta, limpiarTexto } from "./carril-claude";

/** Un paso de vitest completo puede tardar muchos minutos sin escribir nada: por debajo de esto sigue «corriendo». */
export const TOPE_SIN_SENAL_MIN = 40;

export type PasoPuerta = "esperando" | "integrando" | "pruebas" | "tipos" | "final" | "terminado";
export const PASOS_PUERTA: readonly PasoPuerta[] = ["esperando", "integrando", "pruebas", "tipos", "final", "terminado"];

export const TEXTO_PASO: Record<PasoPuerta, string> = {
    esperando: "esperando un momento seguro",
    integrando: "fusionando las ramas",
    pruebas: "corriendo todas las pruebas",
    tipos: "comprobando tipos (tsc)",
    final: "pruebas de Python y Node y comprobación del service worker",
    terminado: "terminada",
};

export interface PruebasPuerta {
    archivos: number | null;
    pruebas: number | null;
    falladas: number;
    omitidas: number;
}

export interface EstadoPuerta {
    origen: "estado" | "log";
    nombre: string;
    ramas: string[];
    /** Los 10 primeros caracteres del commit de partida. */
    base?: string;
    paso: PasoPuerta;
    inicioMs: number | null;
    /** Última vez que se supo algo de ella; para un paso en marcha, es cuando empezó ese paso. */
    actualizadoMs: number | null;
    finMs: number | null;
    resultado: "en_curso" | "verde" | "rojo";
    pruebas?: PruebasPuerta;
    fallo?: string;
}

const entero = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
};
const ID_RAMA = /^[A-Za-z0-9_./-]{1,80}$/;

function parsearPruebas(p: unknown): PruebasPuerta | undefined {
    if (!p || typeof p !== "object") return undefined;
    const x = p as Record<string, unknown>;
    const r = { archivos: entero(x.archivos), pruebas: entero(x.pruebas), falladas: entero(x.falladas) ?? 0, omitidas: entero(x.omitidas) ?? 0 };
    return r.archivos === null && r.pruebas === null && !r.falladas ? undefined : r;
}

/** PURA. Del `puerta-estado.json` a un estado seguro, o `null` si no es uno. */
export function parsearEstadoPuerta(crudo: unknown): EstadoPuerta | null {
    if (!crudo || typeof crudo !== "object") return null;
    const x = crudo as Record<string, unknown>;
    const paso = PASOS_PUERTA.find((p) => p === x.paso);
    if (!paso) return null;
    const resultado = x.resultado === "verde" || x.resultado === "rojo" ? x.resultado : "en_curso";
    const ramas = (Array.isArray(x.ramas) ? x.ramas : []).filter((r): r is string => typeof r === "string" && ID_RAMA.test(r)).slice(0, 20);
    const t = (v: unknown) => {
        const n = instanteDe(v);
        return Number.isFinite(n) ? n : null;
    };
    const base = typeof x.base === "string" && /^[0-9a-f]{4,40}$/i.test(x.base) ? x.base.slice(0, 10) : undefined;
    const pruebas = parsearPruebas(x.pruebas);
    const fallo = limpiarTexto(x.fallo, 240);
    return {
        origen: "estado",
        nombre: limpiarTexto(x.nombre, 40),
        ramas,
        ...(base ? { base } : {}),
        paso,
        inicioMs: t(x.inicio),
        actualizadoMs: t(x.actualizado),
        finMs: t(x.fin),
        resultado,
        ...(pruebas ? { pruebas } : {}),
        ...(fallo ? { fallo } : {}),
    };
}

/** "Test Files  939 passed (939)" / "Tests  1 failed | 3405 passed | 13 skipped (3406)" → cuentas. */
function cuentasDeVitest(lineas: string): PruebasPuerta {
    const n = (re: RegExp, s: string) => {
        const m = re.exec(s);
        return m ? Number(m[1]) : null;
    };
    const archivos = /Test Files\s+([^'\]]*)/.exec(lineas)?.[1] ?? "";
    const tests = /Tests\s+([^'\]]*)/.exec(lineas)?.[1] ?? "";
    const archivosTotal = n(/\((\d+)\)/, archivos) ?? n(/(\d+) passed/, archivos);
    const pruebasOk = n(/(\d+) passed/, tests);
    return {
        archivos: archivosTotal,
        pruebas: pruebasOk,
        falladas: n(/(\d+) failed/, tests) ?? n(/(\d+) failed/, archivos) ?? 0,
        omitidas: n(/(\d+) skipped/, tests) ?? 0,
    };
}

/**
 * PURA. Del texto de un `aplicar-*.log` a un estado. `mtimeMs` es cuándo se escribió la última línea
 * (para un paso en marcha, el momento en que empezó); `nacimientoMs`, cuándo se creó el archivo (el
 * inicio de la puerta), si el sistema lo sabe. No inventa el paso: lo deduce de la última línea impresa.
 */
export function parsearLogPuerta(texto: string, mtimeMs: number, nombreArchivo = "", nacimientoMs: number | null = null): EstadoPuerta | null {
    const lineas = String(texto ?? "").split(/\r?\n/);
    // Solo cuentan las líneas con la forma que imprime el script (la salida de vitest y tsc también cae en el log).
    const ramas: string[] = [];
    let picks: string[] | null = null;
    let momento = false;
    let oks = 0;
    let vitest: { cod: number; linea: string } | null = null;
    let repeticion: { cod: number; linea: string } | null = null;
    let aviso = false;
    let tsc: { cod: number; linea: string } | null = null;
    let sw: { cod: number } | null = null;
    let arbol = false;
    let rojo: string | null = null;
    let base: string | undefined;
    const otras: { nombre: string; cod: number }[] = [];
    for (const l of lineas) {
        let m: RegExpExecArray | null;
        if ((m = /^picks: \[(.*)\]\s*$/.exec(l))) {
            picks = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).filter((r) => ID_RAMA.test(r));
        } else if (/^momento seguro: /.test(l)) {
            momento = true;
        } else if ((m = /^ok (\S+) ([0-9a-f]{6,40})\s*$/.exec(l))) {
            oks += 1;
            if (ID_RAMA.test(m[1]) && !ramas.includes(m[1])) ramas.push(m[1]);
        } else if ((m = /^vitest (\d+) \[/.exec(l))) {
            vitest = { cod: Number(m[1]), linea: l };
        } else if ((m = /^vitest \(repetición\) (\d+) \[/.exec(l))) {
            repeticion = { cod: Number(m[1]), linea: l };
        } else if (/^vitest: AVISO/.test(l)) {
            aviso = true;
        } else if ((m = /^tsc (\d+)(.*)$/.exec(l))) {
            tsc = { cod: Number(m[1]), linea: m[2] };
        } else if ((m = /^(pytest|node --test) (\d+) \[/.exec(l))) {
            otras.push({ nombre: m[1], cod: Number(m[2]) });
        } else if ((m = /^precarga-sw\.mjs sale (\d+)/.exec(l))) {
            sw = { cod: Number(m[1]) };
        } else if (/^árbol tras el script/.test(l)) {
            arbol = true;
        } else if ((m = /^ROJO \((.*)\): deshecho a ([0-9a-f]{6,40})/.exec(l))) {
            rojo = m[1];
            base = m[2].slice(0, 10);
        }
    }
    // Un log sin ninguna línea del script no es una puerta.
    if (picks === null && !momento && !oks && !vitest && !rojo) return null;
    const ramasFinal = (picks && picks.length ? picks : ramas).slice(0, 20);
    const nombre = limpiarTexto(nombreArchivo.replace(/^aplicar-/, "").replace(/\.log$/, ""), 40);
    const vitestPasado = Boolean(vitest && (vitest.cod === 0 || aviso || (repeticion && repeticion.cod === 0)));
    const total = ramasFinal.length;

    let paso: PasoPuerta;
    if (arbol) paso = "terminado";
    else if (!momento) paso = "esperando";
    else if (!vitest && !(total ? oks >= total : oks > 0)) paso = "integrando";
    else if (!vitestPasado) paso = "pruebas";
    else if (!tsc) paso = "tipos";
    else paso = "final";

    let pruebas: PruebasPuerta | undefined;
    const fuente = repeticion && repeticion.cod === 0 ? vitest : (vitest ?? null);
    if (fuente) pruebas = cuentasDeVitest(fuente.linea);
    if (aviso || (repeticion && repeticion.cod === 0)) {
        // Pasó tras repetir los archivos sueltos: las cuentas de la pasada completa llevan el fallo ya perdonado.
        if (pruebas) pruebas = { ...pruebas, falladas: 0 };
    }

    let resultado: EstadoPuerta["resultado"] = "en_curso";
    let fallo: string | undefined;
    if (rojo !== null) {
        resultado = "rojo";
        paso = rojo.startsWith("cherry-pick") ? "integrando" : rojo === "vitest" ? "pruebas" : rojo === "tsc" ? "tipos" : "final";
        const primero = rojo === "tsc" ? (/[\w./-]+\(\d+,\d+\): error TS\d+/.exec(tsc?.linea ?? "")?.[0] ?? /error TS\d+/.exec(tsc?.linea ?? "")?.[0]) : undefined;
        const archivo = rojo === "vitest" ? /vitest: repito a solas \[([^\]]*)\]/.exec(texto)?.[1] : undefined;
        const conflicto = rojo.startsWith("cherry-pick") ? /CONFLICT[^\n]*/.exec(texto)?.[0] : undefined;
        fallo = limpiarTexto(
            `${rojo === "vitest" ? "pruebas en rojo" : rojo === "tsc" ? "tsc en rojo" : rojo.startsWith("cherry-pick") ? "no se pudo fusionar" : rojo}` +
                `${primero ? `: ${primero}` : archivo ? `: ${archivo.replace(/'/g, "")}` : conflicto ? `: ${conflicto}` : ""} · se deshizo la fusión`,
            240,
        );
    } else if (arbol) {
        const malo = (vitest && !vitestPasado) || (tsc && tsc.cod !== 0) || (sw && sw.cod !== 0) || otras.some((o) => o.cod !== 0);
        resultado = malo ? "rojo" : "verde";
        if (malo) fallo = "el script terminó con una comprobación en rojo";
    }
    const terminada = resultado !== "en_curso";
    return {
        origen: "log",
        nombre,
        ramas: ramasFinal,
        ...(base ? { base } : {}),
        paso,
        inicioMs: nacimientoMs && Number.isFinite(nacimientoMs) && nacimientoMs > 0 ? nacimientoMs : null,
        actualizadoMs: Number.isFinite(mtimeMs) && mtimeMs > 0 ? mtimeMs : null,
        finMs: terminada && Number.isFinite(mtimeMs) && mtimeMs > 0 ? mtimeMs : null,
        resultado,
        ...(pruebas ? { pruebas } : {}),
        ...(fallo ? { fallo } : {}),
    };
}

/** PURA. Elige entre el estado escrito por el script y el que sale del log: gana el de rastro más nuevo. */
export function elegirEstadoPuerta(estado: EstadoPuerta | null, log: EstadoPuerta | null): EstadoPuerta | null {
    if (!estado) return log;
    if (!log) return estado;
    const e = Math.max(estado.actualizadoMs ?? 0, estado.finMs ?? 0);
    const l = Math.max(log.actualizadoMs ?? 0, log.finMs ?? 0);
    // El estado gana también si el log es de hace menos de un minuto de diferencia: es la misma puerta.
    return e >= l - 60_000 ? estado : log;
}

export interface VistaPuerta {
    /** `sin-datos`: no hay ni estado ni log. */
    estado: "corriendo" | "sin-senal" | "verde" | "rojo" | "sin-datos";
    nombre: string;
    ramas: string[];
    paso: PasoPuerta | null;
    pasoTexto: string;
    /** Número de paso para «paso 3 de 5». */
    numeroPaso: number;
    totalPasos: number;
    /** Minutos en el paso actual (solo corriendo) y desde el inicio, si se sabe. */
    minutosEnPaso: number | null;
    minutosTotales: number | null;
    /** Minutos desde el último rastro (corriendo / sin señal) o desde el fin (terminada). */
    haceMin: number | null;
    finMs: number | null;
    pruebas?: PruebasPuerta;
    fallo?: string;
    origen: "estado" | "log" | null;
    texto: string;
}

const PASOS_NUMERADOS: readonly PasoPuerta[] = ["esperando", "integrando", "pruebas", "tipos", "final"];

const resumenRamas = (ramas: string[]): string => {
    const cortas = ramas.map((r) => r.replace(/^opus1106\//, ""));
    return cortas.length <= 4 ? cortas.join(", ") : `${cortas.slice(0, 4).join(", ")} y ${cortas.length - 4} más`;
};

export function textoPruebas(p: PruebasPuerta | undefined): string {
    if (!p || (p.pruebas === null && p.archivos === null)) return "";
    const partes = [p.pruebas !== null ? `${p.pruebas.toLocaleString("es-ES")} pruebas` : "", p.archivos !== null ? `${p.archivos.toLocaleString("es-ES")} archivos` : ""].filter(Boolean);
    return `${partes.join(" en ")}${p.falladas ? ` · ${p.falladas} fallada${p.falladas === 1 ? "" : "s"}` : ""}${p.omitidas ? ` · ${p.omitidas} omitidas` : ""}`;
}

/** PURA. Lo que se enseña de la puerta ahora mismo. */
export function vistaPuerta(e: EstadoPuerta | null | undefined, ahora: number = Date.now()): VistaPuerta {
    const vacio = {
        nombre: "",
        ramas: [] as string[],
        paso: null,
        pasoTexto: "",
        numeroPaso: 0,
        totalPasos: PASOS_NUMERADOS.length,
        minutosEnPaso: null,
        minutosTotales: null,
        haceMin: null,
        finMs: null,
        origen: null,
    };
    if (!e) return { estado: "sin-datos", ...vacio, texto: "no hay rastro de la puerta de integración en esta neurona" };
    const ultimo = e.finMs ?? e.actualizadoMs;
    const haceMin = ultimo === null ? null : Math.max(0, Math.floor((ahora - ultimo) / 60_000));
    const base = {
        nombre: e.nombre,
        ramas: e.ramas,
        paso: e.paso,
        pasoTexto: TEXTO_PASO[e.paso],
        numeroPaso: Math.max(0, PASOS_NUMERADOS.indexOf(e.paso)) + 1,
        totalPasos: PASOS_NUMERADOS.length,
        minutosTotales: e.inicioMs === null ? null : Math.max(0, Math.floor(((e.finMs ?? ahora) - e.inicioMs) / 60_000)),
        haceMin,
        finMs: e.finMs,
        ...(e.pruebas ? { pruebas: e.pruebas } : {}),
        ...(e.fallo ? { fallo: e.fallo } : {}),
        origen: e.origen,
    };
    const quien = e.ramas.length ? resumenRamas(e.ramas) : "sin ramas anotadas";
    if (e.resultado === "verde" || e.resultado === "rojo") {
        const cuando = haceMin === null ? "" : ` hace ${duracionCorta(haceMin)}`;
        const cifras = textoPruebas(e.pruebas);
        return {
            estado: e.resultado,
            ...base,
            minutosEnPaso: null,
            numeroPaso: PASOS_NUMERADOS.length,
            texto:
                e.resultado === "verde"
                    ? `${quien}: en main, todo en verde${cifras ? ` (${cifras})` : ""}${cuando}`
                    : `${quien}: en rojo${e.fallo ? ` — ${e.fallo}` : ""}${cuando}`,
        };
    }
    const sinSenal = haceMin === null || haceMin > TOPE_SIN_SENAL_MIN;
    const enPaso = haceMin;
    if (sinSenal) {
        return {
            estado: "sin-senal",
            ...base,
            minutosEnPaso: null,
            texto: `${quien}: sin señal ${haceMin === null ? "(sin hora)" : `desde hace ${duracionCorta(haceMin)}`}; iba en «${TEXTO_PASO[e.paso]}». Puede haberse cortado`,
        };
    }
    return {
        estado: "corriendo",
        ...base,
        minutosEnPaso: enPaso,
        texto: `${quien}: ${TEXTO_PASO[e.paso]} (paso ${base.numeroPaso} de ${base.totalPasos}) · ${duracionCorta(enPaso ?? 0)} en este paso`,
    };
}
