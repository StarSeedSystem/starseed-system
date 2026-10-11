/**
 * Puerta de datos del A1 · tipos y decisiones PURAS (PDA1010, architecture/puerta-datos-a1.md §5).
 *
 * Sin `node:*` y sin red: lo importan componentes de cliente (Genesis › Consumo y créditos) y el
 * adaptador `puerta-a1.ts`. Aquí vive lo que se puede probar sin nada alrededor: la configuración
 * por neurona, qué URL vale, cuándo se vuelve a probar la salud tras un fallo, qué hacer con cada
 * respuesta, la cola de escrituras pendientes y los contadores del día de este aparato.
 */

export const CLAVE_CONFIG = "starseed.puerta-datos.v1";
export const CLAVE_URL = "starseed.puerta-datos.url.v1";
export const CLAVE_COLA = "starseed.puerta-datos.cola.v1";
export const CLAVE_CONTADORES = "starseed.puerta-datos.contadores.v1";

/** La salud buena se reutiliza este tiempo; después se vuelve a preguntar (una sola vez a la vez). */
export const SALUD_OK_MS = 30_000;
/** Esperas tras fallos seguidos antes de volver a probar la puerta. */
export const ESPERAS_FALLO_MS = [60_000, 120_000, 300_000, 600_000] as const;
/** Una respuesta más lenta que esto cuenta como fallo (y se repite en Supabase). */
export const TIMEOUT_MS = 4_000;
/** La URL leída de `os_puerta_datos` vale este tiempo en el aparato. */
export const URL_VIGENCIA_MS = 6 * 3_600_000;
/**
 * (PDA1012) «No hay puerta» (fila apagada o sin sesión) vale menos: 30 min. Con 6 h, un aparato que
 * abrió el OS justo antes de encender la puerta (`os_puerta_datos.activa = true`) seguía yendo a
 * Supabase el resto de la tarde. 30 min = como mucho 48 lecturas al día de esa fila por aparato.
 */
export const URL_NULA_VIGENCIA_MS = 30 * 60_000;
export const COLA_MAX = 200;

export type ModoPuerta = "auto" | "apagada";

export interface ConfigPuerta {
    modo: ModoPuerta;
}

export interface AlmacenPuerta {
    getItem(clave: string): string | null;
    setItem(clave: string, valor: string): void;
    removeItem(clave: string): void;
}

function leerJson<T>(almacen: AlmacenPuerta | null | undefined, clave: string): T | null {
    if (!almacen) return null;
    try {
        const crudo = almacen.getItem(clave);
        return crudo ? (JSON.parse(crudo) as T) : null;
    } catch {
        return null;
    }
}

function guardarJson(almacen: AlmacenPuerta | null | undefined, clave: string, valor: unknown): void {
    if (!almacen) return;
    try {
        almacen.setItem(clave, JSON.stringify(valor));
    } catch {
        /* almacén lleno o bloqueado: se sigue sin recordar */
    }
}

export function leerConfigPuerta(almacen: AlmacenPuerta | null | undefined): ConfigPuerta {
    const c = leerJson<Partial<ConfigPuerta>>(almacen, CLAVE_CONFIG);
    return { modo: c?.modo === "apagada" ? "apagada" : "auto" };
}

export function guardarConfigPuerta(almacen: AlmacenPuerta | null | undefined, c: ConfigPuerta): void {
    guardarJson(almacen, CLAVE_CONFIG, { modo: c.modo === "apagada" ? "apagada" : "auto" });
}

/** Solo `https://host[:puerto]` (o `http://localhost|127.0.0.1` para probar). Sin ruta ni credenciales. */
export function urlPuertaValida(url: unknown): string | null {
    if (typeof url !== "string" || url.length > 200) return null;
    let u: URL;
    try {
        u = new URL(url.trim());
    } catch {
        return null;
    }
    if (u.username || u.password || u.search || u.hash) return null;
    if (u.pathname !== "/" && u.pathname !== "") return null;
    const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
    if (u.protocol !== "https:" && !local) return null;
    return `${u.protocol}//${u.host}`;
}

