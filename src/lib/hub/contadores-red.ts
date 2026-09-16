// Contadores del panel «Red en Vivo», extraídos a módulo puro para que el Hub
// y la página /network enseñen exactamente los mismos números con la misma regla.

export interface ContadoresRed {
    publicaciones: number;
    conexiones: number;
    propuestas: number;
    conceptos: number;
}

export interface EntradasContadores {
    posts: unknown[];
    conexiones: string[] | number;
    propuestasAbiertas: number;
    conceptos: { etiqueta: string }[];
}

const normalizarEtiqueta = (t: string): string | null => {
    // Sin almohadilla inicial y en minúscula: «#Cultura» y «cultura» cuentan una vez.
    const limpia = t.trim().replace(/^#+/, "").toLowerCase();
    return limpia.length > 0 ? limpia : null;
};

export function contarConceptos(
    posts: { content?: string | null; tags?: string[] | null }[],
): { etiqueta: string; veces: number }[] {
    const veces = new Map<string, number>();
    for (const post of posts) {
        if (!post.tags) continue;
        for (const tag of post.tags) {
            if (typeof tag !== "string") continue;
            const clave = normalizarEtiqueta(tag);
            if (clave) veces.set(clave, (veces.get(clave) ?? 0) + 1);
        }
    }
    // Orden por uso descendente; ante empate, orden alfabético para que el
    // resultado sea determinista y no dependa del orden de llegada del feed.
    return [...veces.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
        .map(([etiqueta, n]) => ({ etiqueta, veces: n }));
}

export function contadoresDe(entradas: EntradasContadores): ContadoresRed {
    const conexiones = Array.isArray(entradas.conexiones)
        ? entradas.conexiones.length
        : entradas.conexiones;
    return {
        publicaciones: entradas.posts.length,
        conexiones,
        propuestas: entradas.propuestasAbiertas,
        conceptos: entradas.conceptos.length,
    };
}

const plural = (n: number, singular: string, pluralTxt: string): string =>
    `${n} ${n === 1 ? singular : pluralTxt}`;

export function resumenDeContadores(c: ContadoresRed): string {
    return [
        plural(c.publicaciones, "publicación", "publicaciones"),
        plural(c.conexiones, "conexión", "conexiones"),
        plural(c.propuestas, "propuesta activa", "propuestas activas"),
        plural(c.conceptos, "concepto", "conceptos"),
    ].join(" · ");
}
