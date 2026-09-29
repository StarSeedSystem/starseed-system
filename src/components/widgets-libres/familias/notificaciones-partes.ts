/**
 * Lógica de los avisos del inicio (ola 0929 · F): de qué fuente viene cada aviso, cuánto
 * importa, cómo se agrupan y qué avisos están pospuestos. Posponer es local a esta neurona
 * (`starseed.inicio.notis.pospuestas.v1`): el aviso sigue sin leer en la cuenta y vuelve solo a
 * su hora. Sin React: se prueba solo.
 */

export interface FilaAviso {
    id: string;
    kind: string | null;
    title: string | null;
    body: string | null;
    link: string | null;
    seen: boolean | null;
    created_at: string | null;
}

export type Grupo = "seguridad" | "menciones" | "invitaciones" | "politica" | "sistema" | "otras";

export const GRUPOS: Record<Grupo, { etiqueta: string; color: string; peso: number }> = {
    seguridad: { etiqueta: "Seguridad", color: "#FF4D6A", peso: 4 },
    menciones: { etiqueta: "Menciones", color: "#38a7ff", peso: 3 },
    invitaciones: { etiqueta: "Invitaciones", color: "#b69cff", peso: 3 },
    politica: { etiqueta: "Gobernanza", color: "#FFBF00", peso: 2 },
    otras: { etiqueta: "Otros", color: "#23d5ab", peso: 1 },
    sistema: { etiqueta: "Sistema", color: "#94a3b8", peso: 0 },
};

const n = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** De qué fuente viene el aviso (por su tipo y, si no lo dice, por su título). */
export function grupoDe(a: Pick<FilaAviso, "kind" | "title">): Grupo {
    const kind = n(a.kind), texto = `${kind} ${n(a.title)}`;
    if (/(otp|segur|security|login|acceso nuevo|contrasen|password|important|alerta|urgent)/.test(texto)) return "seguridad";
    if (/(menci|mention|respond|respuesta|coment|reply|@)/.test(texto)) return "menciones";
    if (/(invit|solicit|request|unir|membres|amistad)/.test(texto)) return "invitaciones";
    if (/(propuesta|votaci|voto|gobern|decis|ontocrac|politic|asamblea)/.test(texto)) return "politica";
    if (/(update|actualiz|install|instala|sistema|system|version)/.test(texto)) return "sistema";
    return "otras";
}

const ts = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);

/** Lo más importante primero; a igual importancia, lo más reciente. */
export function ordenarPorPrioridad<T extends FilaAviso>(avisos: T[]): T[] {
    return [...avisos].sort((a, b) => GRUPOS[grupoDe(b)].peso - GRUPOS[grupoDe(a)].peso || ts(b.created_at) - ts(a.created_at));
}

/** Agrupa por fuente; los grupos van por importancia y cada uno por lo más reciente. */
export function agruparAvisos<T extends FilaAviso>(avisos: T[]): { grupo: Grupo; etiqueta: string; color: string; items: T[] }[] {
    const mapa = new Map<Grupo, T[]>();
    for (const a of ordenarPorPrioridad(avisos)) mapa.set(grupoDe(a), [...(mapa.get(grupoDe(a)) ?? []), a]);
    return [...mapa.entries()].map(([grupo, items]) => ({ grupo, ...GRUPOS[grupo], items }));
}

// ── Posponer ────────────────────────────────────────────────────────────────────────────────

export const CLAVE_POSPUESTAS = "starseed.inicio.notis.pospuestas.v1";
export type Pospuestas = Record<string, number>;

/** Quita las que ya vencieron (y las de avisos que ya no existen). */
export function vigentes(p: Pospuestas, ahora: number, idsExistentes?: Set<string>): Pospuestas {
    return Object.fromEntries(Object.entries(p).filter(([id, hasta]) => hasta > ahora && (!idsExistentes || idsExistentes.has(id))));
}

export function estaPospuesta(p: Pospuestas, id: string, ahora: number): boolean {
    return (p[id] ?? 0) > ahora;
}

/** Las opciones de posponer desde `ahora`: una hora, esta tarde (si aún no es) y mañana a las 9. */
export function opcionesPosponer(ahora: Date): { etiqueta: string; hasta: number }[] {
    const tarde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 18, 0);
    const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 9, 0);
    return [
        { etiqueta: "Una hora", hasta: ahora.getTime() + 3_600_000 },
        ...(tarde.getTime() - ahora.getTime() > 90 * 60_000 ? [{ etiqueta: "Esta tarde (18:00)", hasta: tarde.getTime() }] : []),
        { etiqueta: "Mañana a las 9:00", hasta: manana.getTime() },
    ];
}

/** Enlace seguro: solo rutas internas del OS (un enlace externo en un aviso no se abre desde aquí). */
export function enlaceSeguro(link: string | null | undefined): string {
    return link && link.startsWith("/") && !link.startsWith("//") ? link : "/notifications";
}
