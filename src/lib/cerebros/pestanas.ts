/**
 * Pestañas principales de la sección de cerebros: Privados y Públicos (CB1013A).
 *
 * Contrato: architecture/cerebros-fusion-telepatia.md §2.
 * - Privados: los de la cuenta y sus perfiles (`scope` account | profile).
 * - Públicos: los de grupos, comunidades y páginas (`scope` group | community | page).
 * Un `scope` vacío o desconocido cuenta como privado: así nada queda escondido.
 *
 * Módulo PURO: sin Supabase, sin `window`, sin `node:*`.
 */

export type PestanaCerebros = "privados" | "publicos";

/** Alcances que van a «Públicos». Las comunidades son grupos (`os_groups`), pero se acepta también `community`. */
export const ALCANCES_PUBLICOS: readonly string[] = ["group", "community", "page"];

/** Alcances que van a «Privados» (los desconocidos también caen aquí). */
export const ALCANCES_PRIVADOS: readonly string[] = ["account", "profile"];

export const ETIQUETA_PESTANA: Record<PestanaCerebros, string> = {
    privados: "Privados",
    publicos: "Públicos",
};

export const AYUDA_PESTANA: Record<PestanaCerebros, string> = {
    privados: "Cerebros de tu cuenta y de tus perfiles.",
    publicos: "Cerebros de tus grupos, comunidades y páginas.",
};

/** ¿En qué pestaña va un cerebro según su alcance? */
export function pestanaDeCerebro(cerebro: { scope?: string | null }): PestanaCerebros {
    const alcance = String(cerebro.scope ?? "").trim().toLowerCase();
    return ALCANCES_PUBLICOS.includes(alcance) ? "publicos" : "privados";
}

/** Los cerebros de una pestaña, en el mismo orden en que llegan. No muta la entrada. */
export function cerebrosDePestana<T extends { scope?: string | null }>(cerebros: readonly T[], pestana: PestanaCerebros): T[] {
    return cerebros.filter((c) => pestanaDeCerebro(c) === pestana);
}

/** Cuántos cerebros hay en cada pestaña (números reales para las insignias). */
export function cuentaPorPestana(cerebros: readonly { scope?: string | null }[]): Record<PestanaCerebros, number> {
    const cuenta: Record<PestanaCerebros, number> = { privados: 0, publicos: 0 };
    for (const c of cerebros) cuenta[pestanaDeCerebro(c)] += 1;
    return cuenta;
}

/** La pestaña pedida en la URL (`?vista=privados|publicos`); `null` si no viene o no vale. */
export function pestanaDesdeUrl(busqueda: string): PestanaCerebros | null {
    try {
        const v = new URLSearchParams(busqueda).get("vista");
        const limpio = String(v ?? "").trim().toLowerCase();
        if (limpio === "privados" || limpio === "privado") return "privados";
        if (limpio === "publicos" || limpio === "públicos" || limpio === "publico" || limpio === "público") return "publicos";
        return null;
    } catch {
        return null;
    }
}

/** El alcance con que se crea un cerebro público para una entidad gestionable. */
export function alcanceParaEntidad(tipo: "grupo" | "pagina" | "comunidad"): "group" | "page" {
    return tipo === "pagina" ? "page" : "group";
}

/**
 * Pestaña con la que abrir: la de la URL si viene; si no, la del cerebro pedido por la URL;
 * si no, la que tenga cerebros (Privados si ambas o ninguna).
 */
export function pestanaInicial(
    cerebros: readonly { id: string; scope?: string | null }[],
    desdeUrl: PestanaCerebros | null,
    cerebroUrl: string | null,
): PestanaCerebros {
    if (desdeUrl) return desdeUrl;
    const pedido = cerebroUrl ? cerebros.find((c) => c.id === cerebroUrl) : undefined;
    if (pedido) return pestanaDeCerebro(pedido);
    const cuenta = cuentaPorPestana(cerebros);
    return cuenta.privados === 0 && cuenta.publicos > 0 ? "publicos" : "privados";
}
