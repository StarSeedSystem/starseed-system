/**
 * Asignaciones «dónde se guarda / dónde se procesa» por elemento, topologías y tamaños confirmados
 * (SOP `architecture/recursos-ia-neurona.md` §1.5 y §3).
 *
 * PURO salvo `leerEstado`/`guardarEstado` (localStorage con try/catch). El estado viaja con la cuenta
 * (`starseed.recursos-ia.v1` en `SYNCED_KEYS`), así que lo que llega puede venir de otro medio, de
 * otra versión o roto: todo se valida al escribir (`asignar`, `fijarTopologia`…) y al leer
 * (`normalizarEstado`). Una escritura inválida devuelve el MISMO estado (no cambia nada).
 */
import {
    CLAVE_RECURSOS_IA,
    EVENTO_RECURSOS_IA,
    NOMBRE_TOPOLOGIA,
    VIAS,
    type Alcance,
    type Asignacion,
    type ConfigTopologia,
    type ElementoRef,
    type EstadoRecursosIa,
    type MedioAlmacen,
    type TipoAlmacen,
    type TipoElemento,
    type Topologia,
    type Via,
} from "./tipos";

export function estadoVacio(): EstadoRecursosIa {
    return { v: 1, asignaciones: {}, topologias: {}, tamanosConfirmados: {}, almacenesDeclarados: [] };
}

export function claveElemento(tipo: TipoElemento, id: string): string {
    return `${tipo}:${id}`;
}

export function claveAlcance(a: Alcance): string {
    return `${a.tipo}:${a.id}`;
}

/* ───────────────────────────── Validación (PURA) ───────────────────────────── */

const TIPOS_ELEMENTO = new Set<string>(["modelo", "archivo", "carpeta", "memoria"]);
const TIPOS_ALCANCE = new Set<string>(["perfil", "grupo", "comunidad", "pagina"]);
const TIPOS_ALMACEN = new Set<string>([
    "neurona-local",
    "navegador",
    "biblioteca",
    "carpeta-cerebro",
    "disco-externo",
    "servidor-externo",
    "nube",
] satisfies TipoAlmacen[]);
const TOPOLOGIAS = new Set<string>(Object.keys(NOMBRE_TOPOLOGIA));
const VIAS_VALIDAS = new Set<string>(VIAS);

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const textoNoVacio = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";

export function alcanceValido(a: unknown): a is Alcance {
    return (
        esObjeto(a) &&
        TIPOS_ALCANCE.has(String(a.tipo)) &&
        textoNoVacio(a.id) &&
        (a.visibilidad === "privada" || a.visibilidad === "publica")
    );
}

/** ¿Tiene lo mínimo para guardarse? tipo e id del elemento, medio, instante y alcance. PURA. */
export function asignacionValida(a: unknown): a is Asignacion {
    if (!esObjeto(a) || !esObjeto(a.elemento)) return false;
    const el = a.elemento;
    return (
        TIPOS_ELEMENTO.has(String(el.tipo)) &&
        textoNoVacio(el.id) &&
        textoNoVacio(a.almacenEn) &&
        (a.procesaEn === undefined || typeof a.procesaEn === "string") &&
        typeof a.t === "number" &&
        Number.isFinite(a.t) &&
        alcanceValido(a.alcance)
    );
}

/** Copia limpia de una asignación ya validada (sin campos extraños; nombre por defecto = id). */
function limpiarAsignacion(a: Asignacion): Asignacion {
    const el = a.elemento;
    const elemento: ElementoRef = {
        tipo: el.tipo,
        id: el.id,
        nombre: typeof el.nombre === "string" && el.nombre ? el.nombre : el.id,
        ...(typeof el.tamanoGb === "number" && Number.isFinite(el.tamanoGb) && el.tamanoGb >= 0 ? { tamanoGb: el.tamanoGb } : {}),
        ...(textoNoVacio(el.padreId) ? { padreId: el.padreId } : {}),
    };
    return {
        elemento,
        almacenEn: a.almacenEn,
        ...(textoNoVacio(a.procesaEn) ? { procesaEn: a.procesaEn } : {}),
        ...(Array.isArray(a.replicas) ? { replicas: a.replicas.filter(textoNoVacio) } : {}),
        alcance: { tipo: a.alcance.tipo, id: a.alcance.id, visibilidad: a.alcance.visibilidad },
        t: a.t,
        ...(textoNoVacio(a.quien) ? { quien: a.quien } : {}),
    };
}

