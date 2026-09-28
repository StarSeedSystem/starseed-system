/**
 * Claves de orden fraccionarias (2026-09-28 · apps en vivo L2: Documento y Presentación).
 *
 * Cada bloque de un documento y cada diapositiva lleva una clave `orden` (texto en base 36, sin
 * ceros al final). Ordenar es comparar cadenas; insertar entre dos elementos es inventar una clave
 * que quede ENTRE las dos, sin tocar a nadie más. Así dos personas pueden insertar a la vez en
 * sitios distintos (o en el mismo) sin pisarse: si dos claves empatan, desempata el id.
 *
 * Una cadena de dígitos base 36 sin ceros finales se lee como una fracción 0,xxxx…: el orden
 * lexicográfico coincide con el numérico y siempre cabe otra clave entre dos distintas.
 * Añadir al final (lo más común al escribir) suma 1 en la cuarta cifra: claves cortas durante
 * cientos de miles de párrafos; insertar en medio parte el hueco por la mitad.
 */

const DIGITOS = "0123456789abcdefghijklmnopqrstuvwxyz";
const BASE = DIGITOS.length;
/** Cifras del «entero» con el que se avanza al añadir al final. */
const CIFRAS_PASO = 4;
const MAX_PASO = BASE ** CIFRAS_PASO;
/** Primera clave de una lista vacía: en medio, para que quepa tanto delante como detrás. */
export const CLAVE_INICIAL = "i";
const RE_CLAVE = /^[0-9a-z]{1,120}$/;

/** ¿Es una clave de orden bien formada? (base 36, sin ceros al final, longitud acotada) */
export function claveValida(k: unknown): k is string {
    return typeof k === "string" && RE_CLAVE.test(k) && !k.endsWith("0");
}

function indice(c: string | undefined): number {
    return c === undefined ? 0 : DIGITOS.indexOf(c);
}

/** Punto medio entre `a` ("" = el principio) y `b` (null = el final). Requiere a < b. */
function puntoMedio(a: string, b: string | null): string {
    if (b !== null) {
        let n = 0;
        while ((a[n] ?? "0") === b[n]) n++;
        if (n > 0) return b.slice(0, n) + puntoMedio(a.slice(n), b.slice(n));
    }
    const da = a ? indice(a[0]) : 0;
    const db = b !== null ? indice(b[0]) : BASE;
    if (db - da > 1) return DIGITOS[Math.round((da + db) / 2)];
    if (b !== null && b.length > 1) return b.slice(0, 1);
    return DIGITOS[da] + puntoMedio(a.slice(1), null);
}

/** La clave siguiente al añadir detrás de `a` (+1 en la cuarta cifra). null si no cabe. */
function siguiente(a: string): string | null {
    const cabeza = a.slice(0, CIFRAS_PASO).padEnd(CIFRAS_PASO, "0");
    let n = 0;
    for (const c of cabeza) n = n * BASE + indice(c);
    n += 1;
    if (n >= MAX_PASO) return null;
    const s = n.toString(BASE).padStart(CIFRAS_PASO, "0").replace(/0+$/, "");
    return s && s > a ? s : null;
}

/**
 * Una clave estrictamente entre `a` y `b` (null = sin límite por ese lado).
 * Tolerante con datos corruptos: si a ≥ b, devuelve una clave detrás de `a` (nunca lanza).
 */
export function claveEntre(a: string | null, b: string | null): string {
    const ia = a && claveValida(a) ? a : "";
    const ib = b && claveValida(b) ? b : null;
    if (ib !== null && ia && ia >= ib) return puntoMedio(ia, null);
    if (ib === null) {
        if (!ia) return CLAVE_INICIAL;
        return siguiente(ia) ?? puntoMedio(ia, null);
    }
    return puntoMedio(ia, ib);
}

/** `n` claves ascendentes entre `a` y `b`, repartidas para que no crezcan de más. */
export function clavesEntre(a: string | null, b: string | null, n: number): string[] {
    if (n <= 0) return [];
    if (b === null) {
        const out: string[] = [];
        let previa = a;
        for (let i = 0; i < n; i++) {
            const k = claveEntre(previa, null);
            out.push(k);
            previa = k;
        }
        return out;
    }
    if (n === 1) return [claveEntre(a, b)];
    const m = claveEntre(a, b);
    // Si los datos venían corruptos (a ≥ b), m cae detrás de a: seguimos en fila detrás de m.
    if (b !== null && m >= b) return [m, ...clavesEntre(m, null, n - 1)];
    const mitad = Math.floor(n / 2);
    return [...clavesEntre(a, m, mitad), m, ...clavesEntre(m, b, n - mitad - 1)];
}

/** Comparador total: por clave de orden y, si empatan, por id (determinista en todos). */
export function compararOrden(x: { orden: string; id: string }, y: { orden: string; id: string }): number {
    if (x.orden !== y.orden) return x.orden < y.orden ? -1 : 1;
    if (x.id !== y.id) return x.id < y.id ? -1 : 1;
    return 0;
}

/**
 * Claves para una secuencia en la que algunos elementos ya tienen clave y otros no (nuevos) o la
 * tienen «fuera de sitio» (empates, datos viejos). Conserva todas las claves que ya respetan el
 * orden estricto y asigna claves nuevas solo a lo que lo necesita.
 * Devuelve id → clave SOLO para los elementos que hay que (re)clavar.
 */
export function clavesParaSecuencia(secuencia: { id: string; orden: string | null }[]): Map<string, string> {
    const asignar = new Map<string, string>();
    let ultima: string | null = null;
    let pendientes: string[] = [];
    const volcar = (hasta: string | null) => {
        if (!pendientes.length) return;
        const claves = clavesEntre(ultima, hasta, pendientes.length);
        pendientes.forEach((id, i) => asignar.set(id, claves[i]));
        ultima = claves[claves.length - 1] ?? ultima;
        pendientes = [];
    };
    for (const el of secuencia) {
        const o = el.orden && claveValida(el.orden) ? el.orden : null;
        // Una clave vale si queda detrás de la última fija y deja sitio a los pendientes.
        const cabeDelante = o !== null && (ultima === null || o > ultima) && (!pendientes.length || claveEntre(ultima, o) < o);
        if (cabeDelante) {
            volcar(o);
            ultima = o;
        } else {
            pendientes.push(el.id);
        }
    }
    volcar(null);
    return asignar;
}
