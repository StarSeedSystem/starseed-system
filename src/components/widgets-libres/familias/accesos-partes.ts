/**
 * Accesos del inicio (ola 0929 · F): fijados por el usuario, recientes y sugeridos por
 * «frecencia» (cuántas veces × lo reciente). Todo local a esta neurona
 * (`starseed.inicio.accesos.v1`): son costumbres de este dispositivo, no datos de la cuenta.
 * Sin React: se prueba solo.
 */

export const CLAVE_ACCESOS = "starseed.inicio.accesos.v1";
/** Vida media del peso de una visita: una semana. */
const VIDA_MEDIA_MS = 7 * 86_400_000;
const MAX_USOS = 60;

export interface UsoAcceso { n: number; ultimo: number }
export interface EstadoAccesos {
    /** Rutas fijadas, en su orden; null = aún no ha elegido (se usan los primeros de la lista). */
    fijados: string[] | null;
    uso: Record<string, UsoAcceso>;
}
export const ESTADO_INICIAL: EstadoAccesos = { fijados: null, uso: {} };

/** La clave de un acceso: su ruta sin consulta ni fragmento («/hub?tab=x» → «/hub»). */
export function claveRuta(href: string): string {
    const sinFrag = href.split("#")[0];
    const ruta = sinFrag.split("?")[0] || "/";
    return ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta;
}

/** Peso de una ruta: visitas con decaimiento exponencial desde la última. */
export function frecencia(u: UsoAcceso | undefined, ahora: number): number {
    if (!u) return 0;
    return u.n * Math.pow(0.5, Math.max(0, ahora - u.ultimo) / VIDA_MEDIA_MS);
}

/** Apunta una visita (y recorta a las `MAX_USOS` rutas más pesadas). */
export function registrarUso(uso: Record<string, UsoAcceso>, href: string, ahora: number): Record<string, UsoAcceso> {
    const k = claveRuta(href);
    const siguiente = { ...uso, [k]: { n: (uso[k]?.n ?? 0) + 1, ultimo: ahora } };
    const claves = Object.keys(siguiente);
    if (claves.length <= MAX_USOS) return siguiente;
    const quedan = claves.sort((a, b) => frecencia(siguiente[b], ahora) - frecencia(siguiente[a], ahora)).slice(0, MAX_USOS);
    return Object.fromEntries(quedan.map((c) => [c, siguiente[c]]));
}

/** Fijar o soltar un acceso (si aún no había elección, parte de los fijados por defecto). */
export function alternarFijado(fijados: string[] | null, porDefecto: string[], href: string): string[] {
    const base = fijados ?? porDefecto;
    return base.includes(href) ? base.filter((h) => h !== href) : [...base, href];
}

/** Cuántos se fijan de fábrica. */
export const FIJADOS_DE_FABRICA = 6;

export interface ConHref { href: string; label: string }

/** Los fijados que existen, en su orden (de fábrica, los primeros de la lista). */
export function fijadosDe<T extends ConHref>(accesos: T[], estado: EstadoAccesos): T[] {
    if (!estado.fijados) return accesos.slice(0, FIJADOS_DE_FABRICA);
    const porHref = new Map(accesos.map((a) => [a.href, a]));
    return estado.fijados.map((h) => porHref.get(h)).filter((a): a is T => !!a);
}

/** Los usados más recientemente (`max`), con cuándo. Un acceso cuenta por su ruta. */
export function recientesDe<T extends ConHref>(accesos: T[], estado: EstadoAccesos, max = 4): { acceso: T; cuando: number }[] {
    const vistos = new Set<string>();
    const salida: { acceso: T; cuando: number }[] = [];
    const orden = Object.entries(estado.uso).sort((a, b) => b[1].ultimo - a[1].ultimo);
    for (const [ruta, u] of orden) {
        const a = accesos.find((x) => claveRuta(x.href) === ruta);
        if (a && !vistos.has(a.href)) { vistos.add(a.href); salida.push({ acceso: a, cuando: u.ultimo }); }
        if (salida.length >= max) break;
    }
    return salida;
}

/** Sugeridos: los de más frecencia que no están fijados. */
export function sugeridosDe<T extends ConHref>(accesos: T[], estado: EstadoAccesos, ahora: number, max = 4): T[] {
    const fijados = new Set(fijadosDe(accesos, estado).map((a) => a.href));
    return accesos
        .filter((a) => !fijados.has(a.href))
        .map((a) => ({ a, p: frecencia(estado.uso[claveRuta(a.href)], ahora) }))
        .filter((x) => x.p > 0.05)
        .sort((x, y) => y.p - x.p)
        .slice(0, max)
        .map((x) => x.a);
}

/** Filtro de búsqueda sin tildes ni mayúsculas. */
export function coincide(texto: string, consulta: string): boolean {
    const n = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return n(texto).includes(n(consulta.trim()));
}