export interface UrlGuardada {
    url: string | null;
    en: number;
}

export function leerUrlGuardada(almacen: AlmacenPuerta | null | undefined, ahora: number): UrlGuardada | null {
    const g = leerJson<UrlGuardada>(almacen, CLAVE_URL);
    if (!g || typeof g.en !== "number") return null;
    const url = urlPuertaValida(g.url);
    if (ahora - g.en > (url ? URL_VIGENCIA_MS : URL_NULA_VIGENCIA_MS)) return null;
    return { url, en: g.en };
}

export function guardarUrl(almacen: AlmacenPuerta | null | undefined, url: string | null, ahora: number): void {
    guardarJson(almacen, CLAVE_URL, { url: urlPuertaValida(url), en: ahora });
}

// ── salud y elección ──────────────────────────────────────────────────────────────────────────

export interface SaludPuerta {
    ok: boolean;
    /** Cuándo se midió (ms). 0 = nunca. */
    en: number;
    fallos: number;
    /** Antes de esto no se vuelve a probar (tras fallos). */
    esperaHasta: number;
    ms: number | null;
}

export const SALUD_INICIAL: SaludPuerta = Object.freeze({ ok: false, en: 0, fallos: 0, esperaHasta: 0, ms: null }) as SaludPuerta;

export function esperaTrasFallos(fallos: number): number {
    if (fallos <= 0) return 0;
    return ESPERAS_FALLO_MS[Math.min(ESPERAS_FALLO_MS.length - 1, fallos - 1)];
}

/** Anota una medida de salud (o un fallo de una operación). */
export function anotarSalud(previa: SaludPuerta, ok: boolean, ahora: number, ms: number | null = null): SaludPuerta {
    if (ok) return { ok: true, en: ahora, fallos: 0, esperaHasta: 0, ms };
    const fallos = previa.fallos + 1;
    return { ok: false, en: ahora, fallos, esperaHasta: ahora + esperaTrasFallos(fallos), ms };
}

export type Eleccion = "puerta" | "probar" | "supabase";

/** ¿Por dónde va la próxima operación? `probar` = preguntar la salud antes. */
export function elegir(config: ConfigPuerta, url: string | null, salud: SaludPuerta, ahora: number): Eleccion {
    if (config.modo === "apagada" || !url) return "supabase";
    if (salud.ok && ahora - salud.en < SALUD_OK_MS) return "puerta";
    if (!salud.ok && salud.fallos > 0 && ahora < salud.esperaHasta) return "supabase";
    return "probar";
}

export type DestinoRespuesta = "ok" | "respaldo" | "cola" | "rechazo";

/**
 * Qué hacer con lo que contestó la puerta (`null` = sin respuesta: red, tiempo agotado).
 *  · 2xx → listo.
 *  · sin respuesta / 5xx → la misma operación por Supabase (el guardián de consumo sigue mandando).
 *  · 429 → escritura a la cola (no se gasta Supabase por saltarse un tope); lectura sin datos.
 *  · 400/401/403/404/413/415 → «no» de la puerta: NO se repite en Supabase (sería saltarse un permiso).
 */
export function destinoDeRespuesta(estado: number | null, escritura: boolean): DestinoRespuesta {
    if (estado !== null && estado >= 200 && estado < 300) return "ok";
    if (estado === null || estado === 0 || estado >= 500) return "respaldo";
    if (estado === 429) return escritura ? "cola" : "rechazo";
    return "rechazo";
}

// ── cola de escrituras pendientes (nunca se pierde una) ────────────────────────────────────────

export interface EscrituraPendiente {
    metodo: "POST" | "PUT";
    ruta: string;
    cuerpo: unknown;
    t: number;
}

export function leerCola(almacen: AlmacenPuerta | null | undefined): EscrituraPendiente[] {
    const c = leerJson<EscrituraPendiente[]>(almacen, CLAVE_COLA);
    return Array.isArray(c) ? c.filter((e) => e && typeof e.ruta === "string" && (e.metodo === "POST" || e.metodo === "PUT")) : [];
}

