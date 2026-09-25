/**
 * Mi Puente de Mando — páginas y ajustes de personalización (PURO).
 * ─────────────────────────────────────────────────────────────────────────────
 * El Puente de Mando de USUARIO es un panel para controlar tu propio StarSeed OS
 * (dispositivos, apps, archivos, perfiles, privacidad). Cada persona elige qué
 * páginas ve y en qué orden. Aquí vive SOLO la lógica pura de ese orden (sin
 * React ni navegador) para poder probarla y reutilizarla.
 *
 * Reglas:
 *   · «Inicio» siempre está visible y siempre va primero: es la puerta de
 *     entrada y el sitio desde el que se llega a todo lo demás. Si se pudiera
 *     ocultar, alguien podría quedarse con un panel vacío sin forma de volver.
 *   · Lo que llega de localStorage o de la cuenta NUNCA se da por bueno: se
 *     normaliza (ids desconocidos fuera, duplicados fuera, páginas nuevas al
 *     final) para que una versión futura con más páginas no rompa a las viejas.
 */

export type IdPagina =
    | "inicio"
    | "neuronas"
    | "apps"
    | "archivos"
    | "perfiles"
    | "privacidad"
    | "personalizar";

export interface DefinicionPagina {
    id: IdPagina;
    etiqueta: string;
    /** Una línea que explica para qué sirve la página (se ve en Personalizar). */
    descripcion: string;
}

/** Orden predeterminado y textos de cada página. */
export const PAGINAS: readonly DefinicionPagina[] = [
    { id: "inicio", etiqueta: "Inicio", descripcion: "Resumen de tu sistema y avisos importantes." },
    { id: "neuronas", etiqueta: "Dispositivos", descripcion: "Tus dispositivos vinculados (neuronas) y qué puede hacer cada uno." },
    { id: "apps", etiqueta: "Apps", descripcion: "Las apps que tienes instaladas y dónde vive cada una." },
    { id: "archivos", etiqueta: "Archivos y sincronización", descripcion: "Carpetas vinculadas y qué se guarda en tu cuenta." },
    { id: "perfiles", etiqueta: "Perfiles", descripcion: "Tus perfiles de StarSeed y cuál está activo aquí." },
    { id: "privacidad", etiqueta: "Privacidad y seguridad", descripcion: "Qué datos quedan en el dispositivo y qué permisos tiene el navegador." },
    { id: "personalizar", etiqueta: "Personalizar", descripcion: "Elige qué páginas ves y en qué orden." },
];

const IDS_VALIDOS = new Set<string>(PAGINAS.map((p) => p.id));

/** Página que nunca se oculta ni se mueve. */
export const PAGINA_FIJA: IdPagina = "inicio";

/** Clave local de los ajustes del panel de usuario. */
export const CLAVE_AJUSTES_MI_MANDO = "starseed.mi-mando.ajustes.v1";
/** Clave local de la vista elegida en /mando (proyecto o personal). */
export const CLAVE_VISTA_MANDO = "starseed.mando.vista.v1";

export type VistaMando = "proyecto" | "personal";

export interface AjustesMiMando {
    version: 1;
    /** Orden completo de páginas (incluidas las ocultas). */
    orden: IdPagina[];
    /** Páginas ocultas (nunca incluye «inicio»). */
    ocultas: IdPagina[];
    /** Marca de tiempo (epoch ms) del último cambio: gana el más reciente entre dispositivo y cuenta. */
    actualizado: number;
}

export function esIdPagina(v: unknown): v is IdPagina {
    return typeof v === "string" && IDS_VALIDOS.has(v);
}

export function ajustesPredeterminados(): AjustesMiMando {
    return { version: 1, orden: PAGINAS.map((p) => p.id), ocultas: [], actualizado: 0 };
}

/**
 * Convierte cualquier valor (JSON de localStorage, prefs de la cuenta…) en
 * ajustes válidos. Nunca lanza.
 */
