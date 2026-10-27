/**
 * Traducción · preferencias por perfil (TRD1020D, Ola 1020U).
 * Cada perfil guarda su idioma de lectura y en qué contextos se traduce solo.
 * Por defecto el idioma lo da quien llama (`navigator.language`) y todo «preguntar».
 * Viaja con la cuenta (`starseed.traduccion.v1`, ver SYNCED_KEYS) en localStorage.
 * Módulo PURO: sin `node:*` ni red; nunca lanza.
 */

export const CLAVE_TRADUCCION = "starseed.traduccion.v1";

export type ModoAuto = "nunca" | "preguntar" | "siempre";
export const CONTEXTOS_TRADUCCION = ["paginas", "mensajes", "publicaciones", "agentes", "astraura"] as const;
export type ContextoTraduccion = (typeof CONTEXTOS_TRADUCCION)[number];

export interface PreferenciasTraduccion {
    /** Idioma en el que lee este perfil (BCP-47 en minúsculas, p. ej. «es» o «es-mx»). */
    idioma: string;
    /** Idiomas que ya entiende: lo que llegue en ellos no se traduce. */
    entiende: string[];
    /** Autotraducción por contexto: nunca · preguntar · siempre. */
    auto: Record<ContextoTraduccion, ModoAuto>;
}

export interface AlmacenLike {
    getItem(clave: string): string | null;
    setItem(clave: string, valor: string): void;
}

const IDIOMA_POR_DEFECTO = "es";
const MODOS: readonly ModoAuto[] = ["nunca", "preguntar", "siempre"];
const IDIOMA_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/;

/** Normaliza un idioma («ES_mx» → «es-mx»); null si no parece un idioma. */
export function normalizarIdioma(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const limpio = valor.trim().toLowerCase().replace(/_/g, "-");
    return IDIOMA_RE.test(limpio) ? limpio : null;
}

/** Preferencias por defecto: el idioma de quien llama y todo en «preguntar». */
export function preferenciasPorDefecto(idiomaPorDefecto?: string): PreferenciasTraduccion {
    const idioma = normalizarIdioma(idiomaPorDefecto) ?? IDIOMA_POR_DEFECTO;
    const auto: Record<ContextoTraduccion, ModoAuto> = {
        paginas: "preguntar", mensajes: "preguntar", publicaciones: "preguntar",
        agentes: "preguntar", astraura: "preguntar",
    };
    return { idioma, entiende: [idioma], auto };
}

/** Valida lo que llega del almacén o de la UI; lo inválido vuelve al valor por defecto. */
export function normalizarPreferencias(bruto: unknown, idiomaPorDefecto?: string): PreferenciasTraduccion {
    const base = preferenciasPorDefecto(idiomaPorDefecto);
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return base;
    const valor = bruto as Record<string, unknown>;
    const idioma = normalizarIdioma(valor.idioma) ?? base.idioma;
    const entiende = Array.isArray(valor.entiende)
        ? valor.entiende.map(normalizarIdioma).filter((x): x is string => x !== null)
        : base.entiende;
    const auto = { ...base.auto };
    const autoBruto = (valor.auto ?? {}) as Record<string, unknown>;
    for (const contexto of CONTEXTOS_TRADUCCION) {
        const modo = autoBruto[contexto];
        if (typeof modo === "string" && (MODOS as readonly string[]).includes(modo)) auto[contexto] = modo as ModoAuto;
    }
    return { idioma, entiende: Array.from(new Set([idioma, ...entiende])), auto };
}

function almacenDe(almacen?: AlmacenLike | null): AlmacenLike | null {
    if (almacen !== undefined) return almacen;
    try { return typeof window === "undefined" ? null : window.localStorage; }
    catch { return null; }
}

function leerMapa(store: AlmacenLike, idiomaPorDefecto?: string): Record<string, PreferenciasTraduccion> {
    const valor = JSON.parse(store.getItem(CLAVE_TRADUCCION) ?? "null") as Record<string, unknown> | null;
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
    return Object.fromEntries(Object.entries(valor).filter(([id]) => Boolean(id)).map(([id, p]) => [id, normalizarPreferencias(p, idiomaPorDefecto)]));
}

/** Lee las preferencias de un perfil. Sin almacén o con datos rotos: las de por defecto. */
export function leer(perfilId: string, idiomaPorDefecto?: string, almacen?: AlmacenLike | null): PreferenciasTraduccion {
    const base = preferenciasPorDefecto(idiomaPorDefecto);
    try {
        const store = almacenDe(almacen);
        return store && perfilId ? leerMapa(store, idiomaPorDefecto)[perfilId] ?? base : base;
    } catch { return base; }
}

/** Guarda las preferencias de un perfil conservando las de los demás. */
export function guardar(perfilId: string, prefs: PreferenciasTraduccion, almacen?: AlmacenLike | null): boolean {
    try {
        const store = almacenDe(almacen);
        if (!store || !perfilId) return false;
        const mapa = leerMapa(store, prefs?.idioma);
        mapa[perfilId] = normalizarPreferencias(prefs, prefs?.idioma);
        store.setItem(CLAVE_TRADUCCION, JSON.stringify(mapa));
        return true;
    } catch { return false; }
}

/**
 * ¿Toca traducir este texto solo? Solo con «siempre»: con «preguntar» decide la
 * persona (quien llama pregunta) y con «nunca» no se toca. Nunca si el idioma
 * del texto ya está entre los que entiende.
 */
export function debeTraducir(
    perfil: PreferenciasTraduccion | null | undefined,
    contexto: ContextoTraduccion,
    idiomaDelTexto: string,
): boolean {
    const idioma = normalizarIdioma(idiomaDelTexto);
    if (!idioma) return false;
    const prefs = normalizarPreferencias(perfil, perfil?.idioma);
    const base = idioma.split("-")[0];
    const entendido = prefs.entiende.some((sabido) => {
        const otro = normalizarIdioma(sabido);
        return otro !== null && (otro === idioma || otro.split("-")[0] === base);
    });
    return !entendido && prefs.auto[contexto] === "siempre";
}