/** Añade al final; si pasa de COLA_MAX sale la más vieja. Devuelve cuántas se descartaron. */
export function encolar(almacen: AlmacenPuerta | null | undefined, e: EscrituraPendiente): number {
    const cola = [...leerCola(almacen), e];
    const sobran = Math.max(0, cola.length - COLA_MAX);
    guardarJson(almacen, CLAVE_COLA, cola.slice(sobran));
    return sobran;
}

export function guardarCola(almacen: AlmacenPuerta | null | undefined, cola: EscrituraPendiente[]): void {
    if (!almacen) return;
    if (cola.length === 0) {
        try {
            almacen.removeItem(CLAVE_COLA);
        } catch {
            /* nada */
        }
        return;
    }
    guardarJson(almacen, CLAVE_COLA, cola.slice(-COLA_MAX));
}

// ── contadores del día en este aparato ─────────────────────────────────────────────────────────

/** Contadores de un grupo de rutas (neuronas, presencia, freno…) en este aparato. */
export interface ContadorGrupo {
    puerta: number;
    supabase: number;
}

export interface ContadoresPuerta {
    dia: string;
    /** Operaciones servidas por la puerta (cada una, una petición menos a Supabase). */
    porPuerta: number;
    /** Operaciones que fueron a Supabase porque la puerta no respondía o estaba apagada. */
    porSupabase: number;
    /** Escrituras guardadas en la cola local. */
    enCola: number;
    /** «No» de la puerta (permisos o datos). */
    rechazos: number;
    /** (PDA1012) Por grupo de rutas: cuántas fueron por la puerta y cuántas por Supabase. */
    porGrupo?: Record<string, ContadorGrupo>;
}

/** (PDA1012) El grupo de una ruta de la puerta, con los nombres de las métricas de la propia puerta. */
export function grupoDeRuta(ruta: string): string {
    const m = /^\/v1\/([a-z]+)/.exec(String(ruta || ""));
    if (!m) return "otros";
    const g = m[1];
    return ["bus", "latidos", "neuronas", "presencia", "metagenesis", "malla", "astraura", "freno", "cache"].includes(g) ? g : "otros";
}