function topologiaValida(c: unknown): c is ConfigTopologia {
    return esObjeto(c) && TOPOLOGIAS.has(String(c.topologia)) && alcanceValido(c.alcance);
}

function limpiarTopologia(c: ConfigTopologia): ConfigTopologia {
    const vias = Array.isArray(c.vias) ? (c.vias.filter((v) => VIAS_VALIDAS.has(String(v))) as Via[]) : [];
    return {
        ...c,
        topologia: c.topologia as Topologia,
        vias: vias.length ? vias : ["local", "malla-local", "red-starseed"],
        alcance: { tipo: c.alcance.tipo, id: c.alcance.id, visibilidad: c.alcance.visibilidad },
    };
}

function almacenValido(m: unknown): m is MedioAlmacen {
    return esObjeto(m) && textoNoVacio(m.id) && TIPOS_ALMACEN.has(String(m.tipo)) && VIAS_VALIDAS.has(String(m.via));
}

function limpiarAlmacen(m: MedioAlmacen): MedioAlmacen {
    return {
        ...m,
        etiqueta: typeof m.etiqueta === "string" && m.etiqueta ? m.etiqueta : m.id,
        persistente: m.persistente !== false,
        privado: m.privado !== false,
        disponible: m.disponible !== false,
        fuente: "declarado",
    };
}

/* ───────────────────────────── Escritura (PURA) ───────────────────────────── */

/** Guarda la asignación del elemento. Inválida (sin tipo/id, medio, `t` o alcance) → no cambia nada. */
export function asignar(e: EstadoRecursosIa, a: Asignacion): EstadoRecursosIa {
    if (!asignacionValida(a)) return e;
    const limpia = limpiarAsignacion(a);
    return { ...e, asignaciones: { ...e.asignaciones, [claveElemento(limpia.elemento.tipo, limpia.elemento.id)]: limpia } };
}

export function quitarAsignacion(e: EstadoRecursosIa, tipo: TipoElemento, id: string): EstadoRecursosIa {
    const clave = claveElemento(tipo, id);
    if (!(clave in e.asignaciones)) return e;
    const asignaciones = { ...e.asignaciones };
    delete asignaciones[clave];
    return { ...e, asignaciones };
}

const util = (x: string | undefined): x is string => typeof x === "string" && x !== "" && x !== "auto";

/**
 * Cadena de carpetas de un elemento cuando no se dan `padres`: se sube por `padreId` usando lo que
 * guardaron las asignaciones de esas carpetas (cada una recuerda su propio `padreId`). Con tope y
 * sin ciclos: un estado que llega de otro medio podría tenerlos.
 */
function cadenaDePadres(e: EstadoRecursosIa, elemento: ElementoRef): ElementoRef[] {
    const out: ElementoRef[] = [];
    const vistos = new Set<string>([claveElemento(elemento.tipo, elemento.id)]);
    let padreId = elemento.padreId;
    while (textoNoVacio(padreId) && out.length < 32) {
        const clave = claveElemento("carpeta", padreId);
        if (vistos.has(clave)) break;
        vistos.add(clave);
        const guardada = e.asignaciones[clave];
        out.push(guardada?.elemento ?? { tipo: "carpeta", id: padreId, nombre: padreId });
        padreId = guardada?.elemento.padreId;
    }
    return out;
}

/**
 * El medio efectivo de un elemento: el suyo, o el de la carpeta más cercana que tenga uno (en
 * `padres` el primero es el padre directo), o "auto". `heredadaDe` = id de la carpeta de la que
 * viene el almacén. El procesador se resuelve igual, por separado (un modelo puede fijar dónde se
 * procesa y heredar dónde se guarda).
 */
