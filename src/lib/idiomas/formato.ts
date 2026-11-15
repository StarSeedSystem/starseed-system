/**
 * IDI1115N · Formato de textos con valores, plurales, números y fechas (`Intl`).
 * Las claves del catálogo son el texto español; las que llevan valores usan {0}, {1}…
 * Una traducción puede usar, además de {0}:
 *   {0, number}                      → número con `Intl.NumberFormat`
 *   {0, date}  /  {0, date, short}   → fecha (ms, ISO o Date) con `Intl.DateTimeFormat`
 *   {0, plural, one {# libro} other {# libros}}  → categoría de `Intl.PluralRules` (# = el número)
 * Módulo PURO.
 */

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const tieneValores = (clave: string): boolean => /\{\d+\}/.test(clave);

export interface Patron { clave: string; re: RegExp; literales: number }

/** Compila una clave con {n} a un patrón anclado que captura cada valor. Los índices van en orden. */
export function compilarPatron(clave: string): Patron {
    let literales = 0;
    const partes = clave.split(/(\{\d+\})/);
    const fuente = partes.map((p) => {
        if (/^\{\d+\}$/.test(p)) return "([\\s\\S]+?)";
        literales += p.length;
        return escapar(p);
    }).join("");
    return { clave, re: new RegExp(`^${fuente}$`), literales };
}

/** Valores capturados por el patrón, indexados por el número de su {n} en la clave. */
export function valoresDe(patron: Patron, texto: string): string[] | null {
    const m = patron.re.exec(texto);
    if (!m) return null;
    const orden = [...patron.clave.matchAll(/\{(\d+)\}/g)].map((x) => Number(x[1]));
    const salida: string[] = [];
    orden.forEach((n, i) => { salida[n] = m[i + 1]; });
    return salida;
}

const aNumero = (v: string | undefined): number | null => {
    if (v === undefined) return null;
    const t = v.trim().replace(/\s/g, "");
    if (/^-?\d+$/.test(t)) return Number(t);
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
    if (/^-?\d+[.,]\d+$/.test(t)) return Number(t.replace(",", "."));
    return null;
};

/** Cuerpo entre llaves balanceadas desde `i` (que apunta a «{»); devuelve [contenido, índice tras «}»]. */
function bloque(s: string, i: number): [string, number] | null {
    let nivel = 0;
    for (let j = i; j < s.length; j++) {
        if (s[j] === "{") nivel++;
        else if (s[j] === "}" && --nivel === 0) return [s.slice(i + 1, j), j + 1];
    }
    return null;
}

/** Aplica una traducción con {n}, {n, number|date|plural,…} a los valores capturados. */
export function formatear(plantilla: string, valores: string[], idioma: string): string {
    let salida = "";
    for (let i = 0; i < plantilla.length;) {
        if (plantilla[i] !== "{") { salida += plantilla[i++]; continue; }
        const b = bloque(plantilla, i);
        if (!b) { salida += plantilla[i++]; continue; }
        const [cuerpo, siguiente] = b;
        i = siguiente;
        const m = /^\s*(\d+)\s*(?:,\s*(number|date|plural)\s*(?:,\s*([\s\S]*))?)?$/.exec(cuerpo);
        if (!m) { salida += `{${cuerpo}}`; continue; }
        const valor = valores[Number(m[1])] ?? "";
        const tipo = m[2];
        if (!tipo) salida += valor;
        else if (tipo === "number") {
            const n = aNumero(valor);
            salida += n === null ? valor : safe(() => new Intl.NumberFormat(idioma).format(n), valor);
        } else if (tipo === "date") {
            const f = fecha(valor);
            const estilo = (m[3] ?? "medium").trim() as "short" | "medium" | "long" | "full";
            salida += f === null ? valor : safe(() => new Intl.DateTimeFormat(idioma, { dateStyle: estilo }).format(f), valor);
        } else {
            const n = aNumero(valor);
            salida += n === null ? valor : plural(m[3] ?? "", n, idioma);
        }
    }
    return salida;
}

const safe = (f: () => string, respaldo: string): string => { try { return f(); } catch { return respaldo; } };
function fecha(v: string): Date | null {
    const t = v.trim();
    const d = /^\d{10,}$/.test(t) ? new Date(Number(t)) : new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** «one {…} other {…}» → rama según `Intl.PluralRules`; «=0 {…}» exacto tiene prioridad. */
function plural(ramas: string, n: number, idioma: string): string {
    const mapa = new Map<string, string>();
    for (let i = 0; i < ramas.length;) {
        const m = /\s*([=\w]+)\s*\{/.exec(ramas.slice(i));
        if (!m) break;
        const ini = i + m.index + m[0].length - 1;
        const b = bloque(ramas, ini);
        if (!b) break;
        mapa.set(m[1], b[0]);
        i = b[1];
    }
    let categoria = "other";
    try { categoria = new Intl.PluralRules(idioma).select(n); } catch { /* idioma desconocido: other */ }
    const cuerpo = mapa.get(`=${n}`) ?? mapa.get(categoria) ?? mapa.get("other") ?? "";
    let numero = String(n);
    try { numero = new Intl.NumberFormat(idioma).format(n); } catch { /* sin Intl */ }
    return cuerpo.replace(/#/g, numero);
}

/** Valores {n} que usa una traducción (incluidos los de dentro de plurales). */
export const indicesUsados = (traduccion: string): number[] =>
    [...new Set([...traduccion.matchAll(/\{\s*(\d+)\s*[,}]/g)].map((x) => Number(x[1])))].sort((a, b) => a - b);