export function diaUtc(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

function grupos(x: unknown): Record<string, ContadorGrupo> {
    const fuera: Record<string, ContadorGrupo> = {};
    if (!x || typeof x !== "object") return fuera;
    for (const [g, v] of Object.entries(x as Record<string, unknown>)) {
        if (!/^[a-z]{2,20}$/.test(g) || !v || typeof v !== "object") continue;
        const c = v as Partial<ContadorGrupo>;
        fuera[g] = { puerta: Number(c.puerta) || 0, supabase: Number(c.supabase) || 0 };
    }
    return fuera;
}

export function leerContadores(almacen: AlmacenPuerta | null | undefined, ahora: number): ContadoresPuerta {
    const c = leerJson<ContadoresPuerta>(almacen, CLAVE_CONTADORES);
    const hoy = diaUtc(ahora);
    if (!c || c.dia !== hoy) return { dia: hoy, porPuerta: 0, porSupabase: 0, enCola: 0, rechazos: 0, porGrupo: {} };
    return {
        dia: hoy,
        porPuerta: Number(c.porPuerta) || 0,
        porSupabase: Number(c.porSupabase) || 0,
        enCola: Number(c.enCola) || 0,
        rechazos: Number(c.rechazos) || 0,
        porGrupo: grupos(c.porGrupo),
    };
}

export function sumarContador(
    almacen: AlmacenPuerta | null | undefined,
    campo: Exclude<keyof ContadoresPuerta, "dia" | "porGrupo">,
    ahora: number,
    n = 1,
    grupo?: string,
): ContadoresPuerta {
    const c = leerContadores(almacen, ahora);
    const nuevo: ContadoresPuerta = { ...c, [campo]: c[campo] + n };
    if (grupo && (campo === "porPuerta" || campo === "porSupabase")) {
        const previo = c.porGrupo?.[grupo] ?? { puerta: 0, supabase: 0 };
        nuevo.porGrupo = {
            ...(c.porGrupo ?? {}),
            [grupo]: campo === "porPuerta" ? { ...previo, puerta: previo.puerta + n } : { ...previo, supabase: previo.supabase + n },
        };
    }
    guardarJson(almacen, CLAVE_CONTADORES, nuevo);
    return nuevo;
}

// ── lo que mide la neurona (~/.starseed/puerta-datos.json) y su vista en Genesis ──────────────

export interface DatosPuerta {
    version: number;
    comprobado: string;
    ok: boolean;
    motivo?: string | null;
    servicio?: string;
    salud?: {
        ok: boolean;
        version?: string;
        arriba_s?: number;
        jwks?: string;
        caddy?: string;
        replica?: { activa: boolean; pendientes?: { eventos: number; neuronas: number; presencia: number }; hoy?: number; sin_migracion?: boolean };
    } | null;
    https?: { ok: boolean; ms?: number; motivo?: string };
    hoy?: { dia: string; servidas: number; a_supabase: number; ahorradas: number; grupos?: Record<string, { servidas: number; a_supabase: number }> };
    historial?: { dia: string; servidas: number; a_supabase: number; ahorradas: number }[];
    presencia?: { neuronas: number; neuronas_vivas: number; cuentas: number; en_linea: number };
    fichas?: string[];
}

export function esDatosPuerta(x: unknown): x is DatosPuerta {
    if (!x || typeof x !== "object") return false;
    const d = x as Partial<DatosPuerta>;
    return typeof d.comprobado === "string" && typeof d.ok === "boolean";
}

const PARECE_SECRETO = /(https?:\/\/|sslip\.io|\b\d{1,3}(?:\.\d{1,3}){3}\b|pd_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{10,})/;

function num(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function textoLimpio(v: unknown, max = 160): string | null {
    if (typeof v !== "string") return null;
    return PARECE_SECRETO.test(v) ? "(oculto)" : v.slice(0, max);
}

/**
 * Lee `~/.starseed/puerta-datos.json` con LISTA BLANCA de campos: ni URLs, ni IPs, ni fichas
 * llegan a la pantalla aunque alguien las metiera en el archivo. `null` si no vale.
 */
export function leerDatosPuerta(crudo: string): DatosPuerta | null {
    let x: unknown;
    try {
        x = JSON.parse(crudo);
    } catch {
        return null;
    }
    if (!esDatosPuerta(x)) return null;
    const s = x.salud;
    const r = s?.replica;
    const grupos: Record<string, { servidas: number; a_supabase: number }> = {};
    for (const [g, v] of Object.entries(x.hoy?.grupos ?? {})) {
        if (/^[a-z_]{2,20}$/.test(g) && v && typeof v === "object") grupos[g] = { servidas: num(v.servidas), a_supabase: num(v.a_supabase) };
    }
    return {
        version: num(x.version) || 1,
        comprobado: x.comprobado,
        ok: x.ok,
        motivo: textoLimpio(x.motivo),
        servicio: textoLimpio(x.servicio, 20) ?? undefined,
        salud: s && typeof s === "object"
            ? {
                ok: s.ok === true,
                version: textoLimpio(s.version, 20) ?? undefined,
                arriba_s: num(s.arriba_s),
                jwks: textoLimpio(s.jwks, 20) ?? undefined,
                caddy: textoLimpio(s.caddy, 20) ?? undefined,
                replica: r && typeof r === "object"
                    ? {
                        activa: r.activa === true,
                        hoy: num(r.hoy),
                        sin_migracion: r.sin_migracion === true,
                        pendientes: { eventos: num(r.pendientes?.eventos), neuronas: num(r.pendientes?.neuronas), presencia: num(r.pendientes?.presencia) },
                    }
                    : undefined,
            }
            : null,
        https: x.https ? { ok: x.https.ok === true, ms: num(x.https.ms) || undefined, motivo: textoLimpio(x.https.motivo, 60) ?? undefined } : undefined,
        hoy: x.hoy
            ? { dia: String(x.hoy.dia).slice(0, 10), servidas: num(x.hoy.servidas), a_supabase: num(x.hoy.a_supabase), ahorradas: num(x.hoy.ahorradas), grupos }
            : undefined,
        historial: Array.isArray(x.historial)
            ? x.historial.slice(0, 30).map((h) => ({ dia: String(h?.dia).slice(0, 10), servidas: num(h?.servidas), a_supabase: num(h?.a_supabase), ahorradas: num(h?.ahorradas) }))
            : undefined,
        presencia: x.presencia
            ? { neuronas: num(x.presencia.neuronas), neuronas_vivas: num(x.presencia.neuronas_vivas), cuentas: num(x.presencia.cuentas), en_linea: num(x.presencia.en_linea) }
            : undefined,
        fichas: Array.isArray(x.fichas) ? x.fichas.filter((f): f is string => typeof f === "string" && /^[a-z]{2,20}$/.test(f)) : undefined,
    };
}

export type TonoPuerta = "ok" | "aviso" | "peligro" | "neutro";

export interface VistaPuerta {
    estado: { texto: string; tono: TonoPuerta };
    ahorradasHoy: number | null;
    detalleHoy: string;
    replica: { texto: string; tono: TonoPuerta };
    viejo: boolean;
}

const GRUPOS_LEGIBLES: Record<string, string> = {
    bus: "bus",
    latidos: "latidos",
    neuronas: "neuronas",
    presencia: "presencia",
    metagenesis: "MetaGenesis",
    malla: "malla",
    astraura: "Astraura",
    freno: "freno",
    cache: "caché",
};

function miles(n: number): string {
    return Math.round(n).toLocaleString("es-ES");
}

export function vistaPuerta(d: DatosPuerta, ahora: number): VistaPuerta {
    const edad = ahora - Date.parse(d.comprobado);
    const viejo = !Number.isFinite(edad) || edad > 30 * 60_000;
    let estado: VistaPuerta["estado"];
    if (!d.salud) estado = { texto: d.motivo ? "No responde" : "Sin desplegar", tono: d.motivo ? "peligro" : "neutro" };
    else if (!d.https?.ok) estado = { texto: "Sin HTTPS", tono: "aviso" };
    else if (d.salud.jwks !== "ok") estado = { texto: "Sin claves de sesión", tono: "aviso" };
    else estado = { texto: d.https.ms ? `Sana · ${d.https.ms} ms` : "Sana", tono: "ok" };

    const hoy = d.hoy;
    const grupos = Object.entries(hoy?.grupos ?? {})
        .filter(([g, v]) => GRUPOS_LEGIBLES[g] && v.servidas > 0)
        .sort((a, b) => b[1].servidas - a[1].servidas)
        .slice(0, 4)
        .map(([g, v]) => `${GRUPOS_LEGIBLES[g]} ${miles(v.servidas)}`);
    const detalleHoy = hoy
        ? `${miles(hoy.servidas)} servidas sin Supabase − ${miles(hoy.a_supabase)} que la puerta pidió a Supabase${grupos.length ? ` · ${grupos.join(" · ")}` : ""}`
        : "sin medida de hoy";

    const r = d.salud?.replica;
    let replica: VistaPuerta["replica"];
    if (!r) replica = { texto: "réplica sin dato", tono: "neutro" };
    else if (!r.activa) replica = { texto: "réplica apagada (sin llave)", tono: "aviso" };
    else if (r.sin_migracion) replica = { texto: "réplica esperando la migración de Supabase", tono: "aviso" };
    else {
        const p = r.pendientes ?? { eventos: 0, neuronas: 0, presencia: 0 };
        const pend = p.eventos + p.neuronas + p.presencia;
        replica = { texto: `réplica al día · ${r.hoy ?? 0} lotes hoy${pend ? ` · ${miles(pend)} pendientes` : ""}`, tono: pend > 1000 ? "aviso" : "ok" };
    }
    return { estado, ahorradasHoy: hoy ? hoy.ahorradas : null, detalleHoy, replica, viejo };
}