export function resolverAsignacion(
    e: EstadoRecursosIa,
    elemento: ElementoRef,
    padres: ElementoRef[] = [],
): { almacenEn: string; procesaEn?: string; heredadaDe?: string } {
    const propia = e.asignaciones[claveElemento(elemento.tipo, elemento.id)];
    let almacenEn = util(propia?.almacenEn) ? propia.almacenEn : undefined;
    let procesaEn = util(propia?.procesaEn) ? propia.procesaEn : undefined;
    let heredadaDe: string | undefined;
    const cadena = padres.length ? padres : cadenaDePadres(e, elemento);
    for (const p of cadena) {
        if (almacenEn && procesaEn) break;
        if (!p || !textoNoVacio(p.id)) continue;
        const a = e.asignaciones[claveElemento(p.tipo, p.id)];
        if (!a) continue;
        if (!almacenEn && util(a.almacenEn)) {
            almacenEn = a.almacenEn;
            heredadaDe = p.id;
        }
        if (!procesaEn && util(a.procesaEn)) procesaEn = a.procesaEn;
    }
    // Un «auto» explícito del propio elemento se conserva si nadie fija el procesador.
    const procesa = procesaEn ?? (propia?.procesaEn === "auto" ? "auto" : undefined);
    return {
        almacenEn: almacenEn ?? "auto",
        ...(procesa ? { procesaEn: procesa } : {}),
        ...(heredadaDe ? { heredadaDe } : {}),
    };
}

export function fijarTopologia(e: EstadoRecursosIa, c: ConfigTopologia): EstadoRecursosIa {
    if (!topologiaValida(c)) return e;
    const limpia = limpiarTopologia(c);
    return { ...e, topologias: { ...e.topologias, [claveAlcance(limpia.alcance)]: limpia } };
}

/** Tamaño que la persona confirmó para un modelo (regla: preguntar antes de asumir). Inválido → no cambia. */
export function confirmarTamano(e: EstadoRecursosIa, modeloId: string, gb: number): EstadoRecursosIa {
    if (!textoNoVacio(modeloId) || typeof gb !== "number" || !Number.isFinite(gb) || gb <= 0) return e;
    return { ...e, tamanosConfirmados: { ...e.tamanosConfirmados, [modeloId]: gb } };
}

export function declararAlmacen(e: EstadoRecursosIa, m: MedioAlmacen): EstadoRecursosIa {
    if (!almacenValido(m)) return e;
    const limpio = limpiarAlmacen(m);
    return { ...e, almacenesDeclarados: [...e.almacenesDeclarados.filter((x) => x.id !== limpio.id), limpio] };
}

/* ───────────────────────────── Lectura ───────────────────────────── */

/**
 * Cualquier cosa → estado válido. JSON roto o con otra forma → lo que se pueda salvar; otra versión
 * (`v` ≠ 1) → vacío: no se adivina la forma de un esquema que este código no conoce. PURA.
 */
export function normalizarEstado(x: unknown): EstadoRecursosIa {
    const out = estadoVacio();
    if (!esObjeto(x)) return out;
    if (x.v !== undefined && x.v !== 1) return out;
    if (esObjeto(x.asignaciones)) {
        for (const a of Object.values(x.asignaciones)) {
            if (!asignacionValida(a)) continue;
            const limpia = limpiarAsignacion(a);
            out.asignaciones[claveElemento(limpia.elemento.tipo, limpia.elemento.id)] = limpia;
        }
    }
    if (esObjeto(x.topologias)) {
        for (const c of Object.values(x.topologias)) {
            if (!topologiaValida(c)) continue;
            const limpia = limpiarTopologia(c);
            out.topologias[claveAlcance(limpia.alcance)] = limpia;
        }
    }
    if (esObjeto(x.tamanosConfirmados)) {
        for (const [k, gb] of Object.entries(x.tamanosConfirmados)) {
            if (textoNoVacio(k) && typeof gb === "number" && Number.isFinite(gb) && gb > 0) out.tamanosConfirmados[k] = gb;
        }
    }
    if (Array.isArray(x.almacenesDeclarados)) {
        const vistos = new Map<string, MedioAlmacen>();
        for (const m of x.almacenesDeclarados) if (almacenValido(m)) vistos.set(m.id, limpiarAlmacen(m));
        out.almacenesDeclarados = [...vistos.values()];
    }
    return out;
}

export function leerEstado(): EstadoRecursosIa {
    try {
        const crudo = typeof window === "undefined" ? null : window.localStorage.getItem(CLAVE_RECURSOS_IA);
        return crudo ? normalizarEstado(JSON.parse(crudo)) : estadoVacio();
    } catch {
        return estadoVacio();
    }
}

export function guardarEstado(e: EstadoRecursosIa): void {
    try {
        window.localStorage.setItem(CLAVE_RECURSOS_IA, JSON.stringify(e));
        window.dispatchEvent(new CustomEvent(EVENTO_RECURSOS_IA));
    } catch {
        // sin almacenamiento del navegador: la asignación vive solo esta sesión
    }
}