export function normalizarAjustes(entrada: unknown): AjustesMiMando {
    const base = ajustesPredeterminados();
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return base;
    const e = entrada as Record<string, unknown>;

    const vistos = new Set<IdPagina>();
    const orden: IdPagina[] = [];
    if (Array.isArray(e.orden)) {
        for (const id of e.orden) {
            if (esIdPagina(id) && !vistos.has(id)) {
                vistos.add(id);
                orden.push(id);
            }
        }
    }
    // Páginas que no estaban (p. ej. añadidas en una versión nueva) van al final.
    for (const p of PAGINAS) if (!vistos.has(p.id)) orden.push(p.id);
    // «Inicio» siempre primero.
    const sinFija = orden.filter((id) => id !== PAGINA_FIJA);

    const ocultas: IdPagina[] = [];
    if (Array.isArray(e.ocultas)) {
        for (const id of e.ocultas) {
            if (esIdPagina(id) && id !== PAGINA_FIJA && !ocultas.includes(id)) ocultas.push(id);
        }
    }

    const actualizado = typeof e.actualizado === "number" && Number.isFinite(e.actualizado) && e.actualizado > 0
        ? e.actualizado
        : 0;

    return { version: 1, orden: [PAGINA_FIJA, ...sinFija], ocultas, actualizado };
}

/** Lee ajustes desde texto JSON (localStorage). Nunca lanza. */
export function ajustesDesdeTexto(texto: string | null | undefined): AjustesMiMando {
    if (!texto) return ajustesPredeterminados();
    try {
        return normalizarAjustes(JSON.parse(texto) as unknown);
    } catch {
        return ajustesPredeterminados();
    }
}

/** Páginas que se muestran, en su orden. «Inicio» siempre está. */
export function paginasVisibles(ajustes: AjustesMiMando): DefinicionPagina[] {
    const n = normalizarAjustes(ajustes);
    const ocultas = new Set(n.ocultas);
    return n.orden
        .filter((id) => id === PAGINA_FIJA || !ocultas.has(id))
        .map((id) => PAGINAS.find((p) => p.id === id))
        .filter((p): p is DefinicionPagina => Boolean(p));
}

/**
 * Sube (-1) o baja (+1) una página. «Inicio» no se mueve y nada puede ponerse
 * por delante de ella. Devuelve los mismos ajustes si el movimiento no aplica.
 */
export function moverPagina(ajustes: AjustesMiMando, id: IdPagina, direccion: -1 | 1, ahora = Date.now()): AjustesMiMando {
    const n = normalizarAjustes(ajustes);
    if (id === PAGINA_FIJA) return n;
    const i = n.orden.indexOf(id);
    const j = i + direccion;
    // j === 0 sería ponerla delante de «Inicio».
    if (i < 0 || j < 1 || j >= n.orden.length) return n;
    const orden = [...n.orden];
    const tmp = orden[i];
    orden[i] = orden[j] as IdPagina;
    orden[j] = tmp as IdPagina;
    return { ...n, orden, actualizado: ahora };
}

/** Muestra u oculta una página. «Inicio» siempre queda visible. */
export function alternarPagina(ajustes: AjustesMiMando, id: IdPagina, ahora = Date.now()): AjustesMiMando {
    const n = normalizarAjustes(ajustes);
    if (id === PAGINA_FIJA) return n;
    const ocultas = n.ocultas.includes(id) ? n.ocultas.filter((x) => x !== id) : [...n.ocultas, id];
    return { ...n, ocultas, actualizado: ahora };
}

/** ¿Está visible esta página? */
export function estaVisible(ajustes: AjustesMiMando, id: IdPagina): boolean {
    return id === PAGINA_FIJA || !normalizarAjustes(ajustes).ocultas.includes(id);
}

/**
 * Entre los ajustes del dispositivo y los de la cuenta gana el cambio más
 * reciente. Empate: el del dispositivo (es lo que la persona está viendo).
 */
export function elegirAjustesRecientes(local: AjustesMiMando, cuenta: AjustesMiMando | null): AjustesMiMando {
    if (!cuenta) return local;
    return cuenta.actualizado > local.actualizado ? cuenta : local;
}

/** Interpreta la vista guardada de /mando. Por defecto, la del proyecto. */
export function vistaDesdeTexto(texto: string | null | undefined): VistaMando {
    return texto === "personal" ? "personal" : "proyecto";
}
